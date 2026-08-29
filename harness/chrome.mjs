// Launch local Chrome 152 with the WebMCP feature flag (required in EVERY mode —
// measured; the flag names WebMCP and WebMCPTesting are interchangeable).
// Fresh --user-data-dir per launch: without it, presence readings go stale.
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHROME_BIN = process.env.CHROME_BIN
  ?? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export async function launchChrome({ cdpPort, url }) {
  const userDataDir = await mkdtemp(join(tmpdir(), "imw-chrome-"));
  const proc = spawn(CHROME_BIN, [
    "--enable-features=WebMCP",
    "--headless=new",
    `--remote-debugging-port=${cdpPort}`,
    `--user-data-dir=${userDataDir}`,
    "--no-first-run",
    "--no-default-browser-check",
    "--disable-background-networking",
    url,
  ], { stdio: "ignore" });

  let version = null;
  for (let i = 0; i < 120 && !version; i++) {
    try {
      version = await fetch(`http://127.0.0.1:${cdpPort}/json/version`).then((r) => r.json());
    } catch { await new Promise((r) => setTimeout(r, 250)); }
  }
  if (!version) { proc.kill("SIGKILL"); await rm(userDataDir, { recursive: true, force: true }); throw new Error("Chrome CDP endpoint never came up"); }

  return {
    proc,
    wsUrl: version.webSocketDebuggerUrl,
    userAgent: version["User-Agent"] ?? "",
    async close() {
      proc.kill("SIGKILL");
      await new Promise((r) => setTimeout(r, 300));
      await rm(userDataDir, { recursive: true, force: true });
    },
  };
}
