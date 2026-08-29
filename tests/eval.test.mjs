import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../src/engine/parser.mjs";
import { evaluate } from "../src/engine/eval.mjs";

const opts = { priority: ["ad", "hris"] };
const P = (profiles) => ({ id: "PX", category: "employee", profiles });

test("priority: earliest present source wins; okta is the implicit tail", () => {
  const r = evaluate(parse("user.department"), P({ okta: { department: "Legal" }, hris: { department: "Finance" }, ad: {} }), opts);
  assert.equal(r.value, "Finance");
  assert.equal(r.prov.source, "hris");
});

test("DC4: present-but-empty wins over a later non-empty source", () => {
  const r = evaluate(parse("user.department"), P({ okta: {}, hris: { department: "Finance" }, ad: { department: "" } }), opts);
  assert.equal(r.value, "");
  assert.equal(r.prov.source, "ad");
});

test("missing everywhere resolves to null with null source", () => {
  const r = evaluate(parse("user.managerId"), P({ okta: {}, hris: {}, ad: {} }), opts);
  assert.equal(r.value, null);
  assert.equal(r.prov.source, null);
});

test("null poisons concat; empty string does not", () => {
  assert.equal(evaluate(parse('user.managerId + "!"'), P({ okta: {}, hris: {}, ad: {} }), opts).value, null);
  assert.equal(evaluate(parse('user.a + "!"'), P({ okta: { a: "" }, hris: {}, ad: {} }), opts).value, "!");
});

test('equality: "" is not null; null equals null; exact-case strings', () => {
  const persona = P({ okta: { t: "" }, hris: {}, ad: {} });
  const r = evaluate(parse('user.t == null ? "N" : "S"'), persona, opts);
  assert.equal(r.value, "S");
  assert.equal(r.prov.branch, "else");
  const n = evaluate(parse('user.missing == null ? "N" : "S"'), persona, opts);
  assert.equal(n.value, "N");
  assert.equal(n.prov.branch, "then");
  const c = evaluate(parse('user.c == "contractor" ? "y" : "n"'), P({ okta: { c: "Contractor" }, hris: {}, ad: {} }), opts);
  assert.equal(c.value, "n"); // exact-case miss — DC1's mechanism
});

test("calls: case transforms; null passes through; source follows the argument", () => {
  const u = evaluate(parse("String.toLowerCase(user.t)"), P({ okta: {}, hris: { t: "ABC" }, ad: {} }), opts);
  assert.equal(u.value, "abc");
  assert.equal(u.prov.source, "hris");
  const n = evaluate(parse("String.toUpperCase(user.gone)"), P({ okta: {}, hris: {}, ad: {} }), opts);
  assert.equal(n.value, null);
});

test("ternary provenance follows the returned branch", () => {
  const r = evaluate(parse('user.m == null ? "" : user.m'), P({ okta: {}, hris: { m: "M9" }, ad: {} }), opts);
  assert.equal(r.value, "M9");
  assert.equal(r.prov.source, "hris");
  assert.equal(r.prov.branch, "else");
});

test("concat provenance: source expr, inputs union", () => {
  const r = evaluate(parse('user.a + " " + user.b'), P({ okta: { a: "X", b: "Y" }, hris: {}, ad: {} }), opts);
  assert.equal(r.prov.source, "expr");
  assert.deepEqual(r.prov.inputs.map((i) => i.ref).sort(), ["user.a", "user.b"]);
});
