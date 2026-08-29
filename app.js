// Top-level entry module — the ONLY legal registerTool call site (tests/toplevel.test.mjs).
import { TOOLS, runTool, createStubStore } from "./src/tools/defs.mjs";

const personas = await fetch("./data/personas.json").then((r) => r.json());
const store = createStubStore();

const $ = (sel) => document.querySelector(sel);

function render() {
  const s = store.getState();
  $("#rev-badge").textContent = `r${s.revision}`;
  $("#priority").textContent = [...s.priority, "okta"].join(" → ");
  $("#grid tbody").innerHTML = Object.entries(s.expressions)
    .map(([f, e]) => `<tr><td>${f}</td><td><input data-field="${f}" value="${e.replaceAll('"', "&quot;")}"></td><td>—</td></tr>`)
    .join("");
  $("#pins").innerHTML = s.pins.length
    ? s.pins.map((p) => `<li><code>${p.id}</code> ${p.type}</li>`).join("")
    : '<li class="hint">none pinned yet — the human writes these during review</li>';
  const find = store.getLastFind();
  $("#matrix tbody").innerHTML = find
    ? find.violations.map((v) => `<tr><td>${v.personaId}</td><td class="viol">${v.invariantId}</td><td>${v.field}</td><td>${v.detail}</td></tr>`).join("")
    : "";
}

const present = typeof document.modelContext !== "undefined" && document.modelContext !== null;
$("#mc-badge").textContent = `modelContext: ${present ? "present" : "absent"}`;
$("#mc-badge").classList.add(present ? "on" : "off");

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
        render(); // UI updates BEFORE the tool returns (SPEC §7)
        return { content: [{ type: "text", text: JSON.stringify(r.ok ? r.payload : { error: r.error }) }] };
      },
    });
    registeredCount += 1;
  }
}

render();
window.__imw = { store, render, runTool, personas, registeredCount };
