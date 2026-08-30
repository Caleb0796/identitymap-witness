export const OUTPUT_FIELDS = ["displayName", "group", "managerId", "department", "email"];

const OUTPUT_FIELD_SET = new Set(OUTPUT_FIELDS);
const SOURCE_SET = new Set(["okta", "hris", "ad"]);
const RULE_FIELDS = {
  forbidden_group: ["personaCategory", "group"],
  null_if_missing: ["field", "dependsOn"],
  source_of_truth: ["field", "source"],
};

const badRule = (reason) => Object.assign(new Error(reason), { code: "BAD_RULE" });
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function requireNonEmptyString(rule, key, index) {
  if (typeof rule[key] !== "string" || rule[key].length === 0)
    throw badRule(`invariant ${index + 1} ${key} must be a non-empty string`);
}

export function validateInvariants(invariants) {
  if (!Array.isArray(invariants) || invariants.length < 1 || invariants.length > 8)
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
