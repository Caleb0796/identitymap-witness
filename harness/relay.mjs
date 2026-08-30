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
const HOSTILE_PIN = {
  type: "forbidden_group",
  personaCategory: "x",
  group: "<img src=x onerror=window.__pwned=1>",
};
const HOSTILE_ID = "<img src=x onerror=window.__pwned=2>";
const HOSTILE_ID_PIN = {
  id: HOSTILE_ID,
  type: "forbidden_group",
  personaCategory: "contractor",
  group: "employees",
};

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

    const stagedPins = round === 1 ? [HOSTILE_ID_PIN] : PINS;
    const stage = await invokeTool(s.cdp, s.sessionId, s.frameId, "stage_mapping_invariants",
      { expectedRevision: 17, invariants: stagedPins });
    if (!stage.roundTrip) throw new Error("stage round trip failed");
    const staged = JSON.parse(textOf(stage.output));
    assertEq(staged.revision, 17, "stage revision");
    assertEq(staged.status, "pending_confirmation", "stage status");
    const confirmed = await s.evalJs(`(() => {
      const button = document.querySelector("#confirm-pending");
      if (!button) throw new Error("missing #confirm-pending");
      button.click();
      return window.__imw.store.getState().revision;
    })()`);
    assertEq(confirmed, 18, "DOM confirm revision");

    const find = await invokeTool(s.cdp, s.sessionId, s.frameId, "find_mapping_counterexample", { expectedRevision: 18 });
    if (!find.roundTrip) throw new Error("find round trip failed");
    const found = JSON.parse(textOf(find.output));
    assertEq(found.personaIds, round === 1 ? ["P2"] : ["P2", "P3", "P4"], "witness");
    const rows = await s.evalJs('document.querySelectorAll("#matrix tbody tr").length');
    assertEq(rows, round === 1 ? 1 : 4, "matrix rows after find");
    if (round === 1) {
      await s.evalJs("new Promise((resolve) => setTimeout(resolve, 0))", { awaitPromise: true });
      const hostileDom = await s.evalJs(`({
        pwned: typeof window.__pwned,
        imageCount: document.querySelectorAll("#pins img, #matrix img").length,
        pinText: document.querySelector("#pins code")?.textContent,
        matrixText: document.querySelector("#matrix td.viol")?.textContent,
      })`);
      assertEq(hostileDom.pwned, "undefined", "hostile confirmed id did not execute");
      assertEq(hostileDom.imageCount, 0, "hostile confirmed id created no image element");
      assertEq(hostileDom.pinText, HOSTILE_ID, "hostile confirmed id is exact pin text");
      assertEq(hostileDom.matrixText, HOSTILE_ID, "hostile confirmed id is exact matrix text");
    }

    const nope = await invokeTool(s.cdp, s.sessionId, s.frameId, "no_such_tool", {});
    if (!nope.sendRejected || nope.cdp?.code !== -32602)
      throw new Error(`unknown tool: want -32602 send rejection, got ${JSON.stringify(nope)}`);

    if (textOf(read.output).includes("CANARY_") || textOf(find.output).includes("CANARY_"))
      throw new Error("CANARY_ leaked through a tool payload");

    ok(`session ${round}: present, 5 tools, stage pending r17, DOM confirm r18, safe find → ${rows} matrix row(s), -32602, no canary (WebMCP.enable ${s.cdpDomainEnabled ? "ok" : "rejected"} — recorded, not asserted)`);
  } finally {
    s.cdp.close();
    await s.chrome.close();
  }
}

// ── layer 3 ──────────────────────────────────────────────────────────────────
async function e2e(baseUrl) {
  const s = await bootSession(baseUrl);
  const trace = [];
  const captureState = () => s.evalJs(`(async () => {
    const snapshot = window.__imw.store.snapshot();
    const authoritative = {
      revision: snapshot.state.revision,
      priority: snapshot.state.priority,
      expressions: snapshot.state.expressions,
      pins: snapshot.state.pins,
    };
    const hash = async (value) => {
      const bytes = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(JSON.stringify(value)),
      );
      return [...new Uint8Array(bytes)]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
    };
    return {
      snapshot,
      stateHash: await hash(snapshot),
      authoritativeHash: await hash(authoritative),
    };
  })()`, { awaitPromise: true });
  const call = async (round, toolName, input) => {
    const before = await captureState();
    const t0 = Date.now();
    const r = await invokeTool(s.cdp, s.sessionId, s.frameId, toolName, input);
    const after = await captureState();
    const text = textOf(r.output);
    trace.push({ round, kind: "tool", toolName, input, invocationId: r.invocationId,
      status: r.status, matched: r.matched,
      stateHashBefore: before.stateHash, stateHashAfter: after.stateHash,
      authoritativeHashBefore: before.authoritativeHash,
      authoritativeHashAfter: after.authoritativeHash,
      snapshotBefore: before.snapshot, snapshotAfter: after.snapshot,
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
      const liveInput = document.querySelector(${JSON.stringify(selector)});
      const error = liveInput.parentElement.querySelector(".expression-error");
      return {
        revisionAfter: window.__imw.store.getState().revision,
        expressionAfter: window.__imw.store.getState().expressions[${JSON.stringify(field)}],
        inputValue: liveInput.value,
        ariaInvalid: liveInput.getAttribute("aria-invalid"),
        errorHidden: error.hidden,
        errorText: error.textContent,
      };
    })()`);
    trace.push({ round, kind: "human-dom", via: "dom-change",
      action: { type: "EDIT_EXPRESSION", field, expr }, ...result });
    return result;
  };
  const humanPriority = async (round, priority) => {
    const selector = "#priority-select";
    const value = priority.join(",");
    const result = await s.evalJs(`(() => {
      const select = document.querySelector(${JSON.stringify(selector)});
      if (!select) throw new Error(${JSON.stringify(`missing ${selector}`)});
      select.value = ${JSON.stringify(value)};
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const state = window.__imw.store.getState();
      return {
        revisionAfter: state.revision,
        priorityAfter: state.priority,
        selectValue: document.querySelector(${JSON.stringify(selector)}).value,
        optionLabels: [...document.querySelector(${JSON.stringify(selector)}).options].map((option) => option.textContent),
        evidenceAllStale: Object.values(state.evidence).every((evidence) => evidence.stale),
        staleBannerVisible: !document.querySelector("#stale-banner").hidden,
      };
    })()`);
    trace.push({ round, kind: "human-dom", via: "dom-change", selector,
      action: { type: "SET_PRIORITY", priority }, ...result });
    return result;
  };
  const humanClick = async (round, selector) => {
    const result = await s.evalJs(`(() => {
      const button = document.querySelector(${JSON.stringify(selector)});
      if (!button) throw new Error(${JSON.stringify(`missing ${selector}`)});
      const renderedVersion = Number(button.dataset.version);
      button.click();
      const state = window.__imw.store.getState();
      return {
        renderedVersion,
        revisionAfter: state.revision,
        pendingVersionAfter: state.pending?.version ?? null,
        pinIdsAfter: state.pins.map((pin) => pin.id),
      };
    })()`);
    trace.push({ round, kind: "human-dom", via: "click", selector, ...result });
    return result;
  };
  try {
    // 1 read → r17
    const r1 = await call(1, "read_mapping_session", {});
    assertEq(r1.p.revision, 17, "round1 revision");
    // 2 hostile proposal renders as text and is discarded; 3 pins then confirm → r18
    const hostile = await call(2, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: [HOSTILE_PIN],
    });
    assertEq(hostile.p.revision, 17, "round2 hostile stage revision");
    const hostileUi = await s.evalJs(`({
      pwned: typeof window.__pwned,
      text: document.querySelector("#pending-list")?.textContent ?? "",
      imageCount: document.querySelectorAll("#pending-list img").length,
      pinCount: window.__imw.store.getState().pins.length,
    })`);
    assertEq(hostileUi.pwned, "undefined", "round2 hostile value did not execute");
    assertEq(hostileUi.text.includes(HOSTILE_PIN.group), true, "round2 hostile value visible as text");
    assertEq(hostileUi.imageCount, 0, "round2 hostile value created no image element");
    assertEq(hostileUi.pinCount, 0, "round2 hostile proposal not auto-confirmed");
    await s.evalJs("window.__oldPendingConfirm = document.querySelector('#confirm-pending')");
    const discarded = await humanClick(2, "#discard-pending");
    assertEq(discarded.revisionAfter, 17, "round2 discard revision");
    assertEq(discarded.pendingVersionAfter, null, "round2 discard clears pending");

    const r2 = await call(2, "stage_mapping_invariants", { expectedRevision: 17, invariants: PINS });
    assertEq(r2.p.revision, 17, "round2 stage revision");
    const staleConfirm = await s.evalJs(`(() => {
      window.__oldPendingConfirm.click();
      const state = window.__imw.store.getState();
      return {
        revision: state.revision,
        pendingVersion: state.pending?.version ?? null,
        pinCount: state.pins.length,
        currentButtonVersion: Number(document.querySelector("#confirm-pending").dataset.version),
        error: document.querySelector("#pending-error").textContent,
      };
    })()`);
    assertEq(staleConfirm.revision, 17, "round2 stale confirm revision");
    assertEq(staleConfirm.pendingVersion, 2, "round2 stale confirm preserves v2");
    assertEq(staleConfirm.pinCount, 0, "round2 stale confirm applies no pins");
    assertEq(staleConfirm.currentButtonVersion, 2, "round2 re-render keeps current version");
    assertEq(staleConfirm.error.includes("STALE_CONFIRM"), true, "round2 stale confirm is visible");
    const stagedA11y = await s.evalJs(`({
      controlsNamed: [...document.querySelectorAll("input, select, button")].every((control) =>
        Boolean(control.getAttribute("aria-label") || control.labels?.length || control.textContent.trim())),
      priorityLabelled: document.querySelector("#priority-select").labels.length === 1,
      politeRegions: ["#pending-rules", "#stale-banner", "#packet-state"].every((selector) =>
        document.querySelector(selector).getAttribute("aria-live") === "polite"),
    })`);
    assertEq(stagedA11y.controlsNamed, true, "round2 every rendered control has an accessible name");
    assertEq(stagedA11y.priorityLabelled, true, "round2 priority select has a programmatic label");
    assertEq(stagedA11y.politeRegions, true, "round2 state regions are polite live regions");
    const confirmed2 = await humanClick(2, "#confirm-pending");
    assertEq(confirmed2.revisionAfter, 18, "round2 confirm revision");
    assertEq(confirmed2.pinIdsAfter, PINS.map((pin) => pin.id), "round2 confirmed pins");
    const unpinLabels = await s.evalJs(`([...document.querySelectorAll("#pins [data-unpin]")]
      .map((button) => button.getAttribute("aria-label")))`);
    assertEq(unpinLabels, PINS.map((pin) => `Unpin invariant ${pin.id}`), "round2 unpin controls are labelled");
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
    // 8 human applies group fix (r20) + real priority control (r21); clean sweep → green packet
    await human(8, { type: "EDIT_EXPRESSION", field: "group", expr: 'String.toLowerCase(user.userType) == "contractor" ? "contractors" : "employees"' });
    const priority8 = await humanPriority(8, ["hris", "ad"]);
    assertEq(priority8.revisionAfter, 21, "round8 revision");
    assertEq(priority8.priorityAfter, ["hris", "ad"], "round8 priority committed through select");
    assertEq(priority8.selectValue, "hris,ad", "round8 select stays synchronized");
    assertEq(priority8.optionLabels, ["ad → hris → okta", "hris → ad → okta"], "round8 select has exactly two choices");
    assertEq(priority8.evidenceAllStale, true, "round8 priority change stales every prior evidence record");
    assertEq(priority8.staleBannerVisible, true, "round8 priority change exposes stale banner");
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
    assertEq(r10.p.revision, 21, "round10 staged revision");
    const confirmed10a = await humanClick(10, "#confirm-pending");
    assertEq(confirmed10a.revisionAfter, 22, "round10 confirmed revision");
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
    assertEq(r10c.p.revision, 22, "round10 replacement staged revision");
    const confirmed10c = await humanClick(10, "#confirm-pending");
    assertEq(confirmed10c.revisionAfter, 23, "round10 replacement confirmed revision");
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

    // 12 invalid input stays local and preserves the complete store + GREEN UI; valid input commits once
    const before12 = await s.evalJs(`({
      snapshot: JSON.stringify(window.__imw.store.snapshot()),
      matrixRows: document.querySelectorAll("#matrix tbody tr").length,
      matrixText: document.querySelector("#matrix tbody").textContent,
      gridFields: [...document.querySelectorAll("#grid input")].map((input) => input.dataset.field),
      otherGridValues: [...document.querySelectorAll("#grid input")]
        .filter((input) => input.dataset.field !== "managerId")
        .map((input) => [input.dataset.field, input.value]),
      packetText: document.querySelector("#packet-state").textContent,
      packetGreen: document.querySelector("#packet-state").classList.contains("green"),
      applyDisabled: document.querySelector("#apply").disabled,
    })`);
    assertEq(before12.packetGreen, true, "round12 starts with GREEN packet");
    assertEq(before12.applyDisabled, false, "round12 starts with apply enabled");
    const invalid12 = await humanExpression(12, "managerId", "user.");
    assertEq(invalid12.revisionAfter, 25, "round12 invalid expression does not bump revision");
    assertEq(invalid12.expressionAfter, "user.managerId", "round12 invalid expression does not commit");
    assertEq(invalid12.inputValue, "user.", "round12 invalid input remains visible");
    assertEq(invalid12.ariaInvalid, "true", "round12 invalid input is marked invalid");
    assertEq(invalid12.errorHidden, false, "round12 inline error is visible");
    assertEq(invalid12.errorText.includes("position 5"), true, "round12 inline error includes parser position");
    const afterInvalid12 = await s.evalJs(`({
      snapshot: JSON.stringify(window.__imw.store.snapshot()),
      matrixRows: document.querySelectorAll("#matrix tbody tr").length,
      matrixText: document.querySelector("#matrix tbody").textContent,
      gridFields: [...document.querySelectorAll("#grid input")].map((input) => input.dataset.field),
      otherGridValues: [...document.querySelectorAll("#grid input")]
        .filter((input) => input.dataset.field !== "managerId")
        .map((input) => [input.dataset.field, input.value]),
      packetText: document.querySelector("#packet-state").textContent,
      packetGreen: document.querySelector("#packet-state").classList.contains("green"),
      applyDisabled: document.querySelector("#apply").disabled,
    })`);
    assertEq(afterInvalid12.snapshot, before12.snapshot, "round12 invalid input leaves complete snapshot byte-identical");
    assertEq(afterInvalid12.matrixRows, before12.matrixRows, "round12 invalid input preserves matrix rows");
    assertEq(afterInvalid12.matrixText, before12.matrixText, "round12 invalid input preserves matrix text");
    assertEq(afterInvalid12.gridFields, before12.gridFields, "round12 invalid input preserves grid fields");
    assertEq(afterInvalid12.otherGridValues, before12.otherGridValues, "round12 invalid input preserves other grid values");
    assertEq(afterInvalid12.packetText, before12.packetText, "round12 invalid input preserves packet text");
    assertEq(afterInvalid12.packetGreen, true, "round12 invalid input preserves GREEN packet");
    assertEq(afterInvalid12.applyDisabled, false, "round12 invalid input leaves apply enabled");

    const valid12 = await humanExpression(12, "managerId", "user.managerId");
    assertEq(valid12.revisionAfter, invalid12.revisionAfter + 1, "round12 valid expression bumps exactly once");
    assertEq(valid12.revisionAfter, 26, "round12 valid expression revision");
    assertEq(valid12.expressionAfter, "user.managerId", "round12 valid expression commits");
    assertEq(valid12.ariaInvalid, "false", "round12 valid expression clears invalid state");
    assertEq(valid12.errorHidden, true, "round12 valid expression clears inline error");

    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const out = `eval/out/relay-${sha}.json`;
    await writeFile(new URL(`../${out}`, import.meta.url),
      JSON.stringify({ sha, when: new Date().toISOString(), rounds: 12, trace }, null, 2));
    ok(`e2e: 12 rounds green — stale rejection (r5), mismatch recovery (r9), pin-coverage flip (r10), packet freshness recovery (r11), inline validation (r12); trace → ${out}`);
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
    console.log("E2E PASS (12 rounds)");
  } else {
    fail(`unknown mode ${MODE}`);
  }
} catch (e) {
  fail(String(e.message ?? e));
} finally {
  server.close();
}
process.exit(0);
