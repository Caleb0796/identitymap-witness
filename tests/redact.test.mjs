import { test } from "node:test";
import assert from "node:assert/strict";
import { redactPayload, assertNoCanary } from "../src/tools/redact.mjs";

test("canary-bearing string values are scrubbed anywhere in the tree", () => {
  const p = redactPayload({
    a: "CANARY_FN_P1 CANARY_LN_P1",
    nested: { list: [{ v: "before CANARY_EM_P2@example.invalid after" }] },
    clean: "Engineering",
  });
  assert.equal(p.a, "<redacted>");
  assert.equal(p.nested.list[0].v, "<redacted>");
  assert.equal(p.clean, "Engineering");
});

test("canary in an object KEY is scrubbed too", () => {
  const p = redactPayload({ ["CANARY_EM_P3@example.invalid"]: "x" });
  assert.deepEqual(Object.keys(p), ["<redacted>"]);
});

test("identity field names force diff redaction regardless of value", () => {
  const p = redactPayload({ diffs: [{ personaId: "P2", field: "email", before: "a@b.c", after: "d@e.f" }] });
  assert.equal(p.diffs[0].before, "<redacted:changed>");
  assert.equal(p.diffs[0].after, "<redacted:changed>");
});

test("assertNoCanary throws PII_GUARD on a crafted leak", () => {
  assert.throws(() => assertNoCanary({ deep: ["ok", { x: "CANARY_LN_P9" }] }), (e) => e.code === "PII_GUARD");
  assertNoCanary({ fine: "no leak" });
});
