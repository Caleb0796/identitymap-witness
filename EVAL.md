# IdentityMap Witness — EVAL & TEST protocol (r2, post-review)

Companion to `SPEC.md` r2. Numbers reported anywhere come from command output in the
same session (D-38). Raw traces under `eval/out/`, committed. r2 changes after the
sol review: direction cut; arm relabeling (no "three-arm benchmark" headline); K1
demoted from kill line to stated expectation; machine-readable scorer required;
executable gates; audited-oracle gate wired into the report.

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
| fixture | 8 personas; canaries on firstName/lastName/email in EVERY source profile (okta+hris+ad); DC1–DC4 carrier personas present; P1 clean |
| golden walk | `data/golden-walk.md` hand-derived table == machine recomputation later (T4 wires this cross-check) |
| parser | SPEC §6 grammar exactly; out-of-grammar → INVALID_AST with position |
| evaluator | priority resolution, present-but-empty wins (DC4), null poisons concat, `""` vs null equality table, ternary branch capture |
| provenance | candidates chain lists every consulted source; P4 case names losing `hris` candidate explicitly |
| invariants | 3 types × pass/violate; checker case-insensitive where SPEC §5 says so (DC1 asymmetry test) |
| witness | finds all 4 seeded violations; exhaustive minimal set == oracle (size 3, both valid sets accepted); deterministic tie-break; single-invariant → size 1; clean draft → NO_COUNTEREXAMPLE path at tool layer |
| store | mutations bump revision exactly once; recordEvidence/recordPacket do NOT bump; fingerprint invalidation table: EDIT_EXPRESSION stales find-evidence + only matching preview-evidence; SET_PRIORITY stales all; pin changes flip packet coverage; **clean→violating**: edit a clean field into a violating expr → old evidence stale AND re-find catches the new violation |
| tools | all 5 happy paths against golden state; EVERY error code in SPEC §7 provoked (incl. NO_COUNTEREXAMPLE as error, BAD_RULE on unknown pin, INVALID_AST position, UNKNOWN_PERSONA, STALE_EVIDENCE staleIds, PII_GUARD); ≤1500 budget at the cap with truncation path; REVISION_MISMATCH carries currentRevision; pin replace-not-append |
| redaction | canary sweep over every tool × every persona × keys AND values AND candidates AND diffs; crafted leak in a payload KEY caught; `<redacted:changed>` on identity diffs |

Gate: exit 0, 0 fail, 0 skip. Target ≥ 70 tests.

## Layer 2 — registration + protocol smoke (local Chrome 152)

`node harness/relay.mjs --smoke` (launcher/CDP client built in plan T2, patterns
retyped from outpocket, nothing imported):
presence via completed round trip (C7), `(await getTools()).length === 5` (C6),
one invokeTool Completed with DOM matrix updated before response, one -32602
unknown-name send rejection, **repeated cold sessions ×3 with fresh user-data-dir
and cleanup** (review finding: single-shot smoke hid launch flakiness).
Gate: exit 0.

## Layer 3 — protocol E2E relay (scripted; labeled protocol, not agent)

`node harness/relay.mjs --e2e`, one browser session, rounds:
1. read_mapping_session → r17
2. stage_mapping_invariants(3 pins) → r18
3. find_mapping_counterexample → witness {P2,P3,P4|P5}, evidence recorded
4. HUMAN-SIM: `window.__imw.store.dispatch(EDIT_EXPRESSION managerId fix)` via
   Runtime.evaluate → r19; assert find-evidence stale
5. prepare_mapping_review(old ids) → MUST fail STALE_EVIDENCE
6. re-find → fresh evidence; violations no longer include P3/inv-null
7. preview_mapping_patch on `group` fix over {P2} → diff redacted-clean
8. HUMAN-SIM applies group fix + priority fix → re-find → NO_COUNTEREXAMPLE error
   carrying a fresh clean-sweep evidence id → prepare over THAT id → packet `blockers:[]`
9. recovery: wrong expectedRevision → REVISION_MISMATCH → corrected retry succeeds
10. pin add mid-session: PIN_INVARIANTS with a 4th trivial pin → old packet
    incomplete-by-coverage (blocker `uncovered`), then unpin restores
Trace with every invocationId/status/payload/ms → `eval/out/relay-<sha>.json`.
Gate: exit 0 AND rounds 5, 9, 10 each show their failure/recovery pair.

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

`eval/interaction-model.md` (was "arm A"): the per-persona manual-preview count
model moves to prose with its assumptions; it is NOT in report.json (review
finding: a formula is not an observed arm).

Browser-Use / Full-CDP: designs remain in this file's git history; they are
DESIGNED-NOT-RUN and appear in README + video limitations, never in claims.

`eval/run.mjs`: layer gates → scorer → ablation → `eval/out/report.json`
`{layers, scorer: {classes, witness}, ablation, oracleAudited, killLines}`;
**refuses (exit 2) to write an un-watermarked report while `oracle.audited` is
false** — flipping it requires the human audit commit (trailer `Oracle-Audited: yes`);
the automated loop is forbidden to flip it (also asserted by a test that the
string stays false in loop commits — commit author check).

## Pass thresholds (pre-registered)

ALL of: scorer 4/4 classes; false positives ≤ 1; witness size == 3 matching an
oracle set; stale mutations = 0; unauthorized-write count = 0 (no tool ever
dispatches a draft mutation — asserted by store instrumentation in the relay);
PII canary leaks = 0; layer gates all exit 0; report watermark `oracleAudited: true`.

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

report.json + relay traces; ChatGPT-browser human run (PNG + transcribed JSON,
V1-style) **including the remote stale/recovery beat** (round-5 equivalent done
live — review finding); deployed URL; public repo (MIT) flipped only at freeze;
video <3min, audio, remote origin, consent gate visible, first 10–15s = result.
