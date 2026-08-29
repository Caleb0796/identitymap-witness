// The machine reproduces the hand-walk. This is the review's guard against the
// r1 failure mode (a fixture that cannot produce its own witness): the oracle was
// derived on paper FIRST; the engine must now agree cell by cell.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parse } from "../src/engine/parser.mjs";
import { evaluate } from "../src/engine/eval.mjs";
import { GOLDEN_STATE } from "../src/tools/defs.mjs";

const load = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url)));

test("golden expressions over all personas reproduce oracle.expectedValues exactly", async () => {
  const personas = await load("personas.json");
  const oracle = await load("oracle.json");
  const asts = Object.fromEntries(Object.entries(GOLDEN_STATE.expressions).map(([f, e]) => [f, parse(e)]));
  for (const persona of personas) {
    for (const [field, ast] of Object.entries(asts)) {
      const want = oracle.expectedValues[persona.id][field];
      const got = evaluate(ast, persona, { priority: GOLDEN_STATE.priority });
      assert.equal(got.value, want.value, `${persona.id}.${field} value`);
      assert.equal(got.prov.source ?? "literal", want.provSource, `${persona.id}.${field} provSource`);
    }
  }
});
