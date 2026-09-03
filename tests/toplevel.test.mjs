import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { createStore } from "../src/store/reducer.mjs";
import {
  GOLDEN_STATE,
  createToolExecutor,
  registerToolDefinitions,
} from "../src/tools/defs.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

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

test("app registration uses method feature detection, pure reads, and a non-mutating draft guard", async () => {
  const source = await readFile(join(ROOT, "app.js"), "utf8");
  assert.match(source, /typeof document\.modelContext\?\.registerTool === "function"/);
  assert.match(source, /const lifecycle = new AbortController\(\)/);
  assert.match(source, /if \(!event\.persisted\) lifecycle\.abort\(\)/);
  assert.doesNotMatch(source, /flushGridDrafts/);
  assert.match(source, /return OUTPUT_FIELDS\.filter\(\(field\) => draftFields\.has\(field\)\);/);
  assert.match(source, /const isRead = tool\.name === "read_mapping_session";/);
  assert.match(source, /if \(isRead\) return;/);
  assert.match(source, /if \(!result\.ok\) return;/);
  assert.doesNotMatch(source, /content:\s*\[\{\s*type:\s*"text"/);
  const conditionalHook = source.indexOf("}, isRead ? undefined : () => {");
  const handlerSnapshot = source.indexOf("toolSnapshotBefore = store.snapshot();");
  const draftScan = source.indexOf("const fields = visibleExpressionDraftFields();");
  const draftError = source.indexOf('code: "UNCOMMITTED_DRAFT"');
  const handlerCall = source.lastIndexOf("return executeTool(args, context);");
  assert.ok(conditionalHook >= 0 && conditionalHook < handlerSnapshot,
    "reads must omit the non-read precondition hook");
  assert.ok(handlerSnapshot < draftScan && draftScan < draftError,
    "the non-read hook must snapshot before inspecting visible drafts");
  assert.ok(draftError < handlerCall,
    "the unified executor must receive the draft precondition before it is called");
  assert.ok(source.includes(
    'reason: "visible expression drafts must be committed or reverted by the human before running this tool; then call read_mapping_session again"',
  ));
  assert.match(
    source,
    /document\.modelContext\.registerTool\(\{\s*name: definition\.name,\s*description: definition\.description,\s*inputSchema: definition\.inputSchema,\s*execute: definition\.execute,\s*annotations: definition\.annotations,\s*\}, options\)/,
  );
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

  await t.test("failure aborts the catalog and skips later registrations", async () => {
    const controller = new AbortController();
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
      controller.signal,
      (count) => counts.push(count),
    );
    assert.deepEqual(attempted.map(([name]) => name), ["first", "second"]);
    assert.notEqual(attempted[0][1], controller.signal);
    assert.equal(attempted[0][1], attempted[1][1]);
    assert.equal(attempted[0][1].aborted, true);
    assert.deepEqual(counts, [1]);
    assert.deepEqual(result, { registeredCount: 0, failed: true });
  });

  await t.test("lifecycle abort while the final registration is pending fails closed", async () => {
    const controller = new AbortController();
    const counts = [];
    const signals = [];
    let releaseLast;
    let reportLastStarted;
    const lastStarted = new Promise((resolve) => { reportLastStarted = resolve; });
    const registration = registerToolDefinitions(
      ["first", "second", "third", "fourth", "fifth"].map((name) => ({ name })),
      (definition, options) => {
        signals.push(options.signal);
        if (definition.name !== "fifth") return Promise.resolve();
        reportLastStarted();
        return new Promise((resolve) => { releaseLast = resolve; });
      },
      (tool) => tool,
      controller.signal,
      (count) => counts.push(count),
    );

    await lastStarted;
    assert.deepEqual(counts, [1, 2, 3, 4]);
    controller.abort();
    releaseLast();

    assert.deepEqual(await registration, { registeredCount: 0, failed: true });
    assert.equal(new Set(signals).size, 1);
    assert.equal(signals[0].aborted, true);
    assert.deepEqual(counts, [1, 2, 3, 4]);
  });

  await t.test("success", async () => {
    const controller = new AbortController();
    const counts = [];
    const signals = [];
    const result = await registerToolDefinitions(
      [{ name: "first" }, { name: "second" }, { name: "third" }],
      (_definition, options) => {
        signals.push(options.signal);
        return Promise.resolve();
      },
      (tool) => tool,
      controller.signal,
      (count) => counts.push(count),
    );
    assert.deepEqual(counts, [1, 2, 3]);
    assert.deepEqual(result, { registeredCount: 3, failed: false });
    assert.equal(new Set(signals).size, 1);
    assert.equal(signals[0].aborted, false);
    controller.abort();
    assert.equal(signals[0].aborted, true);
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
  let preconditions = 0;
  const execute = createToolExecutor(store, [], "read_mapping_session", () => {
    resultCallbacks += 1;
  }, () => {
    preconditions += 1;
    return { code: "UNCOMMITTED_DRAFT", fields: ["managerId"] };
  });
  const controller = new AbortController();
  controller.abort();
  const result = await execute({}, { signal: controller.signal });
  assert.deepEqual(result, {
    content: [{ type: "text", text: '{"error":{"code":"ABORTED"}}' }],
  });
  assert.equal(resultCallbacks, 0);
  assert.equal(preconditions, 0);
  assert.equal(JSON.stringify(store.snapshot()), before);
});
