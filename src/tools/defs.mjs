// Isomorphic tool surface — SPEC.md r2 §7, complete contracts. Imported unchanged
// by the page (app.js), the tests, and the ablation. Zero node-only imports.
import { parse } from "../engine/parser.mjs";
import { evaluate } from "../engine/eval.mjs";
import { findWitness } from "../engine/witness.mjs";
import { redactPayload, assertNoCanary } from "./redact.mjs";

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

const PIN_SHAPES = {
  forbidden_group: ["personaCategory", "group"],
  null_if_missing: ["field", "dependsOn"],
  source_of_truth: ["field", "source"],
};

const failure = (code, extra = {}) => ({ ok: false, error: { code, ...extra } });
const mismatch = (s) => failure("REVISION_MISMATCH", { currentRevision: s.revision });

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
    const invariants = args.invariants ?? [];
    if (!Array.isArray(invariants) || invariants.length > 8)
      return failure("BAD_RULE", { reason: "invariants must be an array of at most 8" });
    const withIds = invariants.map((inv, i) => {
      const shape = PIN_SHAPES[inv.type];
      if (!shape) throw Object.assign(new Error(`unknown invariant type ${inv.type}`), { code: "BAD_RULE" });
      for (const k of shape) if (!(k in inv))
        throw Object.assign(new Error(`invariant ${inv.type} missing ${k}`), { code: "BAD_RULE" });
      return { id: inv.id ?? `pin-${i + 1}`, ...inv };
    });
    store.dispatch({ type: "PIN_INVARIANTS", invariants: withIds }); // full replace, bumps
    const after = store.getState();
    return { ok: true, payload: { revision: after.revision, pinIds: after.pins.map((p) => p.id) } };
  },

  find_mapping_counterexample(store, personas, args) {
    const s = store.getState();
    if (args.expectedRevision !== s.revision) return mismatch(s);
    let pins = s.pins;
    if (args.invariantIds) {
      const known = new Set(s.pins.map((p) => p.id));
      for (const id of args.invariantIds) if (!known.has(id))
        return failure("BAD_RULE", { reason: `unknown invariant id ${id}` });
      pins = s.pins.filter((p) => args.invariantIds.includes(p.id));
    }
    const r = findWitness({ ...s, pins }, personas);
    if (r.violations.length === 0) return failure("NO_COUNTEREXAMPLE", { checked: personas.length });
    const evidenceId = store.recordEvidence("counterexample", {
      fields: Object.keys(s.expressions),
      invariants: pins.map((p) => p.id),
      personas: personas.map((p) => p.id),
    }, { violations: r.violations, personaIds: r.personaIds });
    return { ok: true, payload: {
      revision: s.revision,
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
    const ids = args.evidenceIds ?? [];
    const staleIds = ids.filter((id) => !s.evidence[id] || s.evidence[id].stale);
    if (staleIds.length) return failure("STALE_EVIDENCE", { staleIds });
    const evidences = ids.map((id) => s.evidence[id]);
    const coveredPins = new Set(evidences.flatMap((e) => e.fingerprint.invariants));
    const coverage = {};
    const blockers = [];
    for (const pin of s.pins) {
      coverage[pin.id] = coveredPins.has(pin.id);
      if (!coverage[pin.id]) { blockers.push({ pin: pin.id, reason: "uncovered" }); continue; }
      const newest = evidences.filter((e) => e.fingerprint.invariants.includes(pin.id)).at(-1);
      const stillViolating = (newest.payload.violations ?? []).some((v) => v.invariantId === pin.id);
      if (stillViolating) blockers.push({ pin: pin.id, reason: "violating" });
    }
    const packet = { revision: s.revision, coverage, blockers, evidenceIds: ids };
    try { assertNoCanary(redactPayload(packet)); }
    catch (e) { return failure("PII_GUARD", { reason: e.message }); }
    const packetId = store.recordPacket(ids, Object.keys(coverage), blockers);
    return { ok: true, payload: { revision: s.revision, packetId, coverage, blockers } };
  },
};

export const TOOLS = [
  { name: "read_mapping_session",
    description: "Report the current UNSAVED mapping session: revision, source priority order, per-field draft expressions, pinned invariant ids, persona pool size. Read-only; values are redacted of personal data.",
    inputSchema: { type: "object", properties: {} },
    annotations: { readOnlyHint: true } },
  { name: "stage_mapping_invariants",
    description: "Replace the full set of human business invariants pinned to this drafting session (never persisted). Requires expectedRevision; bumps the session revision.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "number" },
      invariants: { type: "array", items: { type: "object" } } },
      required: ["expectedRevision", "invariants"] },
    annotations: { readOnlyHint: false } },
  { name: "find_mapping_counterexample",
    description: "Evaluate every synthetic persona against the UNSAVED draft and return the minimal persona set witnessing every violated pinned invariant, with redacted field-level provenance and evidence ids.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "number" },
      invariantIds: { type: "array", items: { type: "string" } },
      maxPersonas: { type: "number" } },
      required: ["expectedRevision"] },
    annotations: { readOnlyHint: true } },
  { name: "preview_mapping_patch",
    description: "Preview a candidate expression fix against named personas WITHOUT editing the draft: redacted before/after diffs and remaining violations. The human applies edits in the UI themselves.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "number" }, field: { type: "string" },
      expr: { type: "string" }, personaIds: { type: "array", items: { type: "string" } } },
      required: ["expectedRevision", "field", "expr", "personaIds"] },
    annotations: { readOnlyHint: true } },
  { name: "prepare_mapping_review",
    description: "Assemble a review packet from fresh evidence ids. Fails on stale evidence (the human edited since) and on any privacy-guard trip. Enables the human's plain Review button; never sends or applies anything.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "number" },
      evidenceIds: { type: "array", items: { type: "string" } } },
      required: ["expectedRevision", "evidenceIds"] },
    annotations: { readOnlyHint: true } },
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

export function runTool(store, personas, name, args) {
  const h = HANDLERS[name];
  if (!h) return { ok: false, error: { code: "UNKNOWN_TOOL", name } };
  let r;
  try { r = h(store, personas, args ?? {}); }
  catch (e) { r = { ok: false, error: { code: e.code ?? "EVALUATOR_FAILED", reason: String(e.message ?? e) } }; }
  if (!r.ok) return r;
  let payload = redactPayload(r.payload);
  try { assertNoCanary(payload); } catch (e) { return failure("PII_GUARD", { reason: e.message }); }
  if (JSON.stringify(payload).length > 1500) {
    const small = shrink(payload);
    if (!small || JSON.stringify(small).length > 1500)
      return failure("EVALUATOR_FAILED", { reason: "payload budget exceeded" });
    payload = small;
  }
  return { ok: true, payload };
}
