import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const load = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url)));

test("personas: identity-bearing keys use canary format; okta always carries identity; DC carriers present", async () => {
  const ps = await load("personas.json");
  assert.equal(ps.length, 8);
  for (const p of ps) for (const src of ["okta", "hris", "ad"]) {
    const prof = p.profiles[src] ?? {};
    for (const [k, re] of [["firstName", /^CANARY_FN_/], ["lastName", /^CANARY_LN_/], ["email", /^CANARY_EM_.+@example\.invalid$/]])
      if (k in prof) assert.match(prof[k], re, `${p.id}.${src}.${k}`);
    if (src === "okta") assert.ok("firstName" in prof, `${p.id} okta profile carries identity`);
  }
  assert.ok(ps.some(p => p.id === "P2" && p.profiles.hris.userType === "Contractor")); // DC1 carrier
  assert.ok(ps.some(p => p.id === "P3" && p.region === "EU"
    && !["okta", "hris", "ad"].some(s => "managerId" in (p.profiles[s] ?? {}))));      // DC2 carrier
  assert.ok(ps.some(p => p.id === "P4" && p.profiles.ad.department === "Sales"
    && p.profiles.hris.department === "Engineering"));                                 // DC3 carrier
  assert.ok(ps.some(p => p.id === "P5" && p.profiles.ad.department === ""
    && p.profiles.hris.department === "Finance"));                                     // DC4 carrier
});

test("oracle: audited, size-3 witness, violations reference the 4 classes", async () => {
  const o = await load("oracle.json");
  assert.equal(o.audited, true);
  assert.equal(o.minimalWitness.size, 3);
  assert.deepEqual([...new Set(o.expectedViolations.map(v => v.defectClass))].sort(),
    ["DC1", "DC2", "DC3", "DC4"]);
});

test("snapshot: corrected exprs, hris-first, no pins", async () => {
  const s = await load("persisted-snapshot.json");
  assert.deepEqual(s.priority, ["hris", "ad"]);
  assert.ok(s.expressions.group.includes("String.toLowerCase"));
  assert.equal(s.expressions.managerId, "user.managerId");
  assert.deepEqual(s.pins, []);
});
