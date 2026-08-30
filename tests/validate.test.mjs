import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { checkInvariants } from "../src/engine/invariants.mjs";
import { createStore } from "../src/store/reducer.mjs";
import { GOLDEN_STATE, runTool } from "../src/tools/defs.mjs";

const load = async (file) => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url)));
const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];

const stateText = (store) => JSON.stringify(store.getState());

function assertBadRule(store, personas, invariants) {
  const before = stateText(store);
  const result = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: store.getState().revision,
    invariants,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "BAD_RULE");
  assert.ok(!JSON.stringify(result).includes("CANARY_"));
  assert.equal(stateText(store), before);
}

test("ghost output fields are rejected before dispatch and cannot produce coverage", async () => {
  const personas = await load("personas.json");
  const base = createStore(GOLDEN_STATE);
  let dispatches = 0;
  const store = {
    ...base,
    dispatch(...args) {
      dispatches += 1;
      return base.dispatch(...args);
    },
  };
  assertBadRule(store, personas, [
    { id: "ghost", type: "null_if_missing", field: "ghost", dependsOn: "ghost" },
  ]);
  assert.equal(dispatches, 0);

  const result = runTool(store, personas, "find_mapping_counterexample", {
    expectedRevision: store.getState().revision,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_INVARIANTS");
  assert.deepEqual(store.getState().evidence, {});
});

test("stage validates exact rule shapes, strings, ids, enums, and the 1-8 bound", async (t) => {
  const personas = await load("personas.json");
  const invalid = [
    ["empty array", []],
    ["not an array", {}],
    ["more than eight", Array.from({ length: 9 }, (_, i) => ({
      id: `rule-${i}`, type: "forbidden_group", personaCategory: "contractor", group: "employees",
    }))],
    ["unknown invariant type", [{ id: "rule", type: "unknown" }]],
    ["prototype-named invariant type", [{ id: "rule", type: "toString" }]],
    ["non-string invariant type", [{ id: "rule", type: 1 }]],
    ["unknown output field", [{ id: "rule", type: "source_of_truth", field: "ghost", source: "hris" }]],
    ["unknown source", [{ id: "rule", type: "source_of_truth", field: "department", source: "ldap" }]],
    ["empty id", [{ id: "", type: "forbidden_group", personaCategory: "contractor", group: "employees" }]],
    ["duplicate explicit ids", [PINS[0], { ...PINS[1], id: PINS[0].id }]],
    ["duplicate resolved ids", [
      { type: "forbidden_group", personaCategory: "contractor", group: "employees" },
      { ...PINS[1], id: "pin-1" },
    ]],
    ["extra key", [{ ...PINS[0], note: "not part of the contract" }]],
    ["non-object rule", [null]],
    ["non-string id", [{ ...PINS[0], id: 1 }]],
    ["non-string personaCategory", [{ ...PINS[0], personaCategory: 1 }]],
    ["non-string group", [{ ...PINS[0], group: false }]],
    ["non-string dependsOn", [{ ...PINS[1], dependsOn: 1 }]],
    ["canary-bearing string", [{ ...PINS[0], group: "CANARY_RULE_VALUE" }]],
  ];

  for (const [label, invariants] of invalid) {
    await t.test(label, () => assertBadRule(createStore(GOLDEN_STATE), personas, invariants));
  }
});

test("stage accepts all three exact shapes and resolves omitted ids", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  const result = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: [
      { type: "forbidden_group", personaCategory: "contractor", group: "employees" },
      { type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
      { type: "source_of_truth", field: "department", source: "hris" },
    ],
  });
  assert.equal(result.ok, true);
  assert.deepEqual(result.payload.pinIds, ["pin-1", "pin-2", "pin-3"]);
});

test("prototype-named rule ids survive stage, find, and prepare coverage", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  const staged = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: [
      { id: "__proto__", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
    ],
  });
  assert.equal(staged.ok, true);

  const found = runTool(store, personas, "find_mapping_counterexample", {
    expectedRevision: staged.payload.revision,
  });
  assert.equal(found.ok, true);
  assert.equal(Object.hasOwn(found.payload.coverage, "__proto__"), true);
  assert.equal(found.payload.coverage.__proto__, true);
  assert.equal(JSON.stringify(found.payload.coverage), '{"__proto__":true}');

  const prepared = runTool(store, personas, "prepare_mapping_review", {
    expectedRevision: staged.payload.revision,
    evidenceIds: found.payload.evidenceIds,
  });
  assert.equal(prepared.ok, true);
  assert.equal(Object.hasOwn(prepared.payload.coverage, "__proto__"), true);
  assert.equal(prepared.payload.coverage.__proto__, true);
  assert.equal(JSON.stringify(prepared.payload.coverage), '{"__proto__":true}');
});

test("checker throws BAD_RULE when a referenced output field is absent", async (t) => {
  const persona = {
    id: "Q1",
    category: "contractor",
    profiles: { okta: {}, hris: { department: "Engineering" }, ad: {} },
  };
  const cases = [
    [PINS[0], "group"],
    [PINS[1], "managerId"],
    [PINS[2], "department"],
  ];

  for (const [pin, field] of cases) {
    await t.test(field, () => {
      assert.throws(
        () => checkInvariants([pin], [persona], { Q1: { fields: {} } }),
        (error) => error?.code === "BAD_RULE",
      );
    });
  }
});

test("zero-pin and empty-evidence gates fail closed without recording derived state", async (t) => {
  const personas = await load("personas.json");

  for (const [label, args] of [
    ["zero pins", { expectedRevision: 17 }],
    ["empty invariantIds", { expectedRevision: 17, invariantIds: [] }],
  ]) {
    await t.test(`find: ${label}`, () => {
      const store = createStore(GOLDEN_STATE);
      const result = runTool(store, personas, "find_mapping_counterexample", args);
      assert.equal(result.ok, false);
      assert.deepEqual(result.error, {
        code: "NO_INVARIANTS",
        reason: "no pinned invariants — ask the human to pin business rules first",
      });
      assert.deepEqual(store.getState().evidence, {});
    });
  }

  await t.test("prepare: zero pins takes precedence", () => {
    const store = createStore(GOLDEN_STATE);
    const result = runTool(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: ["missing"],
    });
    assert.equal(result.error.code, "NO_INVARIANTS");
    assert.deepEqual(store.getState().packets, {});
  });

  await t.test("prepare: pins but no evidence", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    const result = runTool(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: [],
    });
    assert.equal(result.error.code, "NO_EVIDENCE");
    assert.deepEqual(store.getState().packets, {});
  });

  await t.test("prepare: prototype-named unknown evidence", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    const before = stateText(store);
    const result = runTool(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: ["toString"],
    });
    assert.equal(result.error.code, "STALE_EVIDENCE");
    assert.deepEqual(result.error.staleIds, ["toString"]);
    assert.equal(stateText(store), before);
  });
});

test("maxPersonas is an integer 1-8 and caps the minimal witness", async (t) => {
  const personas = await load("personas.json");

  for (const maxPersonas of [0, -1, 1.5, 9]) {
    await t.test(`rejects ${maxPersonas}`, () => {
      const store = createStore({ ...GOLDEN_STATE, pins: PINS });
      const before = stateText(store);
      const result = runTool(store, personas, "find_mapping_counterexample", {
        expectedRevision: 17,
        maxPersonas,
      });
      assert.equal(result.error.code, "BAD_RULE");
      assert.equal(stateText(store), before);
    });
  }

  await t.test("minimal witness exceeds cap", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    const result = runTool(store, personas, "find_mapping_counterexample", {
      expectedRevision: 17,
      maxPersonas: 2,
    });
    assert.deepEqual(result.error, {
      code: "WITNESS_EXCEEDS_CAP",
      witnessSize: 3,
      maxPersonas: 2,
    });
    assert.deepEqual(store.getState().evidence, {});
  });

  await t.test("minimal witness meets cap", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    const result = runTool(store, personas, "find_mapping_counterexample", {
      expectedRevision: 17,
      maxPersonas: 3,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.payload.personaIds, ["P2", "P3", "P4"]);
  });
});

test("revision fencing precedes rule, cap, and zero-state validation", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  const cases = [
    ["stage_mapping_invariants", { expectedRevision: 99, invariants: [] }],
    ["find_mapping_counterexample", { expectedRevision: 99, invariantIds: [], maxPersonas: 0 }],
    ["prepare_mapping_review", { expectedRevision: 99, evidenceIds: [] }],
  ];
  for (const [name, args] of cases) {
    const result = runTool(store, personas, name, args);
    assert.equal(result.error.code, "REVISION_MISMATCH", name);
  }
});
