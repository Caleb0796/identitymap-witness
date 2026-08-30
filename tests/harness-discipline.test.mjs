import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../harness/relay.mjs", import.meta.url), "utf8");

test("scripted human actions mutate the page only through DOM events", () => {
  assert.equal((source.match(/store\.dispatch/g) ?? []).length, 0,
    "harness must contain zero store.dispatch occurrences");
  assert.equal((source.match(/__imw\.render\(\)/g) ?? []).length, 0,
    "harness must contain zero __imw.render() occurrences");
  assert.equal((source.match(/human-sim/g) ?? []).length, 0,
    "legacy human-sim trace entries must stay removed");

  const humanEntries = [...source.matchAll(/trace\.push\(\{[\s\S]*?\}\);/g)]
    .map((match) => match[0])
    .filter((entry) => entry.includes('kind: "human-dom"'));
  assert.ok(humanEntries.length > 0, "harness must record real human-dom actions");
  assert.ok(humanEntries.every((entry) => /\bselector\b/.test(entry)),
    "every human-dom trace entry must record its page selector");
  assert.match(source,
    /selector: "#confirm-pending",\s*detached: true, renderedVersion: 1/,
    "the detached stale-confirm click must remain represented in the human-dom trace");
});
