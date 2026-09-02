// Top-level entry module — the ONLY legal registerTool call site (tests/toplevel.test.mjs).
import {
  TOOLS,
  GOLDEN_STATE,
  createToolExecutor,
  registerToolDefinitions,
} from "./src/tools/defs.mjs";
import { createStore, packetFresh } from "./src/store/reducer.mjs";
import { validatePersonasFixture } from "./src/engine/personas.mjs";
import { evaluateAll } from "./src/engine/witness.mjs";
import { parse } from "./src/engine/parser.mjs";
import { MAX_EXPRESSION_CHARS } from "./src/tools/validate.mjs";

const $ = (sel) => document.querySelector(sel);
const present = typeof document.modelContext?.registerTool === "function";
$("#origin-badge").textContent = `origin: ${location.host}`;
$("#mc-badge").textContent = `modelContext: ${present ? "present" : "absent"}`;
$("#mc-badge").classList.add(present ? "on" : "off");
$("#webmcp-hint").hidden = present;
$("#tools-badge").textContent = "tools: loading";
$("#tools-badge").classList.remove("on", "off");
$("#reset-demo").addEventListener("click", () => location.reload());
const copyButtons = ["#copy-prompt-1", "#copy-prompt-2"].map((selector) => $(selector));
if (present) for (const button of copyButtons) button.disabled = true;

let personas = null;
let dataError = null;
try {
  const response = await fetch("./data/personas.json");
  if (!response.ok) throw new Error(`personas request failed with HTTP ${response.status}`);
  personas = validatePersonasFixture(await response.json());
} catch (caught) {
  dataError = caught;
}

if (dataError) {
  const error = $("#initialization-error");
  error.textContent = "Demo data could not be loaded. Reload the page to retry.";
  error.hidden = false;
  $("#tools-badge").textContent = "tools: unavailable";
  $("#tools-badge").classList.add("off");
  $("#rev-badge").textContent = "r—";
  for (const selector of ["#copy-prompt-1", "#copy-prompt-2", "#priority-select", "#apply"])
    $(selector).disabled = true;
  console.error("IdentityMap Witness demo data failed validation", dataError);
}

if (personas) {
const store = createStore(GOLDEN_STATE);
const ui = { lastFind: null, lastSweep: null, lastPacket: null, selected: null, pendingError: null };
const COPY_PROMPT_1 = "Read the mapping session on this page. Stage exactly these three invariants and then stop and tell me to confirm them on the page: (1) contractors must never map into the employees group; (2) if no source supplies managerId the target must stay null; (3) hris is the source of truth for department. Do not call any other tool until I tell you I confirmed.";
const COPY_PROMPT_2 = "I confirmed the rules. Re-read the session, then find the minimal counterexample set. Walk me through fixing every violation: tell me exactly which expression or the priority order to change in the page UI. After each of my edits, re-find at the current revision. When violations reach zero, prepare the review packet from the fresh evidence ids.";

const show = (v) => v === null ? "∅ null" : v === "" ? '"" empty' : String(v);
const allClear = document.createElement("div");
allClear.id = "all-clear";
allClear.className = "hint";
allClear.hidden = true;
const witnessSummary = document.createElement("div");
witnessSummary.id = "witness-summary";
witnessSummary.className = "hint";
witnessSummary.hidden = true;
$("#matrix").closest(".table-scroll").before(witnessSummary, allClear);

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
      let completed = false;
      try {
        store.dispatch({ type, version: Number(button.dataset.version) });
        ui.pendingError = null;
        completed = true;
      } catch (caught) {
        ui.pendingError = caught?.code === "STALE_CONFIRM"
          ? "STALE_CONFIRM — pending rules changed; review the current proposal"
          : String(caught?.message ?? caught);
      }
      render();
      if (completed)
        $(type === "CONFIRM_RULES" ? "#copy-prompt-2" : "#copy-prompt-1")
          .focus({ preventScroll: true });
    });
    actions.append(button);
  }
}

function syncScrollRegions() {
  for (const container of document.querySelectorAll(".table-scroll")) {
    const overflows = container.scrollWidth > container.clientWidth + 1;
    if (overflows) {
      container.tabIndex = 0;
      container.setAttribute("role", "region");
      container.setAttribute("aria-label", container.dataset.scrollLabel);
    } else {
      container.removeAttribute("tabindex");
      container.removeAttribute("role");
      container.removeAttribute("aria-label");
    }
  }
}

window.addEventListener("resize", syncScrollRegions);

function commitExpressionInput(input) {
  const error = input.parentElement.querySelector(".expression-error");
  if (input.value.length > MAX_EXPRESSION_CHARS) {
    input.setAttribute("aria-invalid", "true");
    error.hidden = false;
    error.textContent = `Expression is too long (${input.value.length} characters); maximum is ${MAX_EXPRESSION_CHARS}`;
    return;
  }
  try {
    parse(input.value);
  } catch (caught) {
    const position = Number.isInteger(caught?.position) ? caught.position : 0;
    input.setAttribute("aria-invalid", "true");
    error.hidden = false;
    error.textContent = `Invalid expression at position ${position}: ${String(caught?.message ?? caught)}`;
    return;
  }
  input.setAttribute("aria-invalid", "false");
  error.hidden = true;
  error.textContent = "";
  store.dispatch({ type: "EDIT_EXPRESSION", field: input.dataset.field, expr: input.value });
  render();
}

function renderRail(outs) {
  const sel = ui.selected;
  const section = $("#provenance");
  if (!outs || !sel || !outs[sel.personaId]) { section.hidden = true; return; }
  const cell = outs[sel.personaId].fields[sel.field];
  if (!cell) { section.hidden = true; return; }
  section.hidden = false;
  const p = cell.prov;
  const rail = $("#rail");
  rail.replaceChildren();
  const head = document.createElement("div");
  head.className = "rail-head";
  head.append(document.createTextNode(`${sel.personaId} · ${sel.field} → ${show(cell.value)} `));
  const source = document.createElement("span");
  source.className = "hint";
  source.textContent = `(source: ${p.source ?? "∅"}${p.branch ? ` · branch: ${p.branch}` : ""})`;
  head.append(source);
  rail.append(head);
  if (p.candidates.length) {
    const table = document.createElement("table");
    const header = document.createElement("thead");
    const headerRow = document.createElement("tr");
    for (const label of ["source (priority order)", "present", "value", ""]) {
      const heading = document.createElement("th");
      heading.textContent = label;
      headerRow.append(heading);
    }
    header.append(headerRow);
    const body = document.createElement("tbody");
    for (const c of p.candidates) {
      const cls = c.source === p.source ? "winner" : c.present ? "loser" : "absent";
      const note = c.source === p.source ? "← wins" : c.present ? "loses (later in priority)" : "absent";
      const row = document.createElement("tr");
      for (const [value, className] of [
        [c.source, ""],
        [c.present ? "yes" : "no", ""],
        [c.present ? show(c.value) : "—", cls],
        [note, cls],
      ]) {
        const item = document.createElement("td");
        if (className) item.className = className;
        item.textContent = value;
        row.append(item);
      }
      body.append(row);
    }
    table.append(header, body);
    const scroll = document.createElement("div");
    scroll.className = "table-scroll";
    scroll.dataset.scrollLabel = "Provenance candidates table";
    scroll.append(table);
    rail.append(scroll);
  } else if (p.inputs.length) {
    const inputs = document.createElement("div");
    inputs.className = "hint";
    inputs.textContent = `inputs: ${p.inputs.map((i) => `${i.ref} (${i.source ?? "∅"})`).join(" · ")}`;
    rail.append(inputs);
  } else {
    const literal = document.createElement("div");
    literal.className = "hint";
    literal.textContent = "literal value — no source resolution involved";
    rail.append(literal);
  }
}

function render() {
  const active = document.activeElement;
  const activeId = active?.id ?? null;
  const inputFocus = active?.matches?.("#grid input")
    ? {
        selectionStart: active.selectionStart,
        selectionEnd: active.selectionEnd,
        selectionDirection: active.selectionDirection,
      }
    : null;
  const matrixFocus = active?.classList.contains("matrix-select")
    ? { personaId: active.dataset.personaId, field: active.dataset.field }
    : null;
  const localDrafts = new Map([...document.querySelectorAll("#grid input")].map((input) => {
    const error = input.parentElement.querySelector(".expression-error");
    return [input.dataset.field, {
      value: input.value,
      ariaInvalid: input.getAttribute("aria-invalid"),
      errorHidden: error.hidden,
      errorText: error.textContent,
    }];
  }));
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
  const gridBody = $("#grid tbody");
  gridBody.replaceChildren();
  for (const [field, expression] of Object.entries(s.expressions)) {
    const row = document.createElement("tr");
    const fieldCell = document.createElement("td");
    fieldCell.textContent = field;
    const expressionCell = document.createElement("td");
    expressionCell.className = "expression-cell";
    const label = document.createElement("label");
    label.className = "visually-hidden";
    label.htmlFor = `expression-${field}`;
    label.textContent = `Expression for ${field}`;
    const input = document.createElement("input");
    input.id = `expression-${field}`;
    input.dataset.field = field;
    input.value = expression;
    input.setAttribute("aria-invalid", "false");
    input.setAttribute("aria-describedby", `expression-error-${field}`);
    const error = document.createElement("div");
    error.id = `expression-error-${field}`;
    error.className = "expression-error";
    error.setAttribute("aria-live", "polite");
    error.hidden = true;
    const localDraft = localDrafts.get(field);
    if (localDraft
        && (localDraft.value !== expression || localDraft.ariaInvalid === "true")) {
      input.value = localDraft.value;
      input.setAttribute("aria-invalid", localDraft.ariaInvalid);
      error.hidden = localDraft.errorHidden;
      error.textContent = localDraft.errorText;
    }
    expressionCell.append(label, input, error);
    const provenanceCell = document.createElement("td");
    provenanceCell.className = "prov-chip";
    provenanceCell.textContent = chips[field];
    row.append(fieldCell, expressionCell, provenanceCell);
    gridBody.append(row);
  }
  for (const input of document.querySelectorAll("#grid input")) {
    input.addEventListener("change", (ev) => {
      commitExpressionInput(ev.target);
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
  const hasWitness = Boolean(find && !find.cleanSweep && find.personaIds.length > 0);
  witnessSummary.hidden = !hasWitness;
  witnessSummary.classList.toggle("stale", Boolean(hasWitness && findStale));
  witnessSummary.textContent = hasWitness
    ? `Minimal witness (${find.personaIds.length}): ${find.personaIds.join(", ")} · ${find.violations.length} violation rows, including alternate witnesses${findStale ? " · STALE" : ""}`
    : "";
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
    const selected = ui.selected
      && ui.selected.personaId === violation.personaId
      && ui.selected.field === violation.field;
    if (selected) row.classList.add("selected");
    const personaCell = document.createElement("td");
    const select = document.createElement("button");
    select.type = "button";
    select.className = "matrix-select";
    select.dataset.personaId = violation.personaId;
    select.dataset.field = violation.field;
    select.textContent = violation.personaId;
    select.setAttribute("aria-label", `Show provenance for persona ${violation.personaId}, field ${violation.field}, invariant ${violation.invariantId}`);
    select.setAttribute("aria-controls", "provenance");
    select.setAttribute("aria-expanded", String(Boolean(selected)));
    personaCell.append(select);
    row.append(personaCell);
    for (const [value, className] of [
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
      ps.textContent = `packet ${pkt.packetId} @ r${pkt.revision}: GREEN — every confirmed rule covered by fresh evidence`;
      ps.classList.add("green");
    }
  } else {
    ps.textContent = "no packet";
  }
  $("#apply").disabled = !(fresh && pkt.blockers.length === 0);
  syncScrollRegions();
  if (matrixFocus) {
    const replacement = [...document.querySelectorAll(".matrix-select")].find((button) =>
      button.dataset.personaId === matrixFocus.personaId && button.dataset.field === matrixFocus.field);
    replacement?.focus({ preventScroll: true });
  } else if (activeId) {
    const replacement = document.getElementById(activeId);
    replacement?.focus({ preventScroll: true });
    if (inputFocus && replacement instanceof HTMLInputElement)
      replacement.setSelectionRange(
        inputFocus.selectionStart,
        inputFocus.selectionEnd,
        inputFocus.selectionDirection,
      );
  }
}

function flushGridDrafts() {
  try {
    for (const input of document.querySelectorAll("#grid input")) {
      try {
        const committed = store.getState().expressions[input.dataset.field];
        if (input.value === committed || input.value.length > MAX_EXPRESSION_CHARS) continue;
        parse(input.value);
        commitExpressionInput(input);
      } catch {
        // Invalid drafts and unexpected DOM state stay local and cannot block a tool call.
      }
    }
  } catch {
    // A missing or replaced grid cannot block the WebMCP surface.
  }
}

$("#priority-select").addEventListener("change", (event) => {
  store.dispatch({ type: "SET_PRIORITY", priority: event.target.value.split(",") });
  render();
});
for (const [selector, prompt, label] of [
  ["#copy-prompt-1", COPY_PROMPT_1, "prompt 1 ready to paste"],
  ["#copy-prompt-2", COPY_PROMPT_2, "prompt 2 ready to paste"],
]) {
  $(selector).addEventListener("click", async () => {
    const status = $("#copy-status");
    const fallback = $("#prompt-fallback");
    try {
      await copyText(prompt);
      status.textContent = `copied — ${label}`;
      status.classList.remove("error");
      fallback.hidden = true;
      fallback.value = "";
    } catch {
      fallback.value = prompt;
      fallback.hidden = false;
      fallback.focus();
      fallback.select();
      status.textContent = "Copy failed — prompt selected below; press ⌘C or Ctrl+C";
      status.classList.add("error");
    }
  });
}
$("#apply").addEventListener("click", () => alert("Apply is a manual page control, is not exposed as a WebMCP tool, and this demo never exercises it."));

const lifecycle = new AbortController();
window.addEventListener("pagehide", (event) => {
  if (!event.persisted) lifecycle.abort();
});
let registeredCount = 0;
let toolSnapshotBefore = null;
if (present) {
  const registration = await registerToolDefinitions(
    TOOLS,
    (definition, options) => document.modelContext.registerTool({
      name: definition.name,
      description: definition.description,
      inputSchema: definition.inputSchema,
      execute: definition.execute,
      annotations: definition.annotations,
    }, options),
    (tool) => {
      const executeTool = createToolExecutor(store, personas, tool.name, (result) => {
        if (result.ok && tool.name === "find_mapping_counterexample") {
          if (result.payload.cleanSweep) {
            ui.lastSweep = result.payload;
            if (result.payload.fullSweep) { ui.lastFind = result.payload; ui.selected = null; }
          } else {
            ui.lastFind = result.payload;
            ui.lastSweep = null;
            ui.selected = null;
          }
        }
        if (result.ok && tool.name === "prepare_mapping_review") ui.lastPacket = result.payload;
        render(); // UI updates BEFORE the tool returns (SPEC §7)
      });
      return {
        name: tool.name,
        description: tool.description,
        inputSchema: tool.inputSchema,
        annotations: tool.annotations,
        execute: async (args, context) => {
          if (!context?.signal?.aborted) flushGridDrafts();
          toolSnapshotBefore = store.snapshot();
          return executeTool(args, context);
        },
      };
    },
    lifecycle.signal,
    (count) => {
      registeredCount = count;
      $("#tools-badge").textContent = `tools: ${count}/5 registering`;
      $("#tools-badge").classList.add("off");
    },
  );
  registeredCount = registration.registeredCount;
  const registrationReady = !registration.failed && registeredCount === 5;
  $("#tools-badge").textContent = registration.failed
    ? "tools: registration failed — Reset demo to retry"
    : `tools: ${registeredCount}/5 registered`;
  $("#tools-badge").classList.remove("on", "off");
  $("#tools-badge").classList.add(registrationReady ? "on" : "off");
  for (const button of copyButtons) button.disabled = !registrationReady;
} else {
  $("#tools-badge").textContent = "tools: 0/5 registered";
  $("#tools-badge").classList.remove("on", "off");
  $("#tools-badge").classList.add("off");
}

render();
const inspection = Object.freeze({
  state: () => structuredClone(store.getState()),
  snapshot: () => structuredClone(store.snapshot()),
  toolSnapshotBefore: () => structuredClone(toolSnapshotBefore),
  personas: () => structuredClone(personas),
  ui: () => structuredClone(ui),
  registeredToolCount: () => registeredCount,
});
Object.defineProperty(window, "__imw", {
  value: inspection,
  writable: false,
  configurable: false,
});
}
