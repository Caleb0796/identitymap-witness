// Invariant checker — SPEC.md r4 §5. The checker is case-robust where the SPEC
// says so; the golden draft's EXPRESSION is not. That asymmetry is DC1.

const lc = (v) => (typeof v === "string" ? v.toLowerCase() : v);
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function requireField(fields, field) {
  if (!hasOwn(fields, field))
    throw Object.assign(new Error(`invariant references missing output field ${field}`), { code: "BAD_RULE" });
  return fields[field];
}

export function checkInvariants(pins, personas, outputs) {
  const violations = [];
  for (const pin of pins) {
    for (const persona of personas) {
      const fields = outputs[persona.id]?.fields ?? {};
      if (pin.type === "forbidden_group") {
        const got = requireField(fields, "group");
        if (lc(persona.category) !== lc(pin.personaCategory)) continue;
        if (got && lc(got.value) === lc(pin.group)) {
          violations.push({ invariantId: pin.id, personaId: persona.id, field: "group",
            detail: "persona category maps into a forbidden group" });
        }
      } else if (pin.type === "null_if_missing") {
        const got = requireField(fields, pin.field);
        const supplied = ["okta", "hris", "ad"]
          .some((source) => hasOwn(persona.profiles?.[source] ?? {}, pin.dependsOn));
        if (supplied) continue;
        if (got && got.value !== null) {
          violations.push({ invariantId: pin.id, personaId: persona.id, field: pin.field,
            detail: `no source supplies ${pin.dependsOn}; target is non-null` });
        }
      } else if (pin.type === "source_of_truth") {
        const got = requireField(fields, pin.field);
        const sourceProfile = persona.profiles?.[pin.source] ?? {};
        const sotValue = hasOwn(sourceProfile, pin.field) ? sourceProfile[pin.field] : null;
        if (sotValue == null || sotValue === "") continue;
        if (got && got.prov.source !== pin.source) {
          violations.push({ invariantId: pin.id, personaId: persona.id, field: pin.field,
            detail: `${pin.source} is the expected source; ${got.prov.source ?? "no source"} won` });
        }
      } else {
        throw Object.assign(new Error(`unknown invariant type ${pin.type}`), { code: "BAD_RULE" });
      }
    }
  }
  return violations;
}
