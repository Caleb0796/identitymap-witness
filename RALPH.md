# RALPH.md — the loop that builds this repo

Executor: the `ralph-loop` Claude Code plugin (same prompt re-fed every iteration;
state lives in files + git history; completion via `<promise>` tag).

## Launch command (run from this repo root, in a fresh Claude Code session)

```
/ralph-loop "You are building IdentityMap Witness in /Users/calebwei/mcp/identitymap-witness. Each iteration: (1) Read CLAUDE.md, then docs/plans/2026-08-29-identitymap-witness.md; find the FIRST unchecked '- [ ]' step. (2) Execute that step and, if it completes a task's step 5, the commit. Follow the plan's code and interfaces exactly; where the plan gives a contract not code, TDD it: failing test first, minimal implementation, green, commit. (3) Re-run 'npm test' before every commit; a task is done only when its gate command exits 0 in THIS iteration. (4) Check the box in the plan file and commit the edit with the code. (5) Append one line to PROGRESS.md: '<iteration-ISO-time> T<n> step<k> <green|red> <one fact from command output>'. HARD RULES: never touch /Users/calebwei/mcp/outpocket; never register an apply/save/push tool; never let a CANARY_ string leave a tool payload; the identifier navigator.modelContext must not appear in src/ or harness/; numbers only from command output; do not attempt human-gated steps (Render auth, ChatGPT-browser evidence, video, Devpost, repo flip-public) — when only those remain, stop and report. KILL GATES: if the plan's K4/K5 schedule gates have passed and their conditions are unmet, write POSTMORTEM.md and output <promise>IDENTITYMAP ABORTED</promise>. COMPLETION: when every checkbox in the plan is checked AND npm test AND node harness/relay.mjs --smoke AND node harness/relay.mjs --e2e AND node eval/run.mjs all exit 0 freshly re-run this iteration, output <promise>IDENTITYMAP COMPLETE</promise>." --completion-promise "IDENTITYMAP COMPLETE" --max-iterations 45
```

Notes:
- `--max-iterations 45`: 13 tasks × ~3 iterations + slack. The loop also self-stops
  on the ABORT promise; `--completion-promise` only matches COMPLETE, so an ABORT
  ends by max-iterations or by the human running `/cancel-ralph` after reading
  POSTMORTEM.md. Check PROGRESS.md whenever you look in.
- The loop's memory is: plan checkboxes + PROGRESS.md + git log. It re-reads them
  every iteration; that is the Ralph mechanism, not a defect.

## Human-gated queue (the loop stops in front of these; you do them)

| when | what | est |
|---|---|---|
| after T12 green | Render deploy (static site from render.yaml), note the URL in README | 20m |
| 09-01 | ChatGPT built-in browser (⌘T): open deployed URL, consent gate, 5 tools listed, counterexample round trip; capture evidence/chatgpt-run.png + transcribed JSON (V1 style) | 30m |
| 09-01 | Oracle audit: row-by-row check of data/oracle.json, then commit with trailer `Oracle-Audited: yes` | 60m |
| 09-02 | Video <3min, audio, remote origin, consent click visible; first 10–15s = running result (AFTER outpocket D4 is recorded) | 2–3h |
| 09-03 am | Devpost submission from docs/DEVPOST-DRAFT.md; repo flip-public + MIT LICENSE | 45m |

## Interlock with outpocket ERP (binding)

- This project NEVER runs its loop while you are inside an outpocket seat window
  that needs the same machine's Chrome for evidence capture.
- outpocket D4 (their video) records BEFORE this project's video on 09-02.
- Any conflict for your hands resolves in outpocket's favor until its D5
  (submission) is done. Two 80% submissions lose to one 95% + one honest spike.

## Abort semantics

K4 (08-31 18:00 PT, layers 1–2 not green) or K5 (09-01 21:00 PT, no remote ChatGPT
run) → the loop writes POSTMORTEM.md (what got built, what fired, what the spike
proved/disproved), tags `abort/<date>`, outputs the ABORT promise. The Okta public-API
evidence and the engine survive as commercial-spike assets either way.
