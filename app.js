// Top-level entry module — the ONLY legal registerTool call site (tests/toplevel.test.mjs).
import { TOOLS, runTool, GOLDEN_STATE } from "./src/tools/defs.mjs";
import { createStore } from "./src/store/reducer.mjs";
import { evaluateAll } from "./src/engine/witness.mjs";

const personas = await fetch("./data/personas.json").then((r) => r.json());
const store = createStore(GOLDEN_STATE);
const ui = { lastFind: null, lastSweep: null, lastPacket: null, selected: null };

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");
const show = (v) => v === null ? "∅ null" : v === "" ? '"" empty' : esc(v);
const allClear = document.createElement("div");
allClear.id = "all-clear";
allClear.className = "hint";
allClear.hidden = true;
$("#matrix").before(allClear);

function renderRail(outs) {
  const sel = ui.selected;
  const section = $("#provenance");
  if (!sel || !outs[sel.personaId]) { section.hidden = true; return; }
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
  $("#priority").textContent = [...s.priority, "okta"].join(" → ");

  const outs = evaluateAll(s, personas);
  const chips = {};
  for (const field of Object.keys(s.expressions)) {
    const sources = new Set(personas.map((p) => outs[p.id].fields[field].prov.source ?? "∅"));
    chips[field] = [...sources].join(",");
  }
  $("#grid tbody").innerHTML = Object.entries(s.expressions)
    .map(([f, e]) => `<tr><td>${f}</td><td><input data-field="${f}" value="${esc(e)}"></td><td class="prov-chip">${chips[f]}</td></tr>`)
    .join("");
  for (const input of document.querySelectorAll("#grid input")) {
    input.addEventListener("change", (ev) => {
      store.dispatch({ type: "EDIT_EXPRESSION", field: ev.target.dataset.field, expr: ev.target.value });
      render();
    });
  }

  $("#pins").innerHTML = s.pins.length
    ? s.pins.map((p) => `<li><span class="pin-chip"><code>${esc(p.id)}</code> ${esc(p.type)}<button data-unpin="${esc(p.id)}" title="unpin">✕</button></span></li>`).join("")
    : '<li class="hint">none pinned yet — the human states these; the agent stages them</li>';
  for (const b of document.querySelectorAll("#pins [data-unpin]")) {
    b.addEventListener("click", () => { store.dispatch({ type: "UNPIN", id: b.dataset.unpin }); render(); });
  }

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
  $("#matrix tbody").innerHTML = find
    ? find.violations.map((v, i) =>
        `<tr data-row="${i}" class="${findStale ? "stale" : ""}${ui.selected && ui.selected.personaId === v.personaId && ui.selected.field === v.field ? " selected" : ""}">`
        + `<td>${esc(v.personaId)}</td><td class="viol">${esc(v.invariantId)}</td><td>${esc(v.field)}</td><td>${esc(v.detail ?? "")}</td></tr>`).join("")
    : "";
  for (const tr of document.querySelectorAll("#matrix tbody tr")) {
    tr.addEventListener("click", () => {
      const v = find.violations[Number(tr.dataset.row)];
      ui.selected = { personaId: v.personaId, field: v.field };
      render();
    });
  }
  renderRail(outs);

  const pkt = ui.lastPacket;
  const ps = $("#packet-state");
  ps.classList.remove("green", "blocked");
  if (pkt) {
    if (pkt.blockers.length) {
      ps.textContent = `packet ${pkt.packetId} @ r${pkt.revision}: BLOCKED — ${pkt.blockers.map((b) => `${b.pin}:${b.reason}`).join(", ")}`;
      ps.classList.add("blocked");
    } else {
      ps.textContent = `packet ${pkt.packetId} @ r${pkt.revision}: GREEN — every pin covered by fresh closing evidence`;
      ps.classList.add("green");
    }
  } else {
    ps.textContent = "no packet";
  }
  $("#apply").disabled = !(pkt && pkt.blockers.length === 0);
}

const present = typeof document.modelContext !== "undefined" && document.modelContext !== null;
$("#origin-badge").textContent = `origin: ${location.host}`;
$("#mc-badge").textContent = `modelContext: ${present ? "present" : "absent"}`;
$("#mc-badge").classList.add(present ? "on" : "off");
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
