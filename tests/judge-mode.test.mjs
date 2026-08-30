import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const app = await readFile(new URL("../app.js", import.meta.url), "utf8");
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
  assert.ok(app.includes('$("#reset-demo").addEventListener("click", () => location.reload());'));
});
