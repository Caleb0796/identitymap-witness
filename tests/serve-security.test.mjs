import { test } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm, symlink } from "node:fs/promises";
import { request } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { startServer } from "../harness/serve.mjs";

const ROOT = fileURLToPath(new URL("..", import.meta.url));

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: Buffer.concat(chunks),
      }));
    });
    req.on("error", reject);
    req.setTimeout(2_000, () => req.destroy(new Error("local server request timed out")));
    req.end();
  });
}

function stopChild(child) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => child.kill("SIGKILL"), 2_000);
    timer.unref();
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    child.kill("SIGTERM");
  });
}

test("serve entrypoint starts from a path containing spaces", async (t) => {
  const temp = await mkdtemp(join(tmpdir(), "imw serve entrypoint "));
  t.after(() => rm(temp, { recursive: true, force: true }));
  const linkedRoot = join(temp, "identitymap-witness");
  await symlink(ROOT, linkedRoot, "dir");
  const script = join(linkedRoot, "harness", "serve.mjs");
  const child = spawn(process.execPath, ["--preserve-symlinks-main", script], {
    env: { ...process.env, PORT: "0" },
    stdio: ["ignore", "pipe", "pipe"],
  });
  t.after(() => stopChild(child));

  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr += chunk; });
  const port = await new Promise((resolvePort, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`serve entrypoint did not start; stderr: ${stderr}`));
    }, 5_000);
    timer.unref();
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      reject(new Error(`serve entrypoint exited before startup (${code ?? signal}); stderr: ${stderr}`));
    });
    child.stdout.on("data", (chunk) => {
      stdout += chunk;
      const match = stdout.match(/http:\/\/127\.0\.0\.1:(\d+)\//);
      if (!match) return;
      clearTimeout(timer);
      resolvePort(Number(match[1]));
    });
  });

  const response = await get(port, "/");
  assert.equal(response.status, 200);
  assert.match(response.body.toString("utf8"), /IdentityMap Witness/);
});

test("local server exposes only the public application asset graph", async (t) => {
  const { server, port } = await startServer(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  for (const path of [
    "/",
    "/app.js",
    "/favicon.svg",
    "/style.css",
    "/src/tools/defs.mjs",
    "/src/engine/eval.mjs",
    "/src/engine/personas.mjs",
    "/data/personas.json",
  ]) {
    await t.test(`allows ${path}`, async () => {
      const response = await get(port, path);
      assert.equal(response.status, 200);
      assert.ok(response.body.length > 0);
    });
  }

  const favicon = await get(port, "/favicon.svg");
  assert.equal(favicon.status, 200);
  assert.equal(favicon.headers["content-type"], "image/svg+xml");

  for (const path of [
    "/.git/HEAD",
    "/.DS_Store",
    "/package.json",
    "/favicon.ico",
    "/tests/validate.test.mjs",
    "/src/not-in-the-page-graph.mjs",
    "/%00",
    "/%E0%A4%A",
    "/src\\tools\\defs.mjs",
    "/src%5ctools%5cdefs.mjs",
    "/src/%2e%2e/package.json",
    "/src/%2e%2e/app.js",
    "/%2e%2e/.git/HEAD",
  ]) {
    await t.test(`denies ${path}`, async () => {
      const response = await get(port, path);
      assert.ok(response.status === 403 || response.status === 404);
      assert.equal(response.body.length, 0);
    });
  }
});
