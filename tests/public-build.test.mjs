import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, readdir, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildPublic } from "../tools/build-public.mjs";

async function filesBelow(root, path = "") {
  const files = [];
  for (const entry of await readdir(join(root, path))) {
    const child = join(path, entry);
    if ((await stat(join(root, child))).isDirectory()) files.push(...await filesBelow(root, child));
    else files.push(child);
  }
  return files;
}

test("curated Render build contains the complete page graph and no repository internals", async (t) => {
  const output = await mkdtemp(join(tmpdir(), "imw-public-"));
  t.after(() => rm(output, { recursive: true, force: true }));
  const published = await buildPublic(output);
  const actual = (await filesBelow(output)).sort();
  assert.deepEqual(actual, published);
  assert.deepEqual(actual, [
    "app.js",
    "data/personas.json",
    "index.html",
    "src/engine/eval.mjs",
    "src/engine/invariants.mjs",
    "src/engine/parser.mjs",
    "src/engine/witness.mjs",
    "src/store/reducer.mjs",
    "src/tools/defs.mjs",
    "src/tools/redact.mjs",
    "src/tools/validate.mjs",
    "style.css",
  ]);
  const app = await readFile(join(output, "app.js"), "utf8");
  const index = await readFile(join(output, "index.html"), "utf8");
  assert.match(app, /fetch\("\.\/data\/personas\.json"\)/);
  assert.match(index, /src="\.\/app\.js"/);
  assert.ok(!actual.some((path) => path.startsWith("tests/") || path.startsWith(".git/")));
  assert.ok(!actual.includes("package.json"));
});
