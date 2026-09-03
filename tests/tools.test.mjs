import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "../src/engine/parser.mjs";
import { createStore } from "../src/store/reducer.mjs";
import { GOLDEN_STATE, runTool } from "../src/tools/defs.mjs";
import { MAX_READ_SESSION_CHARS } from "../src/tools/validate.mjs";

const load = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url)));
const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];
const golden = async () => ({ store: createStore(GOLDEN_STATE), personas: await load("personas.json") });
const stagePins = (store, personas) => {
  const staged = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: store.getState().revision,
    invariants: PINS,
  });
  if (staged.ok) store.dispatch({ type: "CONFIRM_RULES", version: staged.payload.pendingVersion });
  return staged;
};

test("happy path: read → stage → find → preview → prepare", async () => {
  const { store, personas } = await golden();

  const read = runTool(store, personas, "read_mapping_session", {});
  assert.ok(read.ok);
  assert.equal(read.payload.revision, 17);
  assert.equal(read.payload.personaCount, 8);
  assert.equal(read.payload.fields.length, 5);

  const stage = stagePins(store, personas);
  assert.ok(stage.ok);
  assert.equal(stage.payload.revision, 17);
  assert.deepEqual(stage.payload.pendingRuleIds, ["inv-forbid", "inv-null", "inv-sot"]);
  assert.equal(store.getState().revision, 18);

  const find = runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 18 });
  assert.ok(find.ok);
  assert.deepEqual(find.payload.personaIds, ["P2", "P3", "P4"]);
  assert.equal(find.payload.violations.length, 4);
  assert.equal(find.payload.evidenceIds.length, 1);

  const prev = runTool(store, personas, "preview_mapping_patch", {
    expectedRevision: 18, field: "group",
    expr: 'String.toLowerCase(user.userType) == "contractor" ? "contractors" : "employees"',
    personaIds: ["P2"],
  });
  assert.ok(prev.ok);
  assert.deepEqual(prev.payload.diffs, [{ personaId: "P2", field: "group", before: "employees", after: "contractors" }]);
  assert.equal(prev.payload.remainingViolations, 0);

  const prep = runTool(store, personas, "prepare_mapping_review",
    { expectedRevision: 18, evidenceIds: find.payload.evidenceIds });
  assert.ok(prep.ok);
  // fresh evidence covers all pins, but the golden draft still violates them
  assert.deepEqual(prep.payload.blockers.map((b) => b.reason).sort(), ["violating", "violating", "violating"]);
});

test("oversized reads expose an exact session-bound JSON continuation", async () => {
  const personas = await load("personas.json");
  const expressions = Object.fromEntries(
    Object.keys(GOLDEN_STATE.expressions).map((field) => [field, `"${"\u0000".repeat(510)}"`]),
  );
  for (const expr of Object.values(expressions)) {
    assert.equal(expr.length, 512);
    assert.doesNotThrow(() => parse(expr));
  }
  const pins = Array.from({ length: 8 }, (_, index) => ({
    id: `${"\u0000".repeat(63)}${index}`,
    type: "forbidden_group",
    personaCategory: "contractor",
    group: "employees",
  }));
  const pending = Array.from({ length: 8 }, (_, index) => ({
    ...pins[index],
    id: `${"\u0001".repeat(63)}${index}`,
  }));
  const revision = Number.MAX_SAFE_INTEGER;
  const store = createStore({ ...GOLDEN_STATE, revision, expressions, pins });
  store.dispatch({ type: "STAGE_RULES", rules: pending });
  const before = JSON.stringify(store.snapshot());
  let page = runTool(store, personas, "read_mapping_session", {});

  let serialized = "";
  let pages = 0;
  while (page) {
    assert.equal(page.ok, true);
    assert.equal(page.payload.revision, revision);
    assert.equal(page.payload.encoding, "json");
    assert.equal(page.payload.offset, serialized.length);
    assert.equal(JSON.stringify(page.payload).length <= 1_500, true);
    serialized += page.payload.sessionChunk;
    pages += 1;
    page = page.payload.continuation
      ? runTool(store, personas, "read_mapping_session", { continuation: page.payload.continuation })
      : null;
  }

  assert.equal(serialized.length, 21_808);
  assert.equal(serialized.length <= MAX_READ_SESSION_CHARS, true);
  assert.equal(pages, 43);
  assert.deepEqual(JSON.parse(serialized), {
    revision,
    priority: GOLDEN_STATE.priority,
    fields: Object.entries(expressions).map(([field, expr]) => ({ field, expr, defectFree: null })),
    pinIds: pins.map((pin) => pin.id),
    pendingRuleIds: pending.map((pin) => pin.id),
    pendingVersion: 1,
    personaCount: 8,
  });
  assert.equal(JSON.stringify(store.snapshot()), before);
});

test("read continuation rejects a changed revision before returning a chunk", async () => {
  const personas = await load("personas.json");
  const store = createStore({
    ...GOLDEN_STATE,
    expressions: Object.fromEntries(Object.keys(GOLDEN_STATE.expressions)
      .map((field) => [field, `"${"x".repeat(510)}"`])),
  });
  const first = runTool(store, personas, "read_mapping_session", {});
  assert.ok(first.payload.continuation);
  assert.equal(first.payload.continuation.offset, 512);
  store.dispatch({ type: "EDIT_EXPRESSION", field: "group", expr: '"changed"' });
  const result = runTool(store, personas, "read_mapping_session", {
    continuation: first.payload.continuation,
  });
  assert.deepEqual(result, {
    ok: false,
    error: { code: "REVISION_MISMATCH", currentRevision: 18 },
  });
});

test("read continuation rejects same-revision drift and forged Unicode offsets", async () => {
  const personas = await load("personas.json");
  const expressions = {
    ...GOLDEN_STATE.expressions,
    displayName: `"😀${"x".repeat(508)}"`,
    group: `"${"x".repeat(510)}"`,
    managerId: `"${"x".repeat(510)}"`,
    department: `"${"x".repeat(510)}"`,
    email: `"${"x".repeat(510)}"`,
  };
  const store = createStore({ ...GOLDEN_STATE, expressions });
  const first = runTool(store, personas, "read_mapping_session", {});
  assert.ok(first.payload.continuation);
  const serialized = JSON.stringify({
    revision: 17,
    priority: GOLDEN_STATE.priority,
    fields: Object.entries(expressions).map(([field, expr]) => ({ field, expr, defectFree: null })),
    pinIds: [],
    pendingRuleIds: [],
    pendingVersion: null,
    personaCount: 8,
  });
  const lowSurrogateOffset = serialized.indexOf("😀") + 1;
  const split = runTool(store, personas, "read_mapping_session", {
    continuation: { ...first.payload.continuation, offset: lowSurrogateOffset },
  });
  assert.deepEqual(split, {
    ok: false,
    error: { code: "INVALID_INPUT", reason: "continuation offset splits a Unicode character" },
  });

  for (const offset of [513, 511]) {
    const noncanonical = runTool(store, personas, "read_mapping_session", {
      continuation: { ...first.payload.continuation, offset },
    });
    assert.deepEqual(noncanonical, {
      ok: false,
      error: { code: "INVALID_INPUT", reason: "continuation offset is not a page boundary" },
    });
  }

  store.dispatch({ type: "STAGE_RULES", rules: [PINS[0]] });
  const drifted = runTool(store, personas, "read_mapping_session", {
    continuation: first.payload.continuation,
  });
  assert.deepEqual(drifted, {
    ok: false,
    error: {
      code: "INVALID_INPUT",
      reason: "continuation no longer matches the current session — restart read_mapping_session",
    },
  });
});

test("REVISION_MISMATCH carries currentRevision on every fenced tool", async () => {
  const { store, personas } = await golden();
  for (const [name, args] of [
    ["stage_mapping_invariants", { expectedRevision: 99, invariants: PINS }],
    ["find_mapping_counterexample", { expectedRevision: 99 }],
    ["preview_mapping_patch", { expectedRevision: 99, field: "group", expr: '"x"', personaIds: [] }],
    ["prepare_mapping_review", { expectedRevision: 99, evidenceIds: [] }],
  ]) {
    const r = runTool(store, personas, name, args);
    assert.equal(r.ok, false, name);
    assert.equal(r.error.code, "REVISION_MISMATCH", name);
    assert.equal(r.error.currentRevision, 17, name);
  }
});

test("BAD_RULE: unknown type, missing field, unknown invariantId; pin replace not append", async () => {
  const { store, personas } = await golden();
  let r = runTool(store, personas, "stage_mapping_invariants",
    { expectedRevision: 17, invariants: [{ id: "x", type: "no_such_type" }] });
  assert.equal(r.error.code, "BAD_RULE");
  r = runTool(store, personas, "stage_mapping_invariants",
    { expectedRevision: 17, invariants: [{ id: "x", type: "forbidden_group", personaCategory: "c" }] });
  assert.equal(r.error.code, "INVALID_INPUT");

  assert.ok(stagePins(store, personas).ok); // r18
  r = runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 18, invariantIds: ["ghost"] });
  assert.equal(r.error.code, "BAD_RULE");

  r = runTool(store, personas, "stage_mapping_invariants",
    { expectedRevision: 18, invariants: [PINS[0]] }); // full replace
  assert.deepEqual(r.payload.pendingRuleIds, ["inv-forbid"]);
  store.dispatch({ type: "CONFIRM_RULES", version: r.payload.pendingVersion });
  assert.deepEqual(store.getState().pins.map((pin) => pin.id), ["inv-forbid"]);
});

test("a clean snapshot returns successful closing evidence", async () => {
  const personas = await load("personas.json");
  const snapshot = await load("persisted-snapshot.json");
  const store = createStore(snapshot);
  const stage = runTool(store, personas, "stage_mapping_invariants",
    { expectedRevision: snapshot.revision, invariants: PINS });
  store.dispatch({ type: "CONFIRM_RULES", version: stage.payload.pendingVersion });
  const r = runTool(store, personas, "find_mapping_counterexample",
    { expectedRevision: store.getState().revision });
  assert.equal(r.ok, true);
  assert.equal(r.payload.cleanSweep, true);
  assert.equal(r.payload.fullSweep, true);
  assert.equal(r.payload.checked, 8);
  assert.equal(r.payload.evidenceIds.length, 1); // clean sweep is citable evidence
  const prep = runTool(store, personas, "prepare_mapping_review",
    { expectedRevision: store.getState().revision, evidenceIds: r.payload.evidenceIds });
  assert.ok(prep.ok);
  assert.deepEqual(prep.payload.blockers, []);
});

test("INVALID_AST with position; UNKNOWN_PERSONA; invalid target field", async () => {
  const { store, personas } = await golden();
  let r = runTool(store, personas, "preview_mapping_patch",
    { expectedRevision: 17, field: "group", expr: "fetch('x')", personaIds: ["P2"] });
  assert.equal(r.error.code, "INVALID_AST");
  assert.ok(Number.isInteger(r.error.position));
  r = runTool(store, personas, "preview_mapping_patch",
    { expectedRevision: 17, field: "group", expr: '"x"', personaIds: ["P99"] });
  assert.equal(r.error.code, "UNKNOWN_PERSONA");
  r = runTool(store, personas, "preview_mapping_patch",
    { expectedRevision: 17, field: "nope", expr: '"x"', personaIds: ["P2"] });
  assert.equal(r.error.code, "INVALID_INPUT");
});

test("STALE_EVIDENCE: a human edit between find and prepare rejects the packet", async () => {
  const { store, personas } = await golden();
  stagePins(store, personas); // r18
  const find = runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 18 });
  store.dispatch({ type: "EDIT_EXPRESSION", field: "managerId", expr: "user.managerId" }); // r19
  const r = runTool(store, personas, "prepare_mapping_review",
    { expectedRevision: 19, evidenceIds: find.payload.evidenceIds });
  assert.equal(r.error.code, "STALE_EVIDENCE");
  assert.deepEqual(r.error.staleIds, find.payload.evidenceIds);
});

test("payload budget: oversized violation lists shrink to ids with truncated:true", async () => {
  // synthetic: many contractor personas × long details blow the 1500-char cap
  const personas = Array.from({ length: 8 }, (_, i) => ({
    id: `S${i + 1}`, category: "contractor",
    profiles: { okta: { firstName: `CANARY_FN_S${i + 1}`, userType: "Contractor",
      dept: "A-very-long-department-name-to-inflate-detail-strings-substantially" }, hris: {}, ad: {} },
  }));
  const pins = Array.from({ length: 6 }, (_, i) => (
    { id: `fb-${i}`, type: "forbidden_group", personaCategory: "contractor", group: "employees" }));
  const store = createStore({ revision: 1, priority: ["hris", "ad"], expressions: GOLDEN_STATE.expressions, pins: [] });
  const staged = runTool(store, personas, "stage_mapping_invariants", { expectedRevision: 1, invariants: pins });
  store.dispatch({ type: "CONFIRM_RULES", version: staged.payload.pendingVersion });
  const r = runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 2 });
  assert.ok(r.ok);
  assert.equal(r.payload.truncated, true);
  assert.ok(JSON.stringify(r.payload).length <= 1500);
});

test("no CANARY_ ever leaves any tool across the full fixture", async () => {
  const { store, personas } = await golden();
  const outputs = [];
  outputs.push(runTool(store, personas, "read_mapping_session", {}));
  outputs.push(stagePins(store, personas));
  outputs.push(runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 18 }));
  outputs.push(runTool(store, personas, "preview_mapping_patch",
    { expectedRevision: 18, field: "displayName", expr: "user.firstName", personaIds: ["P1", "P4"] }));
  outputs.push(runTool(store, personas, "prepare_mapping_review", { expectedRevision: 18, evidenceIds: [] }));
  for (const o of outputs) assert.ok(!JSON.stringify(o).includes("CANARY_"), JSON.stringify(o).slice(0, 200));
  // identity-field preview diffs specifically come back redacted, not raw
  const d = outputs[3].payload.diffs[0];
  assert.equal(d.before, "<redacted:changed>");
  assert.equal(d.after, "<redacted:changed>");
});

test("SAFETY: a hypothetical preview must NOT close a real packet (run2 finding)", async () => {
  const { store, personas } = await golden();
  stagePins(store, personas); // r18 — draft still defective
  const prev = runTool(store, personas, "preview_mapping_patch", {
    expectedRevision: 18, field: "group",
    expr: 'String.toLowerCase(user.userType) == "contractor" ? "contractors" : "employees"',
    personaIds: ["P2"],
  });
  assert.ok(prev.ok);
  const prep = runTool(store, personas, "prepare_mapping_review",
    { expectedRevision: 18, evidenceIds: [prev.payload.evidenceId] });
  assert.ok(prep.ok);
  // the draft is UNCHANGED and defective — preview evidence is hypothetical and
  // must leave every pin uncovered, never produce blockers: []
  assert.equal(prep.payload.blockers.length, 3, JSON.stringify(prep.payload));
  assert.ok(prep.payload.blockers.every((b) => b.reason === "uncovered"));
});

test("error precedence: stale revision wins over INVALID_AST and UNKNOWN_PERSONA", async () => {
  const { store, personas } = await golden();
  const r = runTool(store, personas, "preview_mapping_patch",
    { expectedRevision: 99, field: "group", expr: "fetch('x')", personaIds: ["P99"] });
  assert.equal(r.error.code, "REVISION_MISMATCH");
});

test("prototype-chain fields cannot create a false clean sweep or GREEN packet", async () => {
  const personas = await load("personas.json");
  assert.equal(personas.some((persona) => ["okta", "hris", "ad"]
    .some((source) => Object.hasOwn(persona.profiles?.[source] ?? {}, "toString"))), false);
  const store = createStore(GOLDEN_STATE);
  const staged = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: [{
      id: "proto-chain",
      type: "null_if_missing",
      field: "group",
      dependsOn: "toString",
    }],
  });
  assert.equal(staged.ok, true);
  store.dispatch({ type: "CONFIRM_RULES", version: staged.payload.pendingVersion });
  const found = runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 18 });
  assert.equal(found.ok, true);
  assert.equal(found.payload.cleanSweep, false);
  assert.ok(found.payload.violations.length > 0);
  const prepared = runTool(store, personas, "prepare_mapping_review", {
    expectedRevision: 18,
    evidenceIds: found.payload.evidenceIds,
  });
  assert.equal(prepared.ok, true);
  assert.deepEqual(prepared.payload.blockers, [{ pin: "proto-chain", reason: "violating" }]);
});

test("non-canary manager ids and raw invariant values never leave tool envelopes", () => {
  const marker = "PRIVATE_MANAGER_42";
  const personas = [
    { id: "Q1", category: "employee", profiles: {
      okta: {}, hris: { managerId: marker }, ad: { managerId: "OTHER_MANAGER" },
    } },
    { id: "Q2", category: "employee", profiles: {
      okta: { managerId: marker }, hris: {}, ad: {},
    } },
  ];
  const pins = [
    { id: "sot", type: "source_of_truth", field: "managerId", source: "hris" },
    { id: "null", type: "null_if_missing", field: "managerId", dependsOn: "employeeNumber" },
  ];
  const store = createStore({ ...GOLDEN_STATE, pins });
  const found = runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 17 });
  const preview = runTool(store, personas, "preview_mapping_patch", {
    expectedRevision: 17,
    field: "managerId",
    expr: "user.managerId",
    personaIds: ["Q2"],
  });
  const error = runTool(store, personas, "preview_mapping_patch", {
    expectedRevision: 17,
    field: "managerId",
    expr: "user.",
    personaIds: ["Q2"],
  });
  assert.equal(found.ok, true);
  assert.ok(found.payload.violations.some((violation) => violation.invariantId === "sot"));
  assert.ok(found.payload.violations.some((violation) => violation.invariantId === "null"));
  assert.equal(preview.ok, true);
  assert.deepEqual(preview.payload.diffs[0], {
    personaId: "Q2",
    field: "managerId",
    before: "<redacted:changed>",
    after: "<redacted:changed>",
  });
  assert.equal(error.error.code, "INVALID_AST");
  for (const envelope of [found, preview, error])
    assert.equal(JSON.stringify(envelope).includes(marker), false);
});
