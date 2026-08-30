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
import { countUncheckedRequiredBoxes } from "./verify-boxes.mjs";
import { isValidChatGptEvidence } from "./verify-evidence.mjs";

const say = (s) => console.log(s);
const status = (s) => { say(`STATUS ${s}`); process.exit(s.startsWith("CODE_COMPLETE") ? 0 : s.startsWith("INCOMPLETE") ? 1 : 3); };

function run(name, cmd) {
  try {
    execSync(cmd, { stdio: "pipe", timeout: 420000 });
    say(`gate  ${name}: exit 0`);
    return 0;
  } catch (e) {
    const code = e.status ?? 1;
    say(`gate  ${name}: exit ${code}`);
    return code;
  }
}

async function check(name, probe) {
  let pass = false;
  try { pass = await probe(); } catch { pass = false; }
  say(`check ${name}: ${pass ? "ok" : "FAIL"}`);
  return pass;
}

// ── clock gates (K4/K5 from EVAL.md, PT = UTC-7 in August/September) ────────
const now = Date.now();
const K4 = Date.parse("2026-08-31T18:00:00-07:00");
const K5 = Date.parse("2026-09-01T21:00:00-07:00");

const unit = run("npm test", "npm test");
const smoke = run("--smoke", "node harness/relay.mjs --smoke");
if (now > K4 && (unit !== 0 || smoke !== 0)) status("ABORT_GATE K4 (layers 1-2 not green past 2026-08-31 18:00 PT)");
if (now > K5 && !existsSync(new URL("../evidence/chatgpt-run.png", import.meta.url)))
  status("ABORT_GATE K5 (no ChatGPT-browser evidence past 2026-09-01 21:00 PT)");

const e2e = run("--e2e", "node harness/relay.mjs --e2e");
const evalRun = run("eval/run.mjs", "node eval/run.mjs");

// Keep every report/trace read below the eval gate: eval/run.mjs regenerates both
// artifacts, so these probes never authorize a stale report from an earlier run.
const head = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
const expectedTrace = `eval/out/relay-${head}.json`;
const reportBound = await check("fresh audited report is bound to HEAD and trace", async () => {
  if (evalRun !== 0) return false;
  const report = JSON.parse(await readFile(new URL("../eval/out/report.json", import.meta.url), "utf8"));
  const trace = JSON.parse(await readFile(new URL(`../${expectedTrace}`, import.meta.url), "utf8"));
  return report.sha === head
    && report.traceFile === expectedTrace
    && report.scorer?.traceFile === expectedTrace
    && trace.sha === head
    && report.oracleAudited === true
    && report.scorer?.oracleAudited === true
    && report.watermark === null
    && report.layers?.unit?.exit === 0
    && report.layers?.smoke?.exit === 0
    && report.layers?.e2e?.exit === 0
    && Array.isArray(report.thresholds)
    && report.thresholds.length > 0
    && report.thresholds.every((threshold) => threshold?.pass === true)
    && report.counters?.unauthorizedWrites === 0
    && report.counters?.writeOracleFailures === 0
    && report.counters?.failedCallHashFailures === 0
    && report.counters?.piiLeaks === 0;
});

const repositoryChecks = [
  await check("LICENSE exists", async () => existsSync(new URL("../LICENSE", import.meta.url))),
  await check("README contains no 70+ claim", async () =>
    !(await readFile(new URL("../README.md", import.meta.url), "utf8")).includes("70+")),
  await check("package requires Node >=21", async () =>
    JSON.parse(await readFile(new URL("../package.json", import.meta.url), "utf8")).engines?.node === ">=21"),
  await check("relay contains no direct store.dispatch", async () =>
    !(await readFile(new URL("../harness/relay.mjs", import.meta.url), "utf8")).includes("store.dispatch")),
  reportBound,
];

const plan = await readFile(new URL("../docs/CODEX-REMEDY-PLAN.md", import.meta.url), "utf8");
const remedyUnchecked = countUncheckedRequiredBoxes(plan);
say(`check required remedy-plan boxes: ${remedyUnchecked === 0 ? "ok" : `FAIL (${remedyUnchecked} unchecked)`}`);

// R13 adds the remedy-plan authority; it does not weaken the original plan gate.
const legacyPlan = await readFile(new URL("../docs/plans/2026-08-29-identitymap-witness.md", import.meta.url), "utf8");
const haltMark = legacyPlan.indexOf("**Step 3: loop protocol");
const t12Halt = haltMark === -1 ? -1 : legacyPlan.lastIndexOf("\n", haltMark);
const legacyScanned = t12Halt === -1 ? legacyPlan : legacyPlan.slice(0, t12Halt);
const legacyUnchecked = (legacyScanned.match(/^- \[ \] /gm) ?? []).length;
say(`check required original-plan boxes: ${legacyUnchecked === 0 ? "ok" : `FAIL (${legacyUnchecked} unchecked)`}`);

if (remedyUnchecked > 0) status(`INCOMPLETE ${remedyUnchecked} unchecked required remedy-plan step(s)`);
if (legacyUnchecked > 0) status(`INCOMPLETE ${legacyUnchecked} unchecked original-plan step(s) before the halt protocol`);
if (unit || smoke || e2e || evalRun) status("INCOMPLETE a gate is red (see gate lines above)");
if (repositoryChecks.some((pass) => !pass)) status("INCOMPLETE a repository/report check is red (see check lines above)");

for (const [item, probe] of [
  ["deploy: live URL in README", async () => /https:\/\/\S+onrender\.com/.test(await readFile(new URL("../README.md", import.meta.url), "utf8"))],
  ["ChatGPT-browser evidence (PNG + content-validated JSON)", async () => {
    if (!existsSync(new URL("../evidence/chatgpt-run.png", import.meta.url))) return false;
    try { // run2 review: existence is not evidence — the transcription must SHOW the result
      const j = JSON.parse(await readFile(new URL("../evidence/chatgpt-run.json", import.meta.url), "utf8"));
      return isValidChatGptEvidence(j);
    } catch { return false; }
  }],
  ["oracle audit flipped", async () => JSON.parse(await readFile(new URL("../data/oracle.json", import.meta.url))).audited === true],
  ["video recorded", async () => existsSync(new URL("../evidence/video-final.txt", import.meta.url))],
  ["Devpost submitted", async () => existsSync(new URL("../evidence/devpost-submitted.txt", import.meta.url))],
]) {
  say(`HUMAN-REMAINING ${await probe() ? "done " : "TODO "} ${item}`);
}
status("CODE_COMPLETE (ENTRY_READY is the human checklist above + docs/EVIDENCE-CHECKLIST.md)");
