// Isomorphic tool surface. T2: STUB handlers, shape-correct per SPEC §7, values
// hardcoded from data/golden-walk.md. T9 replaces stubs with the real engine.
// No node-only imports — this module runs in the page, in tests, and in the ablation.

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

export function createStubStore(initial = GOLDEN_STATE) {
  const state = structuredClone(initial);
  state.evidence = {};
  state.packets = {};
  let lastFind = null;
  return {
    getState: () => state,
    stagePins(invariants) {
      state.pins = structuredClone(invariants);
      state.revision += 1;
    },
    setLastFind(v) { lastFind = v; },
    getLastFind: () => lastFind,
  };
}

const STUB_VIOLATIONS = [
  { invariantId: "inv-forbid", personaId: "P2", field: "group", detail: "STUB: category contractor mapped into employees" },
  { invariantId: "inv-null", personaId: "P3", field: "managerId", detail: "STUB: missing managerId coalesced to empty string" },
  { invariantId: "inv-sot", personaId: "P4", field: "department", detail: "STUB: provenance ad while hris holds Engineering" },
  { invariantId: "inv-sot", personaId: "P5", field: "department", detail: "STUB: present-but-empty ad value wins over hris" },
];

function mismatch(state) {
  return { ok: false, error: { code: "REVISION_MISMATCH", currentRevision: state.revision } };
}

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
    store.stagePins(args.invariants ?? []);
    return { ok: true, payload: { revision: store.getState().revision, pinIds: store.getState().pins.map((p) => p.id) } };
  },
  find_mapping_counterexample(store, _personas, args) {
    const s = store.getState();
    if (args.expectedRevision !== s.revision) return mismatch(s);
    const payload = {
      revision: s.revision,
      personaIds: ["P2", "P3", "P4"],
      violations: STUB_VIOLATIONS,
      coverage: { "inv-forbid": true, "inv-null": true, "inv-sot": true },
      evidenceIds: ["E-stub-1"],
    };
    store.setLastFind(payload);
    return { ok: true, payload };
  },
  preview_mapping_patch(store, _personas, args) {
    const s = store.getState();
    if (args.expectedRevision !== s.revision) return mismatch(s);
    return { ok: true, payload: {
      revision: s.revision, field: args.field,
      diffs: (args.personaIds ?? []).map((personaId) => ({ personaId, before: "<redacted:changed>", after: "<redacted:changed>" })),
      remainingViolations: 0, evidenceId: "E-stub-2",
    } };
  },
  prepare_mapping_review(store, _personas, args) {
    const s = store.getState();
    if (args.expectedRevision !== s.revision) return mismatch(s);
    return { ok: true, payload: {
      revision: s.revision, packetId: "PKT-stub",
      coverage: { "inv-forbid": true, "inv-null": true, "inv-sot": true }, blockers: [],
    } };
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

export function runTool(store, personas, name, args) {
  const h = HANDLERS[name];
  if (!h) return { ok: false, error: { code: "UNKNOWN_TOOL", name } };
  try {
    const r = h(store, personas, args ?? {});
    const text = JSON.stringify(r.ok ? r.payload : { error: r.error });
    if (text.length > 1500) return { ok: false, error: { code: "EVALUATOR_FAILED", reason: "payload budget" } };
    return r;
  } catch (e) {
    return { ok: false, error: { code: e.code ?? "EVALUATOR_FAILED", reason: String(e.message ?? e) } };
  }
}
