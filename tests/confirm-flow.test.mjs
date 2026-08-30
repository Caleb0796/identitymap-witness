import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createStore } from "../src/store/reducer.mjs";
import { GOLDEN_STATE, runTool } from "../src/tools/defs.mjs";

const load = async (file) => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url)));
const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];

function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object")
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

function fnv1a(text) {
  let hash = 0x811c9dc5;
  for (const byte of Buffer.from(text)) {
    hash ^= byte;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, "0");
}

test("stage proposes canonical rules without changing pins or revision", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  const initialRead = runTool(store, personas, "read_mapping_session", {});
  assert.deepEqual(initialRead.payload.pendingRuleIds, []);
  assert.equal(initialRead.payload.pendingVersion, null);
  const result = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: PINS,
  });
  const expectedRules = canonical(PINS);
  const expectedDigest = fnv1a(JSON.stringify(expectedRules));

  assert.deepEqual(result, { ok: true, payload: {
    revision: 17,
    status: "pending_confirmation",
    pendingVersion: 1,
    pendingRuleIds: ["inv-forbid", "inv-null", "inv-sot"],
    digest: expectedDigest,
    nextStep: "the human must review and confirm the pending rules on the page; then call read_mapping_session",
  } });
  assert.equal(store.getState().revision, 17);
  assert.deepEqual(store.getState().pins, []);
  assert.deepEqual(store.getState().pending, {
    version: 1,
    digest: expectedDigest,
    rules: expectedRules,
  });

  const read = runTool(store, personas, "read_mapping_session", {});
  assert.equal(read.payload.pendingVersion, 1);
  assert.deepEqual(read.payload.pendingRuleIds, ["inv-forbid", "inv-null", "inv-sot"]);

  const find = runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 17 });
  assert.equal(find.error.code, "NO_INVARIANTS");
  assert.match(find.error.reason, /pending rules await confirmation/i);
  const prepare = runTool(store, personas, "prepare_mapping_review", {
    expectedRevision: 17,
    evidenceIds: [],
  });
  assert.equal(prepare.error.code, "NO_INVARIANTS");
  assert.match(prepare.error.reason, /pending rules await confirmation/i);
  assert.equal(store.snapshot().nextId, 0);
  store.dispatch({ type: "CONFIRM_RULES", version: result.payload.pendingVersion });
  const confirmedFind = runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 18 });
  assert.equal(confirmedFind.payload.evidenceIds[0], "E-1");
});

test("canonical key order makes an identical re-stage idempotent", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  const reordered = PINS.map((rule) => Object.fromEntries(Object.entries(rule).reverse()));
  const first = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: PINS,
  });
  const second = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: reordered,
  });

  assert.equal(first.ok, true);
  assert.equal(second.ok, true);
  assert.equal(second.payload.pendingVersion, first.payload.pendingVersion);
  assert.equal(second.payload.digest, first.payload.digest);
  assert.equal(store.snapshot().nextPendingVersion, 1);
});

test("different rules cannot replace a proposal awaiting human review", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  const first = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: PINS,
  });
  const before = store.snapshot();
  const second = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: [{ ...PINS[0], group: "contractors" }],
  });

  assert.equal(first.ok, true);
  assert.deepEqual(second, { ok: false, error: {
    code: "PENDING_EXISTS",
    reason: "different rules are already awaiting human review — the human must confirm or discard them first",
  } });
  assert.deepEqual(store.snapshot(), before);
});

test("revision and validation precedence stay fail-closed while rules are pending", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: PINS,
  });
  const before = store.snapshot();

  const staleMalformed = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 99,
    invariants: [{ type: "unknown" }],
  });
  assert.equal(staleMalformed.error.code, "REVISION_MISMATCH");
  assert.deepEqual(store.snapshot(), before);

  const currentMalformed = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: [{ type: "unknown" }],
  });
  assert.equal(currentMalformed.error.code, "BAD_RULE");
  assert.deepEqual(store.snapshot(), before);

  const currentDifferent = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: [{ ...PINS[0], group: "contractors" }],
  });
  assert.equal(currentDifferent.error.code, "PENDING_EXISTS");
  assert.deepEqual(store.snapshot(), before);
});

test("canonical equality, not a colliding display digest, binds confirmation", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  const firstRule = [{
    id: "collision", type: "forbidden_group", personaCategory: "x", group: "g-o27ilb-12jioj6",
  }];
  const collidingRule = [{
    id: "collision", type: "forbidden_group", personaCategory: "x", group: "g-18zofvh-1mpfbx4",
  }];
  assert.equal(fnv1a(JSON.stringify(canonical(firstRule))), "f4ed8df7");
  assert.equal(fnv1a(JSON.stringify(canonical(collidingRule))), "f4ed8df7");

  const first = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: firstRule,
  });
  const before = store.snapshot();
  const second = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: 17,
    invariants: collidingRule,
  });

  assert.equal(first.payload.digest, "f4ed8df7");
  assert.equal(second.error.code, "PENDING_EXISTS");
  assert.deepEqual(store.snapshot(), before);
});

test("only the rendered pending version can confirm or discard", () => {
  const store = createStore(GOLDEN_STATE);
  store.dispatch({ type: "STAGE_RULES", rules: PINS });
  const before = store.snapshot();

  assert.throws(
    () => store.dispatch({ type: "CONFIRM_RULES", version: 99 }),
    (error) => error?.code === "STALE_CONFIRM",
  );
  assert.deepEqual(store.snapshot(), before);
  assert.throws(
    () => store.dispatch({ type: "DISCARD_RULES", version: 99 }),
    (error) => error?.code === "STALE_CONFIRM",
  );
  assert.deepEqual(store.snapshot(), before);

  store.dispatch({ type: "DISCARD_RULES", version: 1 });
  assert.equal(store.getState().pending, null);
  assert.equal(store.getState().revision, 17);
  assert.throws(
    () => store.dispatch({ type: "CONFIRM_RULES", version: 1 }),
    (error) => error?.code === "STALE_CONFIRM",
  );
  store.dispatch({ type: "STAGE_RULES", rules: PINS });
  assert.equal(store.getState().pending.version, 2);
  assert.equal(store.getState().revision, 17);
});

test("confirmation applies pins, bumps once, and a double confirm is stale", () => {
  const store = createStore(GOLDEN_STATE);
  store.dispatch({ type: "STAGE_RULES", rules: PINS });
  store.dispatch({ type: "CONFIRM_RULES", version: 1 });

  assert.equal(store.getState().revision, 18);
  assert.deepEqual(store.getState().pins, canonical(PINS));
  assert.equal(store.getState().pending, null);
  assert.throws(
    () => store.dispatch({ type: "CONFIRM_RULES", version: 1 }),
    (error) => error?.code === "STALE_CONFIRM",
  );
  assert.equal(store.getState().revision, 18);
});

test("confirmed same-id rule content changes stale dependent evidence", () => {
  const store = createStore(GOLDEN_STATE);
  store.dispatch({ type: "STAGE_RULES", rules: PINS });
  store.dispatch({ type: "CONFIRM_RULES", version: 1 });
  const evidenceId = store.recordEvidence("clean-sweep", {
    fields: Object.keys(GOLDEN_STATE.expressions),
    invariants: PINS.map((rule) => rule.id),
    personas: ["P1"],
  }, { violations: [] });

  const changed = PINS.map((rule) => rule.id === "inv-sot" ? { ...rule, source: "ad" } : rule);
  store.dispatch({ type: "STAGE_RULES", rules: changed });
  assert.equal(store.getState().evidence[evidenceId].stale, false);
  assert.equal(store.getState().revision, 18);
  store.dispatch({ type: "CONFIRM_RULES", version: 2 });

  assert.equal(store.getState().revision, 19);
  assert.equal(store.getState().evidence[evidenceId].stale, true);
});

test("find and prepare use confirmed rules while a different proposal is pending", async () => {
  const personas = await load("personas.json");
  const store = createStore(GOLDEN_STATE);
  store.dispatch({ type: "STAGE_RULES", rules: [PINS[0]] });
  store.dispatch({ type: "CONFIRM_RULES", version: 1 });
  store.dispatch({ type: "STAGE_RULES", rules: [{
    id: "pending-only", type: "source_of_truth", field: "department", source: "ad",
  }] });

  const found = runTool(store, personas, "find_mapping_counterexample", { expectedRevision: 18 });
  assert.equal(found.ok, true);
  assert.deepEqual(found.payload.checkedInvariantIds, ["inv-forbid"]);
  assert.deepEqual(found.payload.personaIds, ["P2"]);
  const prepared = runTool(store, personas, "prepare_mapping_review", {
    expectedRevision: 18,
    evidenceIds: found.payload.evidenceIds,
  });
  assert.deepEqual(Object.keys(prepared.payload.coverage), ["inv-forbid"]);
  assert.equal(Object.hasOwn(prepared.payload.coverage, "pending-only"), false);
  assert.deepEqual(store.getState().pins.map((rule) => rule.id), ["inv-forbid"]);
  assert.deepEqual(store.getState().pending.rules.map((rule) => rule.id), ["pending-only"]);
});

test("legacy direct pin action is removed", () => {
  const store = createStore(GOLDEN_STATE);
  assert.throws(
    () => store.dispatch({ type: "PIN_INVARIANTS", invariants: PINS }),
    (error) => error?.code === "EVALUATOR_FAILED",
  );
  assert.deepEqual(store.getState().pins, []);
  assert.equal(store.getState().revision, 17);
});
