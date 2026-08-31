// Session store — SPEC.md r4 §8. Authoritative mutations bump revision and stale-mark evidence
// by recorded fingerprint; derived records (evidence, packets) never bump.
import { validateInvariants } from "../tools/validate.mjs";

export function packetFresh(pkt, state) {
  return pkt.revision === state.revision
    && pkt.evidenceIds.every((id) =>
      Object.prototype.hasOwnProperty.call(state.evidence, id) && !state.evidence[id].stale);
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

const staleConfirm = () => Object.assign(
  new Error("pending rules changed or no longer exist"),
  { code: "STALE_CONFIRM" },
);

const SNAPSHOT_KEYS = ["nextId", "nextPendingVersion", "state"];
const STATE_KEYS = ["evidence", "expressions", "packets", "pending", "pins", "priority", "revision"];
const isObject = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};
const hasExactKeys = (value, expected) => isObject(value)
  && JSON.stringify(Object.keys(value).sort()) === JSON.stringify(expected);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const stringArray = (value) => Array.isArray(value)
  && Array.from(value).every((item) => typeof item === "string" && item.length > 0);

function isJsonValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) return false;
  if (Array.isArray(value)) {
    const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), "length"];
    if (JSON.stringify(ownKeys) !== JSON.stringify(expected)) return false;
  } else if (ownKeys.length !== Object.keys(value).length) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? Array.from(value).every((item) => isJsonValue(item, seen))
    : isObject(value) && Object.values(value).every((item) => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

function validRules(rules, allowEmpty) {
  if (!Array.isArray(rules) || rules.length === 0) return allowEmpty && Array.isArray(rules);
  if (!rules.every((rule) => isObject(rule) && Object.prototype.hasOwnProperty.call(rule, "id"))) return false;
  try {
    validateInvariants(rules);
    return true;
  } catch {
    return false;
  }
}

function validEvidence(key, evidence, revision) {
  return /^E-[1-9]\d*$/.test(key)
    && hasExactKeys(evidence, ["fingerprint", "id", "kind", "payload", "revision", "stale"])
    && evidence.id === key
    && typeof evidence.kind === "string" && evidence.kind.length > 0
    && Number.isInteger(evidence.revision) && evidence.revision >= 0 && evidence.revision <= revision
    && typeof evidence.stale === "boolean"
    && hasExactKeys(evidence.fingerprint, ["fields", "invariants", "personas"])
    && stringArray(evidence.fingerprint.fields)
    && stringArray(evidence.fingerprint.invariants)
    && stringArray(evidence.fingerprint.personas)
    && isObject(evidence.payload);
}

function validPacket(key, packet, revision, evidence) {
  return /^PKT-[1-9]\d*$/.test(key)
    && hasExactKeys(packet, ["blockers", "evidenceIds", "id", "pinsCovered", "revision"])
    && packet.id === key
    && Number.isInteger(packet.revision) && packet.revision >= 0 && packet.revision <= revision
    && stringArray(packet.evidenceIds)
    && packet.evidenceIds.every((id) => Object.prototype.hasOwnProperty.call(evidence, id))
    && stringArray(packet.pinsCovered)
    && Array.isArray(packet.blockers)
    && Array.from(packet.blockers).every((blocker) => hasExactKeys(blocker, ["pin", "reason"])
      && typeof blocker.pin === "string" && blocker.pin.length > 0
      && ["uncovered", "violating"].includes(blocker.reason));
}

function derivedIdsMatchAllocator(evidence, packets, nextId, revision) {
  if (!Object.entries(evidence).every(([key, value]) => validEvidence(key, value, revision))) return false;
  if (!Object.entries(packets).every(([key, value]) => validPacket(key, value, revision, evidence))) return false;
  const ids = [...Object.keys(evidence), ...Object.keys(packets)];
  const suffixes = ids.map((id) => Number(id.slice(id.lastIndexOf("-") + 1))).sort((a, b) => a - b);
  return suffixes.length === nextId
    && suffixes.every((suffix, index) => suffix === index + 1);
}

function validSnapshot(snap) {
  if (!isJsonValue(snap)
      || !hasExactKeys(snap, SNAPSHOT_KEYS)
      || !Number.isInteger(snap.nextId) || snap.nextId < 0
      || !Number.isInteger(snap.nextPendingVersion) || snap.nextPendingVersion < 0
      || !hasExactKeys(snap.state, STATE_KEYS)) return false;
  const state = snap.state;
  if (!Number.isInteger(state.revision) || state.revision < 0
      || !([["ad", "hris"], ["hris", "ad"]]
        .some((priority) => JSON.stringify(priority) === JSON.stringify(state.priority)))
      || !isObject(state.expressions) || !Object.values(state.expressions).every((expr) => typeof expr === "string")
      || !validRules(state.pins, true)
      || !isObject(state.evidence)
      || !isObject(state.packets)
      || !derivedIdsMatchAllocator(state.evidence, state.packets, snap.nextId, state.revision)) return false;
  if (state.pending === null) return true;
  return hasExactKeys(state.pending, ["digest", "rules", "version"])
    && Number.isInteger(state.pending.version) && state.pending.version >= 1
    && state.pending.version === snap.nextPendingVersion
    && typeof state.pending.digest === "string" && /^[0-9a-f]{8}$/.test(state.pending.digest)
    && validRules(state.pending.rules, false)
    && JSON.stringify(state.pending.rules) === JSON.stringify(canonicalize(state.pending.rules))
    && state.pending.digest === fnv1a(JSON.stringify(canonicalize(state.pending.rules)));
}

export function createStore(initial) {
  let state = structuredClone(initial);
  let nextId = 0;
  let nextPendingVersion = state.pending?.version ?? 0;
  const uid = (p) => `${p}-${++nextId}`;
  state.pins = state.pins ?? [];
  state.pending = state.pending ?? null;
  state.evidence = {};
  state.packets = {};

  function staleWhere(pred) {
    for (const e of Object.values(state.evidence)) if (!e.stale && pred(e)) e.stale = true;
  }

  return {
    getState: () => state,

    snapshot: () => ({ state: structuredClone(state), nextId, nextPendingVersion }),

    restore(snap) {
      if (!validSnapshot(snap))
        throw Object.assign(new Error("invalid store snapshot"), { code: "EVALUATOR_FAILED" });
      state = structuredClone(snap.state);
      nextId = snap.nextId;
      nextPendingVersion = snap.nextPendingVersion;
    },

    dispatch(action) {
      switch (action.type) {
        case "EDIT_EXPRESSION": {
          if (!hasOwn(state.expressions, action.field))
            throw Object.assign(new Error(`unknown field ${action.field}`), { code: "INVALID_AST" });
          state.expressions[action.field] = action.expr;
          state.revision += 1;
          staleWhere((e) => e.fingerprint.fields.includes(action.field));
          break;
        }
        case "SET_PRIORITY": {
          state.priority = [...action.priority];
          state.revision += 1;
          staleWhere(() => true);
          break;
        }
        case "STAGE_RULES": {
          const rules = canonicalize(validateInvariants(action.rules));
          const canonicalJson = JSON.stringify(rules);
          if (state.pending) {
            if (JSON.stringify(state.pending.rules) !== canonicalJson)
              throw Object.assign(new Error(
                "different rules are already awaiting human review — the human must confirm or discard them first",
              ), { code: "PENDING_EXISTS" });
            break;
          }
          state.pending = {
            version: ++nextPendingVersion,
            digest: fnv1a(canonicalJson),
            rules,
          };
          break;
        }
        case "CONFIRM_RULES": {
          if (!state.pending || action.version !== state.pending.version) throw staleConfirm();
          const before = new Map(state.pins.map((p) => [p.id, JSON.stringify(canonicalize(p))]));
          const after = new Map(state.pending.rules.map((p) => [p.id, JSON.stringify(p)]));
          const changed = [...new Set([...before.keys(), ...after.keys()])]
            .filter((id) => before.get(id) !== after.get(id));
          state.pins = structuredClone(state.pending.rules);
          state.pending = null;
          state.revision += 1;
          staleWhere((e) => e.fingerprint.invariants.some((id) => changed.includes(id)));
          break;
        }
        case "DISCARD_RULES": {
          if (!state.pending || action.version !== state.pending.version) throw staleConfirm();
          state.pending = null;
          break;
        }
        case "UNPIN": {
          state.pins = state.pins.filter((p) => p.id !== action.id);
          state.revision += 1;
          staleWhere((e) => e.fingerprint.invariants.includes(action.id));
          break;
        }
        default:
          throw Object.assign(new Error(`unknown action ${action.type}`), { code: "EVALUATOR_FAILED" });
      }
    },

    recordEvidence(kind, fingerprint, payload) {
      const id = uid("E");
      state.evidence[id] = {
        id, kind, revision: state.revision, stale: false,
        fingerprint: {
          fields: [...(fingerprint.fields ?? [])],
          invariants: [...(fingerprint.invariants ?? [])],
          personas: [...(fingerprint.personas ?? [])],
        },
        payload,
      };
      return id;
    },

    recordPacket(evidenceIds, pinsCovered, blockers) {
      const id = uid("PKT");
      state.packets[id] = { id, revision: state.revision, evidenceIds: [...evidenceIds], pinsCovered, blockers };
      return id;
    },

    listEvidence: () => Object.values(state.evidence),
  };
}
