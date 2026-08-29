import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createStore } from "../src/store/reducer.mjs";
import { findWitness } from "../src/engine/witness.mjs";
import { GOLDEN_STATE } from "../src/tools/defs.mjs";

const load = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url)));
const ALL8 = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "P8"];
const PIN_IDS = ["inv-forbid", "inv-null", "inv-sot"];
const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];

test("fingerprint invalidation table", () => {
  const s = createStore(GOLDEN_STATE);
  const find = s.recordEvidence("counterexample",
    { fields: Object.keys(GOLDEN_STATE.expressions), invariants: PIN_IDS, personas: ALL8 }, {});
  const prev = s.recordEvidence("patch-preview",
    { fields: ["group"], invariants: PIN_IDS, personas: ["P2"] }, {});
  const r0 = s.getState().revision;

  s.dispatch({ type: "EDIT_EXPRESSION", field: "managerId", expr: "user.managerId" });
  assert.equal(s.getState().revision, r0 + 1);
  assert.equal(s.getState().evidence[find].stale, true);   // find spans all fields
  assert.equal(s.getState().evidence[prev].stale, false);  // preview fingerprint untouched

  s.dispatch({ type: "SET_PRIORITY", priority: ["hris", "ad"] });
  assert.equal(s.getState().evidence[prev].stale, true);   // priority stales everything
});

test("pin membership change stales evidence whose invariant set changed", () => {
  const s = createStore(GOLDEN_STATE);
  s.dispatch({ type: "PIN_INVARIANTS", invariants: PINS });
  const e = s.recordEvidence("counterexample",
    { fields: ["group"], invariants: PIN_IDS, personas: ALL8 }, {});
  s.dispatch({ type: "PIN_INVARIANTS", invariants: PINS.slice(0, 2) }); // inv-sot dropped
  assert.equal(s.getState().evidence[e].stale, true);
});

test("recordEvidence / recordPacket never bump revision", () => {
  const s = createStore(GOLDEN_STATE);
  const r0 = s.getState().revision;
  const e = s.recordEvidence("counterexample", { fields: [], invariants: [], personas: [] }, {});
  s.recordPacket([e], PIN_IDS, []);
  assert.equal(s.getState().revision, r0);
});

test("every mutating action bumps exactly once", () => {
  const s = createStore(GOLDEN_STATE);
  const r0 = s.getState().revision;
  s.dispatch({ type: "EDIT_EXPRESSION", field: "email", expr: "user.email" });
  s.dispatch({ type: "SET_PRIORITY", priority: ["hris", "ad"] });
  s.dispatch({ type: "PIN_INVARIANTS", invariants: PINS });
  s.dispatch({ type: "UNPIN", id: "inv-sot" });
  assert.equal(s.getState().revision, r0 + 4);
  assert.equal(s.getState().pins.length, 2);
});

test("clean-to-violating edit is caught: stale old evidence, fresh find sees it", async () => {
  const personas = await load("personas.json");
  const snapshot = await load("persisted-snapshot.json");
  const s = createStore({ ...snapshot, pins: PINS });
  const clean = findWitness(s.getState(), personas);
  assert.deepEqual(clean.personaIds, []);
  const e = s.recordEvidence("counterexample",
    { fields: Object.keys(snapshot.expressions), invariants: PIN_IDS, personas: ALL8 }, { clean: true });

  // the human "improves" managerId into the null-coalescing trap
  s.dispatch({ type: "EDIT_EXPRESSION", field: "managerId", expr: 'user.managerId == null ? "" : user.managerId' });
  assert.equal(s.getState().evidence[e].stale, true);
  const dirty = findWitness(s.getState(), personas);
  assert.deepEqual(dirty.personaIds, ["P3"]);
  assert.equal(dirty.violations[0].invariantId, "inv-null");
});

test("SAFETY: same-ID pin CONTENT replacement stales dependent evidence (run2 finding)", () => {
  const s = createStore(GOLDEN_STATE);
  s.dispatch({ type: "PIN_INVARIANTS", invariants: PINS });
  const e = s.recordEvidence("clean-sweep",
    { fields: Object.keys(GOLDEN_STATE.expressions), invariants: PIN_IDS, personas: ALL8 }, { violations: [] });
  const swapped = PINS.map((p) => p.id === "inv-sot" ? { ...p, source: "ad" } : p); // same ids, different rule
  s.dispatch({ type: "PIN_INVARIANTS", invariants: swapped });
  assert.equal(s.getState().evidence[e].stale, true,
    "rule content changed under an unchanged id — old evidence must die");
});
