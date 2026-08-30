// Isomorphic tool surface — SPEC.md r4 §7, complete contracts. Imported unchanged
// by the page (app.js), the tests, and the ablation. Zero node-only imports.
import { parse } from "../engine/parser.mjs";
import { evaluate } from "../engine/eval.mjs";
import { findWitness } from "../engine/witness.mjs";
import { redactPayload, assertNoCanary } from "./redact.mjs";
import { OUTPUT_FIELDS, validateInvariants, validateMaxPersonas } from "./validate.mjs";

export const GOLDEN_STATE = {
  revision: 17,
  priority: ["ad", "hris"],
  expressions: {
    displayName: 'user.firstName + " " + user.lastName',
    group: 'user.userType == "contractor" ? "contractors" : "employees"',
    managerId: 'user.managerId == null ? "" : user.managerId',
    department: "user.department",
    email: "user.email",
  },
  pins: [],
};

const failure = (code, extra = {}) => ({ ok: false, error: { code, ...extra } });
const mismatch = (s) => failure("REVISION_MISMATCH", { currentRevision: s.revision });
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const noInvariants = () => failure("NO_INVARIANTS", {
  reason: "no pinned invariants — ask the human to pin business rules first",
});

const HANDLERS = {
  read_mapping_session(store, personas) {
    const s = store.getState();
    return { ok: true, payload: {
      revision: s.revision,
      priority: s.priority,
      fields: Object.entries(s.expressions).map(([field, expr]) => ({ field, expr, defectFree: null })),
      pinIds: s.pins.map((p) => p.id),
      personaCount: personas.length,
    } };
  },

  stage_mapping_invariants(store, _personas, args) {
    const s = store.getState();
    if (args.expectedRevision !== s.revision) return mismatch(s);
    const withIds = validateInvariants(args.invariants);
    store.dispatch({ type: "PIN_INVARIANTS", invariants: withIds }); // full replace, bumps
    const after = store.getState();
    return { ok: true, payload: { revision: after.revision, pinIds: after.pins.map((p) => p.id) } };
  },

  find_mapping_counterexample(store, personas, args) {
    const s = store.getState();
    if (args.expectedRevision !== s.revision) return mismatch(s);
    validateMaxPersonas(args.maxPersonas);
    let pins = s.pins;
    if (args.invariantIds) {
      const known = new Set(s.pins.map((p) => p.id));
      for (const id of args.invariantIds) if (!known.has(id))
        return failure("BAD_RULE", { reason: `unknown invariant id ${id}` });
      pins = s.pins.filter((p) => args.invariantIds.includes(p.id));
    }
    if (pins.length === 0) return noInvariants();
    const checkedInvariantIds = pins.map((p) => p.id);
    const confirmedInvariantIds = new Set(s.pins.map((p) => p.id));
    const checkedInvariantSet = new Set(checkedInvariantIds);
    const fullSweep = checkedInvariantSet.size === confirmedInvariantIds.size
      && [...confirmedInvariantIds].every((id) => checkedInvariantSet.has(id));
    const r = findWitness({ ...s, pins }, personas);
    if (args.maxPersonas !== undefined && r.personaIds.length > args.maxPersonas)
      return failure("WITNESS_EXCEEDS_CAP", {
        witnessSize: r.personaIds.length,
        maxPersonas: args.maxPersonas,
      });
    if (r.violations.length === 0) {
      // Clean sweep is still evidence — recorded so a green packet can cite it.
      const evidenceId = store.recordEvidence("clean-sweep", {
        fields: Object.keys(s.expressions),
        invariants: checkedInvariantIds,
        personas: personas.map((p) => p.id),
      }, { violations: [] });
      return { ok: true, payload: {
        revision: s.revision,
        cleanSweep: true,
        fullSweep,
        checkedInvariantIds,
        confirmedInvariantCount: s.pins.length,
        checked: personas.length,
        personaIds: [],
        violations: [],
        evidenceIds: [evidenceId],
      } };
    }
    const evidenceId = store.recordEvidence("counterexample", {
      fields: Object.keys(s.expressions),
      invariants: checkedInvariantIds,
      personas: personas.map((p) => p.id),
    }, { violations: r.violations, personaIds: r.personaIds });
    return { ok: true, payload: {
      revision: s.revision,
      cleanSweep: false,
      fullSweep,
      checkedInvariantIds,
      personaIds: r.personaIds,
      violations: r.violations,
      coverage: r.coverage,
      evidenceIds: [evidenceId],
    } };
  },

  preview_mapping_patch(store, personas, args) {
    const s = store.getState();
    if (args.expectedRevision !== s.revision) return mismatch(s);
    if (!(args.field in s.expressions))
      return failure("INVALID_AST", { reason: `unknown target field ${args.field}`, position: 0 });
    let patchedAst;
    try { patchedAst = parse(args.expr); }
    catch (e) { return failure("INVALID_AST", { reason: e.message, position: e.position ?? 0 }); }
    const pool = new Map(personas.map((p) => [p.id, p]));
    for (const id of args.personaIds ?? []) if (!pool.has(id)) return failure("UNKNOWN_PERSONA", { personaId: id });
    const named = (args.personaIds ?? []).map((id) => pool.get(id));
    const originalAst = parse(s.expressions[args.field]);
    const diffs = named.map((p) => ({
      personaId: p.id,
      field: args.field,
      before: evaluate(originalAst, p, { priority: s.priority }).value,
      after: evaluate(patchedAst, p, { priority: s.priority }).value,
    }));
    const patchedState = { ...s, expressions: { ...s.expressions, [args.field]: args.expr } };
    const after = findWitness(patchedState, named);
    const remainingViolations = after.violations.filter((v) => v.field === args.field).length;
    const evidenceId = store.recordEvidence("patch-preview", {
      fields: [args.field],
      invariants: s.pins.map((p) => p.id),
      personas: named.map((p) => p.id),
    }, { remainingViolations });
    return { ok: true, payload: { revision: s.revision, field: args.field, diffs, remainingViolations, evidenceId } };
  },

  prepare_mapping_review(store, _personas, args) {
    const s = store.getState();
    if (args.expectedRevision !== s.revision) return mismatch(s);
    if (s.pins.length === 0) return noInvariants();
    const ids = args.evidenceIds ?? [];
    if (ids.length === 0) return failure("NO_EVIDENCE");
    const staleIds = ids.filter((id) => !hasOwn(s.evidence, id) || s.evidence[id].stale);
    if (staleIds.length) return failure("STALE_EVIDENCE", { staleIds });
    const evidences = ids.map((id) => s.evidence[id]);
    // SAFETY (run2 review): only evidence that asserts on the CURRENT draft may
    // close a pin. A patch-preview is hypothetical — the draft was never edited —
    // so it can ride along in a packet but never counts toward coverage.
    const CLOSING_KINDS = new Set(["counterexample", "clean-sweep"]);
    const closing = evidences.filter((e) => CLOSING_KINDS.has(e.kind));
    const coveredPins = new Set(closing.flatMap((e) => e.fingerprint.invariants));
    const coverageEntries = [];
    const blockers = [];
    for (const pin of s.pins) {
      const covered = coveredPins.has(pin.id);
      coverageEntries.push([pin.id, covered]);
      if (!covered) { blockers.push({ pin: pin.id, reason: "uncovered" }); continue; }
      const newest = closing.filter((e) => e.fingerprint.invariants.includes(pin.id)).at(-1);
      const stillViolating = (newest.payload.violations ?? []).some((v) => v.invariantId === pin.id);
      if (stillViolating) blockers.push({ pin: pin.id, reason: "violating" });
    }
    const coverage = Object.fromEntries(coverageEntries);
    const packet = { revision: s.revision, coverage, blockers, evidenceIds: ids };
    try { assertNoCanary(redactPayload(packet)); }
    catch (e) { return failure("PII_GUARD", { reason: e.message }); }
    const pinsCovered = coverageEntries.filter(([, covered]) => covered === true).map(([id]) => id);
    const packetId = store.recordPacket(ids, pinsCovered, blockers);
    return { ok: true, payload: { revision: s.revision, packetId, coverage, blockers, evidenceIds: ids } };
  },
};

export const TOOLS = [
  { name: "read_mapping_session",
    description: "Report the current UNSAVED mapping session: revision, source priority order, per-field draft expressions, pinned invariant ids, persona pool size. Read-only; values are redacted of personal data.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true } },
  { name: "stage_mapping_invariants",
    description: "Replace the full set of human business invariants pinned to this drafting session (never persisted). Requires expectedRevision; bumps the session revision.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "integer", minimum: 0 },
      invariants: { type: "array", minItems: 1, maxItems: 8, items: { oneOf: [
        { type: "object", properties: {
          id: { type: "string", minLength: 1 },
          type: { type: "string", enum: ["forbidden_group"] },
          personaCategory: { type: "string", minLength: 1 },
          group: { type: "string", minLength: 1 },
        }, required: ["type", "personaCategory", "group"], additionalProperties: false },
        { type: "object", properties: {
          id: { type: "string", minLength: 1 },
          type: { type: "string", enum: ["null_if_missing"] },
          field: { type: "string", enum: OUTPUT_FIELDS },
          dependsOn: { type: "string", minLength: 1 },
        }, required: ["type", "field", "dependsOn"], additionalProperties: false },
        { type: "object", properties: {
          id: { type: "string", minLength: 1 },
          type: { type: "string", enum: ["source_of_truth"] },
          field: { type: "string", enum: OUTPUT_FIELDS },
          source: { type: "string", enum: ["okta", "hris", "ad"] },
        }, required: ["type", "field", "source"], additionalProperties: false },
      ] } } },
      required: ["expectedRevision", "invariants"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true } },
  { name: "find_mapping_counterexample",
    description: "Evaluate every synthetic persona against the UNSAVED draft and return the minimal persona set witnessing every violated pinned invariant, with redacted field-level provenance and evidence ids.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "integer", minimum: 0 },
      invariantIds: { type: "array", items: { type: "string" } },
      maxPersonas: { type: "integer", minimum: 1, maximum: 8 } },
      required: ["expectedRevision"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true } },
  { name: "preview_mapping_patch",
    description: "Preview a candidate expression fix against named personas WITHOUT editing the draft: redacted before/after diffs and remaining violations. The human applies edits in the UI themselves.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "integer", minimum: 0 }, field: { type: "string" },
      expr: { type: "string" }, personaIds: { type: "array", items: { type: "string" } } },
      required: ["expectedRevision", "field", "expr", "personaIds"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true } },
  { name: "prepare_mapping_review",
    description: "Assemble a review packet from fresh evidence ids. Fails on stale evidence (the human edited since) and on any privacy-guard trip. Enables the human's plain Review button; never sends or applies anything.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "integer", minimum: 0 },
      evidenceIds: { type: "array", items: { type: "string" } } },
      required: ["expectedRevision", "evidenceIds"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true } },
];

function shrink(payload) {
  if (!payload.violations) return null;
  let out = { ...payload,
    violations: payload.violations.map(({ invariantId, personaId, field }) => ({ invariantId, personaId, field })),
    violationsTotal: payload.violations.length,
    truncated: true };
  while (JSON.stringify(out).length > 1500 && out.violations.length > 1)
    out = { ...out, violations: out.violations.slice(0, Math.ceil(out.violations.length / 2)) };
  return JSON.stringify(out).length <= 1500 ? out : null;
}

const wireText = (r) => JSON.stringify(r.ok ? r.payload : { error: r.error });

function finalize(r) {
  const originalCode = r.ok ? null : r.error.code;
  let result = r.ok
    ? { ok: true, payload: redactPayload(r.payload) }
    : { ok: false, error: redactPayload(r.error) };
  let text = wireText(result);

  if (text.length > 1500) {
    if (result.ok) {
      const small = shrink(result.payload);
      result = small
        ? { ok: true, payload: small }
        : failure("EVALUATOR_FAILED", { reason: "payload budget exceeded" });
    } else {
      result = failure(originalCode, { reason: "detail withheld by output budget" });
    }
    text = wireText(result);
  }

  try { assertNoCanary(text); }
  catch {
    result = failure(result.ok ? "PII_GUARD" : originalCode,
      { reason: "detail withheld by privacy guard" });
    text = wireText(result);
  }
  assertNoCanary(text);
  return result;
}

export function runTool(store, personas, name, args) {
  const snap = store.snapshot();
  const h = HANDLERS[name];
  let r;
  if (!h) {
    r = failure("UNKNOWN_TOOL", { name });
  } else {
    try { r = h(store, personas, args ?? {}); }
    catch (e) { r = failure(e.code ?? "EVALUATOR_FAILED", { reason: String(e.message ?? e) }); }
  }
  const result = finalize(r);
  if (!result.ok) store.restore(snap);
  return result;
}
