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

const wireText = (result) => JSON.stringify(result.ok ? result.payload : { error: result.error });

function assertFinalEnvelope(result, code) {
  assert.equal(result.ok, false);
  assert.equal(result.error.code, code);
  const text = wireText(result);
  assert.ok(text.length <= 1_500, `wire envelope is ${text.length} chars`);
  assert.ok(!text.includes("CANARY_"), text.slice(0, 200));
}

test("every tool's reachable error envelopes cross the unified finalizer", async (t) => {
  const personas = await load("personas.json");
  const cases = [
    {
      label: "read: output-budget EVALUATOR_FAILED",
      code: "EVALUATOR_FAILED",
      run: () => runTool(createStore({ ...GOLDEN_STATE, pins: [LONG_PIN] }), personas,
        "read_mapping_session", {}),
    },
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
      label: "stage: output-budget EVALUATOR_FAILED",
      code: "EVALUATOR_FAILED",
      run: () => runTool(createStore(GOLDEN_STATE), personas, "stage_mapping_invariants", {
        expectedRevision: 17,
        invariants: [LONG_PIN],
      }),
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
      label: "preview: output-budget EVALUATOR_FAILED",
      code: "EVALUATOR_FAILED",
      run: () => {
        const field = `field-${LONG_ID}`;
        return runTool(createStore({
          ...GOLDEN_STATE,
          expressions: { ...GOLDEN_STATE.expressions, [field]: '"before"' },
        }), personas, "preview_mapping_patch", {
          expectedRevision: 17, field, expr: '"after"', personaIds: ["P1"],
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

  await t.test("oversized persona id keeps its code and withholds the entire detail", () => {
    const result = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: '"x"', personaIds: [LONG_ID],
    });
    assertFinalEnvelope(result, "UNKNOWN_PERSONA");
    assert.deepEqual(result.error, {
      code: "UNKNOWN_PERSONA",
      reason: "detail withheld by output budget",
    });
  });

  await t.test("oversized staleIds keeps STALE_EVIDENCE and withholds the entire detail", () => {
    const store = createStore({ ...GOLDEN_STATE, pins: [PINS[0]] });
    const evidenceIds = Array.from({ length: 400 }, () => store.recordEvidence("counterexample", {
      fields: ["group"], invariants: [PINS[0].id], personas: ["P2"],
    }, { violations: [] }));
    store.dispatch({ type: "EDIT_EXPRESSION", field: "group", expr: '"changed"' });
    const result = runTool(store, personas, "prepare_mapping_review", {
      expectedRevision: 18, evidenceIds,
    });
    assertFinalEnvelope(result, "STALE_EVIDENCE");
    assert.deepEqual(result.error, {
      code: "STALE_EVIDENCE",
      reason: "detail withheld by output budget",
    });
  });

  await t.test("a final canary trip keeps the original error code", () => {
    const personaId = { toJSON: () => "CANARY_FINAL_ASSERT" };
    const result = runTool(createStore(GOLDEN_STATE), personas, "preview_mapping_patch", {
      expectedRevision: 17, field: "group", expr: '"x"', personaIds: [personaId],
    });
    assertFinalEnvelope(result, "UNKNOWN_PERSONA");
    assert.deepEqual(result.error, {
      code: "UNKNOWN_PERSONA",
      reason: "detail withheld by privacy guard",
    });
  });
});
