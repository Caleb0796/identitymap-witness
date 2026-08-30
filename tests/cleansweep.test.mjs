import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createStore } from "../src/store/reducer.mjs";
import { GOLDEN_STATE, runTool } from "../src/tools/defs.mjs";

const load = async (file) => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url)));
const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];

const stage = (store, personas) => {
  const staged = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: store.getState().revision,
    invariants: PINS,
  });
  store.dispatch({ type: "CONFIRM_RULES", version: staged.payload.pendingVersion });
};

test("a clean full sweep is successful, citable closing evidence", async () => {
  const personas = await load("personas.json");
  const corrected = await load("persisted-snapshot.json");
  const store = createStore(corrected);
  stage(store, personas);

  const result = runTool(store, personas, "find_mapping_counterexample", {
    expectedRevision: store.getState().revision,
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.cleanSweep, true);
  assert.equal(result.payload.fullSweep, true);
  assert.deepEqual(result.payload.checkedInvariantIds, PINS.map((pin) => pin.id));
  assert.equal(result.payload.confirmedInvariantCount, 3);
  assert.equal(result.payload.checked, personas.length);
  assert.deepEqual(result.payload.personaIds, []);
  assert.deepEqual(result.payload.violations, []);
  assert.equal(result.payload.evidenceIds.length, 1);
  assert.equal(store.listEvidence().length, 1);
  assert.equal(store.listEvidence()[0].kind, "clean-sweep");
  assert.equal(store.listEvidence()[0].id, result.payload.evidenceIds[0]);
});

test("a counterexample result identifies the checked scope", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  stage(store, personas);

  const result = runTool(store, personas, "find_mapping_counterexample", {
    expectedRevision: store.getState().revision,
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.cleanSweep, false);
  assert.equal(result.payload.fullSweep, true);
  assert.deepEqual(result.payload.checkedInvariantIds, PINS.map((pin) => pin.id));
  assert.ok(result.payload.violations.length > 0);
});

test("a scoped clean check is not a global all-clear and cannot close unchecked pins", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  stage(store, personas);
  store.dispatch({ type: "EDIT_EXPRESSION", field: "managerId", expr: "user.managerId" });

  const result = runTool(store, personas, "find_mapping_counterexample", {
    expectedRevision: store.getState().revision,
    invariantIds: ["inv-null"],
  });

  assert.equal(result.ok, true);
  assert.equal(result.payload.cleanSweep, true);
  assert.equal(result.payload.fullSweep, false);
  assert.deepEqual(result.payload.checkedInvariantIds, ["inv-null"]);
  assert.equal(result.payload.confirmedInvariantCount, 3);
  assert.deepEqual(result.payload.violations, []);

  const packet = runTool(store, personas, "prepare_mapping_review", {
    expectedRevision: store.getState().revision,
    evidenceIds: result.payload.evidenceIds,
  });
  assert.equal(packet.ok, true);
  assert.deepEqual(packet.payload.coverage, {
    "inv-forbid": false,
    "inv-null": true,
    "inv-sot": false,
  });
  assert.deepEqual(packet.payload.blockers, [
    { pin: "inv-forbid", reason: "uncovered" },
    { pin: "inv-sot", reason: "uncovered" },
  ]);
});
