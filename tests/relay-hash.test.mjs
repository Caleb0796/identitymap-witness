import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { createStore } from "../src/store/reducer.mjs";

const INITIAL = { revision: 0, expressions: {}, priority: [], pins: [] };
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");

test("snapshot hash material includes allocator state hidden from getState", () => {
  const base = createStore(INITIAL);
  const advanced = createStore(INITIAL);
  const visible = advanced.snapshot().state;
  advanced.recordEvidence("probe", {}, {});
  advanced.restore({ state: visible, nextId: advanced.snapshot().nextId });

  assert.deepEqual(advanced.getState(), base.getState());
  assert.equal(digest(advanced.getState()), digest(base.getState()));
  assert.notEqual(advanced.snapshot().nextId, base.snapshot().nextId);
  assert.notEqual(JSON.stringify(advanced.snapshot()), JSON.stringify(base.snapshot()));
  assert.notEqual(digest(advanced.snapshot()), digest(base.snapshot()));
});

test("relay hashes the complete store snapshot", async () => {
  const source = await readFile(new URL("../harness/relay.mjs", import.meta.url), "utf8");

  assert.match(source, /JSON\.stringify\(window\.__imw\.store\.snapshot\(\)\)/);
  assert.doesNotMatch(source, /JSON\.stringify\(window\.__imw\.store\.getState\(\)\)/);
});
