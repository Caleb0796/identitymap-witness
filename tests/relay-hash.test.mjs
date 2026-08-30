import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createStore } from "../src/store/reducer.mjs";

const INITIAL = { revision: 0, expressions: {}, priority: ["ad", "hris"], pins: [] };
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("snapshot hash material rejects allocator gaps hidden from getState", () => {
  const store = createStore(INITIAL);
  store.recordEvidence("probe", { fields: [], invariants: [], personas: [] }, {});
  const before = store.snapshot();
  const corrupt = { ...before, nextId: before.nextId + 1 };

  assert.deepEqual(corrupt.state, before.state);
  assert.notEqual(digest(corrupt), digest(before));
  assert.throws(
    () => store.restore(corrupt),
    (error) => error?.code === "EVALUATOR_FAILED",
  );
  assert.deepEqual(store.snapshot(), before);
});

test("snapshot hash material includes the pending version counter after discard", () => {
  const base = createStore(INITIAL);
  const advanced = createStore(INITIAL);
  advanced.dispatch({ type: "STAGE_RULES", rules: [{
    id: "pin-1", type: "forbidden_group", personaCategory: "x", group: "employees",
  }] });
  advanced.dispatch({ type: "DISCARD_RULES", version: 1 });

  assert.deepEqual(advanced.getState(), base.getState());
  assert.equal(advanced.snapshot().nextPendingVersion, 1);
  assert.notEqual(digest(advanced.snapshot()), digest(base.snapshot()));
});

test("restore rejects snapshots missing either hidden allocator", () => {
  const store = createStore(INITIAL);
  const before = store.snapshot();

  for (const incomplete of [
    { state: before.state, nextId: before.nextId },
    { state: before.state, nextPendingVersion: before.nextPendingVersion },
  ]) {
    assert.throws(
      () => store.restore(incomplete),
      (error) => error?.code === "EVALUATOR_FAILED",
    );
    assert.deepEqual(store.snapshot(), before);
  }
});

test("restore rejects incomplete or mistyped visible state sections", () => {
  const store = createStore(INITIAL);
  const before = store.snapshot();
  const malformedStates = [
    {},
    Object.fromEntries(Object.entries(before.state).filter(([key]) => key !== "packets")),
    { ...before.state, unexpected: true },
    { ...before.state, revision: "0" },
    { ...before.state, priority: {} },
    { ...before.state, priority: ["bogus"] },
    { ...before.state, expressions: [] },
    { ...before.state, expressions: new Date(0) },
    { ...before.state, pins: {} },
    { ...before.state, pins: [null] },
    { ...before.state, pending: undefined },
    { ...before.state, evidence: [] },
    { ...before.state, evidence: new Map() },
    { ...before.state, packets: [] },
  ];

  for (const state of malformedStates) {
    assert.throws(
      () => store.restore({ ...before, state }),
      (error) => error?.code === "EVALUATOR_FAILED",
    );
    assert.deepEqual(store.snapshot(), before);
  }
});

test("restore rejects corrupt derived records and allocator collisions", () => {
  const store = createStore(INITIAL);
  const before = store.snapshot();
  const validEvidence = {
    id: "E-1",
    kind: "counterexample",
    revision: 0,
    stale: false,
    fingerprint: { fields: [], invariants: [], personas: [] },
    payload: {},
  };
  const malformed = [
    { ...before, state: { ...before.state, evidence: { "E-1": validEvidence } } },
    { ...before, nextId: 1, state: { ...before.state, evidence: { "E-1": {} } } },
    { ...before, nextId: 1, state: { ...before.state, packets: { "PKT-1": {} } } },
    { ...before, nextId: 100 },
  ];

  for (const snapshot of malformed) {
    assert.throws(
      () => store.restore(snapshot),
      (error) => error?.code === "EVALUATOR_FAILED",
    );
    assert.deepEqual(store.snapshot(), before);
  }
  assert.equal(store.recordEvidence("counterexample", { fields: [], invariants: [], personas: [] }, {}), "E-1");
});

test("restore rejects a pending version that disagrees with its hidden counter", () => {
  const store = createStore(INITIAL);
  store.dispatch({ type: "STAGE_RULES", rules: [{
    id: "pin-1", type: "forbidden_group", personaCategory: "x", group: "employees",
  }] });
  const before = store.snapshot();
  const inconsistent = structuredClone(before);
  inconsistent.nextPendingVersion = 0;

  assert.throws(
    () => store.restore(inconsistent),
    (error) => error?.code === "EVALUATOR_FAILED",
  );
  assert.deepEqual(store.snapshot(), before);
});

test("restore rejects malformed pending rules and mismatched display digests", () => {
  const store = createStore(INITIAL);
  store.dispatch({ type: "STAGE_RULES", rules: [{
    id: "pin-1", type: "forbidden_group", personaCategory: "x", group: "employees",
  }] });
  const before = store.snapshot();
  const malformed = [];

  const nullRule = structuredClone(before);
  nullRule.state.pending.rules = [null];
  malformed.push(nullRule);
  const emptyRules = structuredClone(before);
  emptyRules.state.pending.rules = [];
  malformed.push(emptyRules);
  const wrongDigest = structuredClone(before);
  wrongDigest.state.pending.digest = before.state.pending.digest === "00000000" ? "ffffffff" : "00000000";
  malformed.push(wrongDigest);
  const nonCanonical = structuredClone(before);
  nonCanonical.state.pending.rules = nonCanonical.state.pending.rules
    .map((rule) => Object.fromEntries(Object.entries(rule).reverse()));
  malformed.push(nonCanonical);

  for (const snapshot of malformed) {
    assert.throws(
      () => store.restore(snapshot),
      (error) => error?.code === "EVALUATOR_FAILED",
    );
    assert.deepEqual(store.snapshot(), before);
  }
});

test("relay hashes the complete store snapshot", async () => {
  const source = await readFile(new URL("../harness/relay.mjs", import.meta.url), "utf8");

  assert.match(source, /const snapshot = window\.__imw\.store\.snapshot\(\)/);
  assert.match(source, /stateHash: await hash\(snapshot\)/);
  assert.match(source, /authoritativeHash: await hash\(authoritative\)/);
  for (const field of [
    "stateHashBefore", "stateHashAfter",
    "authoritativeHashBefore", "authoritativeHashAfter",
    "snapshotBefore", "snapshotAfter",
  ]) assert.match(source, new RegExp(`\\b${field}\\b`), field);
  assert.doesNotMatch(source, /JSON\.stringify\(window\.__imw\.store\.getState\(\)\)/);
});
