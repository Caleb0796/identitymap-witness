import { test } from "node:test";
import assert from "node:assert/strict";
import { TOOLS } from "../src/tools/defs.mjs";

const OUTPUT_FIELDS = ["displayName", "group", "managerId", "department", "email"];
const EXPECTED_REVISION = { type: "integer", minimum: 0, maximum: Number.MAX_SAFE_INTEGER };
const INVARIANT_ID = { type: "string", minLength: 1, maxLength: 64 };
const RULE_TEXT = { type: "string", minLength: 1, maxLength: 128 };
const PERSONA_ID = { type: "string", minLength: 1, maxLength: 64 };
const EXPECTED_TOOL_DESCRIPTIONS = {
  read_mapping_session: "Read the current unsaved mapping session. Returns the revision, source priority, draft field expressions, confirmed pin ids, pending rule ids/version, and persona count; never returns profile values. Use the returned revision as expectedRevision for every other tool, and re-read after human confirmation or edits.",
  stage_mapping_invariants: "Stage the complete proposed invariant set for visible human review. expectedRevision must match the current session. Staging does not confirm, persist, or change revision; later confirmation replaces the pinned set. Returns pending ids/version/digest. On success, stop for the human to choose Confirm all or Discard, then re-read.",
  find_mapping_counterexample: "Evaluate all synthetic personas (eight in this fixture) against confirmed invariants at expectedRevision. Returns canonical minimum witness personaIds, every violation row, scope/fullSweep flags, and one closing evidence id; records evidence but never edits the draft. Requires a nonempty confirmed/selected set. After any human edit, re-read and re-find because old evidence becomes stale.",
  preview_mapping_patch: "Evaluate one candidate expr for field on the named personaIds at expectedRevision without editing the draft. Returns identity-minimized diffs, remaining violations for that field within those personas, and a non-closing preview evidence id. Use persona ids returned by find_mapping_counterexample; UNKNOWN_PERSONA identifies a bad id. The human makes any edit in the page.",
  prepare_mapping_review: "Create a review packet at expectedRevision from evidenceIds. Empty, missing, or stale ids fail. Only current counterexample or clean-sweep evidence closes pins; preview evidence never does. Returns coverage and blockers and records a packet. A fresh packet with blockers:[] enables Apply mapping (manual page control); this tool never applies or sends anything.",
};
const EXPECTED_SCHEMAS = {
  read_mapping_session: { type: "object", properties: {}, additionalProperties: false },
  stage_mapping_invariants: {
    type: "object",
    properties: {
      expectedRevision: EXPECTED_REVISION,
      invariants: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        items: { oneOf: [
          {
            type: "object",
            properties: {
              id: INVARIANT_ID,
              type: { type: "string", enum: ["forbidden_group"] },
              personaCategory: RULE_TEXT,
              group: RULE_TEXT,
            },
            required: ["type", "personaCategory", "group"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              id: INVARIANT_ID,
              type: { type: "string", enum: ["null_if_missing"] },
              field: { type: "string", enum: OUTPUT_FIELDS },
              dependsOn: RULE_TEXT,
            },
            required: ["type", "field", "dependsOn"],
            additionalProperties: false,
          },
          {
            type: "object",
            properties: {
              id: INVARIANT_ID,
              type: { type: "string", enum: ["source_of_truth"] },
              field: { type: "string", enum: OUTPUT_FIELDS },
              source: { type: "string", enum: ["okta", "hris", "ad"] },
            },
            required: ["type", "field", "source"],
            additionalProperties: false,
          },
        ] },
      },
    },
    required: ["expectedRevision", "invariants"],
    additionalProperties: false,
  },
  find_mapping_counterexample: {
    type: "object",
    properties: {
      expectedRevision: EXPECTED_REVISION,
      invariantIds: {
        type: "array",
        maxItems: 8,
        uniqueItems: true,
        items: INVARIANT_ID,
      },
      maxPersonas: { type: "integer", minimum: 1, maximum: 8 },
    },
    required: ["expectedRevision"],
    additionalProperties: false,
  },
  preview_mapping_patch: {
    type: "object",
    properties: {
      expectedRevision: EXPECTED_REVISION,
      field: { type: "string", enum: OUTPUT_FIELDS },
      expr: { type: "string", maxLength: 512 },
      personaIds: {
        type: "array",
        minItems: 1,
        maxItems: 8,
        uniqueItems: true,
        items: PERSONA_ID,
      },
    },
    required: ["expectedRevision", "field", "expr", "personaIds"],
    additionalProperties: false,
  },
  prepare_mapping_review: {
    type: "object",
    properties: {
      expectedRevision: EXPECTED_REVISION,
      evidenceIds: {
        type: "array",
        maxItems: 16,
        uniqueItems: true,
        items: { type: "string", minLength: 1, maxLength: 32, pattern: "^E-[1-9]\\d*$" },
      },
    },
    required: ["expectedRevision", "evidenceIds"],
    additionalProperties: false,
  },
};

function withoutDescriptions(value) {
  if (Array.isArray(value)) return value.map(withoutDescriptions);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value)
    .filter(([key]) => key !== "description")
    .map(([key, item]) => [key, withoutDescriptions(item)]));
}

function propertySchemas(schema, path = []) {
  const found = [];
  for (const [name, property] of Object.entries(schema.properties ?? {})) {
    const propertyPath = [...path, name];
    found.push([propertyPath.join("."), property]);
    found.push(...propertySchemas(property, propertyPath));
  }
  if (schema.items) found.push(...propertySchemas(schema.items, path));
  for (const branch of schema.oneOf ?? []) found.push(...propertySchemas(branch, path));
  return found;
}

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
  assert.deepEqual(withoutDescriptions(stage.inputSchema), EXPECTED_SCHEMAS.stage_mapping_invariants);
});

test("descriptions are bounded metadata on every input property", () => {
  assert.deepEqual(
    Object.fromEntries(TOOLS.map((tool) => [tool.name, withoutDescriptions(tool.inputSchema)])),
    EXPECTED_SCHEMAS,
  );
  for (const tool of TOOLS) {
    assert.equal(tool.description, EXPECTED_TOOL_DESCRIPTIONS[tool.name], tool.name);
    assert.ok(tool.description.length <= 500, `${tool.name} description is ${tool.description.length} chars`);
    for (const [path, schema] of propertySchemas(tool.inputSchema)) {
      assert.equal(typeof schema.description, "string", `${tool.name}.${path}`);
      assert.ok(schema.description.length > 0, `${tool.name}.${path}`);
    }
  }
});

test("all tool argument schemas are closed and fenced revisions are nonnegative integers", () => {
  for (const tool of TOOLS) {
    assert.equal(tool.inputSchema.additionalProperties, false, tool.name);
    if (tool.name !== "read_mapping_session") {
      assert.deepEqual(withoutDescriptions(tool.inputSchema.properties.expectedRevision),
        EXPECTED_REVISION, tool.name);
    }
  }

  const find = TOOLS.find((tool) => tool.name === "find_mapping_counterexample");
  assert.deepEqual(withoutDescriptions(find.inputSchema.properties.maxPersonas), {
    type: "integer",
    minimum: 1,
    maximum: 8,
  });

  assert.deepEqual(withoutDescriptions(find.inputSchema.properties.invariantIds), {
    type: "array",
    maxItems: 8,
    uniqueItems: true,
    items: { type: "string", minLength: 1, maxLength: 64 },
  });
  const preview = TOOLS.find((tool) => tool.name === "preview_mapping_patch");
  assert.deepEqual(preview.inputSchema.properties.field.enum, OUTPUT_FIELDS);
  assert.equal(preview.inputSchema.properties.expr.maxLength, 512);
  assert.equal(preview.inputSchema.properties.personaIds.minItems, 1);
  assert.equal(preview.inputSchema.properties.personaIds.maxItems, 8);
  assert.equal(preview.inputSchema.properties.personaIds.uniqueItems, true);
  const prepare = TOOLS.find((tool) => tool.name === "prepare_mapping_review");
  assert.equal(prepare.inputSchema.properties.evidenceIds.maxItems, 16);
  assert.equal(prepare.inputSchema.properties.evidenceIds.uniqueItems, true);
  assert.equal(prepare.inputSchema.properties.evidenceIds.items.maxLength, 32);
  assert.equal(prepare.inputSchema.properties.evidenceIds.items.pattern, "^E-[1-9]\\d*$");
});
