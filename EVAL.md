# IdentityMap Witness — EVAL & TEST protocol (r5, final-audit authority)

Companion to `SPEC.md` r5. Numbers reported anywhere come from command output in the
same session (D-38). Fresh relay traces and `report.json` under `eval/out/` are
generated and ignored by default; the release workflow force-adds one frozen report
and its paired relay trace. Their `sha` identifies the evaluated code commit, while
the later evidence-only commit that adds them necessarily has a different HEAD.
r5 retains the post-review direction cut, honest ablation labels, failure-atomic
tools, strict validation, packet freshness, digest-bound human confirmation, and
the write oracle, then adds pure-read draft isolation, paged reads, fail-closed
catalog registration, and dual invocation/handler trace boundaries.

## What the evaluation claims — and refuses to claim

- CLAIMS: the mechanism works end-to-end (layers 1–3), the redaction and fencing
  guards hold under attack tests, and the four seeded defect classes are recovered
  with an auditable minimal witness against a frozen, human-audited oracle.
- REFUSES: any competitive superiority number vs Browser-Use / Full-CDP (not run),
  any "API cannot do this" claim (the ablation is by-construction and labeled so),
  any agent-quality claim from the scripted driver (it is protocol E2E; the real
  agent evidence is the human ChatGPT-browser run).

## Layer 1 — deterministic unit tests (`npm test` = `node --test`)

| suite | proves |
|---|---|
| fixture | 8 personas; present identity-bearing keys use canary format; every okta profile carries identity; DC1–DC4 carrier personas present; P1 clean |
| golden walk | `data/golden-walk.md` hand-derived table == machine recomputation later (T4 wires this cross-check) |
| parser | SPEC §6 grammar exactly; out-of-grammar → INVALID_AST with position |
| evaluator | priority resolution, present-but-empty wins (DC4), null poisons concat, `""` vs null equality table, ternary branch capture |
| provenance | candidates list every consulted source; prototype-chain names are absent unless explicitly owned; P4 names losing `hris` explicitly |
| invariants | 3 types × pass/violate; checker case-insensitive where SPEC §5 says so (DC1 asymmetry test) |
| witness | finds all 4 seeded violations; exhaustive minimal set == oracle (size 3, both valid sets accepted); deterministic tie-break; single-invariant → size 1; clean draft → successful citable clean sweep |
| store | `STAGE_RULES`/`DISCARD_RULES` do not bump revision; version-bound `CONFIRM_RULES` replaces pins and bumps once; stale/double confirms fail; canonical-content pin changes preserve exact invalidation; complete snapshots include both hidden allocators and reject missing counters; recordEvidence/recordPacket do NOT bump |
| tools | all 5 happy paths; schema/runtime parity for exact string/array/revision limits; non-plain/non-JSON, extra, wrong-type, oversized, and duplicate inputs return `INVALID_INPUT` before handlers; stale-revision precedence remains stable; every reachable handler error is failure-atomic at handler entry; normal and oversized reads reconstruct the same exact redacted JSON through canonical ≤512-UTF-16-unit pages, with revision/pending-version drift and forged offsets rejected; `UNCOMMITTED_DRAFT`, ≤1500 wire budget, manager-id minimization, canary sentinel, witness cap, and fencing are asserted |
| confirmation/UI | canonical-key-order digest stability plus deliberate FNV-1a collision proves equality is canonical JSON, not digest; hostile rule group/id render through `textContent`; discarded v1 control cannot confirm v2; confirmed hostile id survives find as exact text with no HTML execution |
| eval oracle | raw snapshot sections, derived-record ids, and hidden counters are own/type/coherence checked; browser SHA-256 values are recomputed; current traces must provide identical invocation-before and handler-entry boundaries; complete per-tool success/error envelopes are required; missing/fake hashes, extra state, modified old evidence, wrong returned ids, unknown tools, and allocator over/under-increments fail closed |
| redaction | canary sweep over every tool × every persona × keys AND values AND candidates AND diffs; crafted leak in a payload KEY caught; `<redacted:changed>` includes managerId; raw invariant values never enter details |
| page/server hardening | no HTML-string parsing sink; all-or-none registration uses one catalog abort signal and exposes zero usable tools after rejection/cancellation; aborted draft guards cannot enter handlers; frozen clone-only inspection surface; public asset allowlist and curated Render build exclude repository internals; serve/build CLIs work from repository paths containing spaces |

Gate for the frozen final-audit run: exit 0, **310 pass, 0 fail, 0 skip**. The real
count is always taken from `npm test`; risk coverage matters more than count.

## Layer 2 — registration + protocol smoke (local Chrome 152)

`node harness/relay.mjs --smoke` (launcher/CDP client built in plan T2, patterns
retyped from outpocket, nothing imported):
presence via completed round trip (C7), visible resolved-registration count equals
`(await getTools()).length === 5` (C6), and injected registration failures or page
lifecycle cancellation abort the shared catalog and leave zero live tools. Every
inspection result is clone-isolated, and mutable store/tool/render capabilities are
absent from the frozen test surface;
stage pending at r17 → real DOM Confirm all → r18 → one find Completed with the
DOM matrix updated before response, one -32602
unknown-name send rejection, **repeated cold sessions ×3 with fresh user-data-dir
and cleanup**. One cold session confirms a hostile invariant id, waits an event-loop
tick, and asserts exact pin/matrix text, zero injected images, and no handler execution.
Gate: exit 0.

## Layer 3 — protocol E2E relay (scripted; labeled protocol, not agent)

`node harness/relay.mjs --e2e`: first five fresh-profile fail-closed starts
(invalid JSON, empty, missing, duplicate, wrong-shape personas fixture) assert the
disabled UI and zero registered tools; then one browser session, rounds:
1. read_mapping_session → r17
2. stage a hostile-HTML group at r17, assert visible text/no execution/no pins,
   retain the v1 Confirm control, then real-DOM Discard; stage 3 rules as pending v2
   at r17; clicking the detached v1 control yields visible `STALE_CONFIRM` and
   leaves v2 untouched; real-DOM Confirm all → r18
3. find_mapping_counterexample → witness {P2,P3,P4}, evidence recorded
4. real-DOM change on `#grid input[data-field="managerId"]` applies the managerId
   fix → r19; assert find-evidence stale
5. prepare_mapping_review(old ids) → MUST fail STALE_EVIDENCE
6. re-find → fresh evidence; violations no longer include P3/inv-null
7. preview_mapping_patch on `group` fix over {P2} → diff redacted-clean
8. a real-DOM change on `#grid input[data-field="group"]` applies the group fix →
   r20; re-find returns the {P4} witness; then a real-DOM change on the labeled
   priority selector applies `hris → ad → okta` → r21; assert every prior evidence
   record is stale and the stale banner is visible; re-find returns a successful
   full clean sweep carrying a fresh evidence id → prepare over that id → packet
   `blockers:[]`
9. recovery: wrong expectedRevision → REVISION_MISMATCH → corrected retry succeeds
10. stage a 4th trivial rule at r21 → real-DOM Confirm all → r22; old packet is
    incomplete-by-coverage (blocker `uncovered`); stage the original 3 at r22 →
    real-DOM Confirm all → r23; fresh prepare is green
11. real grid change breaks managerId (r24), then a real grid repair (r25); fresh
    find + prepare restores a green packet
12. real grid change enters invalid `user.`: complete store snapshot byte-identical
    at r25, inline position error visible, matrix and GREEN packet intact; a valid
    `user.managerId` commits exactly once → r26; a valid input-only edit (no blur)
    survives a pure read at r26 with the same DOM node and focus; the next non-read
    tool returns exact `UNCOMMITTED_DRAFT` without entering its handler or changing
    state/UI/DOM/focus. The human then emits the change, committing exactly once →
    r27; re-read returns r27 and the corrected non-read retry executes exactly once.
Trace records every invocationId/status/payload/ms plus an invocation-before
snapshot and a handler-entry `snapshotBefore`, the shared `snapshotAfter`, and
full-state and authoritative-slice SHA-256 values at both boundaries;
every scripted human action is labeled `human-dom` with its page selector →
`eval/out/relay-<sha>.json`.
Gate: exit 0 AND rounds 5, 9, 10 each show their failure/recovery pair; round 12
shows invalid-input no-op, pure-read isolation, `UNCOMMITTED_DRAFT`, a human commit,
and successful retry.

## Scorer + ablation (honest labels replace the old "3-arm benchmark")

`eval/scorer.mjs`: machine-readable map `defect class → {persona, field, invariant}`
(from `data/defects.md`, frozen at T1) → reads the relay trace → per-class
found/missed + witness-minimality check vs `data/oracle.json`. No prose numbers.

`eval/ablation.mjs` (relabeled — NOT a competitive arm, NOT a kill):
input = `data/persisted-snapshot.json` (the last-saved state: pre-session
expressions, pre-session priority, no pins — authored at T1 next to the golden
state, frozen). Runs the same engine. Reports which of DC1–DC4 are visible.
EXPECTED AND LABELED: 0/4 — the defects are session-introduced BY CONSTRUCTION;
the number quantifies the workflow property "today's mistakes live pre-save",
not superiority. The report prints this label verbatim.

The per-persona manual-preview count model (was "arm A") is retired: it was
never written up as `eval/interaction-model.md` and it is NOT in report.json
(review finding: a formula is not an observed arm).

Browser-Use / Full-CDP: designs remain in this file's git history; they are
DESIGNED-NOT-RUN and appear in the README and Devpost limitations, never in claims.

`eval/run.mjs`: layer gates → scorer → ablation → final per-call write oracle →
`eval/out/report.json`. The oracle re-hashes raw snapshots in Node. Every tool
entry must provide both the invocation-before and handler-entry boundaries and
prove they are identical; missing or partial boundaries fail closed. Every failed
invocation must leave the invocation-entry snapshot byte-identical. Every tool leaves
`{revision,priority,expressions,pins}` unchanged; successful stage changes only
`pending` and advances the hidden pending-version counter by exactly one (or zero
for an identical re-stage); successful find/preview add exactly the returned
evidence id and advance shared `nextId` by one; successful prepare does the same
for its returned packet id; read changes nothing. All unrelated sections and
hidden counters must remain exact.

Report shape includes
`{when, sha, traceFile, layers, scorer, ablation, counters, thresholds, killLines,
oracleAudited, watermark}`;
**refuses (exit 2) to write an un-watermarked report while `oracle.audited` is
false** — flipping it requires the human audit commit (trailer `Oracle-Audited: yes`);
the automated loop is forbidden to flip it (also asserted by a test that the
string stays false in loop commits — commit author check).

## Pass thresholds (pre-registered)

ALL of: scorer 4/4 classes; false positives ≤ 1; witness size == 3 matching an
oracle set; dual-boundary write-oracle failures = 0; failed-call full-state hash
failures = 0; PII canary leaks = 0; ablation visible 0/4 (by construction); layer
gates all exit 0; report has `oracleAudited: true` and `watermark: null`.

## Kill / abort gates (all executable — a script can evaluate each)

- K2 PII: any canary leak reproducible on re-run after one fix commit → kill.
  (`node eval/run.mjs` twice, same leak twice = fired.)
- K3 fencing: any STALE evidence accepted into a green packet in layer 3 → kill
  (same two-run rule).
- K4 schedule: at 2026-08-31T18:00 PT, `npm test` or `--smoke` non-zero → abort.
  Loop checks wall clock each iteration (`date`) against gate table in RALPH.md.
- K5 runtime: at 2026-09-01T21:00 PT, no committed `evidence/chatgpt-run.png` +
  transcription (human task) → abort to ERP-only endgame.
- K1 is RETIRED as a kill (review: non-falsifiable as written). Its replacement
  is the labeled ablation expectation above.

## Evidence pack for submission

fresh generated report.json + relay trace; ChatGPT-browser human run (PNG + transcribed JSON,
V1-style) **including the remote stale/recovery beat** (round-5 equivalent done
live — review finding); deployed URL; public repo (MIT) flipped only at freeze;
video <3min, audio, remote origin, consent gate visible, first 10–15s = result.
