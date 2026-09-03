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
const stateText = (store) => JSON.stringify(store.snapshot());

function confirmRules(store, rules) {
  store.dispatch({ type: "STAGE_RULES", rules });
  store.dispatch({ type: "CONFIRM_RULES", version: store.getState().pending.version });
}

function assertFailedAtomically(store, personas, name, args, code) {
  const before = stateText(store);
  const result = runTool(store, personas, name, args);
  assert.equal(result.ok, false, name);
  assert.equal(result.error.code, code, name);
  assert.equal(stateText(store), before, `${name} ${code} changed store state`);
  return result;
}

test("oversized read returns a bounded page without changing or rebinding state", async () => {
  const personas = await load("personas.json");
  const store = createStore({ ...GOLDEN_STATE, pins: [LONG_PIN] });
  const stateBefore = store.getState();
  const textBefore = stateText(store);
  const result = runTool(store, personas, "read_mapping_session", {});

  assert.equal(result.ok, true);
  assert.equal(result.payload.encoding, "json");
  assert.ok(result.payload.continuation);
  assert.equal(JSON.stringify(result.payload).length <= 1_500, true);
  assert.equal(store.getState(), stateBefore);
  assert.equal(stateText(store), textBefore);
});

test("every reachable failed tool result leaves the store byte-identical", async (t) => {
  const personas = await load("personas.json");

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

  await t.test("stage: output-budget EVALUATOR_FAILED rolls back a bounded dispatch", () => {
    const base = createStore(GOLDEN_STATE);
    const store = {
      ...base,
      dispatch(...args) {
        base.dispatch(...args);
        base.getState().pending.rules[0].id = LONG_ID;
      },
    };
    assertFailedAtomically(store, personas, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: [PINS[0]],
    }, "EVALUATOR_FAILED");
    const next = runTool(base, personas, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: PINS,
    });
    assert.equal(next.payload.pendingVersion, 1);
  });

  await t.test("stage: PENDING_EXISTS", () => {
    const store = createStore(GOLDEN_STATE);
    const staged = runTool(store, personas, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: PINS,
    });
    assert.equal(staged.ok, true);
    assertFailedAtomically(store, personas, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: [{ ...PINS[0], group: "contractors" }],
    }, "PENDING_EXISTS");
  });

  await t.test("find: BAD_RULE", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    assertFailedAtomically(store, personas, "find_mapping_counterexample", {
      expectedRevision: 17,
      invariantIds: ["ghost"],
    }, "BAD_RULE");
  });

  await t.test("find: NO_INVARIANTS", () => {
    const store = createStore(GOLDEN_STATE);
    assertFailedAtomically(store, personas, "find_mapping_counterexample", {
      expectedRevision: 17,
    }, "NO_INVARIANTS");
  });

  await t.test("find: WITNESS_EXCEEDS_CAP", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    assertFailedAtomically(store, personas, "find_mapping_counterexample", {
      expectedRevision: 17,
      maxPersonas: 2,
    }, "WITNESS_EXCEEDS_CAP");
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

  await t.test("preview: pre-seeded long values still exercise output budgeting and rollback", () => {
    const longPersonas = [{ id: "P1", category: "employee", profiles: {
      okta: { group: LONG_ID }, hris: {}, ad: {},
    } }];
    const store = createStore({ ...GOLDEN_STATE,
      expressions: { ...GOLDEN_STATE.expressions, group: "user.group" } });
    assertFailedAtomically(store, longPersonas, "preview_mapping_patch", {
      expectedRevision: 17,
      field: "group",
      expr: '"after"',
      personaIds: ["P1"],
    }, "EVALUATOR_FAILED");
  });

  await t.test("stage: INVALID_INPUT", () => {
    const store = createStore(GOLDEN_STATE);
    assertFailedAtomically(store, personas, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: [{ ...PINS[0], group: "g".repeat(10_000) }],
    }, "INVALID_INPUT");
  });

  await t.test("prepare: STALE_EVIDENCE", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    const evidenceId = store.recordEvidence("counterexample", {
      fields: ["group"], invariants: PINS.map((pin) => pin.id), personas: ["P2"],
    }, { violations: [] });
    store.dispatch({ type: "EDIT_EXPRESSION", field: "group", expr: '"changed"' });
    assertFailedAtomically(store, personas, "prepare_mapping_review", {
      expectedRevision: store.getState().revision,
      evidenceIds: [evidenceId],
    }, "STALE_EVIDENCE");
  });

  await t.test("prepare: NO_INVARIANTS", () => {
    const store = createStore(GOLDEN_STATE);
    assertFailedAtomically(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: [],
    }, "NO_INVARIANTS");
  });

  await t.test("prepare: NO_EVIDENCE", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    assertFailedAtomically(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: [],
    }, "NO_EVIDENCE");
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
    const base = createStore({ ...GOLDEN_STATE, pins: [PINS[0]] });
    const evidenceId = base.recordEvidence("clean-sweep", {
      fields: Object.keys(GOLDEN_STATE.expressions),
      invariants: [PINS[0].id],
      personas: personas.map((persona) => persona.id),
    }, { violations: [] });
    const store = {
      ...base,
      recordPacket(...args) {
        base.recordPacket(...args);
        return { toJSON: () => "CANARY_ATOMICITY" };
      },
    };
    assertFailedAtomically(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: [evidenceId],
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
  confirmRules(store, PINS);
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
    confirmRules(store, PINS);
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
