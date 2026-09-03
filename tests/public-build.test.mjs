import { test } from "node:test";
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, readdir, rm, stat, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { buildPublic } from "../tools/build-public.mjs";

const execFileAsync = promisify(execFile);
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const EXPECTED_PUBLIC_FILES = [
  "app.js",
  "data/personas.json",
  "favicon.svg",
  "index.html",
  "src/engine/eval.mjs",
  "src/engine/invariants.mjs",
  "src/engine/parser.mjs",
  "src/engine/personas.mjs",
  "src/engine/witness.mjs",
  "src/store/reducer.mjs",
  "src/tools/defs.mjs",
  "src/tools/redact.mjs",
  "src/tools/validate.mjs",
  "style.css",
];

async function filesBelow(root, path = "") {
  const files = [];
  for (const entry of await readdir(join(root, path))) {
    const child = join(path, entry);
    if ((await stat(join(root, child))).isDirectory()) files.push(...await filesBelow(root, child));
    else files.push(child);
  }
  return files;
}

test("production build entrypoint runs from a path containing spaces", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "imw public entrypoint "));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const linkedRoot = join(temp, "identitymap-witness");
  await symlink(ROOT, linkedRoot, "dir");
  const script = join(linkedRoot, "tools", "build-public.mjs");
  const output = join(temp, "built assets");

  const { stdout, stderr } = await execFileAsync(
    process.execPath,
    ["--preserve-symlinks-main", script, output],
    { timeout: 5_000 },
  );

  assert.equal(stderr, "");
  assert.equal(stdout, `published ${EXPECTED_PUBLIC_FILES.length} curated assets\n`);
  assert.deepEqual((await filesBelow(output)).sort(), EXPECTED_PUBLIC_FILES);
});

test("curated Render build contains the complete page graph and no repository internals", async (t) => {
  const output = await mkdtemp(join(tmpdir(), "imw-public-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const published = await buildPublic(output);
  const actual = (await filesBelow(output)).sort();
  assert.deepEqual(actual, published);
  assert.deepEqual(actual, EXPECTED_PUBLIC_FILES);
  const app = await readFile(join(output, "app.js"), "utf8");
  const favicon = await readFile(join(output, "favicon.svg"), "utf8");
  const index = await readFile(join(output, "index.html"), "utf8");
  assert.match(app, /fetch\("\.\/data\/personas\.json"\)/);
  assert.match(index, /rel="icon" type="image\/svg\+xml" href="\.\/favicon\.svg"/);
  assert.match(index, /src="\.\/app\.js"/);
  assert.doesNotMatch(favicon, /<(?:script|image|use)\b|href\s*=/i);
  assert.ok(!actual.some((path) => path.startsWith("tests/") || path.startsWith(".git/")));
  assert.ok(!actual.includes("package.json"));
});
