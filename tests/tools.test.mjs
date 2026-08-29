import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createStore } from "../src/store/reducer.mjs";
import { GOLDEN_STATE, runTool } from "../src/tools/defs.mjs";

const load = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url)));
const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];
const golden = async () => ({ store: createStore(GOLDEN_STATE), personas: await load("personas.json") });
const stagePins = (store, personas) =>
  runTool(store, personas, "stage_mapping_invariants", { expectedRevision: store.getState().revision, invariants: PINS });

test("happy path: read → stage → find → preview → prepare", async () => {
  const { store, personas } = await golden();

  const read = runTool(store, personas, "read_mapping_session", {});
  assert.ok(read.ok);
  assert.equal(read.payload.revision, 17);
  assert.equal(read.payload.personaCount, 8);
  assert.equal(read.payload.fields.length, 5);

  const stage = stagePins(store, personas);
  assert.ok(stage.ok);
  assert.equal(stage.payload.revision, 18);
  assert.deepEqual(stage.payload.pinIds, ["inv-forbid", "inv-null", "inv-sot"]);

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
  assert.equal(r.error.code, "BAD_RULE");

  assert.ok(stagePins(store, personas).ok); // r18
  r = runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 18, invariantIds: ["ghost"] });
  assert.equal(r.error.code, "BAD_RULE");

  r = runTool(store, personas, "stage_mapping_invariants",
    { expectedRevision: 18, invariants: [PINS[0]] }); // full replace
  assert.deepEqual(r.payload.pinIds, ["inv-forbid"]);
});

test("NO_COUNTEREXAMPLE is an error, not an empty success (clean snapshot)", async () => {
  const personas = await load("personas.json");
  const snapshot = await load("persisted-snapshot.json");
  const store = createStore(snapshot);
  const stage = runTool(store, personas, "stage_mapping_invariants",
    { expectedRevision: snapshot.revision, invariants: PINS });
  const r = runTool(store, personas, "find_mapping_counterexample",
    { expectedRevision: stage.payload.revision });
  assert.equal(r.ok, false);
  assert.equal(r.error.code, "NO_COUNTEREXAMPLE");
  assert.equal(r.error.checked, 8);
  assert.equal(r.error.evidenceIds.length, 1); // clean sweep is citable evidence
  const prep = runTool(store, personas, "prepare_mapping_review",
    { expectedRevision: store.getState().revision, evidenceIds: r.error.evidenceIds });
  assert.ok(prep.ok);
  assert.deepEqual(prep.payload.blockers, []);
});

test("INVALID_AST with position; UNKNOWN_PERSONA; unknown target field", async () => {
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
  assert.equal(r.error.code, "INVALID_AST");
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
  runTool(store, personas, "stage_mapping_invariants", { expectedRevision: 1, invariants: pins });
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
