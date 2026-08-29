#!/usr/bin/env node
// The ONLY authority for "done" (review r2). Re-runs every gate itself, checks
// the plan's boxes, evaluates the clock gates, prints exactly one STATUS line:
//   STATUS CODE_COMPLETE          — loop may emit its halt promise
//   STATUS INCOMPLETE <reason>    — keep working
//   STATUS ABORT_GATE <K-id>      — follow the ABORT protocol
// CODE_COMPLETE is NOT ENTRY_READY: the human checklist in
// docs/EVIDENCE-CHECKLIST.md owns deployment, ChatGPT evidence, oracle audit,
// video, and submission.
import { execSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";

const say = (s) => console.log(s);
const status = (s) => { say(`STATUS ${s}`); process.exit(s.startsWith("CODE_COMPLETE") ? 0 : s.startsWith("INCOMPLETE") ? 1 : 3); };

function run(name, cmd, okExits = [0]) {
  try {
    execSync(cmd, { stdio: "pipe", timeout: 420000 });
    say(`gate  ${name}: exit 0`);
    return 0;
  } catch (e) {
    const code = e.status ?? 1;
    say(`gate  ${name}: exit ${code}`);
    return okExits.includes(code) ? 0 : code;
  }
}

// ── clock gates (K4/K5 from EVAL.md, PT = UTC-7 in August/September) ────────
const now = Date.now();
const K4 = Date.parse("2026-08-31T18:00:00-07:00");
const K5 = Date.parse("2026-09-01T21:00:00-07:00");

// ── plan boxes: everything except T12's halt-protocol step must be checked ──
const plan = await readFile(new URL("../docs/plans/2026-08-29-identitymap-witness.md", import.meta.url), "utf8");
const haltMark = plan.indexOf("**Step 3: loop protocol");
const t12Halt = haltMark === -1 ? -1 : plan.lastIndexOf("\n", haltMark); // cut at the LINE start, not mid-checkbox
const scanned = t12Halt === -1 ? plan : plan.slice(0, t12Halt);
const unchecked = (scanned.match(/^- \[ \] /gm) ?? []).length;

const unit = run("npm test", "npm test");
const smoke = run("--smoke", "node harness/relay.mjs --smoke");
if (now > K4 && (unit !== 0 || smoke !== 0)) status("ABORT_GATE K4 (layers 1-2 not green past 2026-08-31 18:00 PT)");
if (now > K5 && !existsSync(new URL("../evidence/chatgpt-run.png", import.meta.url)))
  status("ABORT_GATE K5 (no ChatGPT-browser evidence past 2026-09-01 21:00 PT)");

const e2e = run("--e2e", "node harness/relay.mjs --e2e");
const evalRun = run("eval/run.mjs", "node eval/run.mjs", [0, 2]); // 2 = pass, unaudited (human-gated)

if (unchecked > 0) status(`INCOMPLETE ${unchecked} unchecked plan step(s) before the halt protocol`);
if (unit || smoke || e2e || evalRun) status("INCOMPLETE a gate is red (see gate lines above)");

for (const [item, probe] of [
  ["deploy: live URL in README", async () => /https:\/\/\S+onrender\.com/.test(await readFile(new URL("../README.md", import.meta.url), "utf8"))],
  ["ChatGPT-browser evidence PNG", async () => existsSync(new URL("../evidence/chatgpt-run.png", import.meta.url))],
  ["oracle audit flipped", async () => JSON.parse(await readFile(new URL("../data/oracle.json", import.meta.url))).audited === true],
  ["video recorded", async () => existsSync(new URL("../evidence/video-final.txt", import.meta.url))],
  ["Devpost submitted", async () => existsSync(new URL("../evidence/devpost-submitted.txt", import.meta.url))],
]) {
  say(`HUMAN-REMAINING ${await probe() ? "done " : "TODO "} ${item}`);
}
status("CODE_COMPLETE (ENTRY_READY is the human checklist above + docs/EVIDENCE-CHECKLIST.md)");
