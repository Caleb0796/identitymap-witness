// Redaction at the tool boundary — SPEC.md r2 §9. Belt: redactPayload rewrites
// canary-bearing strings (keys AND values) and identity-field diffs. Suspenders:
// assertNoCanary throws PII_GUARD if anything slips through anyway.

const IDENTITY_FIELDS = new Set(["firstName", "lastName", "email", "displayName"]);
const hit = (s) => typeof s === "string" && s.includes("CANARY_");

export function redactPayload(value) {
  if (typeof value === "string") return hit(value) ? "<redacted>" : value;
  if (Array.isArray(value)) return value.map(redactPayload);
  if (value && typeof value === "object") {
    const out = {};
    const isDiff = "before" in value && "after" in value;
    const diffField = isDiff ? (value.field ?? null) : null;
    for (const [k, v] of Object.entries(value)) {
      const key = hit(k) ? "<redacted>" : k;
      if (isDiff && (k === "before" || k === "after") && (diffField === null || IDENTITY_FIELDS.has(diffField))) {
        out[key] = "<redacted:changed>";
      } else {
        out[key] = redactPayload(v);
      }
    }
    return out;
  }
  return value;
}

export function assertNoCanary(value) {
  const s = JSON.stringify(value) ?? "";
  if (s.includes("CANARY_")) throw Object.assign(new Error("canary escaped the redaction layer"), { code: "PII_GUARD" });
  return value;
}
