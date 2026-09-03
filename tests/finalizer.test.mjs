import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createStore } from "../src/store/reducer.mjs";
import { createToolExecutor, GOLDEN_STATE, runTool } from "../src/tools/defs.mjs";

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

const wireText = (result) => JSON.stringify(result.ok ? result.payload : { error: result.error });

function assertFinalEnvelope(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  const text = wireText(result);
  assert.ok(text.length <= 1_500, `wire envelope is ${text.length} chars`);
  assert.ok(!text.includes("CANARY_"), text.slice(0, 200));
}

test("oversized read crosses the finalizer as a bounded paged success", async () => {
  const personas = await load("personas.json");
  const result = runTool(createStore({ ...GOLDEN_STATE, pins: [LONG_PIN] }), personas,
    "read_mapping_session", {});
  assert.equal(result.ok, true);
  assert.equal(result.payload.encoding, "json");
  assert.ok(result.payload.continuation);
  assert.equal(wireText(result).length <= 1_500, true);
  assert.equal(wireText(result).includes("CANARY_"), false);
});

test("executor preconditions use the unified finalizer and fail closed", async (t) => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  const before = JSON.stringify(store.snapshot());
  const reason = "visible expression drafts must be committed or reverted by the human before running this tool; then call read_mapping_session again";

  await t.test("exact UNCOMMITTED_DRAFT envelope", async () => {
    const detail = { code: "UNCOMMITTED_DRAFT", reason, fields: ["group", "email"] };
    let observed;
    const execute = createToolExecutor(store, personas, "stage_mapping_invariants",
      (result) => { observed = result; }, () => detail);
    const response = await execute({ expectedRevision: 17, invariants: PINS });
    const text = response.content[0].text;

    assert.deepEqual(JSON.parse(text), { error: detail });
    assert.deepEqual(observed, { ok: false, error: detail });
    assert.equal(text.length <= 1_500, true);
    assert.equal(text.includes("CANARY_"), false);
    assert.equal(JSON.stringify(store.snapshot()), before);
  });

  await t.test("hook exception", async () => {
    let observed;
    const execute = createToolExecutor(store, personas, "stage_mapping_invariants",
      (result) => { observed = result; }, () => { throw new Error("CANARY_HOOK_FAILURE"); });
    const response = await execute({ expectedRevision: 17, invariants: PINS });
    const text = response.content[0].text;

    assert.deepEqual(JSON.parse(text), {
      error: { code: "EVALUATOR_FAILED", reason: "<redacted>" },
    });
    assert.deepEqual(observed, {
      ok: false,
      error: { code: "EVALUATOR_FAILED", reason: "<redacted>" },
    });
    assert.equal(text.length <= 1_500, true);
    assert.equal(text.includes("CANARY_"), false);
    assert.equal(JSON.stringify(store.snapshot()), before);
  });

  await t.test("abort while hook is pending", async () => {
    const controller = new AbortController();
    let releaseHook;
    let reportHookStarted;
    let resultCallbacks = 0;
    const hookStarted = new Promise((resolve) => { reportHookStarted = resolve; });
    const execute = createToolExecutor(store, personas, "stage_mapping_invariants",
      () => { resultCallbacks += 1; }, async () => {
        reportHookStarted();
        await new Promise((resolve) => { releaseHook = resolve; });
      });
    const pending = execute({ expectedRevision: 17, invariants: PINS }, {
      signal: controller.signal,
    });

    await hookStarted;
    controller.abort();
    releaseHook();

    assert.deepEqual(await pending, {
      content: [{ type: "text", text: '{"error":{"code":"ABORTED"}}' }],
    });
    assert.equal(resultCallbacks, 0);
    assert.equal(JSON.stringify(store.snapshot()), before);
  });
});

test("every tool's reachable error envelopes cross the unified finalizer", async (t) => {
  const personas = await load("personas.json");
  const cases = [
    ...[
      ["stage_mapping_invariants", { expectedRevision: 99, invariants: PINS }],
      ["find_mapping_counterexample", { expectedRevision: 99 }],
      ["preview_mapping_patch", { expectedRevision: 99, field: "group", expr: '"x"', personaIds: [] }],
      ["prepare_mapping_review", { expectedRevision: 99, evidenceIds: [] }],
    ].map(([name, args]) => ({
      label: `${name}: REVISION_MISMATCH`,
      code: "REVISION_MISMATCH",
      run: () => runTool(createStore(GOLDEN_STATE), personas, name, args),
    })),
    {
      label: "stage: BAD_RULE",
      code: "BAD_RULE",
      run: () => runTool(createStore(GOLDEN_STATE), personas, "stage_mapping_invariants", {
        expectedRevision: 17,
        invariants: [{ id: "bad", type: "unknown" }],
      }),
    },
    {
      label: "stage: output-budget EVALUATOR_FAILED from bounded input",
      code: "EVALUATOR_FAILED",
      run: () => {
        const base = createStore(GOLDEN_STATE);
        const store = {
          ...base,
          dispatch(...args) {
            base.dispatch(...args);
            base.getState().pending.rules[0].id = LONG_ID;
          },
        };
        return runTool(store, personas, "stage_mapping_invariants", {
          expectedRevision: 17,
          invariants: [PINS[0]],
        });
      },
    },
    {
      label: "stage: INVALID_INPUT",
      code: "INVALID_INPUT",
      run: () => runTool(createStore(GOLDEN_STATE), personas, "stage_mapping_invariants", {
        expectedRevision: 17,
        invariants: [{ ...PINS[0], group: "g".repeat(10_000) }],
      }),
    },
    {
      label: "stage: PENDING_EXISTS",
      code: "PENDING_EXISTS",
      run: () => {
        const store = createStore(GOLDEN_STATE);
        runTool(store, personas, "stage_mapping_invariants", {
          expectedRevision: 17,
          invariants: PINS,
        });
        return runTool(store, personas, "stage_mapping_invariants", {
          expectedRevision: 17,
          invariants: [{ ...PINS[0], group: "contractors" }],
        });
      },
    },
    {
      label: "find: CANARY-bearing BAD_RULE",
      code: "BAD_RULE",
      run: () => runTool(createStore({ ...GOLDEN_STATE, pins: PINS }), personas,
        "find_mapping_counterexample", { expectedRevision: 17, invariantIds: ["CANARY_UNKNOWN_ID"] }),
    },
    {
      label: "find: output-budget EVALUATOR_FAILED",
      code: "EVALUATOR_FAILED",
      run: () => runTool(createStore({ ...GOLDEN_STATE, pins: [LONG_PIN] }), personas,
        "find_mapping_counterexample", { expectedRevision: 17 }),
    },
    {
      label: "preview: INVALID_AST",
      code: "INVALID_AST",
      run: () => runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
        expectedRevision: 17, field: "group", expr: "fetch('x')", personaIds: ["P2"],
      }),
    },
    {
      label: "preview: CANARY-bearing UNKNOWN_PERSONA",
      code: "UNKNOWN_PERSONA",
      run: () => runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
        expectedRevision: 17, field: "group", expr: '"x"', personaIds: ["CANARY_SECRET"],
      }),
    },
    {
      label: "preview: pre-seeded long value output-budget EVALUATOR_FAILED",
      code: "EVALUATOR_FAILED",
      run: () => {
        const longPersonas = [{ id: "P1", category: "employee", profiles: {
          okta: { group: LONG_ID }, hris: {}, ad: {},
        } }];
        const store = createStore({ ...GOLDEN_STATE,
          expressions: { ...GOLDEN_STATE.expressions, group: "user.group" } });
        return runTool(store, longPersonas, "preview_mapping_patch", {
          expectedRevision: 17, field: "group", expr: '"after"', personaIds: ["P1"],
        });
      },
    },
    {
      label: "prepare: STALE_EVIDENCE",
      code: "STALE_EVIDENCE",
      run: () => {
        const store = createStore({ ...GOLDEN_STATE, pins: [PINS[0]] });
        const evidenceId = store.recordEvidence("counterexample", {
          fields: ["group"], invariants: [PINS[0].id], personas: ["P2"],
        }, { violations: [] });
        store.dispatch({ type: "EDIT_EXPRESSION", field: "group", expr: '"changed"' });
        return runTool(store, personas, "prepare_mapping_review", {
          expectedRevision: 18, evidenceIds: [evidenceId],
        });
      },
    },
    {
      label: "prepare: output-budget EVALUATOR_FAILED",
      code: "EVALUATOR_FAILED",
      run: () => {
        const store = createStore({ ...GOLDEN_STATE, pins: [LONG_PIN] });
        const evidenceId = store.recordEvidence("clean-sweep", {
          fields: Object.keys(GOLDEN_STATE.expressions), invariants: [LONG_ID],
          personas: personas.map((persona) => persona.id),
        }, { violations: [] });
        return runTool(store, personas, "prepare_mapping_review", {
          expectedRevision: 17, evidenceIds: [evidenceId],
        });
      },
    },
    {
      label: "prepare: PII_GUARD",
      code: "PII_GUARD",
      run: () => {
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
            return { toJSON: () => "CANARY_PACKET" };
          },
        };
        return runTool(store, personas, "prepare_mapping_review", {
          expectedRevision: 17, evidenceIds: [evidenceId],
        });
      },
    },
    {
      label: "unknown tool: UNKNOWN_TOOL",
      code: "UNKNOWN_TOOL",
      run: () => runTool(createStore(GOLDEN_STATE), personas, "unknown_tool", {}),
    },
  ];

  for (const entry of cases) {
    await t.test(entry.label, () => assertFinalEnvelope(entry.run(), entry.code));
  }
});

test("a finalized failed stage restores the pending version allocator", async () => {
  const personas = await load("personas.json");
  const base = createStore(GOLDEN_STATE);
  const store = {
    ...base,
    dispatch(...args) {
      base.dispatch(...args);
      base.getState().pending.rules[0].id = LONG_ID;
    },
  };
  const failed = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: [PINS[0]],
  });
  assertFinalEnvelope(failed, "EVALUATOR_FAILED");

  const succeeded = runTool(base, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: PINS,
  });
  assert.equal(succeeded.ok, true);
  assert.equal(succeeded.payload.pendingVersion, 1);
});

test("caller-controlled error details are redacted or replaced as a whole", async (t) => {
  const personas = await load("personas.json");

  await t.test("CANARY persona id is redacted", () => {
    const result = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: '"x"', personaIds: ["CANARY_SECRET"],
    });
    assertFinalEnvelope(result, "UNKNOWN_PERSONA");
    assert.equal(result.error.personaId, "<redacted>");
  });

  await t.test("CANARY unknown invariant id is redacted", () => {
    const result = runTool(createStore({ ...GOLDEN_STATE, pins: PINS }), personas,
      "find_mapping_counterexample", { expectedRevision: 17, invariantIds: ["CANARY_UNKNOWN_ID"] });
    assertFinalEnvelope(result, "BAD_RULE");
    assert.equal(result.error.reason, "<redacted>");
  });

  await t.test("oversized persona id is rejected at the transport boundary", () => {
    const result = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: '"x"', personaIds: [LONG_ID],
    });
    assertFinalEnvelope(result, "INVALID_INPUT");
  });

  await t.test("oversized evidence arrays are rejected at the transport boundary", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: [PINS[0]] });
    const evidenceIds = Array.from({ length: 400 }, () => store.recordEvidence("counterexample", {
      fields: ["group"], invariants: [PINS[0].id], personas: ["P2"],
    }, { violations: [] }));
    store.dispatch({ type: "EDIT_EXPRESSION", field: "group", expr: '"changed"' });
    const result = runTool(store, personas, "prepare_mapping_review", {
      expectedRevision: 18, evidenceIds,
    });
    assertFinalEnvelope(result, "INVALID_INPUT");
  });

  await t.test("non-JSON persona objects cannot invoke custom serialization", () => {
    const personaId = { toJSON: () => "CANARY_FINAL_ASSERT" };
    const result = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: '"x"', personaIds: [personaId],
    });
    assertFinalEnvelope(result, "INVALID_INPUT");
  });
});
