#!/usr/bin/env node
// Layer-2 (--smoke) and layer-3 (--e2e) gates. Presence is proven by the
// completed round trip (WebMCP.enable returns OK even with no page API — measured;
// recorded, never asserted). By-name calls go over the CDP WebMCP domain.
import { execSync } from "node:child_process";
import { readFile, rename, writeFile } from "node:fs/promises";
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
  const boundary = await evalJs(`(async () => {
    const inspected = window.__imw.state();
    const originalRevision = inspected.revision;
    inspected.revision = originalRevision + 1000;
    const tools = await document.modelContext.getTools();
    const badge = document.querySelector("#tools-badge").textContent;
    return {
      frozen: Object.isFrozen(window.__imw),
      functionsOnly: Object.values(window.__imw).every((value) => typeof value === "function"),
      forbiddenAbsent: ["store", "dispatch", "restore", "runTool", "render"]
        .every((key) => !(key in window.__imw)),
      cloneIsolated: window.__imw.state().revision === originalRevision,
      inspectedCount: window.__imw.registeredToolCount(),
      registryCount: tools.length,
      badge,
      copyButtonsEnabled: [...document.querySelectorAll("#copy-prompt-1, #copy-prompt-2")]
        .every((button) => !button.disabled),
    };
  })()`, { awaitPromise: true });
  if (!boundary.frozen || !boundary.functionsOnly || !boundary.forbiddenAbsent || !boundary.cloneIsolated)
    throw new Error(`inspection boundary failed: ${JSON.stringify(boundary)}`);
  if (boundary.inspectedCount !== boundary.registryCount
      || !boundary.badge.includes(`tools: ${boundary.registryCount}/5 registered`))
    throw new Error(`registration count mismatch: ${JSON.stringify(boundary)}`);
  if (!boundary.copyButtonsEnabled)
    throw new Error(`copy buttons stayed disabled after registration: ${JSON.stringify(boundary)}`);
  const { frameTree } = await cdp.send("Page.getFrameTree", {}, sessionId);
  return { chrome, cdp, sessionId, frameId: frameTree.frame.id, evalJs, cdpDomainEnabled };
}

async function pressKey(s, key, code, virtualKeyCode) {
  const text = code === "Enter" ? "\r" : key.length === 1 ? key : "";
  const params = { key, code, windowsVirtualKeyCode: virtualKeyCode };
  await s.cdp.send("Input.dispatchKeyEvent", {
    type: text ? "keyDown" : "rawKeyDown",
    text,
    unmodifiedText: text,
    ...params,
  }, s.sessionId);
  await s.cdp.send("Input.dispatchKeyEvent", { type: "keyUp", ...params }, s.sessionId);
}

async function viewportState(s, width) {
  await s.cdp.send("Emulation.setDeviceMetricsOverride", {
    width,
    height: 568,
    deviceScaleFactor: 1,
    mobile: false,
  }, s.sessionId);
  await s.evalJs("new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))", {
    awaitPromise: true,
  });
  return s.evalJs(`({
    innerWidth,
    documentWidth: document.documentElement.scrollWidth,
    bodyWidth: document.body.scrollWidth,
    regions: [...document.querySelectorAll(".table-scroll")].map((container) => ({
      table: container.querySelector("table")?.id
        || (container.closest("#provenance") ? "provenance" : "unknown"),
      clientWidth: container.clientWidth,
      scrollWidth: container.scrollWidth,
      tabindex: container.getAttribute("tabindex"),
      role: container.getAttribute("role"),
      label: container.getAttribute("aria-label"),
      expectedLabel: container.dataset.scrollLabel,
    })),
  })`);
}

async function assertResponsiveState(s, phase, requiredAt320) {
  for (const width of [320, 390, 1024, 1440]) {
    const state = await viewportState(s, width);
    if (state.documentWidth > state.innerWidth || state.bodyWidth > state.innerWidth)
      throw new Error(`${phase} ${width}px: page overflow ${JSON.stringify(state)}`);
    for (const region of state.regions) {
      const overflows = region.scrollWidth > region.clientWidth + 1;
      if (overflows) {
        assertEq(region.tabindex, "0", `${phase} ${width}px ${region.table} tabindex`);
        assertEq(region.role, "region", `${phase} ${width}px ${region.table} role`);
        assertEq(region.label, region.expectedLabel, `${phase} ${width}px ${region.table} label`);
      } else {
        assertEq(region.tabindex, null, `${phase} ${width}px ${region.table} no tabindex`);
        assertEq(region.role, null, `${phase} ${width}px ${region.table} no role`);
        assertEq(region.label, null, `${phase} ${width}px ${region.table} no aria-label`);
      }
    }
    if (width === 320) {
      for (const table of requiredAt320) {
        const region = state.regions.find((candidate) => candidate.table === table);
        if (!region || region.scrollWidth <= region.clientWidth + 1)
          throw new Error(`${phase} 320px: ${table} must overflow internally: ${JSON.stringify(state)}`);
      }
    }
  }
}

const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];
const COPY_PROMPT_1 = "Read the mapping session on this page. Stage exactly these three invariants and then stop and tell me to confirm them on the page: (1) contractors must never map into the employees group; (2) if no source supplies managerId the target must stay null; (3) hris is the source of truth for department. Do not call any other tool until I tell you I confirmed.";
const UNCOMMITTED_DRAFT_REASON = "visible expression drafts must be committed or reverted by the human before running this tool; then call read_mapping_session again";
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

async function initializationFailureSession(baseUrl, fixtureCase, verifyFavicon) {
  const cdpPort = 9800 + Math.floor(Math.random() * 400);
  const chrome = await launchChrome({ cdpPort, url: "about:blank" });
  const cdp = await connect(chrome.wsUrl);
  const sessionId = await attachToPage(cdp, "about:blank");
  const s = { cdp, sessionId };
  const evalJs = async (expression, { awaitPromise = false } = {}) => {
    const result = await cdp.send("Runtime.evaluate", {
      expression,
      returnByValue: true,
      awaitPromise,
    }, sessionId);
    if (result.exceptionDetails)
      throw new Error(`page eval threw: ${result.exceptionDetails.text} ${result.exceptionDetails.exception?.description ?? ""}`);
    return result.result.value;
  };
  let personasRequests = 0;
  let initializationErrors = 0;
  const faviconResponses = [];
  const requestedUrls = [];
  const fulfillments = [];
  const off = cdp.on((message) => {
    if (message.sessionId !== sessionId) return;
    if (message.method === "Network.requestWillBeSent")
      requestedUrls.push(message.params.request.url);
    if (message.method === "Network.responseReceived"
        && new URL(message.params.response.url).pathname === "/favicon.svg")
      faviconResponses.push(message.params.response.status);
    if (message.method === "Runtime.consoleAPICalled"
        && message.params.type === "error"
        && message.params.args.some((argument) =>
          argument.value === "IdentityMap Witness demo data failed validation"))
      initializationErrors += 1;
    if (message.method === "Fetch.requestPaused"
        && new URL(message.params.request.url).pathname === "/data/personas.json") {
      personasRequests += 1;
      fulfillments.push(cdp.send("Fetch.fulfillRequest", {
        requestId: message.params.requestId,
        responseCode: 200,
        responseHeaders: [{ name: "Content-Type", value: "application/json" }],
        body: Buffer.from(fixtureCase.body).toString("base64"),
      }, sessionId));
    }
  });
  const waitFor = async (predicate, what) => {
    for (let attempt = 0; attempt < 80; attempt++) {
      if (await predicate().catch(() => false)) return;
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`${fixtureCase.name}: timed out waiting for ${what}`);
  };
  const readFailureUi = () => evalJs(`(async () => ({
    errorHidden: document.querySelector("#initialization-error").hidden,
    errorText: document.querySelector("#initialization-error").textContent,
    errorRole: document.querySelector("#initialization-error").getAttribute("role"),
    errorAtomic: document.querySelector("#initialization-error").getAttribute("aria-atomic"),
    tools: document.querySelector("#tools-badge").textContent,
    revision: document.querySelector("#rev-badge").textContent,
    copy1Disabled: document.querySelector("#copy-prompt-1").disabled,
    copy2Disabled: document.querySelector("#copy-prompt-2").disabled,
    priorityDisabled: document.querySelector("#priority-select").disabled,
    applyDisabled: document.querySelector("#apply").disabled,
    resetDisabled: document.querySelector("#reset-demo").disabled,
    inspectionExposed: Object.hasOwn(window, "__imw"),
    storeExposed: Object.hasOwn(window, "store"),
    toolCount: typeof document.modelContext?.getTools === "function"
      ? (await document.modelContext.getTools()).length
      : -1,
  }))()`, { awaitPromise: true });
  const expectedUi = {
    errorHidden: false,
    errorText: "Demo data could not be loaded. Reload the page to retry.",
    errorRole: "alert",
    errorAtomic: "true",
    tools: "tools: unavailable",
    revision: "r—",
    copy1Disabled: true,
    copy2Disabled: true,
    priorityDisabled: true,
    applyDisabled: true,
    resetDisabled: false,
    inspectionExposed: false,
    storeExposed: false,
    toolCount: 0,
  };

  try {
    await cdp.send("Runtime.enable", {}, sessionId);
    await cdp.send("Network.enable", {}, sessionId);
    await cdp.send("Network.setCacheDisabled", { cacheDisabled: true }, sessionId);
    await cdp.send("Fetch.enable", {
      patterns: [{ urlPattern: "*data/personas.json*", requestStage: "Request" }],
    }, sessionId);
    await cdp.send("WebMCP.enable", {}, sessionId);
    await cdp.send("Page.navigate", { url: baseUrl }, sessionId);
    await waitFor(
      () => evalJs('document.querySelector("#initialization-error")?.hidden === false'),
      "initialization alert",
    );
    await waitFor(async () => initializationErrors === 1, "one console error");
    assertEq(personasRequests, 1, `${fixtureCase.name} initial personas request count`);
    assertEq(await readFailureUi(), expectedUi, `${fixtureCase.name} failure UI`);

    await evalJs('document.querySelector("#reset-demo").focus()');
    await pressKey(s, "Enter", "Enter", 13);
    await waitFor(async () => personasRequests >= 2, "reset personas request");
    await waitFor(
      () => evalJs('document.querySelector("#initialization-error")?.hidden === false'),
      "reset initialization alert",
    );
    await waitFor(async () => initializationErrors === 2, "one console error after reset");
    assertEq(personasRequests, 2, `${fixtureCase.name} reset personas request count`);
    assertEq(await readFailureUi(), expectedUi, `${fixtureCase.name} stable reset failure UI`);

    if (verifyFavicon) {
      await waitFor(async () => faviconResponses.includes(200), "favicon response");
      assertEq(requestedUrls.some((url) => new URL(url).pathname === "/favicon.ico"), false,
        "browser made no favicon.ico request");
    }
  } finally {
    off();
    await Promise.allSettled(fulfillments);
    cdp.close();
    await chrome.close();
  }
}

async function initializationFailureCoverage(baseUrl) {
  const valid = JSON.parse(await readFile(new URL("../data/personas.json", import.meta.url), "utf8"));
  const missing = structuredClone(valid).slice(0, -1);
  const duplicate = structuredClone(valid);
  duplicate[7].id = "P1";
  const wrongProfile = structuredClone(valid);
  wrongProfile[0].profiles.ad = [];
  const cases = [
    { name: "invalid JSON", body: "not-json" },
    { name: "empty array", body: "[]" },
    { name: "missing persona", body: JSON.stringify(missing) },
    { name: "duplicate ID", body: JSON.stringify(duplicate) },
    { name: "wrong profile structure", body: JSON.stringify(wrongProfile) },
  ];
  for (const [index, fixtureCase] of cases.entries())
    await initializationFailureSession(baseUrl, fixtureCase, index === 0);
  ok("initialization: 5 fresh-profile fail-closed cases, retry stability, zero tools/store, favicon network clean");
}

// ── layer 2 ──────────────────────────────────────────────────────────────────
async function smokeSession(round, baseUrl) {
  const s = await bootSession(baseUrl);
  try {
    const present = await s.evalJs('typeof document.modelContext?.registerTool === "function"');
    if (!present) throw new Error("document.modelContext absent — flag missing or engine mismatch");
    const registered = await s.evalJs(`document.modelContext.getTools().then((tools) => tools.map((tool) => ({
      name: tool.name,
      annotations: tool.annotations,
      inputSchema: typeof tool.inputSchema === "string" ? JSON.parse(tool.inputSchema) : tool.inputSchema,
    })))`, { awaitPromise: true });
    if (registered.length !== 5) throw new Error(`getTools() length ${registered.length}, want 5`);
    const expectedNames = [
      "read_mapping_session",
      "stage_mapping_invariants",
      "find_mapping_counterexample",
      "preview_mapping_patch",
      "prepare_mapping_review",
    ];
    assertEq(registered.map((tool) => tool.name).sort(), [...expectedNames].sort(), "registered tool names");
    const annotations = Object.fromEntries(registered.map((tool) => [tool.name, tool.annotations]));
    assertEq(annotations, Object.fromEntries([...expectedNames].sort().map((name) => [name, {
      readOnlyHint: name === "read_mapping_session",
      untrustedContentHint: true,
    }])), "registered annotations");
    const previewSchema = registered.find((tool) => tool.name === "preview_mapping_patch").inputSchema;
    assertEq(previewSchema.properties.field.enum,
      ["displayName", "group", "managerId", "department", "email"], "preview field enum");
    assertEq(previewSchema.properties.expr.maxLength, 512, "preview expression budget");

    if (round === 1) {
      const copyFallback = await s.evalJs(`(async () => {
        Object.defineProperty(navigator, "clipboard", {
          configurable: true,
          value: { writeText: () => Promise.reject(new Error("clipboard rejected")) },
        });
        Object.defineProperty(document, "execCommand", {
          configurable: true,
          value: () => false,
        });
        document.querySelector("#copy-prompt-1").click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        const textarea = document.querySelector("#prompt-fallback");
        const failure = {
          hidden: textarea.hidden,
          value: textarea.value,
          readOnly: textarea.readOnly,
          active: document.activeElement === textarea,
          selectionStart: textarea.selectionStart,
          selectionEnd: textarea.selectionEnd,
          status: document.querySelector("#copy-status").textContent,
          statusError: document.querySelector("#copy-status").classList.contains("error"),
        };
        navigator.clipboard.writeText = () => Promise.resolve();
        document.querySelector("#copy-prompt-2").click();
        await new Promise((resolve) => setTimeout(resolve, 0));
        return { failure, success: {
          hidden: textarea.hidden,
          value: textarea.value,
          status: document.querySelector("#copy-status").textContent,
          statusError: document.querySelector("#copy-status").classList.contains("error"),
        } };
      })()`, { awaitPromise: true });
      assertEq(copyFallback.failure, {
        hidden: false,
        value: COPY_PROMPT_1,
        readOnly: true,
        active: true,
        selectionStart: 0,
        selectionEnd: COPY_PROMPT_1.length,
        status: "Copy failed — prompt selected below; press ⌘C or Ctrl+C",
        statusError: true,
      }, "clipboard failure exposes selected prompt fallback");
      assertEq(copyFallback.success, {
        hidden: true,
        value: "",
        status: "copied — prompt 2 ready to paste",
        statusError: false,
      }, "clipboard success clears prompt fallback");
    }

    const read = await invokeTool(s.cdp, s.sessionId, s.frameId, "read_mapping_session", {});
    if (!read.roundTrip) throw new Error(`read round trip failed: ${JSON.stringify(read)}`);
    const payload = JSON.parse(textOf(read.output));
    assertEq(payload.revision, 17, "read revision");
    assertEq(payload.personaCount, 8, "personaCount");

    const beforeOversized = await s.evalJs("JSON.stringify(window.__imw.snapshot())");
    const oversized = await invokeTool(s.cdp, s.sessionId, s.frameId, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: [{
        id: "oversized",
        type: "forbidden_group",
        personaCategory: "contractor",
        group: "g".repeat(10_000),
      }],
    });
    if (!oversized.roundTrip) throw new Error("oversized stage round trip failed");
    const oversizedPayload = JSON.parse(textOf(oversized.output));
    assertEq(oversizedPayload.error.code, "INVALID_INPUT", "oversized stage error");
    assertEq(await s.evalJs("JSON.stringify(window.__imw.snapshot())"), beforeOversized,
      "oversized stage complete snapshot");

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
      return window.__imw.state().revision;
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
    const snapshot = window.__imw.snapshot();
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
  const captureToolState = () => s.evalJs(`(async () => {
    const snapshot = window.__imw.toolSnapshotBefore();
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
    const invocationBefore = await captureState();
    const t0 = Date.now();
    const r = await invokeTool(s.cdp, s.sessionId, s.frameId, toolName, input);
    const before = toolName === "read_mapping_session" ? invocationBefore : await captureToolState();
    const after = await captureState();
    const text = textOf(r.output);
    const payload = text ? JSON.parse(text) : null;
    assertEq(before.snapshot, invocationBefore.snapshot,
      `round ${round} ${toolName} handler entry matches invocation`);
    assertEq(before.stateHash, invocationBefore.stateHash,
      `round ${round} ${toolName} handler state hash matches invocation`);
    assertEq(before.authoritativeHash, invocationBefore.authoritativeHash,
      `round ${round} ${toolName} handler authoritative hash matches invocation`);
    if (payload?.error)
      assertEq(after.snapshot, invocationBefore.snapshot,
        `round ${round} ${toolName} failed invocation rollback`);
    trace.push({ round, kind: "tool", toolName, input, invocationId: r.invocationId,
      status: r.status, matched: r.matched,
      invocationStateHashBefore: invocationBefore.stateHash,
      invocationAuthoritativeHashBefore: invocationBefore.authoritativeHash,
      invocationSnapshotBefore: invocationBefore.snapshot,
      stateHashBefore: before.stateHash, stateHashAfter: after.stateHash,
      authoritativeHashBefore: before.authoritativeHash,
      authoritativeHashAfter: after.authoritativeHash,
      snapshotBefore: before.snapshot, snapshotAfter: after.snapshot,
      ms: Date.now() - t0, payload });
    if (text?.includes("CANARY_")) throw new Error(`round ${round}: canary leak`);
    return { r, p: payload };
  };
  const humanExpression = async (round, field, expr) => {
    const selector = `#grid input[data-field="${field}"]`;
    const result = await s.evalJs(`(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      if (!input) throw new Error(${JSON.stringify(`missing ${selector}`)});
      input.focus();
      input.value = ${JSON.stringify(expr)};
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const liveInput = document.querySelector(${JSON.stringify(selector)});
      const error = liveInput.parentElement.querySelector(".expression-error");
      return {
        revisionAfter: window.__imw.state().revision,
        expressionAfter: window.__imw.state().expressions[${JSON.stringify(field)}],
        inputValue: liveInput.value,
        ariaInvalid: liveInput.getAttribute("aria-invalid"),
        errorHidden: error.hidden,
        errorText: error.textContent,
        active: document.activeElement === liveInput,
      };
    })()`);
    trace.push({ round, kind: "human-dom", via: "dom-change", selector,
      action: { type: "EDIT_EXPRESSION", field, expr }, ...result });
    return result;
  };
  const humanPriority = async (round, priority) => {
    const selector = "#priority-select";
    const value = priority.join(",");
    const result = await s.evalJs(`(() => {
      const select = document.querySelector(${JSON.stringify(selector)});
      if (!select) throw new Error(${JSON.stringify(`missing ${selector}`)});
      select.focus();
      select.value = ${JSON.stringify(value)};
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const state = window.__imw.state();
      return {
        revisionAfter: state.revision,
        priorityAfter: state.priority,
        selectValue: document.querySelector(${JSON.stringify(selector)}).value,
        optionLabels: [...document.querySelector(${JSON.stringify(selector)}).options].map((option) => option.textContent),
        evidenceAllStale: Object.values(state.evidence).every((evidence) => evidence.stale),
        staleBannerVisible: !document.querySelector("#stale-banner").hidden,
        active: document.activeElement === document.querySelector(${JSON.stringify(selector)}),
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
      button.focus();
      button.click();
      const state = window.__imw.state();
      return {
        renderedVersion,
        revisionAfter: state.revision,
        pendingVersionAfter: state.pending?.version ?? null,
        pinIdsAfter: state.pins.map((pin) => pin.id),
        activeId: document.activeElement.id,
      };
    })()`);
    trace.push({ round, kind: "human-dom", via: "click", selector, ...result });
    return result;
  };
  try {
    const copyButtonCount = await s.evalJs('document.querySelectorAll("#copy-prompt-1, #copy-prompt-2").length');
    assertEq(copyButtonCount, 2, "judge mode copy button count");
    const tagline = await s.evalJs('document.querySelector(".tagline")?.textContent');
    assertEq(tagline, "finds the smallest set of synthetic people proving every violated rule on an unsaved draft — and the proof dies when you edit what it depended on", "judge mode tagline");
    await assertResponsiveState(s, "initial mapping", ["grid"]);
    // 1 read → r17
    const r1 = await call(1, "read_mapping_session", {});
    assertEq(r1.p.revision, 17, "round1 revision");
    assertEq(await s.evalJs("window.__imw.toolSnapshotBefore()"), null,
      "round1 read leaves tool snapshot bookkeeping untouched");
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
      pinCount: window.__imw.state().pins.length,
    })`);
    assertEq(hostileUi.pwned, "undefined", "round2 hostile value did not execute");
    assertEq(hostileUi.text.includes(HOSTILE_PIN.group), true, "round2 hostile value visible as text");
    assertEq(hostileUi.imageCount, 0, "round2 hostile value created no image element");
    assertEq(hostileUi.pinCount, 0, "round2 hostile proposal not auto-confirmed");
    await s.evalJs("window.__oldPendingConfirm = document.querySelector('#confirm-pending')");
    const discarded = await humanClick(2, "#discard-pending");
    assertEq(discarded.revisionAfter, 17, "round2 discard revision");
    assertEq(discarded.pendingVersionAfter, null, "round2 discard clears pending");
    assertEq(discarded.activeId, "copy-prompt-1", "round2 discard focuses the setup prompt");

    const r2 = await call(2, "stage_mapping_invariants", { expectedRevision: 17, invariants: PINS });
    assertEq(r2.p.revision, 17, "round2 stage revision");
    const staleConfirm = await s.evalJs(`(() => {
      window.__oldPendingConfirm.click();
      const state = window.__imw.state();
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
    trace.push({ round: 2, kind: "human-dom", via: "click", selector: "#confirm-pending",
      detached: true, renderedVersion: 1, revisionAfter: staleConfirm.revision });
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
    assertEq(confirmed2.activeId, "copy-prompt-2", "round2 confirm focuses the next-step prompt");
    const unpinLabels = await s.evalJs(`([...document.querySelectorAll("#pins [data-unpin]")]
      .map((button) => button.getAttribute("aria-label")))`);
    assertEq(unpinLabels, PINS.map((pin) => `Unpin invariant ${pin.id}`), "round2 unpin controls are labelled");
    // 3 find → witness [P2,P3,P4], evidence E1
    const r3 = await call(3, "find_mapping_counterexample", { expectedRevision: 18 });
    assertEq(r3.p.personaIds, ["P2", "P3", "P4"], "round3 witness");
    assertEq(r3.p.evidenceIds, ["E-1"], "round3 evidence id");
    assertEq(await s.evalJs(`({
      hidden: document.querySelector("#witness-summary").hidden,
      text: document.querySelector("#witness-summary").textContent,
    })`), {
      hidden: false,
      text: "Minimal witness (3): P2, P3, P4 · 4 violation rows, including alternate witnesses",
    }, "round3 witness summary");
    const matrixButtons = await s.evalJs(`([...document.querySelectorAll(".matrix-select")].map((button) => ({
      personaId: button.dataset.personaId,
      field: button.dataset.field,
      invariantId: button.closest("tr").querySelector("td.viol").textContent,
      name: button.getAttribute("aria-label"),
      controls: button.getAttribute("aria-controls"),
      expanded: button.getAttribute("aria-expanded"),
    })))`);
    assertEq(matrixButtons.length, r3.p.violations.length, "round3 matrix button count");
    assertEq(matrixButtons.map((button) => button.name), r3.p.violations.map((violation) =>
      `Show provenance for persona ${violation.personaId}, field ${violation.field}, invariant ${violation.invariantId}`),
    "round3 matrix button accessible names");
    assertEq(matrixButtons.every((button) => button.controls === "provenance"), true,
      "round3 matrix buttons control provenance");
    assertEq(matrixButtons.every((button) => button.expanded === "false"), true,
      "round3 matrix buttons start collapsed");
    const firstMatrixButton = matrixButtons[0];
    assertEq(await s.evalJs(`(() => {
      document.querySelector(".matrix-select").focus();
      return document.activeElement === document.querySelector(".matrix-select");
    })()`), true, "round3 first matrix button focused");
    await pressKey(s, "Enter", "Enter", 13);
    const enterState = await s.evalJs(`(() => {
      const buttons = [...document.querySelectorAll(".matrix-select")];
      const target = buttons.find((button) =>
        button.dataset.personaId === ${JSON.stringify(firstMatrixButton.personaId)}
        && button.dataset.field === ${JSON.stringify(firstMatrixButton.field)});
      return {
        active: document.activeElement === target,
        expanded: target.getAttribute("aria-expanded"),
        expandedCount: buttons.filter((button) => button.getAttribute("aria-expanded") === "true").length,
        provenanceHidden: document.querySelector("#provenance").hidden,
        railText: document.querySelector("#rail").textContent,
      };
    })()`);
    assertEq(enterState.active, true, "round3 Enter restores matrix focus");
    assertEq(enterState.expanded, "true", "round3 Enter expands selected violation");
    assertEq(enterState.expandedCount, 1, "round3 Enter leaves one expanded violation");
    assertEq(enterState.provenanceHidden, false, "round3 Enter opens provenance");
    assertEq(enterState.railText.includes(`${firstMatrixButton.personaId} · ${firstMatrixButton.field}`), true,
      "round3 Enter shows selected provenance");

    const nextMatrixButton = matrixButtons.find((button) =>
      button.field === "department"
      && (button.personaId !== firstMatrixButton.personaId || button.field !== firstMatrixButton.field));
    if (!nextMatrixButton) throw new Error("round3 missing a second department violation for Space test");
    assertEq(await s.evalJs(`(() => {
      const target = [...document.querySelectorAll(".matrix-select")].find((button) =>
        button.dataset.personaId === ${JSON.stringify(nextMatrixButton.personaId)}
        && button.dataset.field === ${JSON.stringify(nextMatrixButton.field)});
      target.focus();
      return document.activeElement === target;
    })()`), true, "round3 second matrix button focused");
    await pressKey(s, " ", "Space", 32);
    const spaceState = await s.evalJs(`(() => {
      const buttons = [...document.querySelectorAll(".matrix-select")];
      const previous = buttons.find((button) =>
        button.dataset.personaId === ${JSON.stringify(firstMatrixButton.personaId)}
        && button.dataset.field === ${JSON.stringify(firstMatrixButton.field)});
      const target = buttons.find((button) =>
        button.dataset.personaId === ${JSON.stringify(nextMatrixButton.personaId)}
        && button.dataset.field === ${JSON.stringify(nextMatrixButton.field)});
      return {
        active: document.activeElement === target,
        previousExpanded: previous.getAttribute("aria-expanded"),
        targetExpanded: target.getAttribute("aria-expanded"),
        expandedCount: buttons.filter((button) => button.getAttribute("aria-expanded") === "true").length,
        provenanceHidden: document.querySelector("#provenance").hidden,
        provenanceTable: Boolean(document.querySelector("#provenance .table-scroll table")),
        railText: document.querySelector("#rail").textContent,
      };
    })()`);
    assertEq(spaceState.active, true, "round3 Space restores matrix focus");
    assertEq(spaceState.previousExpanded, "false", "round3 Space collapses previous violation");
    assertEq(spaceState.targetExpanded, "true", "round3 Space expands new violation");
    assertEq(spaceState.expandedCount, 1, "round3 Space leaves one expanded violation");
    assertEq(spaceState.provenanceHidden, false, "round3 Space keeps provenance open");
    assertEq(spaceState.provenanceTable, true, "round3 department provenance renders a table");
    assertEq(spaceState.railText.includes(`${nextMatrixButton.personaId} · ${nextMatrixButton.field}`), true,
      "round3 Space switches provenance content");
    await assertResponsiveState(s, "dynamic matrix", ["matrix", "provenance"]);
    const E1 = r3.p.evidenceIds;
    // 4 human fixes managerId (r19); E1 must go stale — and only via fingerprint
    const manager4 = await humanExpression(4, "managerId", "user.managerId");
    assertEq(manager4.revisionAfter, 19, "round4 revision");
    assertEq(manager4.expressionAfter, "user.managerId", "round4 managerId expression");
    assertEq(manager4.active, true, "round4 managerId edit preserves input focus");
    const e1stale = await s.evalJs(`window.__imw.state().evidence[${JSON.stringify(E1[0])}].stale`);
    assertEq(e1stale, true, "round4 E1 stale");
    assertEq(await s.evalJs('!document.querySelector("#stale-banner").hidden'), true,
      "round4 managerId edit exposes stale banner");
    assertEq(await s.evalJs(`({
      hidden: document.querySelector("#witness-summary").hidden,
      stale: document.querySelector("#witness-summary").classList.contains("stale"),
      text: document.querySelector("#witness-summary").textContent,
    })`), {
      hidden: false,
      stale: true,
      text: "Minimal witness (3): P2, P3, P4 · 4 violation rows, including alternate witnesses · STALE",
    }, "round4 stale witness summary");
    // 5 prepare over stale E1 MUST fail
    const r5 = await call(5, "prepare_mapping_review", { expectedRevision: 19, evidenceIds: E1 });
    assertEq(r5.p.error.code, "STALE_EVIDENCE", "round5 code");
    assertEq(r5.p.error.staleIds, E1, "round5 staleIds");
    // 6 re-find: P3 fixed, witness shrinks to [P2,P4]
    const r6 = await call(6, "find_mapping_counterexample", { expectedRevision: 19 });
    assertEq(r6.p.personaIds, ["P2", "P4"], "round6 witness");
    assertEq(r6.p.violations.length, 3, "round6 violations");
    assertEq(r6.p.evidenceIds, ["E-2"], "round6 evidence id");
    assertEq(await s.evalJs(`({
      hidden: document.querySelector("#witness-summary").hidden,
      stale: document.querySelector("#witness-summary").classList.contains("stale"),
      text: document.querySelector("#witness-summary").textContent,
    })`), {
      hidden: false,
      stale: false,
      text: "Minimal witness (2): P2, P4 · 3 violation rows, including alternate witnesses",
    }, "round6 witness summary");
    // 7 preview the group fix over P2 — draft untouched
    const r7 = await call(7, "preview_mapping_patch", {
      expectedRevision: 19, field: "group",
      expr: 'String.toLowerCase(user.userType) == "contractor" ? "contractors" : "employees"',
      personaIds: ["P2"] });
    assertEq(r7.p.diffs, [{ personaId: "P2", field: "group", before: "employees", after: "contractors" }], "round7 diff");
    assertEq(r7.p.remainingViolations, 0, "round7 remaining");
    assertEq(r7.p.evidenceId, "E-3", "round7 evidence id");
    const rev7 = await s.evalJs("window.__imw.state().revision");
    assertEq(rev7, 19, "round7 preview must not bump revision");
    // 8 human applies group fix (r20), re-finds P4, then changes priority (r21); clean sweep → green packet
    const group8 = await humanExpression(8, "group", 'String.toLowerCase(user.userType) == "contractor" ? "contractors" : "employees"');
    assertEq(group8.revisionAfter, 20, "round8 group revision");
    assertEq(group8.expressionAfter, 'String.toLowerCase(user.userType) == "contractor" ? "contractors" : "employees"', "round8 group expression");
    assertEq(group8.active, true, "round8 group edit preserves input focus");
    const r8w = await call(8, "find_mapping_counterexample", { expectedRevision: 20 });
    assertEq(r8w.p.personaIds, ["P4"], "round8 r20 witness");
    assertEq(r8w.p.violations.length, 2, "round8 r20 violations");
    assertEq(r8w.p.cleanSweep, false, "round8 r20 is not a clean sweep");
    assertEq(r8w.p.evidenceIds, ["E-4"], "round8 r20 evidence id");
    assertEq(await s.evalJs(`({
      hidden: document.querySelector("#witness-summary").hidden,
      text: document.querySelector("#witness-summary").textContent,
    })`), {
      hidden: false,
      text: "Minimal witness (1): P4 · 2 violation rows, including alternate witnesses",
    }, "round8 r20 witness summary");
    const priority8 = await humanPriority(8, ["hris", "ad"]);
    assertEq(priority8.revisionAfter, 21, "round8 revision");
    assertEq(priority8.priorityAfter, ["hris", "ad"], "round8 priority committed through select");
    assertEq(priority8.selectValue, "hris,ad", "round8 select stays synchronized");
    assertEq(priority8.optionLabels, ["ad → hris → okta", "hris → ad → okta"], "round8 select has exactly two choices");
    assertEq(priority8.evidenceAllStale, true, "round8 priority change stales every prior evidence record");
    assertEq(priority8.staleBannerVisible, true, "round8 priority change exposes stale banner");
    assertEq(priority8.active, true, "round8 priority change preserves select focus");
    const r8 = await call(8, "find_mapping_counterexample", { expectedRevision: 21 });
    assertEq(r8.p.cleanSweep, true, "round8 clean sweep");
    assertEq(r8.p.fullSweep, true, "round8 full sweep");
    assertEq(r8.p.evidenceIds, ["E-5"], "round8 clean-sweep evidence id");
    const rows8 = await s.evalJs('document.querySelectorAll("#matrix tbody tr").length');
    assertEq(rows8, 0, "round8 clean sweep clears matrix");
    assertEq(await s.evalJs(`({
      hidden: document.querySelector("#witness-summary").hidden,
      text: document.querySelector("#witness-summary").textContent,
    })`), { hidden: true, text: "" }, "round8 clean sweep hides witness summary");
    const allClear8 = await s.evalJs('!document.querySelector("#all-clear").hidden && document.querySelector("#all-clear").textContent.includes("clean sweep — 0 violations across 8 personas at r21")');
    assertEq(allClear8, true, "round8 all-clear visible");
    const E3 = r8.p.evidenceIds;
    const r8b = await call(8, "prepare_mapping_review", { expectedRevision: 21, evidenceIds: E3 });
    assertEq(r8b.p.blockers, [], "round8 packet green");
    assertEq(r8b.p.packetId, "PKT-6", "round8 packet id");
    // 9 recovery: wrong expectedRevision → REVISION_MISMATCH with currentRevision → one retry works
    const r9 = await call(9, "find_mapping_counterexample", { expectedRevision: 17 });
    assertEq(r9.p.error.code, "REVISION_MISMATCH", "round9 code");
    assertEq(r9.p.error.currentRevision, 21, "round9 currentRevision");
    const r9b = await call(9, "find_mapping_counterexample", { expectedRevision: r9.p.error.currentRevision });
    assertEq(r9b.p.cleanSweep, true, "round9 recovery lands on the clean sweep");
    assertEq(r9b.p.fullSweep, true, "round9 recovery covers every confirmed pin");
    assertEq(r9b.p.evidenceIds, ["E-7"], "round9 recovery evidence id");
    // 10 pin add → packet incomplete-by-coverage; unpin → green again
    const r10 = await call(10, "stage_mapping_invariants", { expectedRevision: 21, invariants: [
      ...PINS, { id: "pin-extra", type: "forbidden_group", personaCategory: "nobody", group: "nothing" }] });
    assertEq(r10.p.revision, 21, "round10 staged revision");
    const confirmed10a = await humanClick(10, "#confirm-pending");
    assertEq(confirmed10a.revisionAfter, 22, "round10 confirmed revision");
    const e3fresh = await s.evalJs(`window.__imw.state().evidence[${JSON.stringify(E3[0])}].stale`);
    assertEq(e3fresh, false, "round10 clean-sweep evidence survives an ADDED pin (fingerprint untouched)");
    const stale10a = await s.evalJs(`({
      text: document.querySelector("#packet-state").textContent,
      applyDisabled: document.querySelector("#apply").disabled,
    })`);
    assertEq(stale10a.text.includes("STALE"), true, "round10 revision-only stale packet text");
    assertEq(stale10a.applyDisabled, true, "round10 revision-only stale disables apply");
    const r10b = await call(10, "prepare_mapping_review", { expectedRevision: 22, evidenceIds: E3 });
    assertEq(r10b.p.blockers, [{ pin: "pin-extra", reason: "uncovered" }], "round10 uncovered blocker");
    assertEq(r10b.p.packetId, "PKT-8", "round10 blocked packet id");
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
    assertEq(r10d.p.packetId, "PKT-9", "round10 green packet id");
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
    assertEq(r11.p.evidenceIds, ["E-10"], "round11 evidence id");
    const r11b = await call(11, "prepare_mapping_review", {
      expectedRevision: 25,
      evidenceIds: r11.p.evidenceIds,
    });
    assertEq(r11b.p.blockers, [], "round11 recovered packet green");
    assertEq(r11b.p.packetId, "PKT-11", "round11 packet id");
    const green11 = await s.evalJs(`({
      text: document.querySelector("#packet-state").textContent,
      applyDisabled: document.querySelector("#apply").disabled,
    })`);
    assertEq(green11.text.includes("GREEN"), true, "round11 recovered packet text");
    assertEq(green11.applyDisabled, false, "round11 recovered packet enables apply");

    // 12 invalid input stays local and preserves the complete store + GREEN UI; valid input commits once
    const before12 = await s.evalJs(`({
      snapshot: JSON.stringify(window.__imw.snapshot()),
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
    assertEq(invalid12.active, true, "round12 invalid input keeps focus");
    const afterInvalid12 = await s.evalJs(`({
      snapshot: JSON.stringify(window.__imw.snapshot()),
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

    const readWhileInvalid12 = await call(12, "read_mapping_session", {});
    assertEq(readWhileInvalid12.p.revision, 25, "round12 read during invalid local draft sees committed revision");
    const afterRead12 = await s.evalJs(`(() => {
      const input = document.querySelector('#expression-managerId');
      const error = document.querySelector('#expression-error-managerId');
      return {
        snapshot: JSON.stringify(window.__imw.snapshot()),
        inputValue: input.value,
        ariaInvalid: input.getAttribute('aria-invalid'),
        errorText: error.textContent,
        active: document.activeElement === input,
      };
    })()`);
    assertEq(afterRead12.snapshot, before12.snapshot, "round12 read during invalid local draft leaves state byte-identical");
    assertEq(afterRead12.inputValue, "user.", "round12 read preserves invalid local value");
    assertEq(afterRead12.ariaInvalid, "true", "round12 read preserves invalid state");
    assertEq(afterRead12.errorText, invalid12.errorText, "round12 read preserves inline error");
    assertEq(afterRead12.active, true, "round12 read preserves input focus");

    const overlongExpression = `"${"a".repeat(512)}"`;
    const overlong12 = await humanExpression(12, "managerId", overlongExpression);
    assertEq(overlong12.revisionAfter, 25, "round12 overlong expression does not bump revision");
    assertEq(overlong12.expressionAfter, "user.managerId", "round12 overlong expression does not commit");
    assertEq(overlong12.inputValue, overlongExpression, "round12 overlong input remains visible");
    assertEq(overlong12.ariaInvalid, "true", "round12 overlong input is marked invalid");
    assertEq(overlong12.errorHidden, false, "round12 overlong error is visible");
    assertEq(overlong12.errorText.includes("maximum is 512"), true, "round12 overlong error names the limit");
    assertEq(overlong12.active, true, "round12 overlong input keeps focus");
    assertEq(await s.evalJs("JSON.stringify(window.__imw.snapshot())"), before12.snapshot,
      "round12 overlong input leaves complete snapshot byte-identical");

    const valid12 = await humanExpression(12, "managerId", "user.managerId");
    assertEq(valid12.revisionAfter, invalid12.revisionAfter + 1, "round12 valid expression bumps exactly once");
    assertEq(valid12.revisionAfter, 26, "round12 valid expression revision");
    assertEq(valid12.expressionAfter, "user.managerId", "round12 valid expression commits");
    assertEq(valid12.ariaInvalid, "false", "round12 valid expression clears invalid state");
    assertEq(valid12.errorHidden, true, "round12 valid expression clears inline error");
    assertEq(valid12.active, true, "round12 valid expression preserves input focus");

    const inputOnlyExpression = "user.managerId == null ? null : user.managerId";
    const inputOnly12 = await s.evalJs(`(() => {
      const selector = '#grid input[data-field="managerId"]';
      const input = document.querySelector(selector);
      input.focus();
      input.value = ${JSON.stringify(inputOnlyExpression)};
      input.dispatchEvent(new Event("input", { bubbles: true }));
      window.__inputOnlyNode = input;
      return {
        revisionAfter: window.__imw.state().revision,
        expressionAfter: window.__imw.state().expressions.managerId,
        inputValue: input.value,
        active: document.activeElement === input,
      };
    })()`);
    trace.push({ round: 12, kind: "human-dom", via: "dom-input", selector: '#grid input[data-field="managerId"]',
      action: { type: "INPUT_ONLY_EXPRESSION", field: "managerId", expr: inputOnlyExpression }, ...inputOnly12 });
    assertEq(inputOnly12.revisionAfter, 26, "round12 input-only edit stays local before tool call");
    assertEq(inputOnly12.expressionAfter, "user.managerId", "round12 input-only edit is initially uncommitted");
    assertEq(inputOnly12.inputValue, inputOnlyExpression, "round12 input-only draft is visible");
    assertEq(inputOnly12.active, true, "round12 input-only draft keeps focus");
    const beforePureRead12 = await s.evalJs(`(() => {
      const input = document.querySelector('#expression-managerId');
      const error = document.querySelector('#expression-error-managerId');
      return {
        snapshot: JSON.stringify(window.__imw.snapshot()),
        ui: JSON.stringify(window.__imw.ui()),
        toolSnapshotBefore: JSON.stringify(window.__imw.toolSnapshotBefore()),
        inputValue: input.value,
        ariaInvalid: input.getAttribute('aria-invalid'),
        errorHidden: error.hidden,
        errorText: error.textContent,
        active: document.activeElement === input,
        revisionBadge: document.querySelector('#rev-badge').textContent,
        packetText: document.querySelector('#packet-state').textContent,
        applyDisabled: document.querySelector('#apply').disabled,
        staleBannerHidden: document.querySelector('#stale-banner').hidden,
      };
    })()`);
    const pureRead12 = await call(12, "read_mapping_session", {});
    assertEq(pureRead12.p.revision, 26, "round12 read leaves input-only edit uncommitted");
    assertEq(pureRead12.p.fields.find((field) => field.field === "managerId")?.expr,
      "user.managerId", "round12 read returns the committed managerId expression");
    const afterPureRead12 = await s.evalJs(`(() => {
      const input = document.querySelector('#expression-managerId');
      return {
        snapshot: JSON.stringify(window.__imw.snapshot()),
        toolSnapshotBefore: JSON.stringify(window.__imw.toolSnapshotBefore()),
        inputValue: input.value,
        active: document.activeElement === input,
        sameInputNode: input === window.__inputOnlyNode,
      };
    })()`);
    assertEq(afterPureRead12.snapshot, beforePureRead12.snapshot,
      "round12 read leaves the complete snapshot byte-identical");
    assertEq(afterPureRead12.toolSnapshotBefore, beforePureRead12.toolSnapshotBefore,
      "round12 read leaves tool snapshot bookkeeping byte-identical");
    assertEq(afterPureRead12.inputValue, inputOnlyExpression,
      "round12 read preserves the visible input-only draft");
    assertEq(afterPureRead12.active, true, "round12 read preserves input focus");
    assertEq(afterPureRead12.sameInputNode, true, "round12 read does not rebuild the input DOM");
    assertEq(await s.evalJs('document.querySelector("#rev-badge").textContent'), "r26",
      "round12 revision badge stays unchanged after read");

    const failedNonRead12 = await call(12, "find_mapping_counterexample",
      { expectedRevision: 26 });
    assertEq(failedNonRead12.p, {
      error: {
        code: "UNCOMMITTED_DRAFT",
        reason: UNCOMMITTED_DRAFT_REASON,
        fields: ["managerId"],
      },
    }, "round12 non-read tool rejects the visible input-only draft exactly");
    const afterFailedNonRead12 = await s.evalJs(`(() => {
      const input = document.querySelector('#expression-managerId');
      const error = document.querySelector('#expression-error-managerId');
      return {
        snapshot: JSON.stringify(window.__imw.snapshot()),
        ui: JSON.stringify(window.__imw.ui()),
        toolSnapshotBefore: JSON.stringify(window.__imw.toolSnapshotBefore()),
        inputValue: input.value,
        ariaInvalid: input.getAttribute('aria-invalid'),
        errorHidden: error.hidden,
        errorText: error.textContent,
        active: document.activeElement === input,
        sameInputNode: input === window.__inputOnlyNode,
        revisionBadge: document.querySelector('#rev-badge').textContent,
        packetText: document.querySelector('#packet-state').textContent,
        applyDisabled: document.querySelector('#apply').disabled,
        staleBannerHidden: document.querySelector('#stale-banner').hidden,
      };
    })()`);
    for (const [key, value] of Object.entries(beforePureRead12)) {
      if (key === "toolSnapshotBefore") continue;
      assertEq(afterFailedNonRead12[key], value,
        `round12 failed non-read call preserves ${key}`);
    }
    assertEq(afterFailedNonRead12.sameInputNode, true,
      "round12 failed non-read call does not rebuild the input DOM");
    const failedHandlerSnapshot12 = JSON.parse(afterFailedNonRead12.toolSnapshotBefore);
    assertEq(failedHandlerSnapshot12, JSON.parse(beforePureRead12.snapshot),
      "round12 rejected non-read trace keeps invocation and handler boundaries equal");

    const committedInputOnly12 = await humanExpression(12, "managerId", inputOnlyExpression);
    assertEq(committedInputOnly12.revisionAfter, 27,
      "round12 human change commits the visible draft at r27");
    assertEq(committedInputOnly12.expressionAfter, inputOnlyExpression,
      "round12 human change commits the input-only expression");
    assertEq(committedInputOnly12.ariaInvalid, "false",
      "round12 human change leaves the committed expression valid");
    assertEq(committedInputOnly12.errorHidden, true,
      "round12 human change leaves no expression error");
    assertEq(committedInputOnly12.active, true,
      "round12 human change preserves input focus");

    const reread12 = await call(12, "read_mapping_session", {});
    assertEq(reread12.p.revision, 27,
      "round12 read after the human commit returns r27");
    assertEq(reread12.p.fields.find((field) => field.field === "managerId")?.expr,
      inputOnlyExpression, "round12 read after the human commit returns the committed expression");

    const nextIdBeforeRetry12 = await s.evalJs("window.__imw.snapshot().nextId");
    const successfulNonRead12 = await call(12, "find_mapping_counterexample",
      { expectedRevision: 27 });
    assertEq(successfulNonRead12.p.cleanSweep, true,
      "round12 non-read succeeds after the human commits and re-reads");
    assertEq(await s.evalJs(`({
      revision: window.__imw.state().revision,
      expression: window.__imw.state().expressions.managerId,
      nextId: window.__imw.snapshot().nextId,
    })`), {
      revision: 27,
      expression: inputOnlyExpression,
      nextId: nextIdBeforeRetry12 + 1,
    }, "round12 successful non-read runs once without recommitting the human draft");

    const sha = execSync("git rev-parse --short HEAD", { encoding: "utf8" }).trim();
    const configuredTrace = process.env.IMW_E2E_TRACE_PATH;
    if (configuredTrace && !configuredTrace.startsWith("/"))
      throw new Error("IMW_E2E_TRACE_PATH must be absolute");
    const out = configuredTrace ?? `eval/out/relay-${sha}.json`;
    const body = JSON.stringify({ sha, when: new Date().toISOString(), rounds: 12, trace }, null, 2);
    if (configuredTrace) {
      // Operator-captured evidence: exclusive create — never overwrite prior evidence.
      await writeFile(new URL(`file://${configuredTrace}`), body, { flag: "wx" });
    } else {
      // Regenerated gate artifact (gitignored since R6): exclusive tmp + atomic rename,
      // so every rerun lands fresh — eval's mtime freshness binding depends on it.
      const tmp = new URL(`../eval/out/tmp-trace-${process.pid}.json`, import.meta.url);
      await writeFile(tmp, body, { flag: "wx" });
      await rename(tmp, new URL(`../${out}`, import.meta.url));
    }
    ok(`e2e: 12 rounds green — stale rejection (r5), mismatch recovery (r9), pin-coverage flip (r10), packet freshness recovery (r11), input bounds/draft/focus recovery (r12); trace → ${out}`);
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
    await initializationFailureCoverage(baseUrl);
    await e2e(baseUrl);
    console.log("E2E PASS (12 rounds + 5 fail-closed starts)");
  } else {
    fail(`unknown mode ${MODE}`);
  }
} catch (e) {
  fail(String(e.message ?? e));
} finally {
  server.close();
}
process.exit(0);
