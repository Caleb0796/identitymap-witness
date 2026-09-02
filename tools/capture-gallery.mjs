#!/usr/bin/env node
import assert from "node:assert/strict";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { launchChrome } from "../harness/chrome.mjs";
import { connect, invokeTool, textOf } from "../harness/cdp.mjs";

const WIDTH = 1500;
const HEIGHT = 1000;
const GALLERY = new URL("../docs/assets/devpost/", import.meta.url);
const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];
const GROUP_FIX = 'String.toLowerCase(user.userType) == "contractor" ? "contractors" : "employees"';

function parseBaseUrl(args) {
  let raw = "http://127.0.0.1:4173";
  for (let index = 0; index < args.length; index++) {
    const arg = args[index];
    if (arg === "--base-url") {
      if (!args[index + 1]) throw new Error("--base-url requires a value");
      raw = args[++index];
    } else if (arg.startsWith("--base-url=")) {
      raw = arg.slice("--base-url=".length);
    } else {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  const url = new URL(raw);
  if (!new Set(["http:", "https:"]).has(url.protocol))
    throw new Error("--base-url must use http or https");
  url.hash = "";
  return url.href;
}

async function freePort() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function attachToPage(cdp, wantUrl) {
  for (let attempt = 0; attempt < 60; attempt++) {
    const { targetInfos } = await cdp.send("Target.getTargets");
    const target = targetInfos.find((candidate) =>
      candidate.type === "page" && candidate.url.startsWith(wantUrl));
    if (target) {
      const { sessionId } = await cdp.send("Target.attachToTarget", {
        targetId: target.targetId,
        flatten: true,
      });
      return sessionId;
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`no page target for ${wantUrl}`);
}

async function main() {
  const baseUrl = parseBaseUrl(process.argv.slice(2));
  const chrome = await launchChrome({ cdpPort: await freePort(), url: baseUrl });
  let cdp = null;
  try {
    cdp = await connect(chrome.wsUrl);
    const sessionId = await attachToPage(cdp, baseUrl);
    await cdp.send("Page.enable", {}, sessionId);
    await cdp.send("WebMCP.enable", {}, sessionId);
    await cdp.send("Emulation.setDeviceMetricsOverride", {
      width: WIDTH,
      height: HEIGHT,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId);

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

    for (let attempt = 0; attempt < 60; attempt++) {
      if (await evalJs("Boolean(window.__imw)").catch(() => false)) break;
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    if (!await evalJs("Boolean(window.__imw)")) throw new Error("page module never initialized");
    const registration = await evalJs(`({
      count: window.__imw.registeredToolCount(),
      badge: document.querySelector("#tools-badge").textContent,
    })`);
    assert.deepEqual(registration, { count: 5, badge: "tools: 5/5 registered" });

    const { frameTree } = await cdp.send("Page.getFrameTree", {}, sessionId);
    const frameId = frameTree.frame.id;
    const call = async (toolName, input) => {
      const response = await invokeTool(cdp, sessionId, frameId, toolName, input);
      if (!response.roundTrip)
        throw new Error(`${toolName} did not complete: ${JSON.stringify(response)}`);
      const text = textOf(response.output);
      if (!text) throw new Error(`${toolName} returned no payload`);
      const payload = JSON.parse(text);
      if (payload.error) throw new Error(`${toolName} failed: ${JSON.stringify(payload.error)}`);
      return payload;
    };

    const changeExpression = async (field, expression) => evalJs(`(() => {
      const input = document.querySelector(${JSON.stringify(`#grid input[data-field="${field}"]`)});
      if (!input) throw new Error(${JSON.stringify(`missing expression input for ${field}`)});
      input.focus();
      input.value = ${JSON.stringify(expression)};
      input.dispatchEvent(new Event("change", { bubbles: true }));
      const state = window.__imw.state();
      return {
        revision: state.revision,
        expression: state.expressions[${JSON.stringify(field)}],
        staleVisible: !document.querySelector("#stale-banner").hidden,
      };
    })()`);

    const screenshot = async (name, expectedRevision, visibleSelector = null) => {
      await evalJs(`new Promise((resolve) => {
        const target = document.querySelector(${JSON.stringify(visibleSelector)});
        if (target) target.scrollIntoView({ block: "center" });
        else window.scrollTo(0, 0);
        requestAnimationFrame(() => requestAnimationFrame(resolve));
      })`, { awaitPromise: true });
      assert.equal(await evalJs("window.__imw.state().revision"), expectedRevision);
      if (visibleSelector) {
        assert.equal(await evalJs(`(() => {
          const rect = document.querySelector(${JSON.stringify(visibleSelector)}).getBoundingClientRect();
          return rect.top >= 0 && rect.bottom <= innerHeight;
        })()`), true, `${visibleSelector} does not fit inside the screenshot viewport`);
      }
      const { data } = await cdp.send("Page.captureScreenshot", {
        format: "png",
        fromSurface: true,
        captureBeyondViewport: false,
      }, sessionId);
      const image = Buffer.from(data, "base64");
      assert.equal(image.subarray(1, 4).toString("ascii"), "PNG");
      assert.equal(image.readUInt32BE(16), WIDTH);
      assert.equal(image.readUInt32BE(20), HEIGHT);
      await writeFile(new URL(`${name}.png`, GALLERY), image);
      console.log(`wrote ${name}.png (${WIDTH}x${HEIGHT}, r${expectedRevision})`);
    };

    await mkdir(GALLERY, { recursive: true });

    const staged = await call("stage_mapping_invariants", {
      expectedRevision: 17,
      invariants: PINS,
    });
    assert.equal(staged.revision, 17);
    assert.deepEqual(staged.pendingRuleIds, PINS.map((pin) => pin.id));
    assert.deepEqual(await evalJs(`({
      visible: !document.querySelector("#pending-rules").hidden,
      cards: document.querySelectorAll("#pending-list .pending-rule").length,
    })`), { visible: true, cards: 3 });
    await screenshot("01-confirmation", 17, "#pending-rules");

    const confirmed = await evalJs(`(() => {
      const button = document.querySelector("#confirm-pending");
      if (!button) throw new Error("missing Confirm all control");
      button.click();
      const state = window.__imw.state();
      return {
        revision: state.revision,
        pending: state.pending,
        pinIds: state.pins.map((pin) => pin.id),
      };
    })()`);
    assert.deepEqual(confirmed, {
      revision: 18,
      pending: null,
      pinIds: PINS.map((pin) => pin.id),
    });

    const firstFind = await call("find_mapping_counterexample", { expectedRevision: 18 });
    assert.deepEqual(firstFind.personaIds, ["P2", "P3", "P4"]);
    assert.equal(firstFind.violations.length, 4);
    assert.equal(firstFind.cleanSweep, false);
    await screenshot("02-witness", 18);

    assert.deepEqual(await changeExpression("managerId", "user.managerId"), {
      revision: 19,
      expression: "user.managerId",
      staleVisible: true,
    });
    await screenshot("03-stale", 19);

    const secondFind = await call("find_mapping_counterexample", { expectedRevision: 19 });
    assert.deepEqual(secondFind.personaIds, ["P2", "P4"]);
    assert.equal(secondFind.violations.length, 3);

    assert.deepEqual(await changeExpression("group", GROUP_FIX), {
      revision: 20,
      expression: GROUP_FIX,
      staleVisible: true,
    });
    const thirdFind = await call("find_mapping_counterexample", { expectedRevision: 20 });
    assert.deepEqual(thirdFind.personaIds, ["P4"]);
    assert.equal(thirdFind.violations.length, 2);
    assert.equal(thirdFind.cleanSweep, false);

    const priority = await evalJs(`(() => {
      const select = document.querySelector("#priority-select");
      select.focus();
      select.value = "hris,ad";
      select.dispatchEvent(new Event("change", { bubbles: true }));
      const state = window.__imw.state();
      return {
        revision: state.revision,
        priority: state.priority,
        staleVisible: !document.querySelector("#stale-banner").hidden,
      };
    })()`);
    assert.deepEqual(priority, {
      revision: 21,
      priority: ["hris", "ad"],
      staleVisible: true,
    });

    const clean = await call("find_mapping_counterexample", { expectedRevision: 21 });
    assert.equal(clean.cleanSweep, true);
    assert.equal(clean.fullSweep, true);
    assert.deepEqual(clean.personaIds, []);
    assert.equal(clean.violations.length, 0);
    const packet = await call("prepare_mapping_review", {
      expectedRevision: 21,
      evidenceIds: clean.evidenceIds,
    });
    assert.deepEqual(packet.blockers, []);
    assert.deepEqual(await evalJs(`({
      green: document.querySelector("#packet-state").classList.contains("green"),
      applyEnabled: !document.querySelector("#apply").disabled,
    })`), { green: true, applyEnabled: true });
    await screenshot("04-green", 21);

    await copyFile(new URL("02-witness.png", GALLERY), new URL("thumbnail.png", GALLERY));
    console.log(`wrote thumbnail.png (copy of 02-witness.png)`);
    console.log(`gallery capture complete from ${baseUrl}`);
  } finally {
    cdp?.close();
    await chrome.close();
  }
}

await main();
