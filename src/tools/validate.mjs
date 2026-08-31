export const OUTPUT_FIELDS = ["displayName", "group", "managerId", "department", "email"];
export const MAX_INVARIANTS = 8;
export const MAX_INVARIANT_ID_CHARS = 64;
export const MAX_RULE_TEXT_CHARS = 128;
export const MAX_EXPRESSION_CHARS = 512;
export const MAX_INVARIANT_IDS = 8;
export const MAX_PERSONA_IDS = 8;
export const MAX_PERSONA_ID_CHARS = 64;
export const MAX_EVIDENCE_IDS = 16;
export const MAX_EVIDENCE_ID_CHARS = 32;
export const MAX_REVISION = Number.MAX_SAFE_INTEGER;

const OUTPUT_FIELD_SET = new Set(OUTPUT_FIELDS);
const SOURCE_SET = new Set(["okta", "hris", "ad"]);
const FENCED_TOOLS = new Set([
  "stage_mapping_invariants",
  "find_mapping_counterexample",
  "preview_mapping_patch",
  "prepare_mapping_review",
]);
const RULE_FIELDS = {
  forbidden_group: ["personaCategory", "group"],
  null_if_missing: ["field", "dependsOn"],
  source_of_truth: ["field", "source"],
};

const badRule = (reason) => Object.assign(new Error(reason), { code: "BAD_RULE" });
const invalidInput = (reason) => Object.assign(new Error(reason), { code: "INVALID_INPUT" });
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
const isPlainObject = (value) => {
  if (value === null || typeof value !== "object" || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

function isJsonValue(value, seen = new WeakSet()) {
  if (value === null || typeof value === "string" || typeof value === "boolean") return true;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value !== "object" || seen.has(value)) return false;
  if (!Array.isArray(value) && !isPlainObject(value)) return false;

  const keys = Reflect.ownKeys(value);
  if (keys.some((key) => typeof key !== "string")) return false;
  if (Array.isArray(value)) {
    const expected = [...Array.from({ length: value.length }, (_, index) => String(index)), "length"];
    if (JSON.stringify(keys) !== JSON.stringify(expected)) return false;
  } else if (keys.length !== Object.keys(value).length) {
    return false;
  }

  seen.add(value);
  for (const key of Array.isArray(value) ? keys.slice(0, -1) : keys) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor || !hasOwn(descriptor, "value") || !isJsonValue(descriptor.value, seen)) {
      seen.delete(value);
      return false;
    }
  }
  seen.delete(value);
  return true;
}

function requireExactKeys(value, required, optional = []) {
  const allowed = new Set([...required, ...optional]);
  if (Object.keys(value).some((key) => !allowed.has(key)))
    throw invalidInput("input contains an unexpected property");
  if (required.some((key) => !hasOwn(value, key)))
    throw invalidInput("input is missing a required property");
}

function requireString(value, name, { min = 0, max, pattern } = {}) {
  if (typeof value !== "string") throw invalidInput(`${name} must be a string`);
  if (value.length < min || (max !== undefined && value.length > max))
    throw invalidInput(`${name} is outside its length limit`);
  if (pattern && !pattern.test(value)) throw invalidInput(`${name} has an invalid format`);
}

function requireUniqueStringArray(value, name, { min = 0, max, itemMax, pattern } = {}) {
  if (!Array.isArray(value) || value.length < min || value.length > max)
    throw invalidInput(`${name} is outside its item limit`);
  for (const item of value) requireString(item, `${name} item`, { min: 1, max: itemMax, pattern });
  if (new Set(value).size !== value.length) throw invalidInput(`${name} must contain unique entries`);
}

function validateRuleInput(rule) {
  if (!isPlainObject(rule)) throw invalidInput("each invariant must be a plain object");
  const allowed = new Set(["id", "type", "personaCategory", "group", "field", "dependsOn", "source"]);
  if (Object.keys(rule).some((key) => !allowed.has(key)))
    throw invalidInput("invariant contains an unexpected property");
  if (!hasOwn(rule, "type")) throw invalidInput("invariant is missing type");
  requireString(rule.type, "invariant type", { min: 1, max: MAX_RULE_TEXT_CHARS });
  if (hasOwn(rule, "id"))
    requireString(rule.id, "invariant id", { min: 1, max: MAX_INVARIANT_ID_CHARS });

  const fields = hasOwn(RULE_FIELDS, rule.type) ? RULE_FIELDS[rule.type] : null;
  if (fields) {
    const shape = new Set(["id", "type", ...fields]);
    if (Object.keys(rule).some((key) => !shape.has(key)))
      throw invalidInput("invariant contains a property for another rule type");
    if (fields.some((key) => !hasOwn(rule, key)))
      throw invalidInput("invariant is missing a required property");
  }

  for (const key of ["personaCategory", "group", "dependsOn"])
    if (hasOwn(rule, key)) requireString(rule[key], key, { min: 1, max: MAX_RULE_TEXT_CHARS });
  for (const key of ["field", "source"])
    if (hasOwn(rule, key)) requireString(rule[key], key, { min: 1, max: MAX_RULE_TEXT_CHARS });
}

export function validateToolInputHeader(name, input) {
  if (!FENCED_TOOLS.has(name)) return;
  if (!isPlainObject(input)) throw invalidInput("input must be a plain object");
  const descriptor = Object.getOwnPropertyDescriptor(input, "expectedRevision");
  if (!descriptor || !hasOwn(descriptor, "value")
      || !Number.isSafeInteger(descriptor.value) || descriptor.value < 0)
    throw invalidInput("expectedRevision must be a nonnegative safe integer");
}

export function validateToolInput(name, input) {
  if (!isPlainObject(input) || !isJsonValue(input))
    throw invalidInput("input must be a plain JSON object");

  if (name === "read_mapping_session") {
    requireExactKeys(input, []);
    return;
  }

  if (name === "stage_mapping_invariants") {
    requireExactKeys(input, ["expectedRevision", "invariants"]);
    if (!Array.isArray(input.invariants)
        || input.invariants.length < 1 || input.invariants.length > MAX_INVARIANTS)
      throw invalidInput("invariants must contain 1 to 8 rules");
    for (const rule of input.invariants) validateRuleInput(rule);
    return;
  }

  if (name === "find_mapping_counterexample") {
    requireExactKeys(input, ["expectedRevision"], ["invariantIds", "maxPersonas"]);
    if (hasOwn(input, "invariantIds")) requireUniqueStringArray(input.invariantIds, "invariantIds", {
      max: MAX_INVARIANT_IDS, itemMax: MAX_INVARIANT_ID_CHARS,
    });
    if (hasOwn(input, "maxPersonas")
        && (!Number.isInteger(input.maxPersonas) || input.maxPersonas < 1 || input.maxPersonas > 8))
      throw invalidInput("maxPersonas must be an integer from 1 to 8");
    return;
  }

  if (name === "preview_mapping_patch") {
    requireExactKeys(input, ["expectedRevision", "field", "expr", "personaIds"]);
    requireString(input.field, "field", { min: 1, max: MAX_RULE_TEXT_CHARS });
    if (!OUTPUT_FIELD_SET.has(input.field)) throw invalidInput("field must be an output field");
    requireString(input.expr, "expr", { max: MAX_EXPRESSION_CHARS });
    requireUniqueStringArray(input.personaIds, "personaIds", {
      min: 1, max: MAX_PERSONA_IDS, itemMax: MAX_PERSONA_ID_CHARS,
    });
    return;
  }

  if (name === "prepare_mapping_review") {
    requireExactKeys(input, ["expectedRevision", "evidenceIds"]);
    requireUniqueStringArray(input.evidenceIds, "evidenceIds", {
      max: MAX_EVIDENCE_IDS,
      itemMax: MAX_EVIDENCE_ID_CHARS,
      pattern: /^E-[1-9]\d*$/,
    });
  }
}

function requireNonEmptyString(rule, key, index) {
  if (typeof rule[key] !== "string" || rule[key].length === 0)
    throw badRule(`invariant ${index + 1} ${key} must be a non-empty string`);
}

export function validateInvariants(invariants) {
  if (!Array.isArray(invariants) || invariants.length < 1 || invariants.length > MAX_INVARIANTS)
    throw badRule("invariants must be an array of 1 to 8 rules");

  const resolved = invariants.map((rule, index) => {
    if (!rule || typeof rule !== "object" || Array.isArray(rule))
      throw badRule(`invariant ${index + 1} must be an object`);

    if (typeof rule.type !== "string" || !hasOwn(RULE_FIELDS, rule.type))
      throw badRule(`invariant ${index + 1} has an unknown type`);
    const fields = RULE_FIELDS[rule.type];

    const allowed = new Set(["id", "type", ...fields]);
    const keys = Object.keys(rule);
    if (keys.some((key) => !allowed.has(key)))
      throw badRule(`invariant ${index + 1} has an unexpected property`);
    for (const key of ["type", ...fields]) {
      if (!hasOwn(rule, key)) throw badRule(`invariant ${index + 1} is missing ${key}`);
    }

    if (hasOwn(rule, "id")) requireNonEmptyString(rule, "id", index);
    for (const key of fields) requireNonEmptyString(rule, key, index);
    for (const value of Object.values(rule)) {
      if (typeof value === "string" && value.includes("CANARY_"))
        throw badRule(`invariant ${index + 1} contains a reserved string`);
    }

    if (hasOwn(rule, "field") && !OUTPUT_FIELD_SET.has(rule.field))
      throw badRule(`invariant ${index + 1} field is not an output field`);
    if (hasOwn(rule, "source") && !SOURCE_SET.has(rule.source))
      throw badRule(`invariant ${index + 1} source is not supported`);

    return { ...rule, id: rule.id ?? `pin-${index + 1}` };
  });

  const ids = new Set();
  for (const rule of resolved) {
    if (ids.has(rule.id)) throw badRule("invariant ids must be unique");
    ids.add(rule.id);
  }
  return resolved;
}

export function validateMaxPersonas(maxPersonas) {
  if (maxPersonas === undefined) return;
  if (!Number.isInteger(maxPersonas) || maxPersonas < 1 || maxPersonas > 8)
    throw badRule("maxPersonas must be an integer from 1 to 8");
}
