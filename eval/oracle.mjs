import { createHash } from "node:crypto";

const HASH = /^[0-9a-f]{64}$/;
const TOOL_NAMES = new Set([
  "read_mapping_session",
  "stage_mapping_invariants",
  "find_mapping_counterexample",
  "preview_mapping_patch",
  "prepare_mapping_review",
]);
const OUTPUT_FIELDS = ["displayName", "group", "managerId", "department", "email"];
const UNCOMMITTED_DRAFT_REASON = "visible expression drafts must be committed or reverted by the human before running this tool; then call read_mapping_session again";
const TOOL_ERROR_CODES = {
  read_mapping_session: new Set([
    "ABORTED", "EVALUATOR_FAILED", "INVALID_INPUT", "PII_GUARD", "REVISION_MISMATCH",
  ]),
  stage_mapping_invariants: new Set([
    "ABORTED", "BAD_RULE", "EVALUATOR_FAILED", "INVALID_INPUT", "PENDING_EXISTS", "PII_GUARD",
    "REVISION_MISMATCH", "UNCOMMITTED_DRAFT",
  ]),
  find_mapping_counterexample: new Set([
    "ABORTED", "BAD_RULE", "EVALUATOR_FAILED", "INVALID_INPUT", "NO_INVARIANTS", "PII_GUARD",
    "REVISION_MISMATCH", "UNCOMMITTED_DRAFT", "WITNESS_EXCEEDS_CAP",
  ]),
  preview_mapping_patch: new Set([
    "ABORTED", "EVALUATOR_FAILED", "INVALID_AST", "INVALID_INPUT", "PII_GUARD",
    "REVISION_MISMATCH", "UNCOMMITTED_DRAFT", "UNKNOWN_PERSONA",
  ]),
  prepare_mapping_review: new Set([
    "ABORTED", "EVALUATOR_FAILED", "INVALID_INPUT", "NO_EVIDENCE", "NO_INVARIANTS", "PII_GUARD",
    "REVISION_MISMATCH", "STALE_EVIDENCE", "UNCOMMITTED_DRAFT",
  ]),
};
const SNAPSHOT_KEYS = ["nextId", "nextPendingVersion", "state"];
const STATE_KEYS = ["evidence", "expressions", "packets", "pending", "pins", "priority", "revision"];
const READ_PAYLOAD_KEYS = [
  "fields", "pendingRuleIds", "pendingVersion", "personaCount", "pinIds", "priority", "revision",
];
const READ_PAGE_KEYS = [
  "continuation", "encoding", "offset", "revision", "sessionChunk", "sessionLength",
];
const READ_CONTINUATION_KEYS = ["expectedPendingVersion", "expectedRevision", "offset"];
const MAX_OUTPUT_CHARS = 1500;
const READ_SESSION_CHUNK_CHARS = 512;
const readSessionChunkEnd = (serialized, offset) => {
  let end = Math.min(offset + READ_SESSION_CHUNK_CHARS, serialized.length);
  if (end < serialized.length
      && /[\uD800-\uDBFF]/.test(serialized[end - 1])
      && /[\uDC00-\uDFFF]/.test(serialized[end])) end -= 1;
  return end;
};
const isReadSessionContinuationOffset = (serialized, offset) => {
  let boundary = readSessionChunkEnd(serialized, 0);
  while (boundary < serialized.length) {
    if (boundary === offset) return true;
    if (boundary > offset) return false;
    boundary = readSessionChunkEnd(serialized, boundary);
  }
  return false;
};
const STAGE_PAYLOAD_KEYS = [
  "digest", "nextStep", "pendingRuleIds", "pendingVersion", "revision", "status",
];
const FIND_VIOLATING_KEYS = [
  "checkedInvariantIds", "cleanSweep", "coverage", "evidenceIds", "fullSweep", "personaIds",
  "revision", "violations",
];
const FIND_CLEAN_KEYS = [
  "checked", "checkedInvariantIds", "cleanSweep", "confirmedInvariantCount", "evidenceIds",
  "fullSweep", "personaIds", "revision", "violations",
];
const PREVIEW_PAYLOAD_KEYS = ["diffs", "evidenceId", "field", "remainingViolations", "revision"];
const PREPARE_PAYLOAD_KEYS = ["blockers", "coverage", "evidenceIds", "packetId", "revision"];
const STAGE_NEXT_STEP = "the human must review and confirm the pending rules on the page; then call read_mapping_session";
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isObject = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (isObject(value))
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  return value;
}

const same = (left, right) => JSON.stringify(canonicalize(left)) === JSON.stringify(canonicalize(right));
const rawSame = (left, right) => JSON.stringify(left) === JSON.stringify(right);
const sha256 = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const stringArray = (value, { empty = true } = {}) => Array.isArray(value)
  && (empty || value.length > 0)
  && Array.from(value).every((item) => typeof item === "string" && item.length > 0);
const authoritative = (snapshot) => ({
  revision: snapshot.state.revision,
  priority: snapshot.state.priority,
  expressions: snapshot.state.expressions,
  pins: snapshot.state.pins,
});

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

function isJsonValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  const ownKeys = Reflect.ownKeys(value);
  if (ownKeys.some((key) => typeof key !== "string")) return false;
  if (Array.isArray(value)) {
    const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), "length"];
    if (!rawSame(ownKeys, expected)) return false;
  } else if (ownKeys.length !== Object.keys(value).length) return false;
  seen.add(value);
  const valid = Array.isArray(value)
    ? Array.from(value).every((item) => isJsonValue(item, seen))
    : isObject(value) && Object.values(value).every((item) => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
}

function validRule(rule) {
  if (!isObject(rule) || typeof rule.type !== "string") return false;
  const keys = {
    forbidden_group: ["group", "id", "personaCategory", "type"],
    null_if_missing: ["dependsOn", "field", "id", "type"],
    source_of_truth: ["field", "id", "source", "type"],
  }[rule.type];
  if (!keys || !same(Object.keys(rule).sort(), keys)) return false;
  if (!Object.values(rule).every((value) => typeof value === "string"
      && value.length > 0 && !value.includes("CANARY_"))) return false;
  if (hasOwn(rule, "field")
      && !OUTPUT_FIELDS.includes(rule.field)) return false;
  if (hasOwn(rule, "source") && !["okta", "hris", "ad"].includes(rule.source)) return false;
  return true;
}

function validRules(rules, allowEmpty) {
  return Array.isArray(rules)
    && rules.length <= 8
    && (allowEmpty || rules.length > 0)
    && Array.from(rules).every(validRule)
    && new Set(Array.from(rules, (rule) => rule.id)).size === rules.length;
}

function validEvidence(key, evidence, revision) {
  return /^E-[1-9]\d*$/.test(key)
    && isObject(evidence)
    && same(Object.keys(evidence).sort(), ["fingerprint", "id", "kind", "payload", "revision", "stale"])
    && evidence.id === key
    && typeof evidence.kind === "string" && evidence.kind.length > 0
    && Number.isInteger(evidence.revision) && evidence.revision >= 0 && evidence.revision <= revision
    && typeof evidence.stale === "boolean"
    && isObject(evidence.fingerprint)
    && same(Object.keys(evidence.fingerprint).sort(), ["fields", "invariants", "personas"])
    && stringArray(evidence.fingerprint.fields)
    && stringArray(evidence.fingerprint.invariants)
    && stringArray(evidence.fingerprint.personas)
    && isObject(evidence.payload);
}

function validPacket(key, packet, revision, evidence) {
  return /^PKT-[1-9]\d*$/.test(key)
    && isObject(packet)
    && same(Object.keys(packet).sort(), ["blockers", "evidenceIds", "id", "pinsCovered", "revision"])
    && packet.id === key
    && Number.isInteger(packet.revision) && packet.revision >= 0 && packet.revision <= revision
    && stringArray(packet.evidenceIds)
    && packet.evidenceIds.every((id) => hasOwn(evidence, id))
    && stringArray(packet.pinsCovered)
    && Array.isArray(packet.blockers)
    && Array.from(packet.blockers).every((blocker) => isObject(blocker)
      && same(Object.keys(blocker).sort(), ["pin", "reason"])
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

function validSnapshot(snapshot) {
  if (!isJsonValue(snapshot)
      || !isObject(snapshot) || !SNAPSHOT_KEYS.every((key) => hasOwn(snapshot, key))) return false;
  if (!same(Object.keys(snapshot).sort(), SNAPSHOT_KEYS)) return false;
  if (!Number.isInteger(snapshot.nextId) || snapshot.nextId < 0) return false;
  if (!Number.isInteger(snapshot.nextPendingVersion) || snapshot.nextPendingVersion < 0) return false;
  const state = snapshot.state;
  if (!isObject(state) || !STATE_KEYS.every((key) => hasOwn(state, key))) return false;
  if (!same(Object.keys(state).sort(), STATE_KEYS)) return false;
  if (!Number.isInteger(state.revision) || state.revision < 0) return false;
  if (![["ad", "hris"], ["hris", "ad"]]
    .some((priority) => rawSame(priority, state.priority))) return false;
  if (!isObject(state.expressions)
      || !Object.values(state.expressions).every((expr) => typeof expr === "string")) return false;
  if (!validRules(state.pins, true)) return false;
  if (!isObject(state.evidence) || !isObject(state.packets)) return false;
  if (!derivedIdsMatchAllocator(state.evidence, state.packets, snapshot.nextId, state.revision)) return false;
  if (state.pending !== null) {
    if (!isObject(state.pending)) return false;
    if (!same(Object.keys(state.pending).sort(), ["digest", "rules", "version"])) return false;
    if (!Number.isInteger(state.pending.version) || state.pending.version < 1) return false;
    if (state.pending.version !== snapshot.nextPendingVersion) return false;
    if (typeof state.pending.digest !== "string" || !/^[0-9a-f]{8}$/.test(state.pending.digest)) return false;
    if (!validRules(state.pending.rules, false)) return false;
    if (!rawSame(state.pending.rules, canonicalize(state.pending.rules))) return false;
    if (state.pending.digest !== fnv1a(JSON.stringify(canonicalize(state.pending.rules)))) return false;
  }
  return true;
}

function stateEqualExcept(before, after, allowed) {
  return STATE_KEYS.filter((key) => !allowed.has(key))
    .every((key) => rawSame(before.state[key], after.state[key]));
}

function exactAddedKeys(before, after, expected) {
  if (!isObject(before) || !isObject(after) || !Array.isArray(expected)) return false;
  const expectedSet = new Set(expected);
  if (expectedSet.size !== expected.length || expected.some((id) => typeof id !== "string")) return false;
  const beforeKeys = Object.keys(before);
  if (!beforeKeys.every((key) => hasOwn(after, key) && rawSame(before[key], after[key]))) return false;
  const added = Object.keys(after).filter((key) => !hasOwn(before, key));
  return same(added.sort(), [...expectedSet].sort());
}

function validProtocol(entry) {
  return entry.status === "Completed"
    && entry.matched === true
    && typeof entry.invocationId === "string"
    && entry.invocationId.trim().length > 0
    && hasOwn(entry, "payload")
    && isObject(entry.payload)
    && isJsonValue(entry.payload);
}

function validErrorDetails(error, entry, handlerBefore) {
  const keys = Object.keys(error).sort();
  const reasonEnvelope = same(keys, ["code", "reason"])
    && typeof error.reason === "string" && error.reason.length > 0;
  if (reasonEnvelope && [
    "detail withheld by output budget", "detail withheld by privacy guard",
  ].includes(error.reason)
      && ["INVALID_AST", "STALE_EVIDENCE", "UNKNOWN_PERSONA"].includes(error.code)) return true;
  switch (error.code) {
    case "ABORTED":
      return same(keys, ["code"]);
    case "BAD_RULE":
    case "EVALUATOR_FAILED":
    case "INVALID_INPUT":
    case "PII_GUARD":
      return reasonEnvelope;
    case "PENDING_EXISTS":
      return reasonEnvelope
        && handlerBefore.state.pending !== null
        && error.reason === "different rules are already awaiting human review — the human must confirm or discard them first";
    case "UNCOMMITTED_DRAFT":
      return same(keys, ["code", "fields", "reason"])
        && error.reason === UNCOMMITTED_DRAFT_REASON
        && Array.isArray(error.fields) && error.fields.length > 0
        && new Set(error.fields).size === error.fields.length
        && error.fields.every((field) => OUTPUT_FIELDS.includes(field))
        && rawSame(error.fields, OUTPUT_FIELDS.filter((field) => error.fields.includes(field)));
    case "NO_INVARIANTS": {
      const emptySelection = handlerBefore.state.pins.length > 0
        && entry.toolName === "find_mapping_counterexample"
        && Array.isArray(entry.input?.invariantIds)
        && entry.input.invariantIds.length === 0;
      const noEffectivePins = handlerBefore.state.pins.length === 0 || emptySelection;
      const expectedReason = emptySelection
        ? "no invariants selected — omit invariantIds to check all confirmed rules, or pass confirmed ids returned by read_mapping_session"
        : handlerBefore.state.pending
          ? "no confirmed invariants — pending rules await confirmation by the human"
          : "no confirmed invariants — call stage_mapping_invariants with the complete rule set, ask the human to Confirm all, then call read_mapping_session";
      return reasonEnvelope && noEffectivePins && error.reason === expectedReason;
    }
    case "REVISION_MISMATCH":
      return same(keys, ["code", "currentRevision"])
        && error.currentRevision === handlerBefore.state.revision;
    case "INVALID_AST":
      return same(keys, ["code", "position", "reason"])
        && typeof error.reason === "string" && error.reason.length > 0
        && Number.isInteger(error.position) && error.position >= 0;
    case "UNKNOWN_PERSONA":
      return same(keys, ["code", "personaId"])
        && typeof error.personaId === "string" && error.personaId.length > 0;
    case "WITNESS_EXCEEDS_CAP":
      return same(keys, ["code", "maxPersonas", "witnessSize"])
        && Number.isInteger(error.witnessSize) && error.witnessSize > error.maxPersonas
        && error.witnessSize <= 8
        && Number.isInteger(error.maxPersonas) && error.maxPersonas >= 1 && error.maxPersonas <= 8;
    case "STALE_EVIDENCE":
      return same(keys, ["code", "staleIds"])
        && stringArray(error.staleIds) && error.staleIds.length > 0;
    case "NO_EVIDENCE":
      return reasonEnvelope
        && error.reason === "no evidence ids supplied — run find_mapping_counterexample at the current revision and pass its evidenceIds"
        && handlerBefore.state.pins.length > 0
        && Array.isArray(entry.input?.evidenceIds)
        && entry.input.evidenceIds.length === 0;
    default:
      return false;
  }
}

function validErrorEnvelope(payload, entry, handlerBefore) {
  return same(Object.keys(payload).sort(), ["error"])
    && isObject(payload.error)
    && typeof payload.error.code === "string"
    && TOOL_ERROR_CODES[entry.toolName]?.has(payload.error.code)
    && validErrorDetails(payload.error, entry, handlerBefore);
}

function expectedPayloadKeys(base, payload) {
  return payload.truncated === true
    ? [...base, "truncated", "violationsTotal"].sort()
    : base;
}

function validFindPayload(payload) {
  if (payload.cleanSweep !== true && payload.cleanSweep !== false) return false;
  const clean = payload.cleanSweep === true;
  const baseKeys = clean ? FIND_CLEAN_KEYS : FIND_VIOLATING_KEYS;
  if (!same(Object.keys(payload).sort(), expectedPayloadKeys(baseKeys, payload))) return false;
  if (typeof payload.fullSweep !== "boolean"
      || !stringArray(payload.checkedInvariantIds, { empty: false })
      || !stringArray(payload.personaIds)
      || !stringArray(payload.evidenceIds, { empty: false })
      || payload.evidenceIds.length !== 1
      || !Array.isArray(payload.violations)) return false;
  if (payload.truncated === true
      && (!Number.isInteger(payload.violationsTotal)
        || payload.violationsTotal < payload.violations.length)) return false;
  const violationKeys = payload.truncated === true
    ? ["field", "invariantId", "personaId"]
    : ["detail", "field", "invariantId", "personaId"];
  if (!Array.from(payload.violations).every((violation) => isObject(violation)
      && same(Object.keys(violation).sort(), violationKeys)
      && typeof violation.invariantId === "string" && violation.invariantId.length > 0
      && typeof violation.personaId === "string" && violation.personaId.length > 0
      && typeof violation.field === "string" && violation.field.length > 0
      && (payload.truncated === true || typeof violation.detail === "string"))) return false;
  if (clean) {
    return payload.personaIds.length === 0
      && payload.violations.length === 0
      && Number.isInteger(payload.confirmedInvariantCount) && payload.confirmedInvariantCount >= 0
      && Number.isInteger(payload.checked) && payload.checked === 8;
  }
  return payload.personaIds.length > 0
    && payload.violations.length > 0
    && isObject(payload.coverage)
    && rawSame(Object.keys(payload.coverage), payload.checkedInvariantIds)
    && Object.values(payload.coverage).every((covered) => typeof covered === "boolean");
}

function validPreviewPayload(payload) {
  return same(Object.keys(payload).sort(), PREVIEW_PAYLOAD_KEYS)
    && OUTPUT_FIELDS.includes(payload.field)
    && typeof payload.evidenceId === "string" && payload.evidenceId.length > 0
    && Number.isInteger(payload.remainingViolations) && payload.remainingViolations >= 0
    && Array.isArray(payload.diffs)
    && Array.from(payload.diffs).every((diff) => isObject(diff)
      && same(Object.keys(diff).sort(), ["after", "before", "field", "personaId"])
      && typeof diff.personaId === "string" && diff.personaId.length > 0
      && diff.field === payload.field
      && [diff.before, diff.after].every((value) => value === null
        || typeof value === "string" || typeof value === "boolean"
        || (typeof value === "number" && Number.isFinite(value))));
}

function validPreparePayload(payload) {
  if (!same(Object.keys(payload).sort(), PREPARE_PAYLOAD_KEYS)
      || typeof payload.packetId !== "string" || payload.packetId.length === 0
      || !stringArray(payload.evidenceIds, { empty: false })
      || !isObject(payload.coverage)
      || !Object.values(payload.coverage).every((covered) => typeof covered === "boolean")
      || !Array.isArray(payload.blockers)) return false;
  return Array.from(payload.blockers).every((blocker) => isObject(blocker)
    && same(Object.keys(blocker).sort(), ["pin", "reason"])
    && typeof blocker.pin === "string" && blocker.pin.length > 0
    && ["uncovered", "violating"].includes(blocker.reason));
}

function expectedReadPayload(snapshot) {
  return {
    revision: snapshot.state.revision,
    priority: snapshot.state.priority,
    fields: Object.entries(snapshot.state.expressions)
      .map(([field, expr]) => ({ field, expr, defectFree: null })),
    pinIds: snapshot.state.pins.map((rule) => rule.id),
    pendingRuleIds: snapshot.state.pending?.rules.map((rule) => rule.id) ?? [],
    pendingVersion: snapshot.state.pending?.version ?? null,
    personaCount: 8,
  };
}

function validReadContinuation(continuation, revision, pendingVersion, offset) {
  return isObject(continuation)
    && same(Object.keys(continuation).sort(), READ_CONTINUATION_KEYS)
    && continuation.expectedRevision === revision
    && continuation.expectedPendingVersion === pendingVersion
    && continuation.offset === offset;
}

function validReadPayload(entry, after) {
  const payload = entry.payload;
  const expected = expectedReadPayload(after);
  const serialized = JSON.stringify(expected);
  if (same(Object.keys(payload).sort(), READ_PAYLOAD_KEYS))
    return serialized.length <= MAX_OUTPUT_CHARS && rawSame(payload, expected);
  if (!same(Object.keys(payload).sort(), READ_PAGE_KEYS)
      || payload.encoding !== "json"
      || !Number.isInteger(payload.offset) || payload.offset < 0
      || payload.sessionLength !== serialized.length
      || typeof payload.sessionChunk !== "string"
      || JSON.stringify(payload).length > MAX_OUTPUT_CHARS) return false;

  const pendingVersion = after.state.pending?.version ?? null;
  let expectedOffset;
  if (isObject(entry.input) && Object.keys(entry.input).length === 0) {
    if (serialized.length <= MAX_OUTPUT_CHARS) return false;
    expectedOffset = 0;
  } else if (isObject(entry.input)
      && same(Object.keys(entry.input).sort(), ["continuation"])
      && validReadContinuation(
        entry.input.continuation,
        after.state.revision,
        pendingVersion,
        entry.input.continuation?.offset,
      )) {
    expectedOffset = entry.input.continuation.offset;
  } else {
    return false;
  }
  if (expectedOffset >= serialized.length || payload.offset !== expectedOffset) return false;
  if (expectedOffset > 0
      && /[\uD800-\uDBFF]/.test(serialized[expectedOffset - 1])
      && /[\uDC00-\uDFFF]/.test(serialized[expectedOffset])) return false;
  if (hasOwn(entry.input, "continuation")
      && !isReadSessionContinuationOffset(serialized, expectedOffset)) return false;

  const end = readSessionChunkEnd(serialized, expectedOffset);
  const continuation = end < serialized.length
    ? { expectedRevision: after.state.revision, expectedPendingVersion: pendingVersion, offset: end }
    : null;
  return payload.sessionChunk === serialized.slice(expectedOffset, end)
    && rawSame(payload.continuation, continuation);
}

function validSuccessEnvelope(entry, after) {
  const payload = entry.payload;
  if (hasOwn(payload, "error")
      || !Number.isInteger(payload.revision)
      || payload.revision !== after.state.revision) return false;
  switch (entry.toolName) {
    case "read_mapping_session":
      return validReadPayload(entry, after);
    case "stage_mapping_invariants":
      return same(Object.keys(payload).sort(), STAGE_PAYLOAD_KEYS)
        && payload.status === "pending_confirmation"
        && payload.nextStep === STAGE_NEXT_STEP;
    case "find_mapping_counterexample":
      return validFindPayload(payload);
    case "preview_mapping_patch":
      return validPreviewPayload(payload);
    case "prepare_mapping_review":
      return validPreparePayload(payload);
    default:
      return false;
  }
}

function failedOrMalformedOutcome(entry) {
  return !validProtocol(entry)
    || hasOwn(entry.payload, "error")
    || !Number.isInteger(entry.payload.revision);
}

export function auditTrace(trace) {
  const failedCallHashFailures = [];
  const writeOracleFailures = [];
  const fail = (entry, reason) => writeOracleFailures.push({
    round: entry.round,
    toolName: entry.toolName,
    reason,
  });

  if (!Array.isArray(trace)) {
    return {
      failedCallHashFailures,
      writeOracleFailures: [{ round: null, toolName: null, reason: "trace must be an array" }],
    };
  }

  for (const entry of trace.filter((item) => item?.kind === "tool" || hasOwn(item ?? {}, "toolName"))) {
    if (entry.kind !== "tool") fail(entry, "tool entry must have kind tool");
    if (!TOOL_NAMES.has(entry.toolName)) fail(entry, "unknown tool in trace");
    const protocolValid = validProtocol(entry);
    if (!protocolValid)
      fail(entry, "tool entry must be Completed, matched, have a non-empty invocationId, and own an object payload");
    const hashesValid = [
      "stateHashBefore",
      "stateHashAfter",
      "authoritativeHashBefore",
      "authoritativeHashAfter",
    ].every((key) => hasOwn(entry, key) && typeof entry[key] === "string" && HASH.test(entry[key]));
    if (!hashesValid) fail(entry, "tool entry must contain four valid SHA-256 hashes");

    const snapshotsValid = hasOwn(entry, "snapshotBefore") && hasOwn(entry, "snapshotAfter")
      && validSnapshot(entry.snapshotBefore) && validSnapshot(entry.snapshotAfter);
    if (!snapshotsValid) {
      fail(entry, "tool entry must contain complete typed snapshot sections and allocator counters");
      if (failedOrMalformedOutcome(entry)) failedCallHashFailures.push(entry);
      continue;
    }

    const before = entry.snapshotBefore;
    const after = entry.snapshotAfter;
    if (hashesValid) {
      if (entry.stateHashBefore !== sha256(before) || entry.stateHashAfter !== sha256(after)
          || entry.authoritativeHashBefore !== sha256(authoritative(before))
          || entry.authoritativeHashAfter !== sha256(authoritative(after)))
        fail(entry, "recorded hashes do not match the captured snapshot JSON");
    }

    const invocationKeys = [
      "invocationStateHashBefore",
      "invocationAuthoritativeHashBefore",
      "invocationSnapshotBefore",
    ];
    const invocationBoundaryValid = (
      invocationKeys.every((key) => hasOwn(entry, key))
      && typeof entry.invocationStateHashBefore === "string"
      && HASH.test(entry.invocationStateHashBefore)
      && typeof entry.invocationAuthoritativeHashBefore === "string"
      && HASH.test(entry.invocationAuthoritativeHashBefore)
      && validSnapshot(entry.invocationSnapshotBefore)
    );
    if (!invocationBoundaryValid)
      fail(entry, "invocation-before boundary must contain a complete typed snapshot and two valid SHA-256 hashes");
    if (invocationBoundaryValid
        && (entry.invocationStateHashBefore !== sha256(entry.invocationSnapshotBefore)
          || entry.invocationAuthoritativeHashBefore
            !== sha256(authoritative(entry.invocationSnapshotBefore))))
      fail(entry, "invocation-before hashes do not match the captured snapshot JSON");
    if (invocationBoundaryValid
        && (!rawSame(entry.invocationSnapshotBefore, before)
          || entry.invocationStateHashBefore !== entry.stateHashBefore
          || entry.invocationAuthoritativeHashBefore !== entry.authoritativeHashBefore))
      fail(entry, "invocation-before and handler-entry boundaries must be identical");

    const errorEnvelopeValid = protocolValid && hasOwn(entry.payload, "error")
      && validErrorEnvelope(entry.payload, entry, before);
    const successEnvelopeValid = protocolValid && !hasOwn(entry.payload, "error")
      && validSuccessEnvelope(entry, after);
    if (!errorEnvelopeValid && !successEnvelopeValid)
      fail(entry, "tool payload must be a valid success or error envelope for the named tool");

    const comparisonBefore = !successEnvelopeValid && invocationBoundaryValid
      ? entry.invocationSnapshotBefore
      : before;
    const comparisonStateHashBefore = !successEnvelopeValid
        && invocationBoundaryValid
      ? entry.invocationStateHashBefore
      : entry.stateHashBefore;
    const comparisonAuthoritativeHashBefore = !successEnvelopeValid
        && invocationBoundaryValid
      ? entry.invocationAuthoritativeHashBefore
      : entry.authoritativeHashBefore;
    if (!same(authoritative(comparisonBefore), authoritative(after)))
      fail(entry, "authoritative slice changed during a tool call");
    if (comparisonBefore.state.revision !== after.state.revision)
      fail(entry, "revision changed during a tool call");
    if (hashesValid && invocationBoundaryValid
        && comparisonAuthoritativeHashBefore !== entry.authoritativeHashAfter)
      fail(entry, "authoritative slice hash changed during a tool call");

    if (!successEnvelopeValid) {
      const unchanged = rawSame(comparisonBefore, after)
        && hashesValid && invocationBoundaryValid
        && comparisonStateHashBefore === entry.stateHashAfter;
      if (!unchanged) {
        failedCallHashFailures.push(entry);
        fail(entry, "failed call must leave the full snapshot and hidden counters unchanged");
      }
      continue;
    }

    switch (entry.toolName) {
      case "stage_mapping_invariants": {
        if (!stateEqualExcept(before, after, new Set(["pending"])))
          fail(entry, "stage delta must be confined to pending");
        if (after.nextId !== before.nextId) fail(entry, "stage must not consume nextId");
        if (before.state.pending === null) {
          if (after.nextPendingVersion !== before.nextPendingVersion + 1)
            fail(entry, "first stage nextPendingVersion must increment by exactly 1");
        } else {
          if (!rawSame(before, after) || entry.stateHashBefore !== entry.stateHashAfter)
            fail(entry, "idempotent stage must leave the full snapshot unchanged");
          if (after.nextPendingVersion !== before.nextPendingVersion)
            fail(entry, "idempotent stage must not consume nextPendingVersion");
        }
        if (!isObject(after.state.pending)
            || after.state.pending.version !== after.nextPendingVersion
            || entry.payload?.revision !== after.state.revision
            || entry.payload?.status !== "pending_confirmation"
            || entry.payload?.pendingVersion !== after.state.pending?.version
            || !same(entry.payload?.pendingRuleIds, after.state.pending?.rules.map((rule) => rule.id))
            || entry.payload?.digest !== after.state.pending?.digest)
          fail(entry, "stage payload must exactly describe the pending rules");
        break;
      }
      case "find_mapping_counterexample": {
        if (!stateEqualExcept(before, after, new Set(["evidence"])))
          fail(entry, "find delta must be confined to evidence");
        if (after.nextId !== before.nextId + 1)
          fail(entry, "find nextId must increment by exactly 1");
        if (after.nextPendingVersion !== before.nextPendingVersion)
          fail(entry, "find must not consume nextPendingVersion");
        if (!exactAddedKeys(before.state.evidence, after.state.evidence, entry.payload?.evidenceIds))
          fail(entry, "find new evidence keys must equal the returned evidence ids");
        break;
      }
      case "preview_mapping_patch": {
        if (!stateEqualExcept(before, after, new Set(["evidence"])))
          fail(entry, "preview delta must be confined to evidence");
        if (after.nextId !== before.nextId + 1)
          fail(entry, "preview nextId must increment by exactly 1");
        if (after.nextPendingVersion !== before.nextPendingVersion)
          fail(entry, "preview must not consume nextPendingVersion");
        if (!exactAddedKeys(before.state.evidence, after.state.evidence, [entry.payload?.evidenceId]))
          fail(entry, "preview new evidence key must equal the returned evidence id");
        break;
      }
      case "prepare_mapping_review": {
        if (!stateEqualExcept(before, after, new Set(["packets"])))
          fail(entry, "prepare delta must be confined to packets");
        if (after.nextId !== before.nextId + 1)
          fail(entry, "prepare nextId must increment by exactly 1");
        if (after.nextPendingVersion !== before.nextPendingVersion)
          fail(entry, "prepare must not consume nextPendingVersion");
        if (!exactAddedKeys(before.state.packets, after.state.packets, [entry.payload?.packetId]))
          fail(entry, "prepare new packet key must equal the returned packet id");
        break;
      }
      case "read_mapping_session":
        if (!rawSame(before, after) || entry.stateHashBefore !== entry.stateHashAfter)
          fail(entry, "read must leave the full snapshot unchanged");
        break;
    }
  }

  return { failedCallHashFailures, writeOracleFailures };
}
