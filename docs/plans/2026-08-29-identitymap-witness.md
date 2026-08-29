# IdentityMap Witness Implementation Plan (r2, post-review)

> **For agentic workers:** executed by the Ralph loop in `RALPH.md` (user-prescribed
> executor). One step per iteration where steps are heavy; a whole task per iteration
> where light. Every `- [ ]` lives on its own line — check it off in this file and
> commit the checkbox edit together with the work it records. A failing-test step is
> NEVER committed alone: test + implementation land in one commit at the task's
> commit step.

r2 supersedes r1 after the gpt-5.6-sol review (`reviews/codex-sol-2026-08-29.md`):
vertical slice first, direction cut, golden state defective-by-design, isomorphic
tool module, root deploy layout, exhaustive witness search, fingerprint
invalidation, external verifier + HALT protocol.

**Goal:** Ship SPEC.md r2 with EVAL.md r2 layers green, scorer + labeled ablation
reported, deployed remote origin, before 2026-09-03 13:00 PT.

**Architecture:** Zero-dependency Node 20 ES modules. One isomorphic tool+engine
core (`src/`) imported unchanged by tests, the page, and the ablation. Page at repo
root for single-directory static deploy. CDP harness drives Chrome 152 by name over
the `WebMCP` domain. External verifier `tools/verify.mjs` is the only authority for
"done".

**Tech Stack:** Node 20+, `node --test`, vanilla ESM, no build, no runtime deps.
Chrome 152 local. Render static site (publish `.`).

**Spec:** `SPEC.md` r2 (constraints C1–C10, golden state §4, tool contracts §7,
store semantics §8). **Eval:** `EVAL.md` r2 (layers, scorer, ablation, K-gates).

## Global Constraints

- Deadline 2026-09-03 13:00 PT. Gates: K0 2026-08-30 14:00 (T1+T2 green);
  K4 08-31 18:00 (`npm test` + `--smoke` green); K5 09-01 21:00 (human ChatGPT
  evidence committed). Loop checks `date` against these EVERY iteration (RALPH.md).
- `document.modelContext` only; `navigator.modelContext` banned in `src/**`,
  `harness/**`, root `app.js` (tested). Top-level registration only.
- No tool waits on a human (C4). Payload ≤1500 chars. No apply/save/push tool.
- No `CANARY_` leaves any tool (keys, values, candidates, diffs).
- Never touch `/Users/calebwei/mcp/outpocket`. Patterns retyped, never imported.
- Numbers from command output only (D-38). Loop never edits `data/oracle.json`
  `audited` field or `data/golden-walk.md` after T1 (human-only thereafter).
- Public materials: no WindTunnel, no arXiv 2508.09171, no uniqueness claims.
- Commit prefix `T<n>:`; every commit leaves `npm test` green (except inside a
  task before its commit step — never leave a red tree AT a commit).

---

### Task 1: Golden contract freeze (fixture + hand-walk + oracle + snapshot)

**Files:**
- Create: `package.json`, `.gitignore`, `data/personas.json`, `data/defects.md`,
  `data/golden-walk.md`, `data/oracle.json`, `data/persisted-snapshot.json`,
  `tests/fixture.test.mjs`

**Interfaces (frozen here, consumed by every later task):**
- Persona: `{id, category, region, profiles: {okta: {...}, hris: {...}, ad: {...}}}`
  — identity fields `firstName/lastName/email` in EVERY profile carry
  `CANARY_FN_<id>` / `CANARY_LN_<id>` / `CANARY_EM_<id>@example.invalid`.
- Golden state: SPEC §4 verbatim (priority `["ad","hris"]`, the four DC expressions).
- Oracle: `{audited: false, minimalWitness: {size: 3, sets: [["P2","P3","P4"],["P2","P3","P5"]]}, expectedViolations: [{invariantId, personaId, field, defectClass}], expectedValues: {personaId: {field: {value, provSource}}}}` — filled for all 8 personas × 5 fields by HAND-WALKING SPEC §6 semantics in `data/golden-walk.md` first, then transcribing. The engine does not exist yet; that is the point.
- Snapshot: pre-session saved state — corrected `group` expr
  (`String.toLowerCase(user.userType) == "contractor" ? …`), plain `user.managerId`,
  priority `["hris","ad"]`, no pins. This is what a saved-state reader sees.

- [x] **Step 1: package.json + .gitignore**

```json
{
  "name": "identitymap-witness",
  "private": true,
  "type": "module",
  "scripts": { "test": "node --test", "serve": "node harness/serve.mjs" },
  "engines": { "node": ">=20" }
}
```
`.gitignore`: `node_modules/`, `eval/out/tmp-*`, `.claude/.ralph-loop.local.md`, `chrome-profile-*/`

- [x] **Step 2: Write the failing fixture test**

```js
// tests/fixture.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
const load = async (f) => JSON.parse(await readFile(new URL(`../data/${f}`, import.meta.url)));

test("personas: 8, canaries in EVERY source profile, DC carriers present", async () => {
  const ps = await load("personas.json");
  assert.equal(ps.length, 8);
  for (const p of ps) for (const src of ["okta", "hris", "ad"]) {
    const prof = p.profiles[src] ?? {};
    for (const [k, re] of [["firstName", /^CANARY_FN_/], ["lastName", /^CANARY_LN_/], ["email", /^CANARY_EM_.+@example\.invalid$/]])
      if (k in prof) assert.match(prof[k], re, `${p.id}.${src}.${k}`);
    assert.ok(("firstName" in prof) || src !== "okta", "okta profile carries identity");
  }
  assert.ok(ps.some(p => p.id === "P2" && p.profiles.hris.userType === "Contractor")); // DC1 carrier
  assert.ok(ps.some(p => p.id === "P3" && p.region === "EU"
    && !["okta","hris","ad"].some(s => "managerId" in (p.profiles[s] ?? {}))));        // DC2 carrier
  assert.ok(ps.some(p => p.id === "P4" && p.profiles.ad.department === "Sales"
    && p.profiles.hris.department === "Engineering"));                                 // DC3 carrier
  assert.ok(ps.some(p => p.id === "P5" && p.profiles.ad.department === ""
    && p.profiles.hris.department === "Finance"));                                     // DC4 carrier
});
test("oracle: unaudited, size-3 witness, violations reference the 4 classes", async () => {
  const o = await load("oracle.json");
  assert.equal(o.audited, false);
  assert.equal(o.minimalWitness.size, 3);
  assert.deepEqual([...new Set(o.expectedViolations.map(v => v.defectClass))].sort(),
    ["DC1", "DC2", "DC3", "DC4"]);
});
test("snapshot: corrected exprs, hris-first, no pins", async () => {
  const s = await load("persisted-snapshot.json");
  assert.deepEqual(s.priority, ["hris", "ad"]);
  assert.ok(s.expressions.group.includes("String.toLowerCase"));
  assert.equal(s.expressions.managerId, "user.managerId");
  assert.deepEqual(s.pins, []);
});
```

- [x] **Step 3: `npm test` → verify FAIL (ENOENT)**
- [x] **Step 4: Author personas (P1 clean baseline, P2 "Contractor", P3 EU managerless, P4 dept conflict, P5 ad-empty dept, P6 employee mixed-case group source, P7 lowercase contractor mapped correctly, P8 spare clean), then hand-walk SPEC §6 over SPEC §4 in `data/golden-walk.md` (a table: persona × field → value, prov source, violated pin, defect class — every row derived on paper), transcribe into oracle.json + defects.md, author persisted-snapshot.json**
- [x] **Step 5: `npm test` green → commit** `T1: golden contract — fixture, hand-walk, oracle, snapshot`

---

### Task 2: Vertical slice — page at root, 5 stub tools registered, CDP smoke

Retires on day one: C3/C7/C8/C10 launch+registration risk and the deploy-layout
404 risk (review P1). Stubs return SPEC-shaped payloads from the golden state
WITHOUT the engine (hardcoded from `data/golden-walk.md`).

**Files:**
- Create: `index.html`, `style.css`, `app.js`, `src/tools/defs.mjs`,
  `harness/serve.mjs`, `harness/chrome.mjs`, `harness/cdp.mjs`, `harness/relay.mjs`
- Test: `tests/toplevel.test.mjs`

**Interfaces:**
- `src/tools/defs.mjs` (ISOMORPHIC — imported by app.js, tests, ablation; zero
  node-only imports): exports `TOOLS: [{name, description, inputSchema, annotations, handler}]`
  and `runTool(store, personas, name, args) -> {ok, payload}|{ok:false, error}`;
  in T2 handlers are stubs keyed `STUB:` + shape-correct.
- `index.html`: top-level `<script type="module">` imports `./app.js`; app.js
  builds store stub, calls `registerAll`, exposes `window.__imw = {store, render, runTool}`.
- `registerAll` (inside app.js, per SPEC C10, no `{signal}`):

```js
for (const t of TOOLS) {
  document.modelContext.registerTool({
    name: t.name, description: t.description, inputSchema: t.inputSchema,
    annotations: t.annotations,
    execute: async (args) => {
      const r = runTool(store, personas, t.name, args ?? {});
      render();
      return { content: [{ type: "text", text: JSON.stringify(r.ok ? r.payload : { error: r.error }) }] };
    },
  });
}
```

- `harness/serve.mjs`: node:http static server, root = repo root, `/` → index.html.
- `harness/chrome.mjs`: `launchChrome({port, userDataDir})` with
  `--enable-features=WebMCP --headless=new --remote-debugging-port=<port> --user-data-dir=<fresh>`;
  kills + rm -rf profile on close.
- `harness/cdp.mjs`: ~80-line WebSocket JSON-RPC client (node:http upgrade),
  `send(method, params, sessionId)`, `on(fn)`.
- `harness/relay.mjs --smoke` asserts: completed `WebMCP.invokeTool`→`toolResponded`
  round trip on `read_mapping_session` (presence proof per C7);
  `(await document.modelContext.getTools()).length === 5` via Runtime.evaluate (C6);
  unknown name → -32602 at send; matrix DOM node exists; **cold sessions ×3**, fresh
  profile each, all pass.

- [x] **Step 1: Write `tests/toplevel.test.mjs`** — static import-graph walk (blank
  strings/comments, regex imports): `registerTool` reachable only from index.html's
  entry module; `navigator.modelContext` absent from `src/**`, `harness/**`, `app.js`.
- [x] **Step 2: `npm test` → new test FAILS (files missing)**
- [x] **Step 3: Implement the slice (stub handlers; minimal grid + matrix DOM)**
- [x] **Step 4: `npm test` green AND `node harness/relay.mjs --smoke` exit 0**
- [x] **Step 5: Commit** `T2: vertical slice — root page, 5 stub tools, CDP smoke x3`

---

### Task 3: Parser

**Files:** Create `src/engine/parser.mjs`, `tests/parser.test.mjs`

**Interfaces:** `parse(src) -> ast`; nodes `{k:"str",v}`, `{k:"null"}`,
`{k:"ident", name}` (namespace `user` only — direction is cut), `{k:"call",
fn:"upper"|"lower", arg}`, `{k:"concat", parts}`, `{k:"eq"|"neq", l, r}`,
`{k:"ternary", cond, then, else}`. Errors: `{code:"INVALID_AST", position}`.

- [x] **Step 1: Failing tests** — the four SPEC §4 draft expressions parse to
  exact ASTs (write all four as deepEqual cases); rejects
  `['appuser.x', 'user[0]', 'fetch("x")', 'a && b', 'user.', '1 + 2', 'x ? y']`
  each with INVALID_AST + numeric `position`.
- [x] **Step 2: run → FAIL**
- [x] **Step 3: Implement (tokenizer + recursive descent, ≈90 lines)**
- [x] **Step 4: `npm test` green**
- [x] **Step 5: Commit** `T3: EL subset parser`

---

### Task 4: Evaluator + candidates provenance + golden cross-check

**Files:** Create `src/engine/eval.mjs`, `tests/eval.test.mjs`, `tests/golden.test.mjs`

**Interfaces:** `evaluate(ast, persona, {priority}) -> {value, prov}`;
`prov = {source, branch, candidates: [{source, present, value}], inputs: [{ref, source}]}`.
Resolution/null/empty semantics per SPEC §6 exactly.

- [x] **Step 1: Failing tests** — semantics table (priority order; DC4
  present-but-empty wins; null poisons concat, "" does not; `"" == null` false;
  branch capture); candidates chain includes losing `hris` for P4-shaped input.
  `tests/golden.test.mjs`: evaluate SPEC §4 golden expressions over ALL personas
  and deepEqual against `oracle.expectedValues` (machine now reproduces the
  hand-walk — review P1 #2's guard).
- [x] **Step 2: FAIL** → **Step 3: implement (≈90 lines)** → **Step 4: green**
- [x] **Step 5: Commit** `T4: evaluator + candidates provenance + golden cross-check`

---

### Task 5: Invariant checker

**Files:** Create `src/engine/invariants.mjs`, `tests/invariants.test.mjs`

**Interfaces:** `checkInvariants(pins, personas, outputs) -> [{invariantId,
personaId, field, detail}]`; `outputs[personaId] = {fields: {name: {value, prov}}}`.
SPEC §5 semantics; checker case-insensitive on category/group (DC1 asymmetry).

- [x] **Step 1: Failing tests** — golden outputs (from T4) produce EXACTLY
  oracle.expectedViolations (set-equal); corrected-snapshot outputs produce zero;
  per-type edge cases (missing group field, null category).
- [x] **Step 2: FAIL** → **Step 3: implement (≈50 lines)** → **Step 4: green**
- [x] **Step 5: Commit** `T5: invariant checker matches oracle`

---

### Task 6: Witness search (exhaustive, provably minimal)

**Files:** Create `src/engine/witness.mjs`, `tests/witness.test.mjs`

**Interfaces:** `findWitness(state, personas) -> {personaIds, violations,
coverage}` — evaluates all personas, checks all pins, then exhaustive subset scan
(personas ≤ 8 ⇒ ≤255 non-empty subsets) for the smallest set covering every
violated invariant; ties → lexicographic persona order.

- [x] **Step 1: Failing tests** — golden: coverage all-true, `personaIds` equals
  one of oracle.minimalWitness.sets (size 3); single-pin case → size 1; clean
  snapshot state → `{personaIds: [], violations: []}`.
- [x] **Step 2: FAIL** → **Step 3: implement (≈50 lines)** → **Step 4: green**
- [x] **Step 5: Commit** `T6: exhaustive minimal witness`

---

### Task 7: Store — revision + fingerprint invalidation + packets

**Files:** Create `src/store/reducer.mjs`, `tests/reducer.test.mjs`

**Interfaces:** `createStore(initial?) -> {getState, dispatch, recordEvidence(kind,
fingerprint, payload) -> id, recordPacket(evidenceIds, pinsCovered, blockers) -> id,
listEvidence()}`. SPEC §8 verbatim: only EDIT_EXPRESSION / SET_PRIORITY /
PIN_INVARIANTS (full replace) / UNPIN bump revision; record* never bumps;
invalidation per fingerprint table.

- [x] **Step 1: Failing tests**

```js
test("fingerprint invalidation table", () => {
  const s = createStore(golden());
  const find = s.recordEvidence("counterexample",
    { fields: ["displayName","group","managerId","department","email"],
      invariants: ["inv-forbid","inv-null","inv-sot"], personas: ALL8 }, {});
  const prev = s.recordEvidence("patch-preview",
    { fields: ["group"], invariants: PINS3, personas: ["P2"] }, {});
  const r0 = s.getState().revision;
  s.dispatch({ type: "EDIT_EXPRESSION", field: "managerId", expr: "user.managerId" });
  assert.equal(s.getState().revision, r0 + 1);
  assert.equal(s.getState().evidence[find].stale, true);   // find spans all fields
  assert.equal(s.getState().evidence[prev].stale, false);  // preview fingerprint untouched
  s.dispatch({ type: "SET_PRIORITY", priority: ["hris","ad"] });
  assert.equal(s.getState().evidence[prev].stale, true);   // priority stales everything
});
test("recordEvidence/recordPacket do not bump revision", () => { /* r stays fixed */ });
test("clean-to-violating edit is caught", () => {
  // start from snapshot (clean), edit email expr into a violating one,
  // assert prior evidence stale AND a fresh findWitness reports the new violation
});
```

- [x] **Step 2: FAIL** → **Step 3: implement (≈80 lines)** → **Step 4: green**
- [x] **Step 5: Commit** `T7: store fingerprints + packets`

---

### Task 8: Redaction

**Files:** Create `src/tools/redact.mjs`, `tests/redact.test.mjs`

**Interfaces:** `redactPayload(p) -> p'` (deep walk over keys AND values AND
arrays: `CANARY_`-bearing strings → `"<redacted>"`; identity-field diffs →
`"<redacted:changed>"`); `assertNoCanary(p)` throws `{code:"PII_GUARD"}`. Tool
layer calls redact THEN assert.

- [x] **Step 1: Failing tests** — nested candidates/diffs scrubbed; canary in a
  KEY caught; non-identity values untouched; crafted post-redaction leak throws.
- [x] **Step 2: FAIL** → **Step 3: implement (≈40 lines)** → **Step 4: green**
- [x] **Step 5: Commit** `T8: redaction + canary guard`

---

### Task 9: Real tools (SPEC §7 complete) + full UI

**Files:** Modify `src/tools/defs.mjs` (stubs → real), `app.js` (full render);
Create `tests/tools.test.mjs`

**Interfaces:** exactly SPEC §7 — every input schema, output shape, error code,
replace-not-append staging, packet-green rule, ≤1500 budget with trim path,
NO_COUNTEREXAMPLE as error. UI per SPEC §10 (grid, chips, matrix, provenance rail
with candidates, packet panel, revision badge, disabled Apply). Human edits in the
UI dispatch to the same store.

- [ ] **Step 1: Failing tests** — per SPEC §7: 5 happy paths against golden state
  (find returns oracle witness); every error code provoked once; budget test at the
  cap (40-violation synthetic state → `truncated:true`, length ≤1500); pin replace
  semantics; canary sweep across all tools × personas (extends T8's property test).
- [ ] **Step 2: FAIL** → **Step 3: implement tools (≈150 lines) + render (≈180 lines)**
- [ ] **Step 4: `npm test` green (target ≥70) AND `--smoke` still exit 0**
- [ ] **Step 5: Commit** `T9: real tools + full UI`

---

### Task 10: Protocol E2E relay

**Files:** Modify `harness/relay.mjs` (add `--e2e`); Create `eval/out/.gitkeep`

- [ ] **Step 1: Encode EVAL.md layer-3 rounds 1–10** (human-sim via
  `window.__imw.store.dispatch` through Runtime.evaluate; per-round asserts; trace
  JSON with invocationId/status/payload/ms → `eval/out/relay-<sha>.json`)
- [ ] **Step 2: run → FAIL** → **Step 3: fix until rounds 5/9/10 show their
  failure/recovery pairs** → **Step 4: exit 0, trace committed**
- [ ] **Step 5: Commit** `T10: protocol E2E, 10 rounds, stale+recovery+pin-coverage`

---

### Task 11: Scorer + ablation + report

**Files:** Create `eval/scorer.mjs`, `eval/ablation.mjs`, `eval/run.mjs`,
`eval/interaction-model.md`

**Interfaces:** per EVAL.md r2 — scorer maps DC1–DC4 → relay observations vs
oracle; ablation runs the SAME `src/` engine over `persisted-snapshot.json`,
reports visible classes with the by-construction label verbatim; `run.mjs` writes
`eval/out/report.json {layers, scorer, ablation, oracleAudited, killLines}`,
exit 2 while `oracle.audited` is false, exit 0 only with all thresholds met.

- [ ] **Step 1: thresholds transcribed from EVAL.md as data; failing run**
- [ ] **Step 2–3: implement scorer/ablation/run (≈120 lines total)**
- [ ] **Step 4: `node eval/run.mjs` → expected exit 2 with watermark
  `oracleAudited:false` and everything else green (audit flip is human-only)**
- [ ] **Step 5: Commit** `T11: scorer + labeled ablation + gated report`

---

### Task 12: Verifier + deploy config + submission docs + HALT

**Files:** Create `tools/verify.mjs`, `render.yaml`, `docs/DEMO-SCRIPT.md`,
`docs/DEVPOST-DRAFT.md`, `docs/EVIDENCE-CHECKLIST.md`; Modify `README.md`

**Interfaces:** `tools/verify.mjs` — the ONLY authority for done: re-runs
`npm test`, `--smoke`, `--e2e`, `eval/run.mjs`; greps this plan for unchecked
boxes in T1–T11; prints exactly one of `STATUS CODE_COMPLETE` /
`STATUS INCOMPLETE <reason>` / `STATUS ABORT_GATE <K-id>` (evaluates K4/K5
clock+artifact conditions from EVAL.md). CODE_COMPLETE does NOT claim
ENTRY_READY — the human checklist in `docs/EVIDENCE-CHECKLIST.md` owns that
(deploy, ChatGPT evidence, oracle audit flip, video, Devpost, flip-public).

- [ ] **Step 1: write verify.mjs + render.yaml (publish `.`, no build) + the three
  docs in full prose (30s/3min shot lists from SPEC §11; Devpost 4 answers with
  concessions #1/#2 up front; evidence checklist with the five human tasks + the
  remote stale/recovery beat)**
- [ ] **Step 2: `node tools/verify.mjs` prints STATUS INCOMPLETE naming exactly the
  human-gated remainder → commit** `T12: verifier + deploy + submission docs`
- [ ] **Step 3: loop protocol — when verify prints `STATUS CODE_COMPLETE`, append
  the line to PROGRESS.md and output `<promise>IDENTITYMAP HALT</promise>`; when it
  prints `STATUS ABORT_GATE`, write POSTMORTEM.md, tag `abort/<date>`, append
  STATUS ABORTED to PROGRESS.md, and output the SAME halt promise (the promise ends
  the loop; PROGRESS.md carries which ending it was)**

---

## Schedule map (PT) — sol-estimate-adjusted, scope already cut to fit

| window | tasks | tripwire |
|---|---|---|
| 08-29 eve | T1 | — |
| 08-30 am | T2 | **K0 14:00: slice + smoke green or scope-cut council (drop preview_mapping_patch + round 7)** |
| 08-30 pm | T3–T6 | — |
| 08-31 am | T7–T9 | — |
| 08-31 pm | T10–T11 | **K4 18:00: `npm test`+`--smoke` green or ABORT** |
| 09-01 | T12; human: deploy, ChatGPT evidence, oracle audit | **K5 21:00** |
| 09-02 | human: video (after outpocket D4), Devpost draft final | — |
| 09-03 am | human: submit; freeze rehearsal | 13:00 |

## Self-review (writing-plans checklist)

- Spec coverage: §4→T1, §5→T5, §6→T3/T4, §7→T9, §8→T7, §9→T8, §10→T2/T9/T12,
  §11→T12 docs; C1–C10→T2 asserts + toplevel test; EVAL layers→T1–T9/T2/T10;
  scorer/ablation/gates→T11/T12. Direction removed everywhere (grep `direction`
  returns only this line and the cut notice).
- Placeholder scan: none; every contract names exact shapes; sizes are estimates
  annotating real algorithms.
- Type consistency: persona/evidence-fingerprint/action/tool-result shapes match
  across T1/T7/T9 interface blocks; `runTool(store, personas, name, args)` used in
  T2/T9 and tests; `window.__imw` defined T2, consumed T10.
