import { test } from "node:test";
import assert from "node:assert/strict";
import { parse } from "../src/engine/parser.mjs";

test("golden displayName: concat of idents and literal", () => {
  assert.deepEqual(parse('user.firstName + " " + user.lastName'), {
    k: "concat", parts: [
      { k: "ident", name: "firstName" },
      { k: "str", v: " " },
      { k: "ident", name: "lastName" },
    ],
  });
});

test("golden group: ternary over exact-case equality", () => {
  assert.deepEqual(parse('user.userType == "contractor" ? "contractors" : "employees"'), {
    k: "ternary",
    cond: { k: "eq", l: { k: "ident", name: "userType" }, r: { k: "str", v: "contractor" } },
    then: { k: "str", v: "contractors" },
    else: { k: "str", v: "employees" },
  });
});

test("golden managerId: null comparison and coalesce shape", () => {
  assert.deepEqual(parse('user.managerId == null ? "" : user.managerId'), {
    k: "ternary",
    cond: { k: "eq", l: { k: "ident", name: "managerId" }, r: { k: "null" } },
    then: { k: "str", v: "" },
    else: { k: "ident", name: "managerId" },
  });
});

test("golden department/email: bare idents", () => {
  assert.deepEqual(parse("user.department"), { k: "ident", name: "department" });
  assert.deepEqual(parse("user.email"), { k: "ident", name: "email" });
});

test("snapshot group: lowercase call inside equality", () => {
  const a = parse('String.toLowerCase(user.userType) == "contractor" ? "contractors" : "employees"');
  assert.equal(a.k, "ternary");
  assert.deepEqual(a.cond.l, { k: "call", fn: "lower", arg: { k: "ident", name: "userType" } });
});

test("upper call parses too", () => {
  assert.deepEqual(parse("String.toUpperCase(user.dept)"),
    { k: "call", fn: "upper", arg: { k: "ident", name: "dept" } });
});

test("out-of-grammar rejected with INVALID_AST and a numeric position", () => {
  for (const bad of ["appuser.x", "user[0]", 'fetch("x")', "a && b", "user.", "1 + 2", "x ? y", "user.a ==", "'single'"]) {
    assert.throws(() => parse(bad), (e) => e.code === "INVALID_AST" && Number.isInteger(e.position), bad);
  }
});

test("neq parses", () => {
  assert.deepEqual(parse('user.a != ""'),
    { k: "neq", l: { k: "ident", name: "a" }, r: { k: "str", v: "" } });
});
