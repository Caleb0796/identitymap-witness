import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "../src/engine/parser.mjs";
import { evaluate } from "../src/engine/eval.mjs";
import { checkInvariants } from "../src/engine/invariants.mjs";
import { GOLDEN_STATE } from "../src/tools/defs.mjs";

const load = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url)));
const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];

function outputsFor(state, personas) {
  const asts = Object.fromEntries(Object.entries(state.expressions).map(([f, e]) => [f, parse(e)]));
  const out = {};
  for (const p of personas) {
    out[p.id] = { fields: {} };
    for (const [field, ast] of Object.entries(asts))
      out[p.id].fields[field] = evaluate(ast, p, { priority: state.priority });
  }
  return out;
}

test("golden state violations equal the oracle set exactly", async () => {
  const personas = await load("personas.json");
  const oracle = await load("oracle.json");
  const got = checkInvariants(PINS, personas, outputsFor(GOLDEN_STATE, personas))
    .map(({ invariantId, personaId, field }) => ({ invariantId, personaId, field }))
    .sort((a, b) => (a.personaId + a.invariantId).localeCompare(b.personaId + b.invariantId));
  const want = oracle.expectedViolations
    .map(({ invariantId, personaId, field }) => ({ invariantId, personaId, field }))
    .sort((a, b) => (a.personaId + a.invariantId).localeCompare(b.personaId + b.invariantId));
  assert.deepEqual(got, want);
});

test("persisted snapshot state produces zero violations", async () => {
  const personas = await load("personas.json");
  const snapshot = await load("persisted-snapshot.json");
  assert.deepEqual(checkInvariants(PINS, personas, outputsFor(snapshot, personas)), []);
});

test("forbidden_group matches category case-insensitively and value case-insensitively", () => {
  const personas = [{ id: "Q1", category: "Contractor", profiles: { okta: {}, hris: {}, ad: {} } }];
  const outputs = { Q1: { fields: { group: { value: "Employees", prov: { source: "literal" } } } } };
  const v = checkInvariants([PINS[0]], personas, outputs);
  assert.equal(v.length, 1);
  assert.equal(v[0].invariantId, "inv-forbid");
});

test("null_if_missing passes when a source supplies the attribute", () => {
  const personas = [{ id: "Q2", category: "employee", profiles: { okta: {}, hris: { managerId: "M1" }, ad: {} } }];
  const outputs = { Q2: { fields: { managerId: { value: "M1", prov: { source: "hris" } } } } };
  assert.deepEqual(checkInvariants([PINS[1]], personas, outputs), []);
});

test("source_of_truth ignores personas where the source has nothing to say", () => {
  const personas = [{ id: "Q3", category: "employee", profiles: { okta: { department: "X" }, hris: {}, ad: {} } }];
  const outputs = { Q3: { fields: { department: { value: "X", prov: { source: "okta" } } } } };
  assert.deepEqual(checkInvariants([PINS[2]], personas, outputs), []);
});
