# Codex remedy plan — competition-readiness fixes (v2, post-adversarial)

Written 2026-08-29 late PT from `reviews/2026-08-29-webmcp-competition-readiness-review.md`
(the "readiness review"); revised same night after the gpt-5.6-sol adversarial
evaluation (`reviews/2026-08-29-remedy-adversarial-run.md` — verdict
EXECUTE-WITH-CHANGES; all 12 findings accepted, see changelog at the bottom).
Every P0 claim in the readiness review was independently re-verified against HEAD
`afc9a39` before planning — none is stale.

Repo: `/Users/calebwei/mcp/identitymap-witness` (git, remote
`Caleb0796/identitymap-witness`, **private — never flip public**). Live:
https://identitymap-witness.onrender.com (Render auto-deploys every push to `main`
— see Push policy). Deadline: Devpost 2026-09-03 13:00 PT. Video records
2026-09-02 (human).

You are Codex Desktop executing this plan alone. Work top to bottom. Check a box
(`- [ ]` → `- [x]`) only after its step's command has actually passed in your
session. Boxes tagged `(OPT)` are optional stretch — skip them freely; the box
tagged `(VERIFY-SELF)` is exempt from the verifier's own count (R13 explains).

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
   this plan explicitly changes a contract (R1, R6, R7), in the same commit as the change.
10. Public-materials rules: no WindTunnel citation, no arXiv 2508.09171, no uniqueness
    claims ("first", "only", "unlike every other"), concede first-party draft-preview
    up front, never call a hash or digest a signature.
11. SPEC.md is the head authority. Every contract this plan changes (R1, R4, R5, R7)
    must land in SPEC.md (bump to r4, one changelog line each) in the same commit.
12. Any DOM node that renders agent-controlled text (rule values, ids, error text)
    is built with `createElement` + `textContent` — never `innerHTML`, never
    handler attributes derived from data. (Existing `esc()`-based rendering of
    engine-derived values may stay; everything NEW follows this rule.)

## Push policy (Render deploys main on every push)

- Commit per task, message prefix `remedy:`. **Push only at a phase boundary**, and
  only when PUSH_GATE is green, so the live judge URL never serves a half-refactored page:

```
PUSH_GATE:  npm test  &&  node harness/relay.mjs --smoke  &&  node harness/relay.mjs --e2e  &&  node eval/run.mjs   # all exit 0
```

- `node tools/verify.mjs` is the end-state authority; it will say INCOMPLETE while
  this plan has unchecked required boxes — that is expected mid-plan.
- Stop committing regenerated eval artifacts: R6 untracks `eval/out/relay-*.json`
  and `eval/out/report.json` (gitignore). The final freeze evidence commit
  (09-01, human-visible) re-adds ONE fresh report+trace with `git add -f`, in an
  evidence-only commit whose diff touches nothing but `eval/out/`.

## Schedule and stop conditions

- **Phase 0 (target 08-30):** R1–R6. Trust hotfix. Do not start Phase 1 until PUSH_GATE green + pushed.
- **Phase 1 (target 08-31):** R7–R10. Visible closed loop. K4 clock gate re-checks unit+smoke at 18:00 PT.
- **Phase 2 (09-01):** R13-core is **MANDATORY regardless of anything else** —
  it holds submission-critical work (LICENSE, doc truth, verifier authority,
  human-eval protocol). Run it even if Phase 1 slipped. Stretch items (all `(OPT)`)
  only if R13-core is done and PUSH_GATE is green before 09-01 15:00 PT.
- **Code freeze 09-01 21:00 PT** (K5). After freeze: docs and evidence only.
- A task that turns a previously-green gate red and resists fixing for >60 min:
  roll back ONLY that task's work — `git stash push -u -m "blocked-<task-id>"`
  (preserves everything for later inspection; never `git checkout -- .`, never
  `git clean`), append a dated entry to `reviews/REMEDY-BLOCKED.md` saying what
  broke, and continue with the next independent task. Never leave main red.
- R7 special rule: commit R7 only as one commit and only when unit+smoke+e2e are all
  green. A half-done confirm flow is worse than none — finish it or fully revert it
  (via the stash rule above).
- Cut order if 08-31 overruns (22:00 PT check): R10's status strip `(OPT)` is
  already skippable, then R8's matrix-keyboard/aria extras `(OPT)`. Never cut R8's
  inline-expression validation, never ship a started-but-unreverted R7, and never
  let a cut touch R13-core.

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
| §7.3 unauthorized-write counter only sees revision deltas on Completed calls | weak write oracle | R6 (binding) + R7 (final oracle) |
| 4.3 deeper: agent writes authoritative pins directly; human sees only id/type | missing human confirmation step | R7 |
| 4.6 priority is a `<span>`; E2E "human" uses `store.dispatch` | no real human path | R8, R9 |
| §5.9 half-typed expression commits then `evaluateAll` throws → page dies mid-render | unvalidated UI input | R8 |
| §5.1 no judge path, no reset, no copy-prompt | demo ergonomics | R10 |
| §5.3 Apply is an `alert()`; packet not exportable | no artifact | R11 `(OPT)` |
| §5.4 no visible activity timeline | invisible loop | R12 `(OPT)` |
| 2.1/4.9/§7.4/§5.9 stale docs ("70+ tests", PASS-UNAUDITED, oracle pending), `engines>=20` vs Node-21 WebSocket, no LICENSE, empty repo metadata, fixture-canary test asserts less than its name claims | consistency debt | R13-core |

**Declined review items (do NOT build them):** provenance in `find` tool output
(§5.6 — budget risk; the UI rail already shows judges the losing sources), patch
preview panel (§5.5), SCIM import (§6.1), DP/bitmask witness (§6.2), new invariant
types (§6.3), row-exact fingerprints (§6.4 — and never *claim* row-exactness),
35-run model-eval matrix (§5.8 — reduced to a 3-run human protocol in R13), test-count
padding (§7.4). Dynamic tool registration: out. Per-rule confirmation: out
(adversarial finding 2 — digest-bound Confirm-all only).

---

## Phase 0 — trust hotfix

### R1 — clean sweep becomes a success result; UI shows all-clear ONLY on a full sweep

Today `find_mapping_counterexample` with zero violations returns
`failure("NO_COUNTEREXAMPLE", …)` (`src/tools/defs.mjs:71-79`). That makes "the fix
worked" an *error*, forces R2 to exempt an error that records evidence, and leaves
the old red matrix on screen (`app.js:120`).

New success payload (SPEC §7 r4):

```js
// zero violations:
{ ok: true, payload: { revision, cleanSweep: true, fullSweep: <bool>,
                       checkedInvariantIds: [...], confirmedInvariantCount: <n>,
                       checked: personas.length, personaIds: [], violations: [],
                       evidenceIds: [id] } }
// violations found: existing shape, plus cleanSweep: false, fullSweep, checkedInvariantIds
```

`fullSweep` is true iff the checked invariant set equals ALL confirmed pins
(i.e. no `invariantIds` narrowing, or narrowing that covers every pin).
**A scoped clean sweep must never look like a global all-clear** (adversarial
finding 3): `app.js` renders the global green "clean sweep — 0 violations across
{checked} personas at r{revision}" (matrix cleared, stale banner hidden) ONLY when
`cleanSweep && fullSweep`; a scoped clean result renders
"scoped check clean: {checkedInvariantIds} — other pinned rules NOT checked" and
leaves the existing matrix untouched. The error code `NO_COUNTEREXAMPLE` ceases to
exist.

- [x] Step 1: failing unit test `tests/cleansweep.test.mjs`: corrected state + 3 pins →
      find returns `ok:true`, `cleanSweep:true`, `fullSweep:true`, `violations:[]`,
      one `clean-sweep` evidence id; a counterexample-state find returns
      `cleanSweep:false`; broken state + `invariantIds:["inv-null"]` after fixing
      only managerId → `cleanSweep:true, fullSweep:false` (this is the review-3
      repro); prepare over that scoped evidence still blocks the other pins as
      uncovered (assert it — the packet layer must stay immune).
- [x] Step 2: implement in `defs.mjs`; migrate every test asserting the
      `NO_COUNTEREXAMPLE` error shape (grep `tests/` for the string); update
      `harness/relay.mjs` rounds 8/9 assertions to the new shape.
- [x] Step 3: `app.js` all-clear + scoped-clean render; e2e asserts after the
      full-sweep clean round: `#matrix tbody tr` count 0 and the all-clear element
      visible.
- [x] Step 4: SPEC.md §7 updated (r4 changelog line). `npm test` and
      `node harness/relay.mjs --e2e` green. Commit `remedy: clean sweep is a success result, fullSweep-gated all-clear (R1)`.

### R2 — failed tool calls have zero side effects (snapshot/rollback)

`stage_mapping_invariants` dispatches (revision +1) before `runTool`'s budget check
can still fail (`defs.mjs:55` vs `209-213`). Rule: **any `ok:false` final result
leaves the store byte-identical.**

Implementation: `createStore` gains `snapshot()` / `restore(snap)` — hold `state`
in a `let` binding, restore by reassigning it (all closures read the current
binding; `getState()` must return the restored object afterwards). The evidence-id
allocator moves INSIDE the store and into the snapshot (adversarial finding 12:
module-global `nextId` would let a rolled-back failure consume `E-1`). `runTool`
takes a snapshot on entry; every `ok:false` return path restores it. With R1 done
there are no evidence-recording errors left, so no exemptions.

- [x] Step 1: failing unit test `tests/atomicity.test.mjs`: for EVERY tool, drive at
      least one failure per reachable error code (REVISION_MISMATCH, BAD_RULE,
      STALE_EVIDENCE, INVALID_AST, UNKNOWN_PERSONA, PII_GUARD, budget-exceeded via a
      2,000-char pin id) and assert `JSON.stringify(store.getState())` identical
      before and after — including `evidence`, `packets`, `revision`, `pins`.
      Plus: after a rolled-back failure, the NEXT successful evidence id is the same
      id it would have been without the failure (allocator restored).
- [x] Step 2: implement; `npm test` green.
- [x] Step 3: SPEC §8 gains the atomicity clause. Commit `remedy: failed calls roll back all state incl. id allocator (R2)`.

### R3 — one finalizer for success AND error envelopes, total-size fallback

`runTool` returns error objects raw (`defs.mjs:206`); `app.js:123` serializes them
to the agent. Review repro: `preview_mapping_patch` with `personaIds:["CANARY_SECRET"]`
echoes the string. Rule: **exactly one exit path serializes anything to the agent**,
applied to both `payload` and `error`:

```
finalize(r): redact → serialize → if > 1,500 chars:
               success: existing shrink(); still oversized → EVALUATOR_FAILED (budget)
               error:   replace ENTIRE error with { code: <original code>,
                        reason: "detail withheld by output budget" }
             → canary assert on the FINAL serialized text (both paths)
             → if the canary assert itself trips on an error envelope, replace with
               { code: <original code>, reason: "detail withheld by privacy guard" }
```

Capping only `reason` is not enough (adversarial finding 5): caller-controlled
`personaId` echoes and large `staleIds` arrays must also be bounded — the
total-size fallback above bounds everything.

- [x] Step 1: failing unit test `tests/finalizer.test.mjs`: matrix over every tool ×
      every reachable error code (reuse R2's drivers) asserting the FINAL envelope
      (exactly what `app.js` stringifies) has no `CANARY_` and is ≤1,500 chars.
      Include: the `CANARY_SECRET` persona-id repro; a CANARY-bearing unknown
      invariant id on `find`; a >1,500-char persona id; a `STALE_EVIDENCE` with
      enough ids to exceed the budget (assert the fallback envelope keeps
      `code: "STALE_EVIDENCE"`).
- [x] Step 2: implement `finalize(r)` in `defs.mjs`; `runTool` returns only
      finalized envelopes. `app.js` keeps serializing `r.ok ? r.payload : { error: r.error }`.
- [x] Step 3: confirm `harness/relay.mjs`'s canary check covers error rounds (its
      `call()` already throws on `CANARY_` in any round text — verify by reading).
      `npm test` + e2e green. Commit `remedy: unified success/error finalizer with total-size fallback (R3)`.

### R4 — fail-closed validation: strict rules, zero-pin gates, maxPersonas, honest annotations

Four sub-fixes, one commit, because they share the validation module:

**(a) Strict invariant validation** — new browser-safe `src/tools/validate.mjs`:
type ∈ {forbidden_group, null_if_missing, source_of_truth}; exact key set per type
plus optional `id` — any extra key → BAD_RULE; `id` non-empty string, unique in the
set; `field` ∈ the 5 output fields; `source` ∈ {okta, hris, ad}; `personaCategory`,
`group`, `dependsOn` non-empty strings; **no string value in any rule may contain
`CANARY_`** (reserved prefix → BAD_RULE; adversarial finding 10 — keeps rule
content unconditionally exportable and finalizer-safe); array length 1–8.
`stage_mapping_invariants` validates BEFORE any dispatch (R2 makes this belt-and-braces).

**(b) Fail-closed checker** — `checkInvariants` throws `BAD_RULE` when a pin
references an output field absent from `outputs` (today it falsy-skips,
`invariants.mjs:21-30`). With (a) this is unreachable; keep it as defense in depth.

**(c) Zero-pin and empty-evidence gates** — `find` with an effective pin set of 0
(zero pins staged, or `invariantIds: []`, or ids filtering to nothing) →
`failure("NO_INVARIANTS", { reason: "no pinned invariants — ask the human to pin business rules first" })`,
no clean-sweep evidence recorded. `prepare` with `s.pins.length === 0` →
`NO_INVARIANTS`; with `evidenceIds: []` → `failure("NO_EVIDENCE")`. A GREEN packet
now requires ≥1 pin covered by fresh closing evidence, by construction.

**(d) Contract surface** — `stage` inputSchema items become a strict `oneOf` of the
three shapes (`additionalProperties:false`, enums for `field`/`source`/`type`);
`expectedRevision` → `{type:"integer", minimum:0}`; `maxPersonas` →
`{type:"integer", minimum:1, maximum:8}` AND the handler honors it: validate range,
and if the minimal witness is larger, return
`failure("WITNESS_EXCEEDS_CAP", { witnessSize, maxPersonas })`. Annotations become
honest: `readOnlyHint:true` ONLY on `read_mapping_session` (find/preview/prepare
record evidence/packets); add `untrustedContentHint: true` to all five (outputs
carry human-authored expressions and profile-derived strings).

- [x] Step 1: failing tests `tests/validate.test.mjs`: the review's exact ghost repro
      (`null_if_missing {field:"ghost",dependsOn:"ghost"}` → BAD_RULE, state
      unchanged, and a subsequent find reports no coverage for it); unknown source;
      wrong type; empty id; duplicate ids; extra key; non-string values;
      `CANARY_`-bearing rule value → BAD_RULE; zero-pin find → NO_INVARIANTS with
      no evidence recorded; `invariantIds: []` → NO_INVARIANTS; zero-pin prepare →
      NO_INVARIANTS; empty evidenceIds → NO_EVIDENCE; maxPersonas 0 / -1 / 1.5 / 9 →
      BAD_RULE; maxPersonas 2 with the golden 3-witness → WITNESS_EXCEEDS_CAP;
      maxPersonas 3 → ok.
- [x] Step 2: failing test `tests/annotations.test.mjs`: table-driven assert of the
      exact annotations object per tool (readOnlyHint map + untrustedContentHint all
      true) and that `stage`'s schema has `additionalProperties:false` in every branch.
- [x] Step 3: implement (a)–(d). `npm test` + smoke + e2e green (smoke's PINS are
      valid and must still pass — if an assertion breaks, the fixture pins are the
      spec, not the validator).
- [x] Step 4: SPEC §5/§7 updated. Commit `remedy: fail-closed validation + honest annotations (R4)`.

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

- [x] Step 1: failing unit test `tests/packet-freshness.test.mjs`: build GREEN packet →
      one EDIT_EXPRESSION → `packetFresh` false; also priority change, pin content
      change (same id), and unpin each kill it; a fresh find+prepare afterwards is
      fresh again; `pinsCovered` excludes uncovered pins. (Export `packetFresh`
      from a browser-safe module so app.js and tests share one definition.)
- [x] Step 2: new e2e round in `relay.mjs` (constants in R9's table): after the
      GREEN packet, human-edit an expression via the real `#grid input` change
      event driven through `Runtime.evaluate` (NOT `store.dispatch`), assert via
      DOM: packet panel text contains `STALE` and `#apply` is disabled; then
      re-fix + re-find + re-prepare → GREEN again, `#apply` enabled.
- [x] Step 3: SPEC §8 freshness clause. `npm test` + e2e green.
      Commit `remedy: packet freshness — GREEN dies on edit (R5)`.

### R6 — eval binds to the trace this run wrote; per-call state capture

`eval/scorer.mjs:13-18` sorts `relay-*.json` lexicographically — with traces
`relay-afc9a39.json` and `relay-daae768.json` on disk it scores the OLD one.
Scope note (adversarial finding 1): R6 lands trace binding + per-call state capture
+ the failure-equality check only; the FULL write-allowlist oracle lands in R7,
because pre-R7 successful stage legitimately changes authoritative state.

- Delete `latestTrace()`. `score(tracePath)` takes an explicit path.
- `eval/run.mjs`: record `t0 = Date.now()` before gates; derive
  `tracePath = eval/out/relay-<short HEAD sha>.json`; after the e2e gate assert the
  file exists, `stat.mtimeMs > t0`, and `trace.sha === report.sha === git rev-parse --short HEAD`;
  any mismatch → exit 1 with a clear line.
- Scorer's find-locator: keep the existing kind/tool filters and additionally
  require `status === "Completed"`, `matched === true`, a present invocation id,
  and `payload?.violations?.length > 0` (R1 gives clean sweeps `violations: []`
  which must not match).
- Relay's `call()` captures `stateHashBefore` and `stateHashAfter` per tool call
  (JSON hash of `window.__imw.store.snapshot()` — including the store-local id
  allocator — via `Runtime.evaluate`, captured immediately around the invoke —
  human edits between rounds therefore cannot pollute the comparison). `run.mjs` asserts: **every `ok:false` round has
  `stateHashBefore === stateHashAfter`** (R2's contract, enforced end-to-end in a
  real browser). Keep the existing revision-delta counter as-is until R7 replaces it.
- Untrack regenerated artifacts: `git rm --cached eval/out/relay-*.json eval/out/report.json`,
  add both patterns to `.gitignore` (Push policy explains the final evidence-only
  freeze commit).
- [x] Step 1: failing scorer unit test `tests/scorer.test.mjs`: `score(path)` with a
      tmp trace whose `sha` mismatches HEAD → throws; malformed JSON → throws; a
      synthetic two-find trace (clean sweep first) → picks the counterexample find.
- [x] Step 2: implement; run `node eval/run.mjs` twice in a row and confirm
      `report.json.traceFile` names the fresh sha both times.
- [x] Step 3: Commit `remedy: eval scores only the trace it just produced; per-call state capture (R6)`.

**Phase 0 boundary:** run PUSH_GATE; all four commands exit 0 → `git push`.

---

## Phase 1 — the visible closed loop

### R7 — two-phase invariant authority: agent stages, human confirms (digest-bound)

Today `stage_mapping_invariants` writes authoritative pins directly and the page
shows only id/type — the docs' "the human states the rules" is not yet true on
screen. New contract (SPEC §5/§7/§8 r4):

**Store.** `state.pending = null | { version, digest, rules }` — `version` is a
monotonically increasing integer (in-store counter, snapshot-included), `digest` is
FNV-1a hex over the canonical JSON of `rules` (labeled a *content fingerprint*,
non-cryptographic — never "signature"). New actions:

- `STAGE_RULES {rules}` — sets `pending` (new version). Does NOT bump revision (a
  proposal changes no mapping semantics and stales nothing).
  **Confirmation binding (adversarial finding 2):** if `pending` already exists and
  the incoming canonical rules differ from `pending.rules`, the action THROWS
  `PENDING_EXISTS` (tool → `failure("PENDING_EXISTS", { reason: "different rules are already awaiting human review — the human must confirm or discard them first" })`).
  An identical re-stage is idempotent (same version kept).
- `CONFIRM_RULES {version}` — human/UI only. If `version !== pending.version` →
  throw `STALE_CONFIRM` (UI re-renders; nothing confirmed). Else: move
  `pending.rules` → `pins` with the existing canonical-content staling logic from
  `PIN_INVARIANTS`; bump revision; clear pending.
- `DISCARD_RULES {version}` — same version check; clears pending; no revision bump.
- `PIN_INVARIANTS` is removed; migrate its unit tests to `CONFIRM_RULES` (same
  staling semantics — the same-id-content-swap test MUST survive the migration).

**Tool.** `stage_mapping_invariants` (validated per R4) → dispatch `STAGE_RULES`,
return `{ revision (unchanged), status: "pending_confirmation", pendingVersion,
pendingRuleIds, digest, nextStep: "the human must review and confirm the pending rules on the page; then call read_mapping_session" }`.
Returns immediately; never waits (hard rule 3). `find`/`prepare` operate on
confirmed pins only; pending-only session → R4's `NO_INVARIANTS`, with `reason`
mentioning pending rules await confirmation. `read_mapping_session` payload gains
`pendingRuleIds` and `pendingVersion` (null when none).

**UI.** A "Pending rules (agent-staged — not yet in force)" region rendering EVERY
field of each rule (full canonical content) plus the digest and version. Buttons:
**Confirm all** and **Discard** only (no per-rule confirm — finding 2), each
carrying the rendered `version` in a data attribute so a re-render after any
pending change invalidates old buttons naturally. Built per hard rule 12
(`createElement` + `textContent` — rule values are the most adversarial strings in
the system; finding 4).

**Eval oracle (final form — replaces the interim counter; finding 1).** Using R6's
per-call before/after captures, extended to FOUR hashes per call: full state, and
the authoritative slice `{revision, priority, expressions, pins}`, before and after.
`run.mjs` asserts for every tool round:

- `ok:false` → full state unchanged (already in R6).
- ANY tool, any outcome → authoritative slice unchanged and revision unchanged
  (post-R7, no tool ever moves them — only humans do).
- ok `stage` → visible-state delta confined to `pending`; the snapshot-included
  pending-version counter advances exactly 1 for a new proposal and 0 for an
  identical re-stage; shared `nextId` stays unchanged.
- ok `find`/`preview` → delta confined to `evidence`, and the new evidence keys are
  exactly the returned `evidenceIds`/`evidenceId`; shared `nextId` advances exactly 1.
- ok `prepare` → delta confined to `packets`, new key = returned `packetId`, and
  shared `nextId` advances exactly 1.
- ok `read` → complete snapshot, including both hidden counters, unchanged.

Implement by having relay capture the four hashes plus (for the delta-confinement
checks) the complete snapshot JSON, including `nextId` and the pending-version
counter — sections are small; reuse the 1,500-char-safe store directly via
`Runtime.evaluate` returning the state object. `run.mjs` independently recomputes
all four SHA-256 values and fail-closes malformed raw sections.

- [x] Step 1: failing unit tests `tests/confirm-flow.test.mjs`: stage → pins/revision
      unchanged, pending set with version+digest, digest stable across key order;
      find before confirm → NO_INVARIANTS; CONFIRM_RULES with the right version →
      pins live, revision +1, prior evidence staled per canonical-content rule;
      **confirm with a stale version → STALE_CONFIRM, nothing confirmed**;
      **non-identical re-stage while pending → PENDING_EXISTS, pending unchanged**;
      identical re-stage → idempotent, same version; discard → cleared, no bump;
      **confirm after discard → STALE_CONFIRM**; double-confirm (same version
      twice) → second is STALE_CONFIRM. A deliberate equal-FNV/different-canonical
      pair proves pending equality never relies on the display digest.
- [x] Step 2: failing native test (extend e2e): a hostile-HTML rule value — stage
      `{type:"forbidden_group", personaCategory:"x", group:"<img src=x onerror=window.__pwned=1>"}`
      — assert `window.__pwned === undefined`, the value renders as visible TEXT in
      the pending card, and nothing auto-confirmed (pins still empty). Then discard it.
- [x] Step 3: implement store + tools + UI + harness + eval oracle together; migrate
      `tests/tools.test.mjs` stage helpers and every reducer `PIN_INVARIANTS`
      assertion; update `eval/run.mjs`'s `human-sim` handling to the R9 `human-dom`
      kind. `npm test`, smoke, e2e, `node eval/run.mjs` ALL green before committing.
- [x] Step 4: SPEC §5/§7/§8 r4. Single commit
      `remedy: two-phase invariant authority — digest-bound human confirmation (R7)`.
- [x] Step 5: append to `docs/EVIDENCE-CHECKLIST.md`: "ChatGPT-browser evidence must
      be RE-CAPTURED after the confirm-flow deploy (old PNG/JSON show the direct-pin
      flow); capture during the 09-01 human eval runs (R13 protocol)."

### R8 — real human controls: priority selector + inline expression validation + a11y floor

- Priority: replace the `<span>` with a labeled `<select id="priority-select">` with
  exactly two options — `ad → hris → okta` and `hris → ad → okta` (okta is always
  the implicit tail). `change` dispatches `SET_PRIORITY` + render. Natively
  keyboard-operable.
- Inline expression validation: the grid input's change handler parses FIRST
  (`parse()` from the engine); on throw — set `aria-invalid="true"`, render the
  parser message + position in an inline error element next to the input, do NOT
  dispatch, do NOT bump revision, leave the previous committed expression live.
  On success — clear the error and dispatch. Also wrap `render()`'s `evaluateAll`
  in a try/catch that renders a visible failure banner instead of dying silently
  (defense in depth; should be unreachable once inputs are validated).
- A11y floor: every input/select/button gets a programmatic label; `#stale-banner`,
  the packet state line, and the R7 pending-rules region get `aria-live="polite"`.
- `(OPT)` extras: matrix rows `tabindex="0"` + Enter/Space triggering the row
  handler.
- [x] Step 1: e2e rounds (constants in R9's table): (i) select `hris → ad → okta`
      via a real DOM change event → revision bumps, all evidence stales, banner
      visible; (ii) type `user.` (invalid) into the managerId input + change event →
      revision unchanged, inline error visible, matrix intact; then a valid value →
      commits.
- [x] Step 2: implement; `npm test` + e2e green.
      Commit `remedy: priority control, inline validation, a11y floor (R8)`.
- [ ] `(OPT)` Step 3: matrix keyboard operability + its e2e assertion.

### R9 — the harness's "human" uses the page, not the store

Replace every `human()` `store.dispatch` in `harness/relay.mjs` with DOM-event
driving via `Runtime.evaluate`: set `input.value` / `select.value` then
`dispatchEvent(new Event("change"))`; click real buttons (Confirm all, Discard,
unpin, matrix rows) via `.click()`. Trace entries become `kind: "human-dom"` with
the selector used. Reading state through `window.__imw` for ASSERTIONS stays legal —
the ban is on mutating through it.

**Revision constants after R7 (assert these EXACT values; do not chase old ones):**

| Beat | Action | Revision after |
|---|---|---|
| smoke | read | 17 |
| smoke | stage (pending) | 17 |
| smoke | DOM Confirm all | 18 |
| smoke | find `[P2,P3,P4]`, 4 matrix rows | 18 |
| e2e r1 | read | 17 |
| e2e r2 | stage → confirm | 17 → 18 |
| e2e r3 | find, witness `[P2,P3,P4]` | 18 |
| e2e r4 | human edits managerId (DOM) | 19 (E1 stale) |
| e2e r5 | prepare over E1 → STALE_EVIDENCE | 19 |
| e2e r6 | find → `[P2,P4]`, 3 violations | 19 |
| e2e r7 | preview (no bump) | 19 |
| e2e r8 | human edits group (DOM) → priority select (DOM) | 20 → 21 |
| e2e r8 | find → cleanSweep+fullSweep (E3); prepare → GREEN | 21 |
| e2e r9 | find at 17 → REVISION_MISMATCH currentRevision 21; retry at 21 → cleanSweep | 21 |
| e2e r10 | stage 4 pins (pending @21) → confirm | 21 → 22 |
| e2e r10 | prepare(E3) → blocker pin-extra uncovered; stage 3 pins (pending @22) → confirm | 22 → 23 |
| e2e r10 | prepare(E3) → GREEN | 23 |
| e2e r11 (R5) | human re-breaks managerId (DOM) → packet STALE, `#apply` disabled | 24 |
| e2e r11 | human fixes it back (DOM) | 25 |
| e2e r11 | find → cleanSweep (E4); prepare → GREEN fresh, `#apply` enabled | 25 |
| e2e r12 (R8) | invalid `user.` into an input → inline error, NO bump | 25 |

(E3's fingerprint holds only the three original pin ids, so the added-then-removed
`pin-extra` never stales it — same logic as today's round 10.)

- [ ] Step 1: guard test `tests/harness-discipline.test.mjs`: read
      `harness/relay.mjs` as text and assert zero occurrences of `store.dispatch`
      and zero of `__imw.render()` (rendering happens via the page's own listeners).
- [ ] Step 2: rewrite the human steps to the table above; full e2e green.
      Commit `remedy: E2E humans act through the DOM (R9)`.

### R10 — judge mode: 30-second path on first paint

- REPLACE the header tagline (`index.html` "the agent proves · the human signs" —
  the readiness review found that phrasing commoditized) with:
  "finds the smallest set of synthetic people proving every violated rule on an
  unsaved draft — and the proof dies when you edit what it depended on".
- TWO copy buttons (a single prompt cannot cross the human-confirmation handshake —
  hard rule 3; adversarial finding 9). Copy exactly these texts:

  **Copy prompt 1 — setup:**
  > Read the mapping session on this page. Stage exactly these three invariants and
  > then stop and tell me to confirm them on the page: (1) contractors must never
  > map into the employees group; (2) if no source supplies managerId the target
  > must stay null; (3) hris is the source of truth for department. Do not call any
  > other tool until I tell you I confirmed.

  **Copy prompt 2 — after you click Confirm all:**
  > I confirmed the rules. Re-read the session, then find the minimal
  > counterexample set. Walk me through fixing every violation: tell me exactly
  > which expression or the priority order to change in the page UI. After each of
  > my edits, re-find at the current revision. When violations reach zero, prepare
  > the review packet from the fresh evidence ids.

  Each button shows a visible "copied" confirmation
  (`navigator.clipboard.writeText`, textarea fallback).
- `Reset demo` button: `location.reload()` (honest zero-state reset).
- `(OPT)` five-step status strip (rules confirmed / counterexample found /
  provenance viewed / edit → evidence stale / clean GREEN packet) lit from live
  store/ui facts.
- Regenerate `docs/DEMO-SCRIPT.md` for the R7 flow using the review §9 rhythm table
  (result in the first 15s; the Confirm-all beat visible; STALE beat visible;
  GREEN packet close).
- [ ] Step 1: implement buttons + tagline + demo script; e2e asserts both copy
      buttons exist and the tagline text changed (two selector assertions, no more).
- [ ] Step 2: `npm test` + e2e green. Commit `remedy: judge mode — two-stage copy prompts, reset (R10)`.
- [ ] `(OPT)` Step 3: status strip + one e2e assertion.

**Phase 1 boundary:** PUSH_GATE green → push. (K4: unit+smoke must be green at 18:00 PT 08-31.)

---

## Phase 2 — R13-core is mandatory; stretch is optional

### R13-core — consistency, metadata, verifier authority, human eval protocol (MANDATORY — run on 09-01 no matter what happened before)

All doc numbers from your own fresh command output (hard rule 8):

- [ ] `package.json` engines → `">=21"` (matches `harness/cdp.mjs` native WebSocket).
- [ ] `LICENSE` — MIT, copyright 2026 Caleb (repo stays private; the file lands now
      so the 09-03 flip is one click).
- [ ] GitHub metadata (repo stays PRIVATE):
      `gh repo edit Caleb0796/identitymap-witness --description "Find the minimal persona set proving every violated identity-mapping invariant on an unsaved draft — evidence dies when the human edits. WebMCP Challenge entry." --homepage "https://identitymap-witness.onrender.com" --add-topic webmcp --add-topic identity --add-topic human-in-the-loop --add-topic devpost`
- [ ] `README.md` rewrite: real test count from `npm test` output; status paragraph
      reflects audited oracle + eval exit 0; the R7 confirm flow; run instructions
      for judges (clone → `npm test` → `node harness/serve.mjs` → Chrome 152 with
      `--enable-features=WebMCP` and a fresh `--user-data-dir`; or the live URL in a
      WebMCP-capable browser); the judge path (two copy buttons); the coverage
      claim scoped to "loaded `src/**` files", or dropped.
- [ ] `EVAL.md`: remove the "≥70 tests" numeric target — replace with "the real
      count is whatever `npm test` prints; risk coverage over count". Update the
      `NO_COUNTEREXAMPLE` and `human-sim` mentions to the R1/R9 contracts, and gate
      descriptions changed by R6/R7.
- [ ] `docs/DEVPOST-DRAFT.md` rewrite: current truth (audited oracle, eval PASS,
      confirm flow, packet freshness), the R10 positioning line, the concessions
      block (SPEC §2), the limitations block — checked against hard rule 10.
- [ ] Fixture honesty: rename the personas test so its name matches what it asserts
      ("identity-bearing keys use canary format; okta always carries identity") —
      data stays frozen; grep README/SPEC/DEVPOST for any "every source profile
      carries identity canaries" claim and narrow the wording.
- [ ] `docs/HUMAN-EVAL-PROTOCOL.md` (new): three ChatGPT built-in-browser cold runs —
      (1) DIRECT: the two R10 prompts verbatim; (2) AMBIGUOUS: "make sure this
      mapping draft is safe before I save it" and nothing else; (3) STALE-RECOVERY:
      mid-run human edit, agent must re-read and re-find. Each run: transcription
      template mirroring `evidence/chatgpt-run.json` (pixels-only discipline),
      target files `evidence/model-eval-{direct,ambiguous,stale}.json` + PNGs.
      Run (1) doubles as the R7 re-capture (R7 step 5). These are HUMAN tasks for
      09-01 evening — write the protocol, do not attempt the runs.
- [ ] `tools/verify.mjs` additions (stricter only): LICENSE file exists; README
      contains no `70+`; `package.json` engines is `>=21`; `harness/relay.mjs`
      contains no `store.dispatch`; report freshness is self-consistent because
      verify's own eval gate regenerates `report.json` BEFORE the probes read it —
      assert probe order stays after the gate (comment, not code); unchecked boxes
      in `docs/CODEX-REMEDY-PLAN.md` count toward INCOMPLETE **excluding lines
      containing `(OPT)` or `(VERIFY-SELF)`**; add a unit test
      `tests/verify-boxes.test.mjs` for the box-counting function (extract it) —
      ordinary unchecked box counts, `(OPT)` box does not, `(VERIFY-SELF)` box
      does not.
- [ ] (VERIFY-SELF) Full PUSH_GATE + `node tools/verify.mjs` → expect INCOMPLETE
      only for video / Devpost / any remaining human boxes. Commit
      `remedy: consistency + metadata + verifier authority + human eval protocol (R13)` and push.
      (This box is exempt from the verifier's own count — it cannot be checked
      before the verifier that counts it passes; check it right after the push.)

### Stretch (ALL `(OPT)` — only if R13-core done and PUSH_GATE green before 09-01 15:00 PT)

- [ ] `(OPT)` R11 — "Finalize & download review packet" button, enabled only on a
      FRESH-GREEN packet: client-side JSON `{generatedAt, revision, mappingFingerprint
      (SHA-256 of canonical {expressions, priority} via crypto.subtle), confirmedRules
      (full content + digest), coverage, blockers, evidenceIds+kinds+fingerprints,
      cleanSweepScope, witnessHistorical (labeled as pre-fix history, or omitted),
      limitations[], integrityDigest}` — IDs and rule content only, no persona
      values; must pass `assertNoCanary` (guaranteed by R4's reserved-prefix rule);
      digest labeled "integrity digest — not a signature". Unit test for the pure
      builder + e2e enabled/disabled assertions. If built, re-point R5's
      `#apply`-enabled e2e assertion at the Finalize button in the same commit.
- [ ] `(OPT)` R12 — page-local activity timeline (`ui.timeline`, cap 50,
      `aria-live="polite"`): one entry per tool call (name, ok/error code,
      revision, evidence ids) + one per human action via a single
      `humanAct(label, action)` helper; the STALE beat must read as three adjacent
      rows (agent find → human edit staled N → agent prepare STALE_EVIDENCE).
      E2E asserts those rows after the stale round.
- [ ] `(OPT)` `harness/serve.mjs` hardening: `path.resolve` + `sep`-terminated
      prefix check, deny dotfiles; two unit tests (encoded traversal `..%2f`,
      `/.git/config` → 404).

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

with every required (untagged) box in this plan checked. Remaining after you: the
09-01 human eval runs + re-capture, the 09-02 video, the 09-03 flip-public +
Devpost submission + clean-profile rehearsal. Those are out of your scope — do not
attempt them.

---

## v2 changelog (adversarial findings → plan edits)

| # | Finding (sol, 2026-08-29) | Edit |
|---|---|---|
| 1 P0 | R7 write oracle impossible (find/preview/prepare legitimately record) | R6 keeps binding + per-call before/after + failure-equality; R7 lands the four-hash allowlist oracle |
| 2 P0 | Confirm not bound to reviewed content (re-stage swap → human confirms swapped rules) | pending {version,digest,rules}; PENDING_EXISTS on non-identical re-stage; STALE_CONFIRM on version mismatch; per-rule confirm removed |
| 3 P0 | Scoped find → false global all-clear | `fullSweep`/`checkedInvariantIds` in payload; UI global green only on fullSweep; scoped-clean test incl. prepare immunity |
| 4 P0 | Pending cards render agent HTML | hard rule 12 (createElement+textContent); hostile-HTML native test in R7 |
| 5 P0 | Error envelopes still unbounded (personaId echo, staleIds arrays) | R3 total-size fallback envelope, canary re-assert, oversized-error tests |
| 6 P0 | Verifier counts its own final box (deadlock); committed-sha circularity | `(VERIFY-SELF)` tag + exemption + box-counter unit test; eval/out untracked + evidence-only freeze commit |
| 7 P0 | Submission-critical R13 was conditional; no actual (OPT) tags | R13-core mandatory on 09-01 regardless; all optional boxes now carry literal `(OPT)` |
| 8 P1 | Migration underspecified; "recompute revisions" too vague | explicit migration list (tools.test, reducer tests, EVAL.md, eval human-sim) + exact revision-constants table in R9; scorer locator requires Completed/matched/non-empty violations |
| 9 P1 | Single judge prompt can't cross the handshake; managerId-only fix ≠ GREEN | two literal copy prompts; tagline REPLACED not stacked |
| 10 P1 | R11 export vs CANARY-in-rule-content conflict | R4 rejects `CANARY_` in rule values (reserved prefix); R11 moved to (OPT) with witnessHistorical labeling + Finalize-button assertion re-point |
| 11 P1 | `git checkout -- . && git clean -fd` destroys unrelated work | stash-based rollback (`git stash push -u`), nothing deleted |
| 12 P2 | Evidence-id allocator outside snapshot | allocator moved into store snapshot/restore + next-id test in R2 |
