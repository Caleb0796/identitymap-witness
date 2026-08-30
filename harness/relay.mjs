#!/usr/bin/env node
// Layer-2 (--smoke) and layer-3 (--e2e) gates. Presence is proven by the
// completed round trip (WebMCP.enable returns OK even with no page API — measured;
// recorded, never asserted). By-name calls go over the CDP WebMCP domain.
import { execSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import { startServer } from "./serve.mjs";
import { launchChrome } from "./chrome.mjs";
import { connect, invokeTool, textOf } from "./cdp.mjs";

const MODE = process.argv[2] ?? "--smoke";
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`ok    ${msg}`);
const assertEq = (got, want, what) => {
  if (JSON.stringify(got) !== JSON.stringify(want))
    throw new Error(`${what}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

async function attachToPage(cdp, wantUrl) {
  for (let i = 0; i < 60; i++) {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const t = targetInfos.find((x) => x.type === "page" && x.url.startsWith(wantUrl));
    if (t) {
      const { sessionId } = await cdp.send("Target.attachToTarget", { targetId: t.targetId, flatten: true });
      return sessionId;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`no page target for ${wantUrl}`);
}

async function bootSession(baseUrl) {
  const cdpPort = 9400 + Math.floor(Math.random() * 400);
  const chrome = await launchChrome({ cdpPort, url: baseUrl });
  const cdp = await connect(chrome.wsUrl);
  const sessionId = await attachToPage(cdp, baseUrl);
  let cdpDomainEnabled = true;
  try { await cdp.send("WebMCP.enable", {}, sessionId); } catch { cdpDomainEnabled = false; }
  const evalJs = async (expression, { awaitPromise = false } = {}) => {
    const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise }, sessionId);
    if (r.exceptionDetails) throw new Error(`page eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`);
    return r.result.value;
  };
  for (let i = 0; i < 60; i++) {
    if (await evalJs("Boolean(window.__imw)").catch(() => false)) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!await evalJs("Boolean(window.__imw)")) throw new Error("page module never initialized");
  const { frameTree } = await cdp.send("Page.getFrameTree", {}, sessionId);
  return { chrome, cdp, sessionId, frameId: frameTree.frame.id, evalJs, cdpDomainEnabled };
}

const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];

// ── layer 2 ──────────────────────────────────────────────────────────────────
async function smokeSession(round, baseUrl) {
  const s = await bootSession(baseUrl);
  try {
    const present = await s.evalJs('typeof document.modelContext !== "undefined" && document.modelContext !== null');
    if (!present) throw new Error("document.modelContext absent — flag missing or engine mismatch");
    const count = await s.evalJs("document.modelContext.getTools().then(t => t.length)", { awaitPromise: true });
    if (count !== 5) throw new Error(`getTools() length ${count}, want 5`);

    const read = await invokeTool(s.cdp, s.sessionId, s.frameId, "read_mapping_session", {});
    if (!read.roundTrip) throw new Error(`read round trip failed: ${JSON.stringify(read)}`);
    const payload = JSON.parse(textOf(read.output));
    assertEq(payload.revision, 17, "read revision");
    assertEq(payload.personaCount, 8, "personaCount");

    const stage = await invokeTool(s.cdp, s.sessionId, s.frameId, "stage_mapping_invariants",
      { expectedRevision: 17, invariants: PINS });
    if (!stage.roundTrip) throw new Error("stage round trip failed");
    assertEq(JSON.parse(textOf(stage.output)).revision, 18, "stage revision");

    const find = await invokeTool(s.cdp, s.sessionId, s.frameId, "find_mapping_counterexample", { expectedRevision: 18 });
    if (!find.roundTrip) throw new Error("find round trip failed");
    assertEq(JSON.parse(textOf(find.output)).personaIds, ["P2", "P3", "P4"], "witness");
    const rows = await s.evalJs('document.querySelectorAll("#matrix tbody tr").length');
    assertEq(rows, 4, "matrix rows after find");

    const nope = await invokeTool(s.cdp, s.sessionId, s.frameId, "no_such_tool", {});
    if (!nope.sendRejected || nope.cdp?.code !== -32602)
      throw new Error(`unknown tool: want -32602 send rejection, got ${JSON.stringify(nope)}`);

    if (textOf(read.output).includes("CANARY_") || textOf(find.output).includes("CANARY_"))
      throw new Error("CANARY_ leaked through a tool payload");

    ok(`session ${round}: present, 5 tools, read r17, stage r18, find [P2,P3,P4]→4 matrix rows, -32602, no canary (WebMCP.enable ${s.cdpDomainEnabled ? "ok" : "rejected"} — recorded, not asserted)`);
  } finally {
    s.cdp.close();
    await s.chrome.close();
  }
}

// ── layer 3 ──────────────────────────────────────────────────────────────────
async function e2e(baseUrl) {
  const s = await bootSession(baseUrl);
  const trace = [];
  const stateHash = () => s.evalJs(`crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(JSON.stringify(window.__imw.store.snapshot())),
  ).then((bytes) => [...new Uint8Array(bytes)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join(""))`, { awaitPromise: true });
  const call = async (round, toolName, input) => {
    const stateHashBefore = await stateHash();
    const t0 = Date.now();
    const r = await invokeTool(s.cdp, s.sessionId, s.frameId, toolName, input);
    const stateHashAfter = await stateHash();
    const text = textOf(r.output);
    trace.push({ round, kind: "tool", toolName, input, invocationId: r.invocationId,
      status: r.status, matched: r.matched, stateHashBefore, stateHashAfter,
      ms: Date.now() - t0, payload: text ? JSON.parse(text) : null });
    if (text?.includes("CANARY_")) throw new Error(`round ${round}: canary leak`);
    return { r, p: text ? JSON.parse(text) : null };
  };
  const human = async (round, action) => {
    const rev = await s.evalJs(
      `window.__imw.store.dispatch(${JSON.stringify(action)}); window.__imw.render(); window.__imw.store.getState().revision`);
    trace.push({ round, kind: "human-sim", action, revisionAfter: rev });
    return rev;
  };
  const humanExpression = async (round, field, expr) => {
    const selector = `#grid input[data-field="${field}"]`;
    const result = await s.evalJs(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) throw new Error(${JSON.stringify(`missing ${selector}`)});
      input.value = ${JSON.stringify(expr)};
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return {
        revisionAfter: window.__imw.store.getState().revision,
        expressionAfter: window.__imw.store.getState().expressions[${JSON.stringify(field)}],
      };
    })()`);
    trace.push({ round, kind: "human-sim", via: "dom-change",
      action: { type: "EDIT_EXPRESSION", field, expr }, ...result });
    return result;
  };
  try {
    // 1 read → r17
    const r1 = await call(1, "read_mapping_session", {});
    assertEq(r1.p.revision, 17, "round1 revision");
    // 2 stage 3 pins → r18
    const r2 = await call(2, "stage_mapping_invariants", { expectedRevision: 17, invariants: PINS });
    assertEq(r2.p.revision, 18, "round2 revision");
    // 3 find → witness [P2,P3,P4], evidence E1
    const r3 = await call(3, "find_mapping_counterexample", { expectedRevision: 18 });
    assertEq(r3.p.personaIds, ["P2", "P3", "P4"], "round3 witness");
    const E1 = r3.p.evidenceIds;
    // 4 human fixes managerId (r19); E1 must go stale — and only via fingerprint
    const rev4 = await human(4, { type: "EDIT_EXPRESSION", field: "managerId", expr: "user.managerId" });
    assertEq(rev4, 19, "round4 revision");
    const e1stale = await s.evalJs(`window.__imw.store.getState().evidence[${JSON.stringify(E1[0])}].stale`);
    assertEq(e1stale, true, "round4 E1 stale");
    // 5 prepare over stale E1 MUST fail
    const r5 = await call(5, "prepare_mapping_review", { expectedRevision: 19, evidenceIds: E1 });
    assertEq(r5.p.error.code, "STALE_EVIDENCE", "round5 code");
    assertEq(r5.p.error.staleIds, E1, "round5 staleIds");
    // 6 re-find: P3 fixed, witness shrinks to [P2,P4]
    const r6 = await call(6, "find_mapping_counterexample", { expectedRevision: 19 });
    assertEq(r6.p.personaIds, ["P2", "P4"], "round6 witness");
    assertEq(r6.p.violations.length, 3, "round6 violations");
    // 7 preview the group fix over P2 — draft untouched
    const r7 = await call(7, "preview_mapping_patch", {
      expectedRevision: 19, field: "group",
      expr: 'String.toLowerCase(user.userType) == "contractor" ? "contractors" : "employees"',
      personaIds: ["P2"] });
    assertEq(r7.p.diffs, [{ personaId: "P2", field: "group", before: "employees", after: "contractors" }], "round7 diff");
    assertEq(r7.p.remainingViolations, 0, "round7 remaining");
    const rev7 = await s.evalJs("window.__imw.store.getState().revision");
    assertEq(rev7, 19, "round7 preview must not bump revision");
    // 8 human applies group fix (r20) + priority fix (r21); clean sweep → green packet
    await human(8, { type: "EDIT_EXPRESSION", field: "group", expr: 'String.toLowerCase(user.userType) == "contractor" ? "contractors" : "employees"' });
    const rev8 = await human(8, { type: "SET_PRIORITY", priority: ["hris", "ad"] });
    assertEq(rev8, 21, "round8 revision");
    const r8 = await call(8, "find_mapping_counterexample", { expectedRevision: 21 });
    assertEq(r8.p.cleanSweep, true, "round8 clean sweep");
    assertEq(r8.p.fullSweep, true, "round8 full sweep");
    const rows8 = await s.evalJs('document.querySelectorAll("#matrix tbody tr").length');
    assertEq(rows8, 0, "round8 clean sweep clears matrix");
    const allClear8 = await s.evalJs('!document.querySelector("#all-clear").hidden && document.querySelector("#all-clear").textContent.includes("clean sweep — 0 violations across 8 personas at r21")');
    assertEq(allClear8, true, "round8 all-clear visible");
    const E3 = r8.p.evidenceIds;
    const r8b = await call(8, "prepare_mapping_review", { expectedRevision: 21, evidenceIds: E3 });
    assertEq(r8b.p.blockers, [], "round8 packet green");
    // 9 recovery: wrong expectedRevision → REVISION_MISMATCH with currentRevision → one retry works
    const r9 = await call(9, "find_mapping_counterexample", { expectedRevision: 17 });
    assertEq(r9.p.error.code, "REVISION_MISMATCH", "round9 code");
    assertEq(r9.p.error.currentRevision, 21, "round9 currentRevision");
    const r9b = await call(9, "find_mapping_counterexample", { expectedRevision: r9.p.error.currentRevision });
    assertEq(r9b.p.cleanSweep, true, "round9 recovery lands on the clean sweep");
    assertEq(r9b.p.fullSweep, true, "round9 recovery covers every confirmed pin");
    // 10 pin add → packet incomplete-by-coverage; unpin → green again
    const r10 = await call(10, "stage_mapping_invariants", { expectedRevision: 21, invariants: [
      ...PINS, { id: "pin-extra", type: "forbidden_group", personaCategory: "nobody", group: "nothing" }] });
    assertEq(r10.p.revision, 22, "round10 revision");
    const e3fresh = await s.evalJs(`window.__imw.store.getState().evidence[${JSON.stringify(E3[0])}].stale`);
    assertEq(e3fresh, false, "round10 clean-sweep evidence survives an ADDED pin (fingerprint untouched)");
    const stale10a = await s.evalJs(`({
      text: document.querySelector("#packet-state").textContent,
      applyDisabled: document.querySelector("#apply").disabled,
    })`);
    assertEq(stale10a.text.includes("STALE"), true, "round10 revision-only stale packet text");
    assertEq(stale10a.applyDisabled, true, "round10 revision-only stale disables apply");
    const r10b = await call(10, "prepare_mapping_review", { expectedRevision: 22, evidenceIds: E3 });
    assertEq(r10b.p.blockers, [{ pin: "pin-extra", reason: "uncovered" }], "round10 uncovered blocker");
    const blocked10 = await s.evalJs(`({
      text: document.querySelector("#packet-state").textContent,
      applyDisabled: document.querySelector("#apply").disabled,
    })`);
    assertEq(blocked10.text.includes("BLOCKED"), true, "round10 fresh blocked packet text");
    assertEq(blocked10.applyDisabled, true, "round10 fresh blocked disables apply");
    const r10c = await call(10, "stage_mapping_invariants", { expectedRevision: 22, invariants: PINS });
    assertEq(r10c.p.revision, 23, "round10 unpin revision");
    const stale10c = await s.evalJs(`({
      text: document.querySelector("#packet-state").textContent,
      applyDisabled: document.querySelector("#apply").disabled,
    })`);
    assertEq(stale10c.text.includes("STALE"), true, "round10 stale overrides blocked text");
    assertEq(stale10c.text.includes("BLOCKED"), false, "round10 stale precedes blocked");
    assertEq(stale10c.applyDisabled, true, "round10 stale blocked packet disables apply");
    const r10d = await call(10, "prepare_mapping_review", { expectedRevision: 23, evidenceIds: E3 });
    assertEq(r10d.p.blockers, [], "round10 green after unpin");
    const green10 = await s.evalJs(`({
      text: document.querySelector("#packet-state").textContent,
      applyDisabled: document.querySelector("#apply").disabled,
    })`);
    assertEq(green10.text.includes("GREEN"), true, "round10 fresh green packet text");
    assertEq(green10.applyDisabled, false, "round10 fresh green enables apply");

    // 11 a real grid change stales GREEN; a real repair + fresh evidence restores it
    const broken = await humanExpression(11, "managerId", 'user.managerId == null ? "" : user.managerId');
    assertEq(broken.revisionAfter, 24, "round11 broken revision");
    assertEq(broken.expressionAfter, 'user.managerId == null ? "" : user.managerId', "round11 broken expression");
    const stale11 = await s.evalJs(`({
      text: document.querySelector("#packet-state").textContent,
      applyDisabled: document.querySelector("#apply").disabled,
    })`);
    assertEq(stale11.text.includes("STALE"), true, "round11 stale packet text");
    assertEq(stale11.applyDisabled, true, "round11 stale packet disables apply");

    const repaired = await humanExpression(11, "managerId", "user.managerId");
    assertEq(repaired.revisionAfter, 25, "round11 repaired revision");
    assertEq(repaired.expressionAfter, "user.managerId", "round11 repaired expression");
    const r11 = await call(11, "find_mapping_counterexample", { expectedRevision: 25 });
    assertEq(r11.p.cleanSweep, true, "round11 repaired clean sweep");
    assertEq(r11.p.fullSweep, true, "round11 repaired full sweep");
    const r11b = await call(11, "prepare_mapping_review", {
      expectedRevision: 25,
      evidenceIds: r11.p.evidenceIds,
    });
    assertEq(r11b.p.blockers, [], "round11 recovered packet green");
    const green11 = await s.evalJs(`({
      text: document.querySelector("#packet-state").textContent,
      applyDisabled: document.querySelector("#apply").disabled,
    })`);
    assertEq(green11.text.includes("GREEN"), true, "round11 recovered packet text");
    assertEq(green11.applyDisabled, false, "round11 recovered packet enables apply");

    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const out = `eval/out/relay-${sha}.json`;
    await writeFile(new URL(`../${out}`, import.meta.url),
      JSON.stringify({ sha, when: new Date().toISOString(), rounds: 11, trace }, null, 2));
    ok(`e2e: 11 rounds green — stale rejection (r5), mismatch recovery (r9), pin-coverage flip (r10), packet freshness recovery (r11); trace → ${out}`);
  } finally {
    s.cdp.close();
    await s.chrome.close();
  }
}

const { server, port } = await startServer(0);
const baseUrl = `http://127.0.0.1:${port}/`;
try {
  if (MODE === "--smoke") {
    for (let round = 1; round <= 3; round++) await smokeSession(round, baseUrl);
    console.log("SMOKE PASS (3 cold sessions)");
  } else if (MODE === "--e2e") {
    await e2e(baseUrl);
    console.log("E2E PASS (11 rounds)");
  } else {
    fail(`unknown mode ${MODE}`);
  }
} catch (e) {
  fail(String(e.message ?? e));
} finally {
  server.close();
}
process.exit(0);
