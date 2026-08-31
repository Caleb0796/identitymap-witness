import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const source = await readFile(new URL("../harness/relay.mjs", import.meta.url), "utf8");

test("scripted human actions mutate the page only through DOM events", () => {
  assert.equal((source.match(/store\.dispatch/g) ?? []).length, 0,
    "harness must contain zero store.dispatch occurrences");
  assert.equal((source.match(/__imw\.render\(\)/g) ?? []).length, 0,
    "harness must contain zero __imw.render() occurrences");
  assert.equal((source.match(/__imw\.store/g) ?? []).length, 0,
    "harness must never receive the mutable store");
  assert.equal((source.match(/__imw\.runTool/g) ?? []).length, 0,
    "harness must invoke tools only through WebMCP");
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

test("matrix keyboard coverage uses trusted CDP keys rather than DOM click", () => {
  const start = source.indexOf("const firstMatrixButton");
  const end = source.indexOf("const E1", start);
  const keyboardCoverage = source.slice(start, end);
  assert.ok(start >= 0 && end > start, "matrix keyboard coverage block must exist");
  assert.match(keyboardCoverage, /pressKey\(s, "Enter", "Enter", 13\)/);
  assert.match(keyboardCoverage, /pressKey\(s, " ", "Space", 32\)/);
  assert.doesNotMatch(keyboardCoverage, /\.click\s*\(/,
    "matrix Enter/Space assertions must not be replaced with DOM click");
});

test("failure coverage installs request interception before navigation", () => {
  const start = source.indexOf("async function initializationFailureSession");
  const end = source.indexOf("async function initializationFailureCoverage", start);
  const failureCoverage = source.slice(start, end);
  const fetchEnable = failureCoverage.indexOf('cdp.send("Fetch.enable"');
  const navigate = failureCoverage.indexOf('cdp.send("Page.navigate"');
  assert.match(failureCoverage, /launchChrome\(\{ cdpPort, url: "about:blank" \}\)/);
  assert.ok(fetchEnable >= 0 && navigate >= 0 && fetchEnable < navigate,
    "Fetch interception must be active before navigation");
});

test("trace writes: configured evidence is exclusive; default gate artifact is atomically replaced", () => {
  assert.match(source, /IMW_E2E_TRACE_PATH must be absolute/);
  const start = source.indexOf("const configuredTrace");
  const end = source.indexOf("ok(`e2e:", start);
  assert.ok(start >= 0 && end > start, "trace-write block must exist");
  const block = source.slice(start, end);
  assert.match(block, /if \(configuredTrace\) \{[\s\S]*?\{ flag: "wx" \}/,
    "operator-captured evidence path must be exclusive-create (never overwrite)");
  assert.match(block, /tmp-trace-\$\{process\.pid\}/,
    "default trace must be written to a gitignored tmp file first");
  assert.match(block, /writeFile\(tmp, body, \{ flag: "wx" \}\);\s*await rename\(tmp,/,
    "default trace must land via atomic rename so every rerun is fresh (eval mtime binding)");
});
