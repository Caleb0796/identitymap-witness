// Invariant checker — SPEC.md r2 §5. The checker is case-robust where the SPEC
// says so; the golden draft's EXPRESSION is not. That asymmetry is DC1.

const lc = (v) => (typeof v === "string" ? v.toLowerCase() : v);

export function checkInvariants(pins, personas, outputs) {
  const violations = [];
  for (const pin of pins) {
    for (const persona of personas) {
      const fields = outputs[persona.id]?.fields ?? {};
      if (pin.type === "forbidden_group") {
        if (lc(persona.category) !== lc(pin.personaCategory)) continue;
        const got = fields.group;
        if (got && lc(got.value) === lc(pin.group)) {
          violations.push({ invariantId: pin.id, personaId: persona.id, field: "group",
            detail: `category ${persona.category} mapped into forbidden group ${got.value}` });
        }
      } else if (pin.type === "null_if_missing") {
        const supplied = ["okta", "hris", "ad"].some((s) => pin.dependsOn in (persona.profiles?.[s] ?? {}));
        if (supplied) continue;
        const got = fields[pin.field];
        if (got && got.value !== null) {
          violations.push({ invariantId: pin.id, personaId: persona.id, field: pin.field,
            detail: `no source supplies ${pin.dependsOn}; target must be null, got ${JSON.stringify(got.value)}` });
        }
      } else if (pin.type === "source_of_truth") {
        const sotValue = (persona.profiles?.[pin.source] ?? {})[pin.field];
        if (sotValue == null || sotValue === "") continue;
        const got = fields[pin.field];
        if (got && got.prov.source !== pin.source) {
          violations.push({ invariantId: pin.id, personaId: persona.id, field: pin.field,
            detail: `${pin.source} holds ${JSON.stringify(sotValue)} but value came from ${got.prov.source ?? "nowhere"}` });
        }
      } else {
        throw Object.assign(new Error(`unknown invariant type ${pin.type}`), { code: "BAD_RULE" });
      }
    }
  }
  return violations;
}
