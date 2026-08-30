// Top-level entry module — the ONLY legal registerTool call site (tests/toplevel.test.mjs).
import { TOOLS, runTool, GOLDEN_STATE } from "./src/tools/defs.mjs";
import { createStore, packetFresh } from "./src/store/reducer.mjs";
import { evaluateAll } from "./src/engine/witness.mjs";
import { parse } from "./src/engine/parser.mjs";

const personas = await fetch("./data/personas.json").then((r) => r.json());
const store = createStore(GOLDEN_STATE);
const ui = { lastFind: null, lastSweep: null, lastPacket: null, selected: null, pendingError: null };
const COPY_PROMPT_1 = "Read the mapping session on this page. Stage exactly these three invariants and then stop and tell me to confirm them on the page: (1) contractors must never map into the employees group; (2) if no source supplies managerId the target must stay null; (3) hris is the source of truth for department. Do not call any other tool until I tell you I confirmed.";
const COPY_PROMPT_2 = "I confirmed the rules. Re-read the session, then find the minimal counterexample set. Walk me through fixing every violation: tell me exactly which expression or the priority order to change in the page UI. After each of my edits, re-find at the current revision. When violations reach zero, prepare the review packet from the fresh evidence ids.";

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const show = (v) => v === null ? "∅ null" : v === "" ? '"" empty' : esc(v);
const allClear = document.createElement("div");
allClear.id = "all-clear";
allClear.className = "hint";
allClear.hidden = true;
$("#matrix").before(allClear);

async function copyText(text) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch {
      // The legacy path below also works when clipboard permission is unavailable.
    }
  }
  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.readOnly = true;
  textarea.className = "clipboard-fallback";
  document.body.append(textarea);
  textarea.select();
  try {
    if (!document.execCommand("copy")) throw new Error("copy command rejected");
  } finally {
    textarea.remove();
  }
}

function renderPending(s) {
  const section = $("#pending-rules");
  const meta = $("#pending-meta");
  const list = $("#pending-list");
  const actions = $("#pending-actions");
  const error = $("#pending-error");
  list.replaceChildren();
  actions.replaceChildren();

  if (!s.pending) {
    section.hidden = true;
    meta.textContent = "";
    error.hidden = true;
    error.textContent = "";
    return;
  }

  section.hidden = false;
  meta.textContent = `version ${s.pending.version} · content fingerprint ${s.pending.digest} (FNV-1a, non-cryptographic)`;
  for (const rule of s.pending.rules) {
    const card = document.createElement("article");
    card.className = "pending-rule";
    const fields = document.createElement("dl");
    for (const [key, value] of Object.entries(rule)) {
      const name = document.createElement("dt");
      name.textContent = key;
      const content = document.createElement("dd");
      content.textContent = typeof value === "string" ? value : JSON.stringify(value);
      fields.append(name, content);
    }
    card.append(fields);
    list.append(card);
  }

  error.hidden = !ui.pendingError;
  error.textContent = ui.pendingError ?? "";
  for (const [id, label, type] of [
    ["confirm-pending", "Confirm all", "CONFIRM_RULES"],
    ["discard-pending", "Discard", "DISCARD_RULES"],
  ]) {
    const button = document.createElement("button");
    button.id = id;
    button.type = "button";
    button.dataset.version = String(s.pending.version);
    button.textContent = label;
    button.setAttribute("aria-label", label);
    button.addEventListener("click", () => {
      try {
        store.dispatch({ type, version: Number(button.dataset.version) });
        ui.pendingError = null;
      } catch (caught) {
        ui.pendingError = caught?.code === "STALE_CONFIRM"
          ? "STALE_CONFIRM — pending rules changed; review the current proposal"
          : String(caught?.message ?? caught);
      }
      render();
    });
    actions.append(button);
  }
}

function renderRail(outs) {
  const sel = ui.selected;
  const section = $("#provenance");
  if (!outs || !sel || !outs[sel.personaId]) { section.hidden = true; return; }
  const cell = outs[sel.personaId].fields[sel.field];
  if (!cell) { section.hidden = true; return; }
  section.hidden = false;
  const p = cell.prov;
  let html = `<div class="rail-head">${sel.personaId} · ${sel.field} → ${show(cell.value)}`
    + ` <span class="hint">(source: ${p.source ?? "∅"}${p.branch ? ` · branch: ${p.branch}` : ""})</span></div>`;
  if (p.candidates.length) {
    html += `<table><thead><tr><th>source (priority order)</th><th>present</th><th>value</th><th></th></tr></thead><tbody>`;
    for (const c of p.candidates) {
      const cls = c.source === p.source ? "winner" : c.present ? "loser" : "absent";
      const note = c.source === p.source ? "← wins" : c.present ? "loses (later in priority)" : "absent";
      html += `<tr><td>${c.source}</td><td>${c.present ? "yes" : "no"}</td>`
        + `<td class="${cls}">${c.present ? show(c.value) : "—"}</td><td class="${cls}">${note}</td></tr>`;
    }
    html += `</tbody></table>`;
  } else if (p.inputs.length) {
    html += `<div class="hint">inputs: ${p.inputs.map((i) => `${esc(i.ref)} (${i.source ?? "∅"})`).join(" · ")}</div>`;
  } else {
    html += `<div class="hint">literal value — no source resolution involved</div>`;
  }
  $("#rail").innerHTML = html;
}

function render() {
  const s = store.getState();
  $("#rev-badge").textContent = `r${s.revision}`;
  $("#priority-select").value = s.priority.join(",");

  const evaluationError = $("#evaluation-error");
  let outs = null;
  try {
    outs = evaluateAll(s, personas);
    evaluationError.hidden = true;
    evaluationError.textContent = "";
  } catch (caught) {
    evaluationError.hidden = false;
    evaluationError.textContent = `Evaluation unavailable: ${String(caught?.message ?? caught)}`;
  }
  const chips = {};
  for (const field of Object.keys(s.expressions)) {
    if (outs) {
      const sources = new Set(personas.map((p) => outs[p.id].fields[field].prov.source ?? "∅"));
      chips[field] = [...sources].join(",");
    } else {
      chips[field] = "unavailable";
    }
  }
  $("#grid tbody").innerHTML = Object.entries(s.expressions)
    .map(([f, e]) => `<tr><td>${f}</td><td class="expression-cell">`
      + `<label class="visually-hidden" for="expression-${f}">Expression for ${f}</label>`
      + `<input id="expression-${f}" data-field="${f}" value="${esc(e)}" aria-invalid="false" aria-describedby="expression-error-${f}">`
      + `<div id="expression-error-${f}" class="expression-error" aria-live="polite" hidden></div>`
      + `</td><td class="prov-chip">${chips[f]}</td></tr>`)
    .join("");
  for (const input of document.querySelectorAll("#grid input")) {
    input.addEventListener("change", (ev) => {
      const error = ev.target.parentElement.querySelector(".expression-error");
      try {
        parse(ev.target.value);
      } catch (caught) {
        const position = Number.isInteger(caught?.position) ? caught.position : 0;
        ev.target.setAttribute("aria-invalid", "true");
        error.hidden = false;
        error.textContent = `Invalid expression at position ${position}: ${String(caught?.message ?? caught)}`;
        return;
      }
      ev.target.setAttribute("aria-invalid", "false");
      error.hidden = true;
      error.textContent = "";
      store.dispatch({ type: "EDIT_EXPRESSION", field: ev.target.dataset.field, expr: ev.target.value });
      render();
    });
  }

  const pins = $("#pins");
  pins.replaceChildren();
  if (s.pins.length === 0) {
    const empty = document.createElement("li");
    empty.className = "hint";
    empty.textContent = "none pinned yet — the human states these; the agent stages them";
    pins.append(empty);
  } else {
    for (const pin of s.pins) {
      const item = document.createElement("li");
      const chip = document.createElement("span");
      chip.className = "pin-chip";
      const id = document.createElement("code");
      id.textContent = pin.id;
      const type = document.createTextNode(` ${pin.type}`);
      const remove = document.createElement("button");
      remove.type = "button";
      remove.dataset.unpin = pin.id;
      remove.title = "unpin";
      remove.setAttribute("aria-label", `Unpin invariant ${pin.id}`);
      remove.textContent = "✕";
      chip.append(id, type, remove);
      item.append(chip);
      pins.append(item);
    }
  }
  for (const b of document.querySelectorAll("#pins [data-unpin]")) {
    b.addEventListener("click", () => { store.dispatch({ type: "UNPIN", id: b.dataset.unpin }); render(); });
  }
  renderPending(s);

  const find = ui.lastFind;
  const findStale = find && (find.evidenceIds ?? []).some((id) => s.evidence[id]?.stale);
  const sweep = ui.lastSweep;
  const sweepStale = sweep && (sweep.evidenceIds ?? []).some((id) => s.evidence[id]?.stale);
  const sweepStillFull = sweep?.fullSweep && sweep.confirmedInvariantCount === s.pins.length;
  allClear.hidden = !(sweep?.cleanSweep && !sweepStale);
  if (sweep?.cleanSweep && !sweepStale) {
    allClear.textContent = sweepStillFull
      ? `clean sweep — 0 violations across ${sweep.checked} personas at r${sweep.revision}`
      : `scoped check clean: ${sweep.checkedInvariantIds.join(", ")} — other pinned rules NOT checked`;
  } else {
    allClear.textContent = "";
  }
  $("#stale-banner").hidden = !findStale;
  $("#matrix-hint").hidden = !find || find.violations.length === 0;
  const matrixBody = $("#matrix tbody");
  matrixBody.replaceChildren();
  for (const [index, violation] of (find?.violations ?? []).entries()) {
    const row = document.createElement("tr");
    row.dataset.row = String(index);
    if (findStale) row.classList.add("stale");
    if (ui.selected && ui.selected.personaId === violation.personaId && ui.selected.field === violation.field)
      row.classList.add("selected");
    for (const [value, className] of [
      [violation.personaId, ""],
      [violation.invariantId, "viol"],
      [violation.field, ""],
      [violation.detail ?? "", ""],
    ]) {
      const cell = document.createElement("td");
      if (className) cell.className = className;
      cell.textContent = value;
      row.append(cell);
    }
    matrixBody.append(row);
  }
  for (const tr of document.querySelectorAll("#matrix tbody tr")) {
    tr.addEventListener("click", () => {
      const v = find.violations[Number(tr.dataset.row)];
      ui.selected = { personaId: v.personaId, field: v.field };
      render();
    });
  }
  renderRail(outs);

  const pkt = ui.lastPacket;
  const fresh = pkt && packetFresh(pkt, s);
  const ps = $("#packet-state");
  ps.classList.remove("green", "blocked");
  if (pkt) {
    if (!fresh) {
      ps.textContent = `packet ${pkt.packetId} @ r${pkt.revision}: STALE — the draft changed after this packet was prepared`;
      ps.classList.add("blocked");
    } else if (pkt.blockers.length) {
      ps.textContent = `packet ${pkt.packetId} @ r${pkt.revision}: BLOCKED — ${pkt.blockers.map((b) => `${b.pin}:${b.reason}`).join(", ")}`;
      ps.classList.add("blocked");
    } else {
      ps.textContent = `packet ${pkt.packetId} @ r${pkt.revision}: GREEN — every pin covered by fresh closing evidence`;
      ps.classList.add("green");
    }
  } else {
    ps.textContent = "no packet";
  }
  $("#apply").disabled = !(fresh && pkt.blockers.length === 0);
}

const present = typeof document.modelContext !== "undefined" && document.modelContext !== null;
$("#origin-badge").textContent = `origin: ${location.host}`;
$("#mc-badge").textContent = `modelContext: ${present ? "present" : "absent"}`;
$("#mc-badge").classList.add(present ? "on" : "off");
$("#priority-select").addEventListener("change", (event) => {
  store.dispatch({ type: "SET_PRIORITY", priority: event.target.value.split(",") });
  render();
});
for (const [selector, prompt, label] of [
  ["#copy-prompt-1", COPY_PROMPT_1, "prompt 1 ready to paste"],
  ["#copy-prompt-2", COPY_PROMPT_2, "prompt 2 ready to paste"],
]) {
  $(selector).addEventListener("click", async () => {
    try {
      await copyText(prompt);
      $("#copy-status").textContent = `copied — ${label}`;
    } catch {
      $("#copy-status").textContent = "copy failed — clipboard unavailable";
    }
  });
}
$("#reset-demo").addEventListener("click", () => location.reload());
$("#apply").addEventListener("click", () => alert("Apply stays human-only, and this demo never exercises it."));

let registeredCount = 0;
if (present) {
  for (const t of TOOLS) {
    document.modelContext.registerTool({
      name: t.name,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: t.annotations,
      execute: async (args) => {
        const r = runTool(store, personas, t.name, args ?? {});
        if (r.ok && t.name === "find_mapping_counterexample") {
          if (r.payload.cleanSweep) {
            ui.lastSweep = r.payload;
            if (r.payload.fullSweep) { ui.lastFind = r.payload; ui.selected = null; }
          } else {
            ui.lastFind = r.payload;
            ui.lastSweep = null;
            ui.selected = null;
          }
        }
        if (r.ok && t.name === "prepare_mapping_review") ui.lastPacket = r.payload;
        render(); // UI updates BEFORE the tool returns (SPEC §7)
        return { content: [{ type: "text", text: JSON.stringify(r.ok ? r.payload : { error: r.error }) }] };
      },
    });
    registeredCount += 1;
  }
}
$("#tools-badge").textContent = `tools: ${registeredCount}/5 registered`;
$("#tools-badge").classList.add(registeredCount === 5 ? "on" : "off");

render();
window.__imw = { store, render, runTool, personas, registeredCount, ui };
