# RALPH.md — the loop that builds this repo (r2, post-review)

> **Note (2026-09-01):** deploy is the curated `public/` build (`render.yaml` + `tools/build-public.mjs`), and the K5 evidence contract now also requires `pendingConfirmationObserved` and `humanConfirmAllObserved` (`tools/verify-evidence.mjs`, `docs/HUMAN-EVAL-PROTOCOL.md`).

Executor: the `ralph-loop` Claude Code plugin. Same prompt each iteration; memory =
plan checkboxes + PROGRESS.md + git log. r2 changes: single HALT promise for both
endings (review finding: an ABORT promise the plugin never matches keeps looping),
external verifier `tools/verify.mjs` as the only completion authority, executable
clock gates, explicit no-self-check rule.

## Launch command (repo root, fresh Claude Code session)

```
/ralph-loop "You are building IdentityMap Witness in /Users/calebwei/mcp/identitymap-witness. Each iteration, in order: (0) Run 'date'; compare against the gate table in docs/plans/2026-08-29-identitymap-witness.md Schedule map. If K4 or K5 has passed with its condition unmet, follow the plan's T12 step-3 ABORT protocol and end with <promise>IDENTITYMAP HALT</promise>. (1) Read CLAUDE.md, then the plan; find the FIRST unchecked '- [ ]' line. (2) Do that step exactly as written — contracts and code in the plan are binding; TDD where the plan gives a contract without code. A failing-test step commits NOTHING; the test lands with its implementation at the task's commit step. (3) Before any commit, re-run 'npm test' and any gate the task names; commit only green trees; message prefix 'T<n>:'. (4) Check the box you completed IN THE PLAN FILE and include that edit in the same commit. (5) Append to PROGRESS.md: '<ISO-time> T<n> step<k> <green|red> <one fact copied from command output>'. (6) If T1–T12 boxes all look checked, DO NOT declare done yourself: run 'node tools/verify.mjs' and obey its STATUS line — CODE_COMPLETE: append it to PROGRESS.md and output <promise>IDENTITYMAP HALT</promise>; INCOMPLETE: fix what it names; ABORT_GATE: follow the ABORT protocol then output the same promise. HARD RULES: never touch /Users/calebwei/mcp/outpocket; never register an apply/save/push tool; no CANARY_ substring may leave a tool payload; the identifier navigator.modelContext must not appear in src/, harness/, or app.js; numbers only from command output; never edit data/golden-walk.md or the oracle 'audited' field after T1; never attempt human-gated work (accounts, Render deploy auth, ChatGPT-browser evidence, oracle audit flip, video, Devpost, flip-public) — when only that remains, run the verifier and halt on its STATUS." --completion-promise "IDENTITYMAP HALT" --max-iterations 45
```

Loop-wedge countermeasures (each maps to a review finding):
- False completion: the promise is only legal after `tools/verify.mjs` prints
  `STATUS CODE_COMPLETE` in the SAME iteration — the verifier re-runs every gate
  itself, so stale green can't be replayed.
- Circular final checkbox: verify greps T1–T11 boxes + T12 steps 1–2 only; T12
  step 3 is the halt protocol, not a box the verifier needs.
- Wedged-red thrash: three consecutive PROGRESS.md `red` lines on the same step ⇒
  the iteration must write `STUCK:<step>:<hypothesis>` to PROGRESS.md and attempt
  the SMALLEST scope cut the plan's K0 tripwire authorizes, or halt via ABORT
  protocol if none applies. (The human reads PROGRESS.md, not the loop's chat.)
- CODE_COMPLETE ≠ ENTRY_READY: the verifier says so in its output; ENTRY_READY
  lives only in docs/EVIDENCE-CHECKLIST.md and only a human checks those boxes.

## Human-gated queue (the loop halts in front of these)

| when | what | est |
|---|---|---|
| after T11 | Render deploy (static, publish `.`), URL into README | 20m |
| 09-01 | ChatGPT built-in browser (⌘T): deployed URL, consent gate on camera, 5 tools, witness round trip, AND the live stale/recovery beat; capture evidence/chatgpt-run.png + transcribed JSON (V1 style: transcribe, never infer) | 45m |
| 09-01 | Oracle audit: row-by-row vs data/golden-walk.md; commit flipping `audited:true` with trailer `Oracle-Audited: yes` | 60m |
| 09-02 | Video <3min, audio, remote origin, consent click visible, result in first 10–15s (AFTER outpocket D4 records) | 2–3h |
| 09-03 am | Devpost submission from docs/DEVPOST-DRAFT.md; LICENSE (MIT) + flip repos public | 45m |

## Interlock with outpocket ERP (binding, unchanged)

- Loop never runs while an outpocket seat needs this machine's Chrome for evidence.
- outpocket D4 records before this project's video; conflicts for your hands
  resolve in outpocket's favor until its D5 is submitted.

## Abort semantics

ABORT (gate-fired or STUCK-with-no-cut) = POSTMORTEM.md (what got built, which
gate fired, what the spike proved/disproved — the Okta API evidence and the engine
survive as commercial-spike assets), tag `abort/<date>`, PROGRESS.md `STATUS
ABORTED`, halt promise. `/cancel-ralph` is the human override at any time.
