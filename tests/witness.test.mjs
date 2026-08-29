import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { findWitness } from "../src/engine/witness.mjs";
import { GOLDEN_STATE } from "../src/tools/defs.mjs";

const load = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url)));
const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];

test("golden: exhaustive minimum matches oracle (size 3, lexicographic tie-break)", async () => {
  const personas = await load("personas.json");
  const oracle = await load("oracle.json");
  const state = { ...GOLDEN_STATE, pins: PINS };
  const r = findWitness(state, personas);
  assert.deepEqual(r.coverage, { "inv-forbid": true, "inv-null": true, "inv-sot": true });
  assert.equal(r.personaIds.length, oracle.minimalWitness.size);
  assert.ok(oracle.minimalWitness.sets.some((s) => JSON.stringify(s) === JSON.stringify(r.personaIds)),
    `got ${r.personaIds}`);
  // deterministic: lexicographically first valid set
  assert.deepEqual(r.personaIds, ["P2", "P3", "P4"]);
  assert.equal(r.violations.length, 4);
});

test("single pin: witness of size 1", async () => {
  const personas = await load("personas.json");
  const state = { ...GOLDEN_STATE, pins: [PINS[0]] };
  const r = findWitness(state, personas);
  assert.deepEqual(r.personaIds, ["P2"]);
});

test("clean snapshot state: empty witness, empty violations", async () => {
  const personas = await load("personas.json");
  const snapshot = await load("persisted-snapshot.json");
  const r = findWitness({ ...snapshot, pins: PINS }, personas);
  assert.deepEqual(r.personaIds, []);
  assert.deepEqual(r.violations, []);
});

test("no size-2 subset covers all three invariants (minimality is real, not asserted)", async () => {
  const personas = await load("personas.json");
  const state = { ...GOLDEN_STATE, pins: PINS };
  const { violations } = findWitness(state, personas);
  const violating = [...new Set(violations.map((v) => v.personaId))];
  const covers = (subset) => {
    const got = new Set(violations.filter((v) => subset.includes(v.personaId)).map((v) => v.invariantId));
    return ["inv-forbid", "inv-null", "inv-sot"].every((i) => got.has(i));
  };
  for (let i = 0; i < violating.length; i++)
    for (let j = i + 1; j < violating.length; j++)
      assert.ok(!covers([violating[i], violating[j]]), `pair ${violating[i]},${violating[j]} should not cover`);
});
