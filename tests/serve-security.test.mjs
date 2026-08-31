import { test } from "node:test";
import assert from "node:assert/strict";
import { request } from "node:http";
import { startServer } from "../harness/serve.mjs";

function get(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: "127.0.0.1", port, path }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => resolve({ status: res.statusCode, body: Buffer.concat(chunks) }));
    });
    req.on("error", reject);
    req.end();
  });
}

test("local server exposes only the public application asset graph", async (t) => {
  const { server, port } = await startServer(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));

  for (const path of [
    "/",
    "/app.js",
    "/style.css",
    "/src/tools/defs.mjs",
    "/src/engine/eval.mjs",
    "/data/personas.json",
  ]) {
    await t.test(`allows ${path}`, async () => {
      const response = await get(port, path);
      assert.equal(response.status, 200);
      assert.ok(response.body.length > 0);
    });
  }

  for (const path of [
    "/.git/HEAD",
    "/.DS_Store",
    "/package.json",
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
