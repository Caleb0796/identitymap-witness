# Codex remedy plan — competition-readiness fixes

Written 2026-08-29 late PT, from `reviews/2026-08-29-webmcp-competition-readiness-review.md`
(the "readiness review"). Every P0 claim in that review was independently re-verified
against HEAD `afc9a39` before this plan was written — none is stale. Repo:
`/Users/calebwei/mcp/identitymap-witness` (git, remote `Caleb0796/identitymap-witness`,
**private — never flip public**). Live: https://identitymap-witness.onrender.com
(Render auto-deploys every push to `main` — see Push policy). Deadline: Devpost
2026-09-03 13:00 PT. Video records 2026-09-02 (human).

You are Codex Desktop executing this plan alone. Work top to bottom. Check a box
(`- [ ]` → `- [x]`) only after its step's command has actually passed in your session.

## Hard rules (violating any = stop and write a BLOCKED report)

1. `document.modelContext` only; the identifier `navigator.modelContext` stays banned
   in `src/**`, `harness/**`, `app.js` (enforced by `tests/toplevel.test.mjs`).
2. No apply/save/push/commit tool is ever registered. The agent proposes; the human acts.
3. No tool call may block on human input (measured 22.3s client timeout). Two-phase
   handshake only: a tool returns immediately; the human acts in the UI; the agent
   re-reads. R7 must respect this — `stage` returns `pending`, it never waits.
4. No `CANARY_` substring in any final tool text — success OR error (that is R3).
5. Never read or write `/Users/calebwei/mcp/outpocket`. Never touch `~/Desktop/formproof-webmcp`.
6. No new dependencies. `node:test` only. `src/**` and `app.js` stay browser-safe
   (no node imports). Node ≥21 assumed (R13 aligns `engines`).
7. Frozen files: `data/personas.json`, `data/oracle.json`, `data/golden-walk.md`,
   `data/persisted-snapshot.json`, `data/defects.md` — read-only. The oracle is
   human-audited; changing it invalidates the audit.
8. Numbers in any doc you edit come from command output in your own session (D-38).
   Never write a test count, coverage %, or timing you did not just observe.
9. `tools/verify.mjs` and `eval/*` may only get STRICTER. Never delete or loosen an
   existing gate to make something pass. Update a gate's *expected shape* only where
   this plan explicitly changes a contract (R1, R7), in the same commit as the change.
10. Public-materials rules: no WindTunnel citation, no arXiv 2508.09171, no uniqueness
    claims ("first", "only", "unlike every other"), concede first-party draft-preview
    up front, never call a hash a signature.
11. SPEC.md is the head authority. Every contract this plan changes (R1, R4, R5, R7)
    must land in SPEC.md (bump to r4, one changelog line each) in the same commit.

## Push policy (Render deploys main on every push)

- Commit per task, message prefix `remedy:`. **Push only at a phase boundary**, and
  only when PUSH_GATE is green, so the live judge URL never serves a half-refactored page:

```
PUSH_GATE:  npm test  &&  node harness/relay.mjs --smoke  &&  node harness/relay.mjs --e2e  &&  node eval/run.mjs   # all exit 0
```

- `node tools/verify.mjs` is the end-state authority; it will say INCOMPLETE while
  this plan has unchecked required boxes — that is expected mid-plan.

## Schedule and stop conditions

- **Phase 0 (target 08-30):** R1–R6. Trust hotfix. Do not start Phase 1 until PUSH_GATE green + pushed.
- **Phase 1 (target 08-31):** R7–R10. Visible closed loop. K4 clock gate re-checks unit+smoke at 18:00 PT.
- **Phase 2 (09-01, start only if Phase 1 pushed green before 12:00):** R11–R13.
- **Code freeze 09-01 21:00 PT** (K5). After freeze: docs and evidence only.
- A task that turns a previously-green gate red and resists fixing for >60 min:
  revert that task's changes entirely (`git checkout -- . && git clean -fd` if
  uncommitted, `git revert` if committed), append a dated entry to
  `reviews/REMEDY-BLOCKED.md` saying what broke, and continue with the next
  independent task. Never leave main red.
- R7 special rule: commit R7 only as one commit and only when unit+smoke+e2e are all
  green. A half-done confirm flow is worse than none — finish it or fully revert it.
- If Phase 1 is not green by 08-31 22:00 PT: cut R10 first (judge strip), then R8's
  a11y sub-items. Never cut R8's inline-expression validation (demo-crash risk) and
  never ship a started-but-unreverted R7.

## Diagnosis map (review § → root cause → task)

| Review finding (all re-verified at afc9a39) | Root cause | Task |
|---|---|---|
| 4.4 error responses skip redact/canary/budget (`defs.mjs:206` early return; `UNKNOWN_PERSONA` echoes caller string) | one-sided envelope | R3 |
| 4.5 stage dispatches then fails budget → "failed but mutated" | no failure atomicity | R2 |
| 4.7 clean sweep is `ok:false` so `app.js:120` never updates the matrix | clean sweep modeled as error | R1 |
| 4.2 ghost invariant silently skipped → false GREEN (`invariants.mjs` falsy-skip; `PIN_SHAPES` presence-only) | fail-open validation | R4 |
| 4.3 zero pins / empty evidence → GREEN packet | fail-open validation | R4 |
| §5.9 `maxPersonas` in schema, ignored by handler; items schema is bare `{type:"object"}` | fail-open validation | R4 |
| §5.7 `readOnlyHint:true` on tools that record evidence/packets; no `untrustedContentHint` | dishonest annotations | R4 |
| 4.1 GREEN packet survives edits; Apply stays enabled (`app.js:101`); `pinsCovered` stores uncovered pins too | packet has no freshness semantics | R5 |
| 4.8 scorer globs `relay-*.json` and takes lexicographic max → scores an old trace | no trace↔run binding | R6 |
| §7.3 unauthorized-write counter only sees revision deltas on Completed calls | weak write oracle | R6 |
| 4.3 deeper: agent writes authoritative pins directly; human sees only id/type | missing human confirmation step | R7 |
| 4.6 priority is a `<span>`; E2E "human" uses `store.dispatch` | no real human path | R8, R9 |
| §5.9 half-typed expression commits then `evaluateAll` throws → page dies mid-render | unvalidated UI input | R8 |
| §5.1 no judge path, no reset, no copy-prompt | demo ergonomics | R10 |
| §5.3 Apply is an `alert()`; packet not exportable | no artifact | R11 |
| §5.4 no visible activity timeline | invisible loop | R12 |
| 2.1/4.9/§7.4/§5.9 stale docs ("70+ tests", PASS-UNAUDITED, oracle pending), `engines>=20` vs Node-21 WebSocket, no LICENSE, empty repo metadata, fixture-canary test asserts less than its name claims, `serve.mjs` prefix check | consistency debt | R13 |

**Declined review items (do NOT build them):** provenance in `find` tool output
(§5.6 — budget risk; the UI rail already shows judges the losing sources), patch
preview panel (§5.5), SCIM import (§6.1), DP/bitmask witness (§6.2), new invariant
types (§6.3), row-exact fingerprints (§6.4 — and never *claim* row-exactness),
35-run model-eval matrix (§5.8 — reduced to a 3-run human protocol in R13), test-count
padding (§7.4). Dynamic tool registration: out.

---

## Phase 0 — trust hotfix

### R1 — clean sweep becomes a success result; UI shows all-clear

Today `find_mapping_counterexample` with zero violations returns
`failure("NO_COUNTEREXAMPLE", …)` (`src/tools/defs.mjs:71-79`). That makes "the fix
worked" an *error*, forces R2 to exempt an error that records evidence, and leaves
the old red matrix on screen (`app.js:120`).

New success payload (SPEC §7 r4):

```js
// zero violations:
{ ok: true, payload: { revision, cleanSweep: true, checked: personas.length,
                       personaIds: [], violations: [], evidenceIds: [id] } }
// violations found: unchanged shape, plus cleanSweep: false
```

The error code `NO_COUNTEREXAMPLE` ceases to exist. `app.js`: on any ok find, set
`ui.lastFind`; when `cleanSweep` is true render an all-clear state — matrix body
cleared, a green line "clean sweep — 0 violations across {checked} personas at r{revision}",
stale banner hidden.

- [ ] Step 1: failing unit test `tests/cleansweep.test.mjs`: corrected state + 3 pins →
      find returns `ok:true`, `cleanSweep:true`, `violations:[]`, one `clean-sweep`
      evidence id; and a counterexample-state find returns `cleanSweep:false`.
- [ ] Step 2: implement in `defs.mjs`; update every existing test that asserted the
      `NO_COUNTEREXAMPLE` error shape (search `tests/` for the string); update
      `harness/relay.mjs` rounds 8/9 assertions to the new shape.
- [ ] Step 3: `app.js` all-clear render + e2e assertion: after the clean-sweep round,
      `#matrix tbody tr` count is 0 and the all-clear element is visible.
- [ ] Step 4: SPEC.md §7 updated (r4 changelog line). `npm test` and
      `node harness/relay.mjs --e2e` green. Commit `remedy: clean sweep is a success result (R1)`.

### R2 — failed tool calls have zero side effects (snapshot/rollback)

`stage_mapping_invariants` dispatches (revision +1) before `runTool`'s budget check
can still fail (`defs.mjs:55` vs `209-213`). Rule: **any `ok:false` final result
leaves the store byte-identical.**

Implementation: `createStore` gains `snapshot()` (deep clone of state — hold `state`
in a `let` binding) and `restore(snap)` (reassign the binding; all closures read the
current binding, and `getState()` must return the restored object afterwards).
`runTool` takes a snapshot on entry; every `ok:false` return path restores it.
With R1 done there are no evidence-recording errors left, so no exemptions.

- [ ] Step 1: failing unit test `tests/atomicity.test.mjs`: for EVERY tool, drive at
      least one failure per reachable error code (REVISION_MISMATCH, BAD_RULE,
      STALE_EVIDENCE, INVALID_AST, UNKNOWN_PERSONA, PII_GUARD, budget-exceeded via a
      2,000-char pin id) and assert `JSON.stringify(store.getState())` is identical
      before and after — including `evidence`, `packets`, `revision`, `pins`.
      The budget-exceeded stage case is the review's exact repro; it must now leave
      revision unchanged.
- [ ] Step 2: implement snapshot/restore; `npm test` green.
- [ ] Step 3: SPEC §8 gains the atomicity clause. Commit `remedy: failed calls roll back all state (R2)`.

### R3 — one finalizer for success AND error envelopes

`runTool` returns error objects raw (`defs.mjs:206`); `app.js:123` serializes them
to the agent. Review repro: `preview_mapping_patch` with `personaIds:["CANARY_SECRET"]`
echoes the string. Rule: **exactly one exit path serializes anything to the agent**:
redact → canary assert → budget → return, applied to both `payload` and `error`.

Error budget: cap `reason`/detail strings at 300 chars before redaction. If the
*error itself* trips the canary guard, replace it with
`{ code: <original code>, reason: "detail withheld by privacy guard" }` — never leak,
never recurse.

- [ ] Step 1: failing unit test `tests/finalizer.test.mjs`: a matrix over every tool ×
      every reachable error code (reuse R2's drivers), asserting the FINAL envelope
      (exactly what `app.js` would stringify) contains no `CANARY_` and is ≤1,500
      chars. Include the `CANARY_SECRET` persona-id repro and a CANARY-bearing
      unknown-invariant-id repro for `find`.
- [ ] Step 2: implement `finalize(r)` in `defs.mjs`; `runTool` returns only finalized
      envelopes. `app.js` keeps serializing `r.ok ? r.payload : { error: r.error }`.
- [ ] Step 3: extend `harness/relay.mjs` canary check to EVERY round's raw text (it
      already throws on `CANARY_` in `call()` — confirm it covers error rounds too).
      `npm test` + e2e green. Commit `remedy: unified success/error finalizer (R3)`.

### R4 — fail-closed validation: strict rules, zero-pin gates, maxPersonas, honest annotations

Four sub-fixes, one commit, because they share the validation module:

**(a) Strict invariant validation** — new browser-safe `src/tools/validate.mjs`:
type ∈ {forbidden_group, null_if_missing, source_of_truth}; exact key set per type
plus optional `id` — any extra key → BAD_RULE; `id` non-empty string, unique in the
set; `field` ∈ the 5 output fields; `source` ∈ {okta, hris, ad}; `personaCategory`,
`group`, `dependsOn` non-empty strings; array length 1–8 handled by callers.
`stage_mapping_invariants` validates BEFORE any dispatch (R2 makes this belt-and-braces).

**(b) Fail-closed checker** — `checkInvariants` throws `BAD_RULE` when a pin
references an output field that does not exist in `outputs` (today it falsy-skips,
`invariants.mjs:21-30`). With (a) this is unreachable; keep it as defense in depth.

**(c) Zero-pin and empty-evidence gates** — `find` with an effective pin set of 0 →
`failure("NO_INVARIANTS", { reason: "no pinned invariants — ask the human to pin business rules first" })`
(no clean-sweep evidence recorded). `prepare` with `s.pins.length === 0` →
`NO_INVARIANTS`; with `evidenceIds: []` → `failure("NO_EVIDENCE")`. A GREEN packet
now requires ≥1 pin covered by fresh closing evidence, by construction.

**(d) Contract surface** — `stage` inputSchema items become a strict `oneOf` of the
three shapes (`additionalProperties:false`, enums for `field`/`source`/`type`);
`expectedRevision` → `{type:"integer", minimum:0}`; `maxPersonas` →
`{type:"integer", minimum:1, maximum:8}` AND the handler honors it: validate range,
and if the minimal witness is larger, return
`failure("WITNESS_EXCEEDS_CAP", { witnessSize, maxPersonas })`. Annotations become
honest: `readOnlyHint:true` ONLY on `read_mapping_session` (find/preview/prepare
record evidence/packets); add `untrustedContentHint: true` to all five (outputs carry
human-authored expressions and profile-derived strings).

- [ ] Step 1: failing tests `tests/validate.test.mjs`: the review's exact ghost repro
      (`null_if_missing {field:"ghost",dependsOn:"ghost"}` → BAD_RULE, state
      unchanged, and a subsequent find does NOT report coverage for it); unknown
      source; wrong type; empty id; duplicate ids; extra key; non-string values;
      zero-pin find → NO_INVARIANTS with no evidence recorded; zero-pin prepare →
      NO_INVARIANTS; empty evidenceIds → NO_EVIDENCE; maxPersonas 0 / -1 / 1.5 / 9 →
      BAD_RULE; maxPersonas 2 with the golden 3-witness → WITNESS_EXCEEDS_CAP;
      maxPersonas 3 → ok.
- [ ] Step 2: failing test `tests/annotations.test.mjs`: table-driven assert of the
      exact annotations object per tool (readOnlyHint map + untrustedContentHint all
      true) and that `stage`'s schema has `additionalProperties:false` in every branch.
- [ ] Step 3: implement (a)–(d). `npm test` + smoke + e2e green (smoke's PINS are
      valid and must still pass — if an assertion breaks, the fixture pins are the
      spec, not the validator).
- [ ] Step 4: SPEC §5/§7 updated. Commit `remedy: fail-closed validation + honest annotations (R4)`.

### R5 — packet freshness: GREEN dies on the next relevant edit

Packets are one-shot snapshots; `app.js:87-101` re-renders the old GREEN forever and
`#apply` stays enabled (review's exact repro: r21 GREEN packet, edit to r22, Apply
still on). Freshness is derivable from existing store facts — no new store state:

```
packetFresh(pkt, s) :=  pkt.revision === s.revision
                     && pkt.evidenceIds.every(id => s.evidence[id] && !s.evidence[id].stale)
```

`prepare`'s payload gains `evidenceIds` (it already has revision). `app.js` computes
freshness on every render: stale ⇒ packet panel shows
`packet <id> @ r<N>: STALE — the draft changed after this packet was prepared`,
`#apply` disabled; GREEN text/enabled only when fresh AND blockers empty. Also fix
`recordPacket`: `pinsCovered` must contain only pins with `coverage === true`
(today it stores `Object.keys(coverage)`, `defs.mjs:148`).

- [ ] Step 1: failing unit test `tests/packet-freshness.test.mjs`: build GREEN packet →
      one EDIT_EXPRESSION → `packetFresh` false; also priority change, pin content
      change (same id), and unpin each kill it; a fresh find+prepare afterwards is
      fresh again; `pinsCovered` excludes uncovered pins.
- [ ] Step 2: implement (export `packetFresh` from a browser-safe module so both
      app.js and tests import one definition). New e2e round 11 in `relay.mjs`: after
      the round-10 GREEN, human-edit an expression via the DOM (see R9 — if R9 is not
      done yet, drive the real `#grid input` change event via `Runtime.evaluate`, not
      `store.dispatch`), then assert via DOM: packet panel text contains `STALE` and
      `#apply` is disabled; then re-find + re-prepare → GREEN again, apply enabled.
- [ ] Step 3: SPEC §8 freshness clause. `npm test` + e2e green.
      Commit `remedy: packet freshness — GREEN dies on edit (R5)`.

### R6 — eval binds to the trace this run wrote; stronger write oracle

`eval/scorer.mjs:13-18` sorts `relay-*.json` lexicographically — with traces
`relay-afc9a39.json` and `relay-daae768.json` on disk it scores the OLD one.

- Delete `latestTrace()`. `score(tracePath)` takes an explicit path.
- `eval/run.mjs`: record `t0 = Date.now()` before gates; derive
  `tracePath = eval/out/relay-<short HEAD sha>.json`; after the e2e gate, assert the
  file exists, `stat.mtimeMs > t0`, and `trace.sha === report.sha === git rev-parse --short HEAD`;
  any mismatch → exit 1 with a clear line. Scorer's find-locator becomes explicit:
  first trace entry with `payload?.violations?.length > 0` (R1 gives clean sweeps a
  `violations: []` that must not match).
- Upgrade the unauthorized-write oracle: relay's `call()` also records
  `stateHash` (JSON hash of `window.__imw.store.getState()` captured via
  `Runtime.evaluate` after each call); `run.mjs` asserts for every Completed tool
  round: `stage` (pre-R7) hash may change exactly when `ok:true`, all other tools'
  hashes equal the previous hash unless the payload recorded evidence/packets —
  simplest correct form: for every `ok:false` round, stateHash MUST equal the
  previous stateHash (that is R2's contract, now enforced end-to-end in a real browser).
- [ ] Step 1: failing scorer unit test `tests/scorer.test.mjs` (new): `score(path)`
      with a tmp trace whose `sha` mismatches HEAD → throws; malformed JSON → throws;
      a synthetic two-find trace (clean sweep first) → picks the counterexample find.
- [ ] Step 2: implement; run `node eval/run.mjs` twice in a row and confirm
      `report.json.traceFile` names the fresh sha both times.
- [ ] Step 3: Commit `remedy: eval scores only the trace it just produced (R6)`.

**Phase 0 boundary:** run PUSH_GATE; all four commands exit 0 → `git push`.

---

## Phase 1 — the visible closed loop

### R7 — two-phase invariant authority: agent stages, human confirms

Today `stage_mapping_invariants` writes authoritative pins directly and the page
shows only id/type — the docs' "the human states the rules" is not yet true on
screen. New contract (SPEC §5/§7/§8 r4):

- Store gains `state.pendingRules` (staged proposals, full replace). New actions:
  `STAGE_RULES` (sets pendingRules; does NOT bump revision — a proposal changes no
  mapping semantics and stales nothing) and `CONFIRM_RULES` (moves pendingRules →
  pins with the existing canonical-content staling logic from `PIN_INVARIANTS`;
  bumps revision; clears pendingRules). `PIN_INVARIANTS` is replaced by these two;
  update its unit tests to target `CONFIRM_RULES` semantics (same staling behavior).
- `stage_mapping_invariants` (validated per R4) → dispatch `STAGE_RULES`, return
  `{ revision (unchanged), status: "pending_confirmation", pendingRuleIds, digest,
     nextStep: "the human must review and confirm the pending rules on the page; then call read_mapping_session" }`.
  `digest` = FNV-1a hex over the canonical JSON of the pending set, labeled a
  *content fingerprint* (non-cryptographic) — never "signature". The tool returns
  immediately; it never waits (hard rule 3).
- `find`/`prepare` operate on confirmed pins only; pending-only session → their R4
  `NO_INVARIANTS` error, with `reason` mentioning pending rules await confirmation.
- `read_mapping_session` payload gains `pendingRuleIds`.
- UI: a "Pending rules (agent-staged)" list rendering EVERY field of each rule
  (full canonical content, not just id/type), with per-rule Confirm, Confirm-all,
  and Discard buttons (real `<button>`s, keyboard-operable). Confirm dispatches
  `CONFIRM_RULES`; the pins list stays as-is for confirmed rules.
- Harness: smoke becomes stage(r17, pending; revision still 17) → DOM-click
  Confirm-all → r18 → find(r18) with the same `[P2,P3,P4]` assertions. E2E rounds
  2/10 gain the confirm click between stage and the next tool call; round-10's
  re-stage of the original 3 pins also goes through confirm. Expected revision
  numbers across rounds shift — recompute them from the new bump rules and assert
  the recomputed values (do not chase old constants).
- `eval/run.mjs` write-oracle update: no tool may EVER change the state hash except
  `stage_mapping_invariants` when `ok:true` (whose change is pendingRules only —
  revision must NOT move on any tool call now; assert that directly).

- [ ] Step 1: failing unit tests `tests/confirm-flow.test.mjs`: stage → pins
      unchanged, revision unchanged, pendingRuleIds correct, digest stable across
      key order; find before confirm → NO_INVARIANTS; CONFIRM_RULES → pins live,
      revision +1, prior evidence staled per canonical-content rule; discard clears
      pending without bumping; re-stage replaces pending.
- [ ] Step 2: implement store + tools + UI + harness + eval oracle together;
      `npm test`, smoke, e2e, `node eval/run.mjs` ALL green before committing.
- [ ] Step 3: SPEC §5/§7/§8 r4. Single commit
      `remedy: two-phase invariant authority — human confirms on the page (R7)`.
- [ ] Step 4: append to `docs/EVIDENCE-CHECKLIST.md`: "ChatGPT-browser evidence must
      be RE-CAPTURED after the confirm-flow deploy (old PNG/JSON show the direct-pin
      flow); capture during the 09-01 human eval runs (R13 protocol)."

### R8 — real human controls: priority selector + inline expression validation + a11y floor

- Priority: replace the `<span>` with a labeled `<select id="priority-select">` with
  exactly two options — `ad → hris → okta` and `hris → ad → okta` (okta is always
  the implicit tail; keep rendering the full chain next to it). `change` dispatches
  `SET_PRIORITY` + render. Natively keyboard-operable.
- Inline expression validation: the grid input's change handler parses FIRST
  (`parse()` from the engine); on throw — set `aria-invalid="true"`, render the
  parser message + position in an inline error element next to the input, do NOT
  dispatch, do NOT bump revision, leave the previous committed expression live.
  On success — clear the error and dispatch. Also wrap `render()`'s `evaluateAll`
  in a try/catch that renders a visible failure banner instead of dying silently
  (defense in depth; should be unreachable once inputs are validated).
- A11y floor: every input/select/button gets a programmatic label; `#stale-banner`,
  the packet state line, and the R7 pending-rules region get `aria-live="polite"`;
  matrix rows get `tabindex="0"` + Enter/Space triggering the same handler as click.
- [ ] Step 1: e2e rounds (see R9 for the driving style): (i) select `hris → ad → okta`
      via a real DOM change event → revision bumps, all evidence stales, banner
      visible; (ii) type `user.` (invalid) into the managerId input + change event →
      revision unchanged, inline error visible, matrix intact; then a valid value →
      commits.
- [ ] Step 2: implement; `npm test` + e2e green.
      Commit `remedy: priority control, inline validation, a11y floor (R8)`.

### R9 — the harness's "human" uses the page, not the store

Replace every `human()` `store.dispatch` in `harness/relay.mjs` with DOM-event
driving via `Runtime.evaluate`: set `input.value` / `select.value` then
`dispatchEvent(new Event("change"))`; click real buttons (`confirm`, `unpin`,
matrix rows) via `.click()`. Trace entries become `kind: "human-dom"` with the
selector used. Reading state through `window.__imw` for ASSERTIONS stays legal —
the ban is on mutating through it.

- [ ] Step 1: guard test `tests/harness-discipline.test.mjs`: read
      `harness/relay.mjs` as text and assert it contains zero occurrences of
      `store.dispatch` and zero of `__imw.render()` as a mutation crutch
      (rendering happens via the page's own listeners).
- [ ] Step 2: rewrite the human steps; recompute round revision expectations;
      full e2e green. Commit `remedy: E2E humans act through the DOM (R9)`.

### R10 — judge mode: 30-second path on first paint

- Header adds one plain-English line under the title:
  "On an unsaved identity-mapping draft, the agent finds the smallest set of
  synthetic people proving every violated business rule — and the proof dies the
  moment the human edits what it depended on."
- `Copy judge prompt` button: writes the canonical driving prompt to the clipboard
  (`navigator.clipboard.writeText` with a visible "copied" confirmation; fallback:
  select-a-textarea). The prompt text = stage the 3 golden invariants → confirm on
  page → find → click a row → edit managerId → watch STALE → re-find.
- `Reset demo` button: `location.reload()` (honest zero-state reset).
- A five-step status strip (rules confirmed / counterexample found / provenance
  viewed / edit → evidence stale / clean GREEN packet), each step lighting up from
  live store/ui facts.
- Regenerate `docs/DEMO-SCRIPT.md` shot list for the R7 flow using the review §9
  rhythm table (result in the first 15s; confirm beat visible; STALE beat visible).
- [ ] Step 1: implement; e2e asserts the strip element exists and step 1 lights after
      the confirm round (one selector assertion — do not over-test styling).
- [ ] Step 2: `npm test` + e2e green. Commit `remedy: judge mode — copy prompt, reset, status strip (R10)`.

**Phase 1 boundary:** PUSH_GATE green → push. (K4: unit+smoke must be green at 18:00 PT 08-31.)

---

## Phase 2 — one bonus pack (only if Phase 1 pushed green before 09-01 12:00 PT)

### R11 — finalize & download the review packet (human-only artifact)

Replace the Apply `alert()` with two buttons: `Apply mapping (human only)` stays
disabled-with-tooltip forever (the point of the demo), and
`Finalize & download review packet` — enabled only when the packet is FRESH-GREEN
(R5) — which downloads `identitymap-review-packet-r<rev>.json` built client-side:

```
{ generatedAt, revision, mappingFingerprint (SHA-256 of canonical {expressions, priority} via crypto.subtle),
  confirmedRules (full canonical content + digest), witnessPersonaIds, coverage,
  blockers, evidenceIds + kinds + fingerprints, cleanSweep scope {personasChecked, fields},
  limitations: ["synthetic personas, canary identities", "integrity digest, not a signature",
                "the agent never applies — this file records a human decision point"],
  integrityDigest (SHA-256 of the body) }
```

Redaction discipline: IDs, rule content, and fingerprints only — no persona field
values (even canaries stay out; the download must pass `assertNoCanary`).

- [ ] Step 1: failing unit test `tests/packet-export.test.mjs`: pure builder function
      (browser-safe module, async ok) — shape above, deterministic given fixed
      inputs, `assertNoCanary` passes, digest changes when expressions change.
- [ ] Step 2: implement + wire button; e2e asserts the button is disabled while
      stale/blocked and enabled on fresh GREEN (clicking/download itself is not
      asserted in headless).
- [ ] Step 3: Commit `remedy: downloadable hash-bound review packet (R11)`.

### R12 — page-local activity timeline

`ui.timeline` (cap 50, newest first), `aria-live="polite"` list: one entry per tool
call (name, ok/error code, revision before→after, evidence ids) pushed in the
`execute` wrapper; one entry per human action (edit/priority/confirm/unpin/finalize,
with staled-evidence count when > 0) pushed by a single `humanAct(label, action)`
helper that app.js uses for every dispatch. The STALE beat must read as three
adjacent rows: agent find → human edit (staled N evidence) → agent prepare REJECTED
STALE_EVIDENCE.

- [ ] Step 1: implement; e2e asserts after the stale-rejection round that the
      timeline's top rows contain `STALE_EVIDENCE` and the human edit entry.
- [ ] Step 2: `npm test` + e2e green. Commit `remedy: activity timeline (R12)`.

### R13 — consistency, metadata, and the human eval protocol

All doc numbers from your own fresh command output (hard rule 8):

- [ ] `package.json` engines → `">=21"` (matches `harness/cdp.mjs` native WebSocket).
- [ ] `LICENSE` — MIT, copyright 2026 Caleb (repo stays private; the file lands now
      so the 09-03 flip is one click).
- [ ] GitHub metadata (repo stays PRIVATE):
      `gh repo edit Caleb0796/identitymap-witness --description "Find the minimal persona set proving every violated identity-mapping invariant on an unsaved draft — evidence dies when the human edits. WebMCP Challenge entry." --homepage "https://identitymap-witness.onrender.com" --add-topic webmcp --add-topic identity --add-topic human-in-the-loop --add-topic devpost`
- [ ] `README.md` rewrite: real test count from `npm test` output; status paragraph
      reflects audited oracle + eval exit 0; the R7 flow; run instructions for judges
      (clone → `npm test` → `node harness/serve.mjs` → Chrome 152 with
      `--enable-features=WebMCP` and a fresh `--user-data-dir`; or just the live URL
      in a WebMCP-capable browser); the judge path (copy-prompt button); the
      coverage claim scoped to "loaded `src/**` files", or dropped.
- [ ] `EVAL.md`: remove the "≥70 tests" numeric target line — replace with "the real
      count is whatever `npm test` prints; risk coverage over count". Update gate
      descriptions changed by R6/R7.
- [ ] `docs/DEVPOST-DRAFT.md` rewrite: current truth (audited oracle, eval PASS,
      confirm flow, packet freshness), the one-line positioning from R10, the
      concessions block (SPEC §2), the limitations block — and check rules 10.
- [ ] Fixture honesty: rename the personas test so its name matches what it asserts
      ("identity-bearing keys use canary format; okta always carries identity") —
      data stays frozen; docs must not claim every source profile carries all three
      identity canaries (grep README/SPEC/DEVPOST for such a claim and fix wording).
- [ ] `harness/serve.mjs`: path check via `path.resolve` + `sep`-terminated prefix,
      deny dotfiles; two unit tests (encoded traversal `..%2f`, `/.git/config` → 404).
- [ ] `docs/HUMAN-EVAL-PROTOCOL.md` (new): three ChatGPT built-in-browser cold runs —
      (1) DIRECT: the copy-prompt script verbatim; (2) AMBIGUOUS: "make sure this
      mapping draft is safe before I save it" and nothing else; (3) STALE-RECOVERY:
      mid-run human edit, agent must re-read and re-find. Each run: transcription
      template mirroring `evidence/chatgpt-run.json` (pixels-only discipline),
      target file names `evidence/model-eval-{direct,ambiguous,stale}.json` + PNGs.
      Run (1) doubles as the R7 re-capture (R7 step 4). These are HUMAN tasks for
      09-01 evening — write the protocol, do not attempt the runs.
- [ ] `tools/verify.mjs` additions (stricter only): LICENSE file exists; README
      contains no `70+`; `package.json` engines is `>=21`; `eval/out/report.json`
      traceFile embeds the current short sha; `harness/relay.mjs` contains no
      `store.dispatch`; unchecked required boxes in `docs/CODEX-REMEDY-PLAN.md`
      count toward INCOMPLETE (lines matching `- [ ]` excluding those tagged
      `(OPT)`); existing gates untouched.
- [ ] Full PUSH_GATE + `node tools/verify.mjs` → expect INCOMPLETE only for video /
      Devpost / any remaining human boxes. Commit `remedy: consistency + metadata + human eval protocol (R13)` and push.

---

## Done definition

`node tools/verify.mjs` prints, at minimum:

```
gate  npm test: exit 0
gate  --smoke: exit 0
gate  --e2e: exit 0
gate  eval/run.mjs: exit 0
HUMAN-REMAINING done  ChatGPT-browser evidence (PNG + content-validated JSON)
HUMAN-REMAINING done  oracle audit flipped
HUMAN-REMAINING TODO  video recorded
HUMAN-REMAINING TODO  Devpost submitted
```

with every required box in this plan checked. Remaining after you: the 09-01 human
eval runs + re-capture, the 09-02 video, the 09-03 flip-public + LICENSE-visible +
Devpost submission + clean-profile rehearsal. Those are out of your scope — do not
attempt them.
