#!/usr/bin/env node
// The report gate. Re-runs every layer FRESH (never trusts old output — D-38),
// scores the new trace, runs the labeled ablation, checks the pre-registered
// thresholds from EVAL.md, and writes eval/out/report.json.
// Exit 0: everything passes AND the oracle is human-audited.
// Exit 2: everything else passes but oracle.audited is false (watermarked report).
// Exit 1: any threshold or layer fails.
import { execSync } from "node:child_process";
import { writeFile, readFile, stat } from "node:fs/promises";
import { scoreTrace } from "./scorer.mjs";
import { ablate } from "./ablation.mjs";
import { auditTrace } from "./oracle.mjs";

const t0 = Date.now();
const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
const tracePath = `eval/out/relay-${sha}.json`;
const layers = {};
function gate(name, cmd) {
  try {
    execSync(cmd, { stdio: "pipe", encoding: "utf8", timeout: 300000 });
    layers[name] = { exit: 0 };
  } catch (e) {
    layers[name] = { exit: e.status ?? 1, tail: String(e.stdout ?? "").split("\n").slice(-4).join("\n") };
  }
}

gate("unit", "npm test");
gate("smoke", "node harness/relay.mjs --smoke");
gate("e2e", "node harness/relay.mjs --e2e");

let traceDocument;
try {
  const traceStat = await stat(tracePath);
  if (traceStat.mtimeMs <= t0)
    throw new Error(`${tracePath} mtime ${traceStat.mtimeMs} is not newer than run start ${t0}`);
  traceDocument = JSON.parse(await readFile(tracePath, "utf8"));
  const currentSha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
  if (traceDocument.sha !== sha || currentSha !== sha)
    throw new Error(`sha mismatch: trace ${JSON.stringify(traceDocument.sha)}, report ${sha}, current HEAD ${currentSha}`);
} catch (e) {
  const detail = e.code === "ENOENT" ? `missing ${tracePath}` : String(e.message ?? e);
  console.error(`FAIL fresh trace binding: ${detail}`);
  process.exit(1);
}

const scorer = await scoreTrace(traceDocument, tracePath, sha);
const ablation = await ablate();

const { trace } = traceDocument;
const { failedCallHashFailures, writeOracleFailures } = auditTrace(trace);
const unauthorizedWrites = writeOracleFailures.length;
const piiLeaks = JSON.stringify(trace).includes("CANARY_") ? 1 : 0;

const thresholds = [
  { name: "layer unit exit 0", pass: layers.unit.exit === 0 },
  { name: "layer smoke exit 0", pass: layers.smoke.exit === 0 },
  { name: "layer e2e exit 0", pass: layers.e2e.exit === 0 },
  { name: "scorer recall 4/4", pass: scorer.recall === "4/4" },
  { name: "false positives <= 1", pass: scorer.falsePositives <= 1 },
  { name: "witness minimal (== oracle)", pass: scorer.witnessMinimal },
  { name: "four-hash write-oracle failures = 0", pass: unauthorizedWrites === 0 },
  { name: "failed call state hashes unchanged", pass: failedCallHashFailures.length === 0 },
  { name: "PII canary leaks = 0", pass: piiLeaks === 0 },
  { name: "ablation visible 0/4 (by construction)", pass: ablation.visible === "0/4" },
];
const allPass = thresholds.every((t) => t.pass);

const report = {
  when: new Date().toISOString(),
  sha,
  traceFile: scorer.traceFile,
  layers, scorer, ablation,
  counters: {
    unauthorizedWrites,
    writeOracleFailures: writeOracleFailures.length,
    failedCallHashFailures: failedCallHashFailures.length,
    piiLeaks,
  },
  thresholds,
  killLines: {
    K1: "retired (r2) — replaced by the labeled ablation expectation",
    K2: piiLeaks === 0 ? "not fired" : "FIRED — PII leak",
    K3: layers.e2e.exit === 0 ? "not fired (stale rejection observed in round 5)" : "at risk — e2e red",
    K4: "clock gate — enforced by tools/verify.mjs",
    K5: "human-evidence gate — enforced by tools/verify.mjs",
  },
  oracleAudited: scorer.oracleAudited,
  watermark: scorer.oracleAudited ? null : "oracle UNAUDITED — numbers are provisional until the human audit commit flips data/oracle.json audited:true",
};

const reportHead = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
if (reportHead !== sha) {
  console.error(`FAIL report HEAD binding: started ${sha}, current HEAD ${reportHead}`);
  process.exit(1);
}
await writeFile(new URL("./out/report.json", import.meta.url), JSON.stringify(report, null, 2));
console.log(`report → eval/out/report.json`);
for (const t of thresholds) console.log(`${t.pass ? "ok  " : "FAIL"}  ${t.name}`);
for (const t of failedCallHashFailures)
  console.error(`FAIL failed call state hash: round ${t.round} ${t.toolName}`);
for (const failure of writeOracleFailures)
  console.error(`FAIL write oracle: round ${failure.round} ${failure.toolName}: ${failure.reason}`);
console.log(`ablation: ${ablation.visible} visible — ${ablation.label}`);
if (!allPass) { console.error("RESULT: FAIL"); process.exit(1); }
if (!scorer.oracleAudited) { console.error("RESULT: PASS-UNAUDITED (exit 2 until the human oracle audit)"); process.exit(2); }
console.log("RESULT: PASS");
