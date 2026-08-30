import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import * as reducer from "../src/store/reducer.mjs";
import { runTool } from "../src/tools/defs.mjs";

const { createStore } = reducer;
const load = async (file) => JSON.parse(await readFile(new URL(`../data/${file}`, import.meta.url)));
const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];

async function greenPacket() {
  const personas = await load("personas.json");
  const corrected = await load("persisted-snapshot.json");
  const store = createStore(corrected);
  const staged = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: corrected.revision,
    invariants: PINS,
  });
  store.dispatch({ type: "CONFIRM_RULES", version: staged.payload.pendingVersion });
  const found = runTool(store, personas, "find_mapping_counterexample", {
    expectedRevision: store.getState().revision,
  });
  const prepared = runTool(store, personas, "prepare_mapping_review", {
    expectedRevision: found.payload.revision,
    evidenceIds: found.payload.evidenceIds,
  });
  assert.equal(found.payload.cleanSweep, true);
  assert.deepEqual(prepared.payload.blockers, []);
  assert.deepEqual(prepared.payload.evidenceIds, found.payload.evidenceIds);
  return { personas, store, packet: prepared.payload };
}

test("packetFresh is shared and rejects revision mismatch, missing, or stale evidence", () => {
  assert.equal(typeof reducer.packetFresh, "function");
  const store = createStore({
    revision: 1,
    priority: [],
    expressions: {},
    pins: [],
  });
  const evidenceId = store.recordEvidence("clean-sweep", {
    fields: [], invariants: [], personas: [],
  }, { violations: [] });
  const packet = { revision: 1, evidenceIds: [evidenceId] };

  assert.equal(reducer.packetFresh(packet, store.getState()), true);
  assert.equal(reducer.packetFresh({ revision: 0, evidenceIds: [evidenceId] }, store.getState()), false);
  assert.equal(reducer.packetFresh({ revision: 1, evidenceIds: ["missing"] }, store.getState()), false);
  assert.equal(reducer.packetFresh({ revision: 1, evidenceIds: ["__proto__"] }, store.getState()), false);

  store.getState().evidence[evidenceId].stale = true;
  assert.equal(reducer.packetFresh(packet, store.getState()), false);
});

test("every relevant edit kills a previously GREEN packet", async (t) => {
  const cases = [
    ["expression", (store) => store.dispatch({
      type: "EDIT_EXPRESSION",
      field: "managerId",
      expr: 'user.managerId == null ? "" : user.managerId',
    })],
    ["priority", (store) => store.dispatch({
      type: "SET_PRIORITY",
      priority: ["ad", "hris"],
    })],
    ["same-ID pin content", (store) => {
      store.dispatch({
        type: "STAGE_RULES",
        rules: store.getState().pins.map((pin) =>
          pin.id === "inv-sot" ? { ...pin, source: "ad" } : pin),
      });
      store.dispatch({ type: "CONFIRM_RULES", version: store.getState().pending.version });
    }],
    ["unpin", (store) => store.dispatch({ type: "UNPIN", id: "inv-null" })],
  ];

  for (const [label, edit] of cases) {
    await t.test(label, async () => {
      const { store, packet } = await greenPacket();
      assert.equal(reducer.packetFresh(packet, store.getState()), true);
      edit(store);
      assert.equal(reducer.packetFresh(packet, store.getState()), false);
      assert.ok(packet.evidenceIds.some((id) => store.getState().evidence[id].stale));
    });
  }
});

test("staging and discarding preserve GREEN; only confirmation invalidates it", async () => {
  const { store, packet } = await greenPacket();
  const proposed = store.getState().pins.map((pin) =>
    pin.id === "inv-sot" ? { ...pin, source: "ad" } : pin);

  store.dispatch({ type: "STAGE_RULES", rules: proposed });
  assert.equal(reducer.packetFresh(packet, store.getState()), true);
  assert.equal(store.getState().revision, packet.revision);
  store.dispatch({ type: "DISCARD_RULES", version: store.getState().pending.version });
  assert.equal(reducer.packetFresh(packet, store.getState()), true);
  assert.equal(store.getState().revision, packet.revision);

  store.dispatch({ type: "STAGE_RULES", rules: proposed });
  store.dispatch({ type: "CONFIRM_RULES", version: store.getState().pending.version });
  assert.equal(reducer.packetFresh(packet, store.getState()), false);
  assert.ok(packet.evidenceIds.some((id) => store.getState().evidence[id].stale));
});

test("a real repair followed by fresh find and prepare recovers GREEN freshness", async () => {
  const { personas, store, packet } = await greenPacket();
  store.dispatch({
    type: "EDIT_EXPRESSION",
    field: "managerId",
    expr: 'user.managerId == null ? "" : user.managerId',
  });
  assert.equal(reducer.packetFresh(packet, store.getState()), false);

  store.dispatch({ type: "EDIT_EXPRESSION", field: "managerId", expr: "user.managerId" });
  const found = runTool(store, personas, "find_mapping_counterexample", {
    expectedRevision: store.getState().revision,
  });
  const recovered = runTool(store, personas, "prepare_mapping_review", {
    expectedRevision: store.getState().revision,
    evidenceIds: found.payload.evidenceIds,
  });

  assert.equal(found.payload.cleanSweep, true);
  assert.deepEqual(recovered.payload.blockers, []);
  assert.deepEqual(recovered.payload.evidenceIds, found.payload.evidenceIds);
  assert.equal(reducer.packetFresh(recovered.payload, store.getState()), true);
});

test("stored pinsCovered contains only true scoped coverage, including __proto__", async () => {
  const personas = await load("personas.json");
  const corrected = await load("persisted-snapshot.json");
  const store = createStore(corrected);
  const staged = runTool(store, personas, "stage_mapping_invariants", {
    expectedRevision: corrected.revision,
    invariants: [
      { id: "__proto__", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
      { id: "uncovered", type: "source_of_truth", field: "department", source: "hris" },
    ],
  });
  store.dispatch({ type: "CONFIRM_RULES", version: staged.payload.pendingVersion });
  const found = runTool(store, personas, "find_mapping_counterexample", {
    expectedRevision: store.getState().revision,
    invariantIds: ["__proto__"],
  });
  const prepared = runTool(store, personas, "prepare_mapping_review", {
    expectedRevision: found.payload.revision,
    evidenceIds: found.payload.evidenceIds,
  });

  assert.equal(found.payload.cleanSweep, true);
  assert.equal(found.payload.fullSweep, false);
  assert.equal(Object.hasOwn(prepared.payload.coverage, "__proto__"), true);
  assert.equal(prepared.payload.coverage.__proto__, true);
  assert.equal(prepared.payload.coverage.uncovered, false);
  assert.deepEqual(prepared.payload.blockers, [{ pin: "uncovered", reason: "uncovered" }]);
  assert.deepEqual(store.getState().packets[prepared.payload.packetId].pinsCovered, ["__proto__"]);
  assert.equal(reducer.packetFresh(prepared.payload, store.getState()), true);
});
