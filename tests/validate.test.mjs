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

function assertRuleFailure(store, personas, invariants, code) {
  const before = stateText(store);
  const result = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: store.getState().revision,
    invariants,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
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
  assertRuleFailure(store, personas, [
    { id: "ghost", type: "null_if_missing", field: "ghost", dependsOn: "ghost" },
  ], "BAD_RULE");
  assert.equal(dispatches, 0);

  const result = runTool(store, personas, "find_mapping_counterexample", {
    expectedRevision: store.getState().revision,
  });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NO_INVARIANTS");
  assert.deepEqual(store.getState().evidence, {});
});

test("stage separates transport-shape failures from semantic BAD_RULE failures", async (t) => {
  const personas = await load("personas.json");
  const invalid = [
    ["empty array", [], "INVALID_INPUT"],
    ["not an array", {}, "INVALID_INPUT"],
    ["more than eight", Array.from({ length: 9 }, (_, i) => ({
      id: `rule-${i}`, type: "forbidden_group", personaCategory: "contractor", group: "employees",
    })), "INVALID_INPUT"],
    ["unknown invariant type", [{ id: "rule", type: "unknown" }], "BAD_RULE"],
    ["prototype-named invariant type", [{ id: "rule", type: "toString" }], "BAD_RULE"],
    ["non-string invariant type", [{ id: "rule", type: 1 }], "INVALID_INPUT"],
    ["unknown output field", [{ id: "rule", type: "source_of_truth", field: "ghost", source: "hris" }], "BAD_RULE"],
    ["unknown source", [{ id: "rule", type: "source_of_truth", field: "department", source: "ldap" }], "BAD_RULE"],
    ["empty id", [{ id: "", type: "forbidden_group", personaCategory: "contractor", group: "employees" }], "INVALID_INPUT"],
    ["duplicate explicit ids", [PINS[0], { ...PINS[1], id: PINS[0].id }], "BAD_RULE"],
    ["duplicate resolved ids", [
      { type: "forbidden_group", personaCategory: "contractor", group: "employees" },
      { ...PINS[1], id: "pin-1" },
    ], "BAD_RULE"],
    ["extra key", [{ ...PINS[0], note: "not part of the contract" }], "INVALID_INPUT"],
    ["non-object rule", [null], "INVALID_INPUT"],
    ["non-string id", [{ ...PINS[0], id: 1 }], "INVALID_INPUT"],
    ["non-string personaCategory", [{ ...PINS[0], personaCategory: 1 }], "INVALID_INPUT"],
    ["non-string group", [{ ...PINS[0], group: false }], "INVALID_INPUT"],
    ["non-string dependsOn", [{ ...PINS[1], dependsOn: 1 }], "INVALID_INPUT"],
    ["canary-bearing string", [{ ...PINS[0], group: "CANARY_RULE_VALUE" }], "BAD_RULE"],
  ];

  for (const [label, invariants, code] of invalid) {
    await t.test(label, () => assertRuleFailure(createStore(GOLDEN_STATE), personas, invariants, code));
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
  assert.deepEqual(result.payload.pendingRuleIds, ["pin-1", "pin-2", "pin-3"]);
  assert.deepEqual(store.getState().pins, []);
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
  store.dispatch({ type: "CONFIRM_RULES", version: staged.payload.pendingVersion });

  const found = runTool(store, personas, "find_mapping_counterexample", {
    expectedRevision: store.getState().revision,
  });
  assert.equal(found.ok, true);
  assert.equal(Object.hasOwn(found.payload.coverage, "__proto__"), true);
  assert.equal(found.payload.coverage.__proto__, true);
  assert.equal(JSON.stringify(found.payload.coverage), '{"__proto__":true}');

  const prepared = runTool(store, personas, "prepare_mapping_review", {
    expectedRevision: store.getState().revision,
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
        reason: "no confirmed invariants — call stage_mapping_invariants with the complete rule set, ask the human to Confirm all, then call read_mapping_session",
      });
      assert.deepEqual(store.getState().evidence, {});
    });
  }

  await t.test("find: empty invariantIds with confirmed pins explains selection recovery", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    const result = runTool(store, personas, "find_mapping_counterexample", {
      expectedRevision: 17,
      invariantIds: [],
    });
    assert.deepEqual(result.error, {
      code: "NO_INVARIANTS",
      reason: "no invariants selected — omit invariantIds to check all confirmed rules, or pass confirmed ids returned by read_mapping_session",
    });
    assert.deepEqual(store.getState().evidence, {});
  });

  await t.test("find: pending-only state keeps the human-confirmation reason", () => {
    const store = createStore(GOLDEN_STATE);
    const staged = runTool(store, personas, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: PINS,
    });
    assert.equal(staged.ok, true);
    const result = runTool(store, personas, "find_mapping_counterexample", {
      expectedRevision: 17,
    });
    assert.deepEqual(result.error, {
      code: "NO_INVARIANTS",
      reason: "no confirmed invariants — pending rules await confirmation by the human",
    });
    assert.deepEqual(store.getState().evidence, {});
  });

  await t.test("prepare: zero pins takes precedence", () => {
    const store = createStore(GOLDEN_STATE);
    const result = runTool(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: ["E-1"],
    });
    assert.deepEqual(result.error, {
      code: "NO_INVARIANTS",
      reason: "no confirmed invariants — call stage_mapping_invariants with the complete rule set, ask the human to Confirm all, then call read_mapping_session",
    });
    assert.deepEqual(store.getState().packets, {});
  });

  await t.test("prepare: pins but no evidence", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    const result = runTool(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: [],
    });
    assert.deepEqual(result.error, {
      code: "NO_EVIDENCE",
      reason: "no evidence ids supplied — run find_mapping_counterexample at the current revision and pass its evidenceIds",
    });
    assert.deepEqual(store.getState().packets, {});
  });

  await t.test("prepare: evidence ids must use the public id format", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: PINS });
    const before = stateText(store);
    const result = runTool(store, personas, "prepare_mapping_review", {
      expectedRevision: 17,
      evidenceIds: ["toString"],
    });
    assert.equal(result.error.code, "INVALID_INPUT");
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
      assert.equal(result.error.code, "INVALID_INPUT");
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

test("all five tools reject non-JSON shapes, wrong types, and unexpected properties atomically", async (t) => {
  const personas = await load("personas.json");
  const cases = [
    ["read extra", "read_mapping_session", { extra: true }],
    ["read array", "read_mapping_session", []],
    ["stage extra", "stage_mapping_invariants", { expectedRevision: 17, invariants: [PINS[0]], extra: true }],
    ["stage wrong", "stage_mapping_invariants", { expectedRevision: 17, invariants: "rules" }],
    ["find extra", "find_mapping_counterexample", { expectedRevision: 17, extra: true }],
    ["find wrong", "find_mapping_counterexample", { expectedRevision: 17, invariantIds: "inv-forbid" }],
    ["preview extra", "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: '"x"', personaIds: ["P1"], extra: true,
    }],
    ["preview wrong", "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: '"x"', personaIds: "P1",
    }],
    ["prepare extra", "prepare_mapping_review", { expectedRevision: 17, evidenceIds: [], extra: true }],
    ["prepare wrong", "prepare_mapping_review", { expectedRevision: 17, evidenceIds: "E-1" }],
  ];
  for (const [label, name, args] of cases) {
    await t.test(label, () => {
      const store = createStore(GOLDEN_STATE);
      const before = JSON.stringify(store.snapshot());
      const result = runTool(store, personas, name, args);
      assert.equal(result.error.code, "INVALID_INPUT");
      assert.equal(JSON.stringify(store.snapshot()), before);
    });
  }

  await t.test("cyclic nested value", () => {
    const store = createStore(GOLDEN_STATE);
    const args = { expectedRevision: 17, invariants: [PINS[0]] };
    args.invariants.push(args);
    const result = runTool(store, personas, "stage_mapping_invariants", args);
    assert.equal(result.error.code, "INVALID_INPUT");
  });

  await t.test("expectedRevision accessor is rejected without invocation", () => {
    let reads = 0;
    const args = { invariants: [PINS[0]] };
    Object.defineProperty(args, "expectedRevision", { enumerable: true, get() { reads += 1; return 17; } });
    const result = runTool(createStore(GOLDEN_STATE), personas, "stage_mapping_invariants", args);
    assert.equal(result.error.code, "INVALID_INPUT");
    assert.equal(reads, 0);
  });
});

test("runtime limits accept exact boundaries and reject one over", async (t) => {
  const personas = await load("personas.json");
  const stage = (rule) => runTool(createStore(GOLDEN_STATE), personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: Array.isArray(rule) ? rule : [rule],
  });

  await t.test("revision", () => {
    const at = runTool(createStore(GOLDEN_STATE), personas, "find_mapping_counterexample", {
      expectedRevision: Number.MAX_SAFE_INTEGER,
    });
    assert.equal(at.error.code, "REVISION_MISMATCH");
    const over = runTool(createStore(GOLDEN_STATE), personas, "find_mapping_counterexample", {
      expectedRevision: Number.MAX_SAFE_INTEGER + 1,
    });
    assert.equal(over.error.code, "INVALID_INPUT");
  });

  await t.test("invariant count", () => {
    const rules = Array.from({ length: 8 }, (_, index) => ({ ...PINS[0], id: `rule-${index}` }));
    assert.equal(stage(rules).ok, true);
    assert.equal(stage([...rules, { ...PINS[0], id: "rule-8" }]).error.code, "INVALID_INPUT");
  });

  await t.test("invariant id", () => {
    assert.equal(stage({ ...PINS[0], id: "i".repeat(64) }).ok, true);
    assert.equal(stage({ ...PINS[0], id: "i".repeat(65) }).error.code, "INVALID_INPUT");
  });

  await t.test("rule text", () => {
    assert.equal(stage({ ...PINS[0], group: "g".repeat(128) }).ok, true);
    assert.equal(stage({ ...PINS[0], group: "g".repeat(129) }).error.code, "INVALID_INPUT");
  });

  await t.test("expression", () => {
    const exact = `"${"x".repeat(510)}"`;
    const accepted = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: exact, personaIds: ["P1"],
    });
    assert.equal(accepted.ok, true);
    const rejected = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: `${exact}x`, personaIds: ["P1"],
    });
    assert.equal(rejected.error.code, "INVALID_INPUT");
  });

  await t.test("invariant id array", () => {
    const exact = Array.from({ length: 8 }, (_, index) => `unknown-${index}`);
    const accepted = runTool(createStore({ ...GOLDEN_STATE, pins: PINS }), personas,
      "find_mapping_counterexample", { expectedRevision: 17, invariantIds: exact });
    assert.equal(accepted.error.code, "BAD_RULE");
    const rejected = runTool(createStore({ ...GOLDEN_STATE, pins: PINS }), personas,
      "find_mapping_counterexample", { expectedRevision: 17, invariantIds: [...exact, "unknown-8"] });
    assert.equal(rejected.error.code, "INVALID_INPUT");
  });

  await t.test("persona id array and item", () => {
    const exact = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17,
      field: "group",
      expr: '"x"',
      personaIds: personas.map((persona) => persona.id),
    });
    assert.equal(exact.ok, true);
    const tooMany = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: '"x"',
      personaIds: [...personas.map((persona) => persona.id), "P9"],
    });
    assert.equal(tooMany.error.code, "INVALID_INPUT");
    const itemAt = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: '"x"', personaIds: ["p".repeat(64)],
    });
    assert.equal(itemAt.error.code, "UNKNOWN_PERSONA");
    const itemOver = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: '"x"', personaIds: ["p".repeat(65)],
    });
    assert.equal(itemOver.error.code, "INVALID_INPUT");
  });

  await t.test("evidence id array and item", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: [PINS[0]] });
    const ids = Array.from({ length: 16 }, (_, index) => `E-${index + 1}`);
    const exact = runTool(store, personas, "prepare_mapping_review", { expectedRevision: 17, evidenceIds: ids });
    assert.equal(exact.error.code, "STALE_EVIDENCE");
    const tooMany = runTool(createStore({ ...GOLDEN_STATE, pins: [PINS[0]] }), personas,
      "prepare_mapping_review", { expectedRevision: 17, evidenceIds: [...ids, "E-17"] });
    assert.equal(tooMany.error.code, "INVALID_INPUT");
    const itemAt = `E-${"1".repeat(30)}`;
    assert.equal(itemAt.length, 32);
    const acceptedItem = runTool(createStore({ ...GOLDEN_STATE, pins: [PINS[0]] }), personas,
      "prepare_mapping_review", { expectedRevision: 17, evidenceIds: [itemAt] });
    assert.equal(acceptedItem.error.code, "STALE_EVIDENCE");
    const rejectedItem = runTool(createStore({ ...GOLDEN_STATE, pins: [PINS[0]] }), personas,
      "prepare_mapping_review", { expectedRevision: 17, evidenceIds: [`${itemAt}1`] });
    assert.equal(rejectedItem.error.code, "INVALID_INPUT");
  });
});

test("duplicate id arrays fail before handlers can parse, evaluate, or record", async () => {
  const personas = await load("personas.json");
  const base = createStore({ ...GOLDEN_STATE, pins: PINS });
  const store = {
    ...base,
    dispatch() { throw new Error("dispatch reached"); },
    recordEvidence() { throw new Error("recordEvidence reached"); },
    recordPacket() { throw new Error("recordPacket reached"); },
  };
  for (const [name, args] of [
    ["find_mapping_counterexample", {
      expectedRevision: 17, invariantIds: Array(8).fill("inv-forbid"),
    }],
    ["preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: "fetch('must not parse')", personaIds: Array(8).fill("P1"),
    }],
    ["prepare_mapping_review", {
      expectedRevision: 17, evidenceIds: Array(16).fill("E-1"),
    }],
  ]) {
    const before = JSON.stringify(base.snapshot());
    const result = runTool(store, personas, name, args);
    assert.equal(result.error.code, "INVALID_INPUT", name);
    assert.equal(JSON.stringify(base.snapshot()), before, name);
  }
});

test("the 10,000-character stage probe is rejected before pending state or allocator movement", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  const before = JSON.stringify(store.snapshot());
  const result = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: [{ ...PINS[0], id: "short", group: "g".repeat(10_000) }],
  });
  assert.equal(result.error.code, "INVALID_INPUT");
  assert.equal(JSON.stringify(store.snapshot()), before);
  const text = JSON.stringify({ error: result.error });
  assert.ok(text.length <= 1_500);
  assert.equal(text.includes("CANARY_"), false);
});
