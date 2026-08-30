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
const LONG_ID = "x".repeat(2_000);
const LONG_PIN = {
  id: LONG_ID,
  type: "forbidden_group",
  personaCategory: "contractor",
  group: "employees",
};
const stateText = (store) => JSON.stringify(store.getState());

function assertFailedAtomically(store, personas, name, args, code) {
  const before = stateText(store);
  const result = runTool(store, personas, name, args);
  assert.equal(result.ok, false, name);
  assert.equal(result.error.code, code, name);
  assert.equal(stateText(store), before, `${name} ${code} changed store state`);
  return result;
}

test("every reachable failed tool result leaves the store byte-identical", async (t) => {
  const personas = await load("personas.json");

  await t.test("read: output-budget EVALUATOR_FAILED", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: [LONG_PIN] });
    assertFailedAtomically(store, personas, "read_mapping_session", {}, "EVALUATOR_FAILED");
  });

  for (const [name, args] of [
    ["stage_mapping_invariants", { expectedRevision: 99, invariants: PINS }],
    ["find_mapping_counterexample", { expectedRevision: 99 }],
    ["preview_mapping_patch", { expectedRevision: 99, field: "group", expr: '"x"', personaIds: [] }],
    ["prepare_mapping_review", { expectedRevision: 99, evidenceIds: [] }],
  ]) {
    await t.test(`${name}: REVISION_MISMATCH`, () => {
      const store = createStore(GOLDEN_STATE);
      assertFailedAtomically(store, personas, name, args, "REVISION_MISMATCH");
    });
  }

  await t.test("stage: BAD_RULE", () => {
    const store = createStore(GOLDEN_STATE);
    assertFailedAtomically(store, personas, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: [{ id: "bad", type: "unknown" }],
    }, "BAD_RULE");
  });

  await t.test("stage: output-budget EVALUATOR_FAILED rolls back its dispatch", () => {
    const store = createStore(GOLDEN_STATE);
    assertFailedAtomically(store, personas, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: [LONG_PIN],
    }, "EVALUATOR_FAILED");
  });

  await t.test("find: BAD_RULE", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    assertFailedAtomically(store, personas, "find_mapping_counterexample", {
      expectedRevision: 17,
      invariantIds: ["ghost"],
    }, "BAD_RULE");
  });

  await t.test("find: output-budget EVALUATOR_FAILED rolls back recorded evidence", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: [LONG_PIN] });
    assertFailedAtomically(store, personas, "find_mapping_counterexample", {
      expectedRevision: 17,
    }, "EVALUATOR_FAILED");
  });

  await t.test("preview: INVALID_AST", () => {
    const store = createStore(GOLDEN_STATE);
    assertFailedAtomically(store, personas, "preview_mapping_patch", {
      expectedRevision: 17,
      field: "group",
      expr: "fetch('x')",
      personaIds: ["P2"],
    }, "INVALID_AST");
  });

  await t.test("preview: UNKNOWN_PERSONA", () => {
    const store = createStore(GOLDEN_STATE);
    assertFailedAtomically(store, personas, "preview_mapping_patch", {
      expectedRevision: 17,
      field: "group",
      expr: '"x"',
      personaIds: ["P99"],
    }, "UNKNOWN_PERSONA");
  });

  await t.test("preview: output-budget EVALUATOR_FAILED rolls back recorded evidence", () => {
    const field = `field-${"x".repeat(2_000)}`;
    const store = createStore({
      ...GOLDEN_STATE,
      expressions: { ...GOLDEN_STATE.expressions, [field]: '"before"' },
    });
    assertFailedAtomically(store, personas, "preview_mapping_patch", {
      expectedRevision: 17,
      field,
      expr: '"after"',
      personaIds: ["P1"],
    }, "EVALUATOR_FAILED");
  });

  await t.test("prepare: STALE_EVIDENCE", () => {
    const store = createStore(GOLDEN_STATE);
    const evidenceId = store.recordEvidence("counterexample", {
      fields: ["group"], invariants: [], personas: ["P2"],
    }, { violations: [] });
    store.dispatch({ type: "EDIT_EXPRESSION", field: "group", expr: '"changed"' });
    assertFailedAtomically(store, personas, "prepare_mapping_review", {
      expectedRevision: store.getState().revision,
      evidenceIds: [evidenceId],
    }, "STALE_EVIDENCE");
  });

  await t.test("prepare: output-budget EVALUATOR_FAILED rolls back its packet", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: [LONG_PIN] });
    const evidenceId = store.recordEvidence("clean-sweep", {
      fields: Object.keys(GOLDEN_STATE.expressions), invariants: [LONG_ID],
      personas: personas.map((persona) => persona.id),
    }, { violations: [] });
    assertFailedAtomically(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: [evidenceId],
    }, "EVALUATOR_FAILED");
  });

  await t.test("prepare: PII_GUARD rolls back its packet", () => {
    const base = createStore(GOLDEN_STATE);
    const store = {
      ...base,
      recordPacket(...args) {
        base.recordPacket(...args);
        return { toJSON: () => "CANARY_ATOMICITY" };
      },
    };
    assertFailedAtomically(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: [],
    }, "PII_GUARD");
  });

  await t.test("unknown tool: UNKNOWN_TOOL", () => {
    const store = createStore(GOLDEN_STATE);
    assertFailedAtomically(store, personas, "unknown_tool", {}, "UNKNOWN_TOOL");
  });
});

test("restore rebinds getState to the snapshotted state", () => {
  const store = createStore(GOLDEN_STATE);
  const before = stateText(store);
  const priorReference = store.getState();
  const snap = store.snapshot();
  store.dispatch({ type: "PIN_INVARIANTS", invariants: PINS });
  store.restore(snap);

  assert.notEqual(store.getState(), priorReference);
  assert.equal(stateText(store), before);
  assert.equal(priorReference.revision, 18);
  assert.equal(store.getState().revision, 17);
});

test("rollback restores the store-local evidence id allocator", async () => {
  const personas = await load("personas.json");
  const failedStore = createStore({ ...GOLDEN_STATE, pins: [LONG_PIN] });
  assertFailedAtomically(failedStore, personas, "find_mapping_counterexample", {
    expectedRevision: 17,
  }, "EVALUATOR_FAILED");

  const controlStore = createStore({ ...GOLDEN_STATE, pins: [LONG_PIN] });
  for (const store of [failedStore, controlStore]) {
    store.dispatch({ type: "PIN_INVARIANTS", invariants: PINS });
  }

  const afterFailure = runTool(failedStore, personas, "find_mapping_counterexample", {
    expectedRevision: failedStore.getState().revision,
  });
  const control = runTool(controlStore, personas, "find_mapping_counterexample", {
    expectedRevision: controlStore.getState().revision,
  });
  assert.equal(afterFailure.ok, true);
  assert.equal(control.ok, true);
  assert.equal(afterFailure.payload.evidenceIds[0], control.payload.evidenceIds[0]);
  assert.equal(afterFailure.payload.evidenceIds[0], "E-1");
});
