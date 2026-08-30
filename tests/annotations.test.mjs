import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../src/tools/defs.mjs";

const OUTPUT_FIELDS = ["displayName", "group", "managerId", "department", "email"];
const EXPECTED_REVISION = { type: "integer", minimum: 0 };

test("tool annotations exactly describe read-only and untrusted-content behavior", () => {
  const expected = {
    read_mapping_session: { readOnlyHint: true, untrustedContentHint: true },
    stage_mapping_invariants: { readOnlyHint: false, untrustedContentHint: true },
    find_mapping_counterexample: { readOnlyHint: false, untrustedContentHint: true },
    preview_mapping_patch: { readOnlyHint: false, untrustedContentHint: true },
    prepare_mapping_review: { readOnlyHint: false, untrustedContentHint: true },
  };
  assert.deepEqual(
    Object.fromEntries(TOOLS.map((tool) => [tool.name, tool.annotations])),
    expected,
  );
});

test("stage publishes the strict oneOf invariant schema", () => {
  const stage = TOOLS.find((tool) => tool.name === "stage_mapping_invariants");
  assert.deepEqual(stage.inputSchema, {
    type: "object",
    properties: {
      expectedRevision: EXPECTED_REVISION,
      invariants: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: {
          oneOf: [
            {
              type: "object",
              properties: {
                id: { type: "string", minLength: 1 },
                type: { type: "string", enum: ["forbidden_group"] },
                personaCategory: { type: "string", minLength: 1 },
                group: { type: "string", minLength: 1 },
              },
              required: ["type", "personaCategory", "group"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                id: { type: "string", minLength: 1 },
                type: { type: "string", enum: ["null_if_missing"] },
                field: { type: "string", enum: OUTPUT_FIELDS },
                dependsOn: { type: "string", minLength: 1 },
              },
              required: ["type", "field", "dependsOn"],
              additionalProperties: false,
            },
            {
              type: "object",
              properties: {
                id: { type: "string", minLength: 1 },
                type: { type: "string", enum: ["source_of_truth"] },
                field: { type: "string", enum: OUTPUT_FIELDS },
                source: { type: "string", enum: ["okta", "hris", "ad"] },
              },
              required: ["type", "field", "source"],
              additionalProperties: false,
            },
          ],
        },
      },
    },
    required: ["expectedRevision", "invariants"],
    additionalProperties: false,
  });
});

test("all tool argument schemas are closed and fenced revisions are nonnegative integers", () => {
  for (const tool of TOOLS) {
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    if (tool.name !== "read_mapping_session") {
      assert.deepEqual(tool.inputSchema.properties.expectedRevision, EXPECTED_REVISION, tool.name);
    }
  }

  const find = TOOLS.find((tool) => tool.name === "find_mapping_counterexample");
  assert.deepEqual(find.inputSchema.properties.maxPersonas, {
    type: "integer",
    minimum: 1,
    maximum: 8,
  });
});
