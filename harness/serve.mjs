// Zero-dep static server for the public page asset graph.
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve, sep } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname;
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript",
  ".css": "text/css", ".json": "application/json", ".png": "image/png",
  ".svg": "image/svg+xml",
};
const PUBLIC_FILES = new Set([
  "index.html",
  "app.js",
  "favicon.svg",
  "style.css",
  "data/personas.json",
  `src${sep}engine${sep}eval.mjs`,
  `src${sep}engine${sep}invariants.mjs`,
  `src${sep}engine${sep}parser.mjs`,
  `src${sep}engine${sep}personas.mjs`,
  `src${sep}engine${sep}witness.mjs`,
  `src${sep}store${sep}reducer.mjs`,
  `src${sep}tools${sep}defs.mjs`,
  `src${sep}tools${sep}redact.mjs`,
  `src${sep}tools${sep}validate.mjs`,
]);

function publicAsset(path) {
  return PUBLIC_FILES.has(path);
}

function deny(res, status = 404) {
  res.writeHead(status).end();
}

export function startServer(port = 0) {
  const server = createServer(async (req, res) => {
    try {
      const rawPath = String(req.url ?? "").split("?", 1)[0];
      if (rawPath.includes("\\") || /%5c/i.test(rawPath)) { deny(res); return; }
      for (const rawSegment of rawPath.split("/")) {
        const segment = decodeURIComponent(rawSegment);
        if (segment === "." || segment === ".." || segment.includes("/")
            || segment.includes("\\") || segment.includes("\0") || segment.startsWith(".")) {
          deny(res);
          return;
        }
      }
      let path = decodeURIComponent(new URL(rawPath, "http://x").pathname);
      if (path === "/") path = "/index.html";
      const file = resolve(ROOT, `.${path}`);
      const assetPath = relative(ROOT, file);
      if (assetPath.startsWith(`..${sep}`) || assetPath === ".." || isAbsolute(assetPath)) {
        deny(res, 403);
        return;
      }
      if (!publicAsset(assetPath)) { deny(res); return; }
      const body = await readFile(file);
      res.writeHead(200, { "content-type": MIME[extname(file)] ?? "application/octet-stream" });
      res.end(body);
    } catch {
      deny(res);
    }
  });
  return new Promise((resolve) => server.listen(port, "127.0.0.1", () => resolve({ server, port: server.address().port })));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { port } = await startServer(Number(process.env.PORT ?? 4173));
  console.log(`serving ${ROOT} at http://127.0.0.1:${port}/`);
}
