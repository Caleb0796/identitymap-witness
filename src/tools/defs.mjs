// Isomorphic tool surface — SPEC.md r5 §7, complete contracts. Imported unchanged
// by the page (app.js), the tests, and the ablation. Zero node-only imports.
import { parse } from "../engine/parser.mjs";
import { evaluate } from "../engine/eval.mjs";
import { findWitness } from "../engine/witness.mjs";
import { redactPayload, assertNoCanary } from "./redact.mjs";
import {
  MAX_EVIDENCE_ID_CHARS,
  MAX_EVIDENCE_IDS,
  MAX_EXPRESSION_CHARS,
  MAX_INVARIANT_ID_CHARS,
  MAX_INVARIANT_IDS,
  MAX_INVARIANTS,
  MAX_PERSONA_ID_CHARS,
  MAX_PERSONA_IDS,
  MAX_READ_SESSION_CHARS,
  MAX_REVISION,
  MAX_RULE_TEXT_CHARS,
  OUTPUT_FIELDS,
  validateInvariants,
  validateMaxPersonas,
  validateToolInput,
  validateToolInputHeader,
} from "./validate.mjs";

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
  pending: null,
};

const failure = (code, extra = {}) => ({ ok: false, error: { code, ...extra } });
const mismatch = (s) => failure("REVISION_MISMATCH", { currentRevision: s.revision });
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
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
const noInvariants = (s, emptySelection = false) => failure("NO_INVARIANTS", {
  reason: emptySelection
    ? "no invariants selected — omit invariantIds to check all confirmed rules, or pass confirmed ids returned by read_mapping_session"
    : s.pending
      ? "no confirmed invariants — pending rules await confirmation by the human"
      : "no confirmed invariants — call stage_mapping_invariants with the complete rule set, ask the human to Confirm all, then call read_mapping_session",
});

const HANDLERS = {
  read_mapping_session(store, personas, args) {
    const s = store.getState();
    const payload = {
      revision: s.revision,
      priority: s.priority,
      fields: Object.entries(s.expressions).map(([field, expr]) => ({ field, expr, defectFree: null })),
      pinIds: s.pins.map((p) => p.id),
      pendingRuleIds: s.pending?.rules.map((rule) => rule.id) ?? [],
      pendingVersion: s.pending?.version ?? null,
      personaCount: personas.length,
    };
    const serialized = JSON.stringify(redactPayload(payload));
    if (!args.continuation && serialized.length <= MAX_OUTPUT_CHARS)
      return { ok: true, payload };

    const expectedRevision = args.continuation?.expectedRevision ?? s.revision;
    const expectedPendingVersion = args.continuation
      ? args.continuation.expectedPendingVersion
      : (s.pending?.version ?? null);
    const offset = args.continuation?.offset ?? 0;
    if (expectedRevision !== s.revision) return mismatch(s);
    if (expectedPendingVersion !== (s.pending?.version ?? null))
      return failure("INVALID_INPUT", {
        reason: "continuation no longer matches the current session — restart read_mapping_session",
      });
    if (offset >= serialized.length)
      return failure("INVALID_INPUT", { reason: "continuation offset exceeds session length" });
    if (offset > 0
        && /[\uD800-\uDBFF]/.test(serialized[offset - 1])
        && /[\uDC00-\uDFFF]/.test(serialized[offset]))
      return failure("INVALID_INPUT", { reason: "continuation offset splits a Unicode character" });
    if (args.continuation && !isReadSessionContinuationOffset(serialized, offset))
      return failure("INVALID_INPUT", { reason: "continuation offset is not a page boundary" });
    const end = readSessionChunkEnd(serialized, offset);
    const continuation = end < serialized.length
      ? { expectedRevision, expectedPendingVersion, offset: end }
      : null;
    return { ok: true, payload: {
      revision: s.revision,
      encoding: "json",
      sessionChunk: serialized.slice(offset, end),
      offset,
      sessionLength: serialized.length,
      continuation,
    } };
  },

  stage_mapping_invariants(store, _personas, args) {
    const s = store.getState();
    if (args.expectedRevision !== s.revision) return mismatch(s);
    const withIds = validateInvariants(args.invariants);
    store.dispatch({ type: "STAGE_RULES", rules: withIds });
    const after = store.getState();
    return { ok: true, payload: {
      revision: after.revision,
      status: "pending_confirmation",
      pendingVersion: after.pending.version,
      pendingRuleIds: after.pending.rules.map((rule) => rule.id),
      digest: after.pending.digest,
      nextStep: "the human must review and confirm the pending rules on the page; then call read_mapping_session",
    } };
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
    if (pins.length === 0)
      return noInvariants(s, s.pins.length > 0 && args.invariantIds?.length === 0);
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
    if (!hasOwn(s.expressions, args.field))
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
    if (s.pins.length === 0) return noInvariants(s);
    const ids = args.evidenceIds ?? [];
    if (ids.length === 0) return failure("NO_EVIDENCE", {
      reason: "no evidence ids supplied — run find_mapping_counterexample at the current revision and pass its evidenceIds",
    });
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
    description: "Read the current unsaved mapping session. Normally returns all page-committed expressions and metadata. If that JSON exceeds the output budget, returns an exact JSON sessionChunk plus a continuation; concatenate chunks and pass each returned continuation in order. Changing or skipping a cursor can yield incomplete JSON. Continuations fence revision and pending version. Never returns profile values or changes state. Use its revision for every other tool.",
    inputSchema: { type: "object", properties: {
      continuation: { type: "object", properties: {
        expectedRevision: { type: "integer", minimum: 0, maximum: MAX_REVISION,
          description: "Revision from the paged summary; a changed session returns REVISION_MISMATCH." },
        expectedPendingVersion: { type: ["integer", "null"], minimum: 1, maximum: MAX_REVISION,
          description: "Pending version from the previous continuation; detects same-revision staging changes." },
        offset: { type: "integer", minimum: 0, maximum: MAX_READ_SESSION_CHARS,
          description: "Serialized JSON offset named by the previous continuation." },
      }, required: ["expectedRevision", "expectedPendingVersion", "offset"], additionalProperties: false,
      description: "Pass each returned continuation in order; changing or skipping a cursor can yield incomplete JSON." },
    }, additionalProperties: false },
    annotations: { readOnlyHint: true, untrustedContentHint: true } },
  { name: "stage_mapping_invariants",
    description: "Stage the complete proposed invariant set for visible human review. expectedRevision must match the current session. Staging does not confirm, persist, or change revision; later confirmation replaces the pinned set. Returns pending ids/version/digest. On success, stop for the human to choose Confirm all or Discard, then re-read. If UNCOMMITTED_DRAFT, ask the human to blur or revert the visible edits, then re-read.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "integer", minimum: 0, maximum: MAX_REVISION,
        description: "Exact revision returned by the latest read_mapping_session; REVISION_MISMATCH reports the current revision when stale." },
      invariants: { type: "array", minItems: 1, maxItems: MAX_INVARIANTS,
        description: "Complete 1–8 rule proposal. Human confirmation replaces the pinned set; staging alone does not activate it.",
        items: { oneOf: [
        { type: "object", properties: {
          id: { type: "string", minLength: 1, maxLength: MAX_INVARIANT_ID_CHARS,
            description: "Optional stable rule id; omitted ids become pin-N. Resolved ids must be unique." },
          type: { type: "string", enum: ["forbidden_group"],
            description: "Rule semantics; use the exact branch whose required properties match this value." },
          personaCategory: { type: "string", minLength: 1, maxLength: MAX_RULE_TEXT_CHARS,
            description: "Synthetic persona category to which the forbidden-group rule applies, compared case-insensitively." },
          group: { type: "string", minLength: 1, maxLength: MAX_RULE_TEXT_CHARS,
            description: "Resolved group forbidden for that persona category, compared case-insensitively." },
        }, required: ["type", "personaCategory", "group"], additionalProperties: false },
        { type: "object", properties: {
          id: { type: "string", minLength: 1, maxLength: MAX_INVARIANT_ID_CHARS,
            description: "Optional stable rule id; omitted ids become pin-N. Resolved ids must be unique." },
          type: { type: "string", enum: ["null_if_missing"],
            description: "Rule semantics; use the exact branch whose required properties match this value." },
          field: { type: "string", enum: OUTPUT_FIELDS,
            description: "Target field that must remain null when dependsOn is absent from every source." },
          dependsOn: { type: "string", minLength: 1, maxLength: MAX_RULE_TEXT_CHARS,
            description: "Source-profile property whose absence across okta, hris, and ad triggers the null requirement." },
        }, required: ["type", "field", "dependsOn"], additionalProperties: false },
        { type: "object", properties: {
          id: { type: "string", minLength: 1, maxLength: MAX_INVARIANT_ID_CHARS,
            description: "Optional stable rule id; omitted ids become pin-N. Resolved ids must be unique." },
          type: { type: "string", enum: ["source_of_truth"],
            description: "Rule semantics; use the exact branch whose required properties match this value." },
          field: { type: "string", enum: OUTPUT_FIELDS,
            description: "Target field whose winning provenance must be source when that source supplies a nonempty value." },
          source: { type: "string", enum: ["okta", "hris", "ad"],
            description: "Required source of truth when it supplies a nonempty value." },
        }, required: ["type", "field", "source"], additionalProperties: false },
      ] } } },
      required: ["expectedRevision", "invariants"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true } },
  { name: "find_mapping_counterexample",
    description: "Evaluate all synthetic personas (eight in this fixture) against confirmed invariants at expectedRevision. Returns canonical minimum witness personaIds, every violation row, scope/fullSweep flags, and one closing evidence id; records evidence but never edits the draft. Requires a nonempty confirmed/selected set. After any human edit, re-read and re-find because old evidence becomes stale. If UNCOMMITTED_DRAFT, ask the human to blur or revert the visible edits, then re-read.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "integer", minimum: 0, maximum: MAX_REVISION,
        description: "Exact revision returned by the latest read_mapping_session; REVISION_MISMATCH reports the current revision when stale." },
      invariantIds: { type: "array", maxItems: MAX_INVARIANT_IDS, uniqueItems: true,
        description: "Optional confirmed-id subset. Omit to check all; an empty array checks none and returns NO_INVARIANTS.",
        items: { type: "string", minLength: 1, maxLength: MAX_INVARIANT_ID_CHARS } },
      maxPersonas: { type: "integer", minimum: 1, maximum: 8,
        description: "Optional 1–8 hard cap; WITNESS_EXCEEDS_CAP reports the required minimum size." } },
      required: ["expectedRevision"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true } },
  { name: "preview_mapping_patch",
    description: "Evaluate one candidate expr for field on the named personaIds at expectedRevision without editing the draft. Returns identity-minimized diffs, remaining violations for that field within those personas, and a non-closing preview evidence id. Use persona ids returned by find_mapping_counterexample; UNKNOWN_PERSONA identifies a bad id. The human makes any edit in the page. If UNCOMMITTED_DRAFT, ask the human to blur or revert the visible edits, then re-read.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "integer", minimum: 0, maximum: MAX_REVISION,
        description: "Exact revision returned by the latest read_mapping_session; REVISION_MISMATCH reports the current revision when stale." },
      field: { type: "string", enum: OUTPUT_FIELDS,
        description: "Target draft field to simulate; the tool does not edit it." },
      expr: { type: "string", maxLength: MAX_EXPRESSION_CHARS,
        description: "Candidate expression to evaluate, at most 512 characters; it is never written to the draft." },
      personaIds: { type: "array", minItems: 1, maxItems: MAX_PERSONA_IDS, uniqueItems: true,
        description: "One to eight existing synthetic ids, normally returned by find_mapping_counterexample.personaIds.",
        items: { type: "string", minLength: 1, maxLength: MAX_PERSONA_ID_CHARS } } },
      required: ["expectedRevision", "field", "expr", "personaIds"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true } },
  { name: "prepare_mapping_review",
    description: "Create a review packet at expectedRevision from evidenceIds. Empty, missing, or stale ids fail. Only current counterexample or clean-sweep evidence closes pins; preview evidence never does. Returns coverage and blockers and records a packet. A fresh packet with blockers:[] enables Apply mapping (manual page control); this tool never applies or sends anything. If UNCOMMITTED_DRAFT, ask the human to blur or revert the visible edits, then re-read.",
    inputSchema: { type: "object", properties: {
      expectedRevision: { type: "integer", minimum: 0, maximum: MAX_REVISION,
        description: "Exact revision returned by the latest read_mapping_session; REVISION_MISMATCH reports the current revision when stale." },
      evidenceIds: { type: "array", maxItems: MAX_EVIDENCE_IDS, uniqueItems: true,
        description: "Fresh E-* ids returned by find or preview. Only counterexample and clean-sweep evidence can close pins.",
        items: { type: "string", minLength: 1, maxLength: MAX_EVIDENCE_ID_CHARS,
          pattern: "^E-[1-9]\\d*$" } } },
      required: ["expectedRevision", "evidenceIds"], additionalProperties: false },
    annotations: { readOnlyHint: false, untrustedContentHint: true } },
];

function shrink(payload) {
  if (!payload.violations) return null;
  let out = { ...payload,
    violations: payload.violations.map(({ invariantId, personaId, field }) => ({ invariantId, personaId, field })),
    violationsTotal: payload.violations.length,
    truncated: true };
  while (JSON.stringify(out).length > MAX_OUTPUT_CHARS && out.violations.length > 1)
    out = { ...out, violations: out.violations.slice(0, Math.ceil(out.violations.length / 2)) };
  return JSON.stringify(out).length <= MAX_OUTPUT_CHARS ? out : null;
}

const wireText = (r) => JSON.stringify(r.ok ? r.payload : { error: r.error });

function finalize(r) {
  const originalCode = r.ok ? null : r.error.code;
  let result = r.ok
    ? { ok: true, payload: redactPayload(r.payload) }
    : { ok: false, error: redactPayload(r.error) };
  let text = wireText(result);

  if (text.length > MAX_OUTPUT_CHARS) {
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
    try {
      validateToolInputHeader(name, args);
      if (name !== "read_mapping_session" && args.expectedRevision !== store.getState().revision)
        r = mismatch(store.getState());
      else {
        validateToolInput(name, args);
        r = h(store, personas, args);
      }
    }
    catch (e) { r = failure(e.code ?? "EVALUATOR_FAILED", { reason: String(e.message ?? e) }); }
  }
  const result = finalize(r);
  if (!result.ok && name !== "read_mapping_session") store.restore(snap);
  return result;
}

export function createToolExecutor(store, personas, name, onResult, precondition) {
  return async (args, context = {}) => {
    const { signal } = context;
    if (signal?.aborted) {
      return { content: [{ type: "text", text: '{"error":{"code":"ABORTED"}}' }] };
    }
    let result;
    if (typeof precondition === "function") {
      try {
        const preconditionError = await precondition(args, context);
        if (preconditionError) {
          const { code, ...detail } = preconditionError;
          result = finalize(failure(code, detail));
        }
      } catch (e) {
        result = finalize(failure(e.code ?? "EVALUATOR_FAILED", {
          reason: String(e.message ?? e),
        }));
      }
    }
    if (signal?.aborted) {
      return { content: [{ type: "text", text: '{"error":{"code":"ABORTED"}}' }] };
    }
    if (!result) result = runTool(store, personas, name, args);
    onResult(result);
    return { content: [{ type: "text", text: wireText(result) }] };
  };
}

export async function registerToolDefinitions(tools, register, makeDefinition, signal, onRegistered) {
  const catalog = new AbortController();
  const abortCatalog = () => catalog.abort(signal?.reason);
  if (signal?.aborted) abortCatalog();
  else signal?.addEventListener("abort", abortCatalog, { once: true });
  let registeredCount = 0;
  for (const tool of tools) {
    if (catalog.signal.aborted) return { registeredCount: 0, failed: true };
    try {
      await Promise.resolve(register(makeDefinition(tool), { signal: catalog.signal }));
      if (catalog.signal.aborted) return { registeredCount: 0, failed: true };
      registeredCount += 1;
      onRegistered(registeredCount);
    } catch {
      signal?.removeEventListener("abort", abortCatalog);
      catalog.abort();
      return { registeredCount: 0, failed: true };
    }
  }
  if (catalog.signal.aborted) return { registeredCount: 0, failed: true };
  return { registeredCount, failed: false };
}
