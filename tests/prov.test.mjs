import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../src/engine/parser.mjs";
import { evaluate } from "../src/engine/eval.mjs";

test("candidates chain names every consulted source in order — losers included", () => {
  // P4's shape: ad wins department, hris loses with a real value. The rail must show it.
  const persona = { id: "P4x", category: "employee", profiles: {
    okta: { department: "OktaDept" }, hris: { department: "Engineering" }, ad: { department: "Sales" } } };
  const r = evaluate(parse("user.department"), persona, { priority: ["ad", "hris"] });
  assert.equal(r.prov.source, "ad");
  assert.deepEqual(r.prov.candidates, [
    { source: "ad", present: true, value: "Sales" },
    { source: "hris", present: true, value: "Engineering" },
    { source: "okta", present: true, value: "OktaDept" },
  ]);
});

test("candidates records absence too", () => {
  const persona = { id: "PX", category: "employee", profiles: { okta: { d: "V" }, hris: {}, ad: {} } };
  const r = evaluate(parse("user.d"), persona, { priority: ["ad", "hris"] });
  assert.deepEqual(r.prov.candidates.map((c) => [c.source, c.present]),
    [["ad", false], ["hris", false], ["okta", true]]);
});

test("prototype-chain names are absent from ordinary empty profiles", () => {
  const persona = { id: "PX", category: "employee", profiles: { okta: {}, hris: {}, ad: {} } };
  for (const name of ["toString", "constructor", "__proto__"]) {
    const result = evaluate(parse(`user.${name}`), persona, { priority: ["ad", "hris"] });
    assert.equal(result.value, null, name);
    assert.equal(result.prov.source, null, name);
    assert.ok(result.prov.candidates.every((candidate) => candidate.present === false), name);
  }
});

test("an explicitly owned prototype-named profile attribute resolves normally", () => {
  const persona = {
    id: "PX",
    category: "employee",
    profiles: { okta: {}, hris: { toString: "owned" }, ad: {} },
  };
  const result = evaluate(parse("user.toString"), persona, { priority: ["ad", "hris"] });
  assert.equal(result.value, "owned");
  assert.equal(result.prov.source, "hris");
});
