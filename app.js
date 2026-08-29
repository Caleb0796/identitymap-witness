// Top-level entry module — the ONLY legal registerTool call site (tests/toplevel.test.mjs).
import { TOOLS, runTool, GOLDEN_STATE } from "./src/tools/defs.mjs";
import { createStore } from "./src/store/reducer.mjs";
import { evaluateAll } from "./src/engine/witness.mjs";

const personas = await fetch("./data/personas.json").then((r) => r.json());
const store = createStore(GOLDEN_STATE);
const ui = { lastFind: null, lastPacket: null };

const $ = (sel) => document.querySelector(sel);
const esc = (v) => String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll('"', "&quot;");

function provChips() {
  const s = store.getState();
  const outs = evaluateAll(s, personas);
  const chips = {};
  for (const field of Object.keys(s.expressions)) {
    const sources = new Set(personas.map((p) => outs[p.id].fields[field].prov.source ?? "∅"));
    chips[field] = [...sources].join(",");
  }
  return chips;
}

function render() {
  const s = store.getState();
  $("#rev-badge").textContent = `r${s.revision}`;
  $("#priority").textContent = [...s.priority, "okta"].join(" → ");

  const chips = provChips();
  $("#grid tbody").innerHTML = Object.entries(s.expressions)
    .map(([f, e]) => `<tr><td>${f}</td><td><input data-field="${f}" value="${esc(e)}"></td><td>${chips[f]}</td></tr>`)
    .join("");
  for (const input of document.querySelectorAll("#grid input")) {
    input.addEventListener("change", (ev) => {
      store.dispatch({ type: "EDIT_EXPRESSION", field: ev.target.dataset.field, expr: ev.target.value });
      render();
    });
  }

  $("#pins").innerHTML = s.pins.length
    ? s.pins.map((p) => `<li><code>${p.id}</code> ${p.type}</li>`).join("")
    : '<li class="hint">none pinned yet — the human writes these during review</li>';

  const find = ui.lastFind;
  const findStale = find && (find.evidenceIds ?? []).some((id) => s.evidence[id]?.stale);
  $("#witness h2").textContent = `Counterexample matrix${findStale ? " — STALE (draft edited since)" : ""}`;
  $("#matrix tbody").innerHTML = find
    ? find.violations.map((v) => `<tr${findStale ? ' class="stale"' : ""}><td>${v.personaId}</td><td class="viol">${v.invariantId}</td><td>${v.field}</td><td>${esc(v.detail ?? "")}</td></tr>`).join("")
    : "";

  const pkt = ui.lastPacket;
  $("#packet-state").textContent = pkt
    ? (pkt.blockers.length ? `packet ${pkt.packetId}: BLOCKED — ${pkt.blockers.map((b) => `${b.pin}:${b.reason}`).join(", ")}` : `packet ${pkt.packetId}: GREEN (r${pkt.revision})`)
    : "no packet";
  $("#apply").disabled = !(pkt && pkt.blockers.length === 0);
}

const present = typeof document.modelContext !== "undefined" && document.modelContext !== null;
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
        if (r.ok && t.name === "find_mapping_counterexample") ui.lastFind = r.payload;
        if (r.ok && t.name === "prepare_mapping_review") ui.lastPacket = r.payload;
        render(); // UI updates BEFORE the tool returns (SPEC §7)
        return { content: [{ type: "text", text: JSON.stringify(r.ok ? r.payload : { error: r.error }) }] };
      },
    });
    registeredCount += 1;
  }
}

render();
window.__imw = { store, render, runTool, personas, registeredCount, ui };
