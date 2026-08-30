# Adversarial evaluation request — attack docs/CODEX-REMEDY-PLAN.md

You are reviewing a REMEDIATION PLAN, not code. Your job is to break the plan
before an executor wastes the last runway on it. Be adversarial: assume the plan
author was rushed and optimistic. Your findings will be acted on tonight.

## Context (verify everything yourself; trust nothing below without checking)

- Repo: current directory. Read in this order:
  1. `docs/CODEX-REMEDY-PLAN.md` — the plan under attack.
  2. `reviews/2026-08-29-webmcp-competition-readiness-review.md` — the readiness
     review the plan responds to.
  3. `SPEC.md` §2 §5–§8, `app.js`, `src/tools/defs.mjs`, `src/store/reducer.mjs`,
     `src/engine/invariants.mjs`, `harness/relay.mjs`, `eval/run.mjs`,
     `eval/scorer.mjs`, `tools/verify.mjs` — the ground truth the plan must fit.
- Hard deadline: Devpost 2026-09-03 13:00 PT. Video records 09-02 (human, fixed).
  Executable days for this plan: 08-30, 08-31, 09-01 (code freeze 09-01 21:00 PT).
  Executor: Codex Desktop, working alone, no human available mid-task.
- Measured constraints that CANNOT be violated: tool calls die after ~22.3s, so no
  tool may wait on a human (two-phase handshake only); `document.modelContext` only;
  registration top-level only; no apply/save tool; no `CANARY_` in any tool text;
  zero new dependencies; Chrome 152 + `--enable-features=WebMCP` for the harness.
- Existing assets that must survive: 54/54 unit tests' INTENT (shapes may change
  where the plan says so), the audited oracle (`data/oracle.json` frozen), the
  ChatGPT-browser evidence flow (re-capture is planned post-R7), Render live URL
  serving a working page after every push.

## Attack axes (cover all eight; say "holds" explicitly where it holds)

1. **Fix ↔ hole mapping.** For each review P0 (4.1–4.8), does the mapped task
   actually close it? Find any repro from the review that would STILL reproduce
   after the plan executes as written.
2. **Hidden coupling and ordering.** R1 reshapes a wire contract that R2/R6/R7 and
   the harness/eval all touch. Find sequencing bugs, tests that go red in between
   tasks, or a task whose Step 1 cannot even be written before another task lands.
3. **Time feasibility.** Phase 1 (R7–R10) in one day, R7 alone touches store, tools,
   UI, harness, and eval. Is the cut list (which task dies first) correct? What
   would YOU cut or reorder, concretely?
4. **Contract regressions.** Revision-number expectations across smoke/e2e after R7
   (stage no longer bumps; confirm bumps). Scorer's find-locator after R1
   (clean sweep now has `violations: []`). The eval write-oracle after R7
   (stateHash changes on ok stage). Find any assertion in the current suites the
   plan forgot to schedule for update.
5. **New attack surface.** Does two-phase confirm introduce a bypass (e.g. staging
   over pending, discard/confirm races, confirm with stale pending content)? Does
   the download packet leak anything? Does the reset button or timeline create a
   state the safety story can't explain? Can zero-pin GREEN still be reached via
   some path the plan missed (e.g. `find` with `invariantIds: []` filtering to an
   empty effective set)?
6. **Judge-story regressions.** Does anything in the plan make the demo WORSE
   (extra clicks before the money shot, confirm friction in the 30s path, all-clear
   state hiding the provenance rail)?
7. **verify/eval authority erosion.** Does any step weaken a gate, or create a gate
   that can be satisfied vacuously?
8. **Ambiguities an executor will get wrong.** Point at exact plan lines where two
   readings exist and the wrong one ships a bug.

## Output format (markdown, ≤1800 words)

1. `VERDICT: EXECUTE | EXECUTE-WITH-CHANGES | REWRITE` + two-sentence justification.
2. Numbered findings, most severe first. Each: `[P0|P1|P2]` — claim — the exact
   plan section — the concrete edit that fixes the plan (edit text, not vibes).
3. A "holds" list: attack axes you tried that the plan survives.
4. If you propose cuts: the exact tasks/boxes to cut and what is lost.

Do not modify any file. Do not run the harness or eval (they launch Chrome); you
may run `npm test` and read anything. Numbers you cite must come from files or
commands you actually read/ran.
