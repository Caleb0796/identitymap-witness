#!/usr/bin/env node
// --smoke: layer-2 gate. Presence-by-round-trip (WebMCP.enable is recorded, never
// asserted — measured to return OK even with no page API), tool count via awaited
// getTools(), one Completed invokeTool round trip with the DOM already updated,
// one -32602 unknown-name rejection, THREE cold sessions with fresh profiles.
import { startServer } from "./serve.mjs";
import { launchChrome } from "./chrome.mjs";
import { connect, invokeTool, textOf } from "./cdp.mjs";

const MODE = process.argv[2] ?? "--smoke";
const fail = (msg) => { console.error(`FAIL ${msg}`); process.exit(1); };
const ok = (msg) => console.log(`ok    ${msg}`);

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

async function evalJs(cdp, sessionId, expression, { awaitPromise = false } = {}) {
  const r = await cdp.send("Runtime.evaluate", { expression, returnByValue: true, awaitPromise }, sessionId);
  if (r.exceptionDetails) throw new Error(`page eval threw: ${r.exceptionDetails.text} ${r.exceptionDetails.exception?.description ?? ""}`);
  return r.result.value;
}

async function smokeSession(round, baseUrl) {
  const cdpPort = 9400 + Math.floor(Math.random() * 400);
  const chrome = await launchChrome({ cdpPort, url: baseUrl });
  try {
    const cdp = await connect(chrome.wsUrl);
    const sessionId = await attachToPage(cdp, baseUrl);
    let cdpDomainEnabled = true;
    try { await cdp.send("WebMCP.enable", {}, sessionId); } catch { cdpDomainEnabled = false; }

    for (let i = 0; i < 60; i++) {
      const ready = await evalJs(cdp, sessionId, "Boolean(window.__imw)").catch(() => false);
      if (ready) break;
      await new Promise((r) => setTimeout(r, 250));
    }
    if (!await evalJs(cdp, sessionId, "Boolean(window.__imw)")) throw new Error("page module never initialized");

    const present = await evalJs(cdp, sessionId, 'typeof document.modelContext !== "undefined" && document.modelContext !== null');
    if (!present) throw new Error("document.modelContext absent — flag missing or engine mismatch");

    const count = await evalJs(cdp, sessionId, "document.modelContext.getTools().then(t => t.length)", { awaitPromise: true });
    if (count !== 5) throw new Error(`getTools() length ${count}, want 5`);

    const { frameTree } = await cdp.send("Page.getFrameTree", {}, sessionId);
    const frameId = frameTree.frame.id;

    const read = await invokeTool(cdp, sessionId, frameId, "read_mapping_session", {});
    if (!read.roundTrip) throw new Error(`read_mapping_session round trip failed: ${JSON.stringify(read)}`);
    const payload = JSON.parse(textOf(read.output));
    if (payload.revision !== 17) throw new Error(`read revision ${payload.revision}, want 17`);
    if (payload.personaCount !== 8) throw new Error(`personaCount ${payload.personaCount}, want 8`);

    const stage = await invokeTool(cdp, sessionId, frameId, "stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: [
        { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
        { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
        { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
      ],
    });
    if (!stage.roundTrip) throw new Error("stage round trip failed");
    const staged = JSON.parse(textOf(stage.output));
    if (staged.revision !== 18) throw new Error(`stage revision ${staged.revision}, want 18`);

    const find = await invokeTool(cdp, sessionId, frameId, "find_mapping_counterexample", { expectedRevision: 18 });
    if (!find.roundTrip) throw new Error("find round trip failed");
    const witness = JSON.parse(textOf(find.output));
    if (JSON.stringify(witness.personaIds) !== '["P2","P3","P4"]')
      throw new Error(`witness ${JSON.stringify(witness.personaIds)}, want [P2,P3,P4]`);
    const rows = await evalJs(cdp, sessionId, 'document.querySelectorAll("#matrix tbody tr").length');
    if (rows !== 4) throw new Error(`matrix rows ${rows} after find, want 4 (UI must update before/with the response)`);

    const nope = await invokeTool(cdp, sessionId, frameId, "no_such_tool", {});
    if (!nope.sendRejected || nope.cdp?.code !== -32602) throw new Error(`unknown tool: want -32602 send rejection, got ${JSON.stringify(nope)}`);

    const canaries = JSON.stringify(payload).includes("CANARY_") || textOf(find.output).includes("CANARY_");
    if (canaries) throw new Error("CANARY_ leaked through a tool payload");

    ok(`session ${round}: present, 5 tools, read r17, stage r18, find [P2,P3,P4]→4 matrix rows, -32602, no canary (WebMCP.enable ${cdpDomainEnabled ? "ok" : "rejected"} — recorded, not asserted)`);
    cdp.close();
  } finally {
    await chrome.close();
  }
}

if (MODE === "--smoke") {
  const { server, port } = await startServer(0);
  const baseUrl = `http://127.0.0.1:${port}/`;
  try {
    for (let round = 1; round <= 3; round++) await smokeSession(round, baseUrl);
    console.log("SMOKE PASS (3 cold sessions)");
  } catch (e) {
    fail(String(e.message ?? e));
  } finally {
    server.close();
  }
  process.exit(0);
} else {
  fail(`unknown mode ${MODE} (--e2e arrives in T10)`);
}
