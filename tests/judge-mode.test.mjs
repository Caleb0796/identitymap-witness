import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
const style = await readFile(new URL("../style.css", import.meta.url), "utf8");
const TAGLINE = "finds the smallest set of synthetic people proving every violated rule on an unsaved draft — and the proof dies when you edit what it depended on";
const PROMPT_1 = "Read the mapping session on this page. Stage exactly these three invariants and then stop and tell me to confirm them on the page: (1) contractors must never map into the employees group; (2) if no source supplies managerId the target must stay null; (3) hris is the source of truth for department. Do not call any other tool until I tell you I confirmed.";
const PROMPT_2 = "I confirmed the rules. Re-read the session, then find the minimal counterexample set. Walk me through fixing every violation: tell me exactly which expression or the priority order to change in the page UI. After each of my edits, re-find at the current revision. When violations reach zero, prepare the review packet from the fresh evidence ids.";

test("judge action bar exposes the two-stage handshake and live copy status", () => {
  assert.ok(html.includes(`<div class="tagline">${TAGLINE}</div>`));
  for (const id of ["copy-prompt-1", "copy-prompt-2", "reset-demo"])
    assert.equal((html.match(new RegExp(`id="${id}"`, "g")) ?? []).length, 1);
  assert.match(html, /id="copy-status" role="status" aria-live="polite"/);
});

test("copy prompts are exact, independently bound, and have a readonly fallback", () => {
  assert.ok(app.includes(`const COPY_PROMPT_1 = ${JSON.stringify(PROMPT_1)};`));
  assert.ok(app.includes(`const COPY_PROMPT_2 = ${JSON.stringify(PROMPT_2)};`));
  assert.ok(app.includes('["#copy-prompt-1", COPY_PROMPT_1'));
  assert.ok(app.includes('["#copy-prompt-2", COPY_PROMPT_2'));
  assert.ok(app.includes("navigator.clipboard?.writeText"));
  assert.ok(app.includes("textarea.readOnly = true"));
  assert.ok(app.includes('document.execCommand("copy")'));
  assert.match(html, /<textarea id="prompt-fallback" class="prompt-fallback" readonly hidden><\/textarea>/);
  const handler = app.slice(app.indexOf("for (const [selector, prompt, label]"),
    app.indexOf('$("#apply").addEventListener'));
  assert.ok(handler.includes('const fallback = $("#prompt-fallback");'));
  const success = handler.slice(handler.indexOf("try {"), handler.indexOf("} catch {"));
  const failure = handler.slice(handler.indexOf("} catch {"));
  assert.match(success, /fallback\.hidden = true;[\s\S]*fallback\.value = "";/);
  assert.match(failure, /fallback\.value = prompt;[\s\S]*fallback\.hidden = false;[\s\S]*fallback\.focus\(\);[\s\S]*fallback\.select\(\);/);
  assert.match(success, /status\.classList\.remove\("error"\)/);
  assert.match(failure, /status\.classList\.add\("error"\)/);
  assert.ok(app.includes('$("#reset-demo").addEventListener("click", () => location.reload());'));
});

test("WebMCP-absent guidance is present and toggled from method detection", () => {
  assert.ok(html.includes(`<p id="webmcp-hint" class="hint" hidden>WebMCP is not available in this browser. Open this page in ChatGPT's built-in browser with site tools enabled for this site, or in Chrome 152 launched with --enable-features=WebMCP, then reload.</p>`));
  assert.ok(app.includes('$("#webmcp-hint").hidden = present;'));
});

test("page guidance identifies the human-only controls and evidence boundaries", () => {
  for (const text of [
    "<b>Confirm all</b> — this page control puts staged rules in force; no tool can.",
    "<b>Edit a field or priority</b>",
    "Rules currently in force. The WebMCP tools can stage proposals; confirmation happens through this page control.",
    "Bundles fresh evidence for human review. Refuses stale evidence. Apply is not exposed as a WebMCP tool and, in this demo, is a simulated final gate — no save path is connected.",
    "session-only; no save path connected · synthetic personas only, no real identities",
    "<th>winning sources</th>",
    "Select a violation row to view its field provenance",
    "STALE — the draft changed after this evidence was computed; those evidence ids cannot prepare a packet",
    "For the selected person and field: which source supplied each input, and which branch of the expression produced the value.",
    "Text that does not parse stays local to its box and is not part of the shown revision.",
  ]) assert.ok(html.includes(text), `missing page guidance: ${text}`);
  assert.ok(app.includes("GREEN — every confirmed rule covered by fresh evidence"));
  const witnessSummaryStart = app.indexOf("const hasWitness");
  const witnessSummaryRender = app.slice(witnessSummaryStart,
    app.indexOf("allClear.hidden", witnessSummaryStart));
  assert.ok(witnessSummaryRender.includes('witnessSummary.classList.toggle("stale", Boolean(hasWitness && findStale));'));
  assert.ok(witnessSummaryRender.includes('${findStale ? " · STALE" : ""}'));
  assert.match(style, /#witness-summary\.stale \{ opacity: \.55; text-decoration: line-through; \}/);
  assert.match(style, /\.matrix-select \{[^}]*text-decoration: underline dotted;[^}]*text-underline-offset: 2px;[^}]*color: #1459d9;[^}]*font-weight: 600;/);
  assert.match(style, /\.matrix-select:focus-visible \{ outline: 3px solid #1459d9; outline-offset: 2px; \}/);
});
