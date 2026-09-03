import { copyFile, mkdir, readFile, rm } from "node:fs/promises";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";
import { tmpdir } from "node:os";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const STATIC_FILES = ["favicon.svg", "index.html", "style.css", "data/personas.json"];
const IMPORT_PATTERN = /\b(?:import|export)\s+(?:[^"']*?\s+from\s+)?["']([^"']+)["']/g;

function insideRoot(path) {
  const pathFromRoot = relative(ROOT, path);
  return pathFromRoot !== ".." && !pathFromRoot.startsWith(`..${sep}`) && !isAbsolute(pathFromRoot);
}

function inside(base, path) {
  const pathFromBase = relative(base, path);
  return pathFromBase !== "" && pathFromBase !== ".."
    && !pathFromBase.startsWith(`..${sep}`) && !isAbsolute(pathFromBase);
}

async function collectModule(path, files) {
  const absolute = resolve(ROOT, path);
  if (!insideRoot(absolute)) throw new Error(`module escapes repository root: ${path}`);
  const pathFromRoot = relative(ROOT, absolute);
  if (files.has(pathFromRoot)) return;
  files.add(pathFromRoot);
  const source = await readFile(absolute, "utf8");
  for (const match of source.matchAll(IMPORT_PATTERN)) {
    const specifier = match[1];
    if (!specifier.startsWith(".")) continue;
    const dependency = resolve(dirname(absolute), specifier);
    if (!insideRoot(dependency) || !/\.(?:mjs|js)$/.test(dependency))
      throw new Error(`unsupported public module dependency: ${specifier}`);
    await collectModule(relative(ROOT, dependency), files);
  }
}

export async function buildPublic(outputPath) {
  if (!outputPath) throw new Error("missing output directory");
  const output = resolve(ROOT, outputPath);
  if (!inside(ROOT, output) && !inside(resolve(tmpdir()), output))
    throw new Error("output directory must be inside the repository or temporary directory");
  const files = new Set(STATIC_FILES);
  await collectModule("app.js", files);
  await rm(output, { recursive: true, force: true });
  for (const file of [...files].sort()) {
    const destination = resolve(output, file);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(resolve(ROOT, file), destination);
  }
  return [...files].sort();
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const output = process.argv[2];
  if (!output) throw new Error("usage: node tools/build-public.mjs <output-directory>");
  const files = await buildPublic(output);
  console.log(`published ${files.length} curated assets`);
}
