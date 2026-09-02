import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { createStore } from "../src/store/reducer.mjs";
import {
  GOLDEN_STATE,
  createToolExecutor,
  registerToolDefinitions,
} from "../src/tools/defs.mjs";

const ROOT = new URL("..", import.meta.url).pathname;

async function jsFiles(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(join(ROOT, dir)); } catch { return out; }
  for (const e of entries) {
    const p = join(ROOT, dir, e);
    if ((await stat(p)).isDirectory()) out.push(...await jsFiles(join(dir, e)));
    else if (/\.(mjs|js)$/.test(e)) out.push(join(dir, e));
  }
  return out;
}

// Blank string literals and comments so prose/regex mentions don't count as call sites.
function blank(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length))
    .replace(/(["'`])(?:\\.|(?!\1)[^\\\n])*\1/g, (m) => m[0] + " ".repeat(m.length - 2) + m[0]);
}

test("registerTool call sites live only in the top-level entry module (app.js)", async () => {
  const files = ["app.js", ...await jsFiles("src"), ...await jsFiles("harness")];
  const sites = [];
  for (const f of files) {
    const src = blank(await readFile(join(ROOT, f), "utf8"));
    if (/registerTool\s*\(/.test(src)) sites.push(f);
  }
  assert.deepEqual(sites, ["app.js"], "registration must be reachable only from the top-level document entry");
});

test("banned identifier navigator.modelContext appears nowhere in code", async () => {
  const files = ["app.js", ...await jsFiles("src"), ...await jsFiles("harness")];
  for (const f of files) {
    const src = await readFile(join(ROOT, f), "utf8");
    assert.ok(!src.includes("navigator." + "modelContext"), `${f} uses the dead API surface`);
  }
});

test("app.js has no HTML-string parsing sinks", async () => {
  const source = await readFile(join(ROOT, "app.js"), "utf8");
  assert.doesNotMatch(source, /\.(?:innerHTML|outerHTML)\s*=/);
  assert.doesNotMatch(source, /insertAdjacentHTML\s*\(/);
});

test("app registration uses method feature detection and a non-BFCache page lifetime signal", async () => {
  const source = await readFile(join(ROOT, "app.js"), "utf8");
  assert.match(source, /typeof document\.modelContext\?\.registerTool === "function"/);
  assert.match(source, /const lifecycle = new AbortController\(\)/);
  assert.match(source, /if \(!event\.persisted\) lifecycle\.abort\(\)/);
  assert.match(source, /document\.modelContext\.registerTool\(definition, options\)/);
});

test("registration exposes loading, partial-failure, and success states", async (t) => {
  await t.test("loading", async () => {
    let resolveRegistration;
    let settled = false;
    const counts = [];
    const registration = registerToolDefinitions(
      [{ name: "first" }],
      () => new Promise((resolve) => { resolveRegistration = resolve; }),
      (tool) => tool,
      new AbortController().signal,
      (count) => counts.push(count),
    );
    registration.then(() => { settled = true; });
    assert.deepEqual(counts, []);
    assert.equal(settled, false);
    resolveRegistration();
    assert.deepEqual(await registration, { registeredCount: 1, failed: false });
    assert.deepEqual(counts, [1]);
  });

  await t.test("partial failure", async () => {
    const signal = new AbortController().signal;
    const attempted = [];
    const counts = [];
    const result = await registerToolDefinitions(
      [{ name: "first" }, { name: "second" }, { name: "third" }],
      (definition, options) => {
        attempted.push([definition.name, options.signal]);
        if (definition.name === "second") return Promise.reject(new Error("mock rejection"));
        return definition.name === "first" ? undefined : Promise.resolve();
      },
      (tool) => tool,
      signal,
      (count) => counts.push(count),
    );
    assert.deepEqual(attempted, [["first", signal], ["second", signal], ["third", signal]]);
    assert.deepEqual(counts, [1, 2]);
    assert.deepEqual(result, { registeredCount: 2, failed: true });
  });

  await t.test("success", async () => {
    const counts = [];
    const result = await registerToolDefinitions(
      [{ name: "first" }, { name: "second" }, { name: "third" }],
      () => Promise.resolve(),
      (tool) => tool,
      new AbortController().signal,
      (count) => counts.push(count),
    );
    assert.deepEqual(counts, [1, 2, 3]);
    assert.deepEqual(result, { registeredCount: 3, failed: false });
  });
});

test("present WebMCP gates copy buttons until all five registrations succeed", async () => {
  const source = await readFile(join(ROOT, "app.js"), "utf8");
  assert.match(source, /const copyButtons = \["#copy-prompt-1", "#copy-prompt-2"\]/);
  assert.match(source, /if \(present\) for \(const button of copyButtons\) button\.disabled = true;/);
  assert.match(source, /const registrationReady = !registration\.failed && registeredCount === 5;/);
  assert.ok(source.includes('"tools: registration failed — Reset demo to retry"'));
  assert.match(source, /for \(const button of copyButtons\) button\.disabled = !registrationReady;/);
});

test("an already-aborted execute callback cannot enter runTool or move allocators", async () => {
  const store = createStore(GOLDEN_STATE);
  const before = JSON.stringify(store.snapshot());
  let resultCallbacks = 0;
  const execute = createToolExecutor(store, [], "read_mapping_session", () => {
    resultCallbacks += 1;
  });
  const controller = new AbortController();
  controller.abort();
  const result = await execute({}, { signal: controller.signal });
  assert.deepEqual(result, {
    content: [{ type: "text", text: '{"error":{"code":"ABORTED"}}' }],
  });
  assert.equal(resultCallbacks, 0);
  assert.equal(JSON.stringify(store.snapshot()), before);
});
