# VERDICT: EXECUTE-WITH-CHANGES

Do not give the current plan to the executor: R7’s eval gate is impossible, confirmation is vulnerable to stale-content approval, and the final verifier deadlocks. The core remediation is salvageable with the edits and cuts below.

## Findings

1. **[P0] — R7’s write oracle cannot pass honestly — R6 lines 269–275; R7 lines 320–330.** Successful find/preview/prepare intentionally add evidence or packets, and comparing a failed call with the previous tool hash is wrong when a human edit intervened. Replace with: “Every trace entry records before/after full-state, authoritative `{revision,priority,expressions,pins}`, and pending hashes. Failed calls and read preserve full state; all tools preserve authoritative state and revision after R7; successful stage may change only pending rules; find/preview may add only returned evidence; prepare may add only its returned packet.” Land this final oracle after R7; keep only trace-path binding in pre-R7 R6.

2. **[P0] — Confirmation is not bound to the reviewed content — R7 lines 295–328.** Re-stage replaces pending rules without bumping revision, while Confirm operates on whatever is current; the displayed digest is never checked. Remove per-rule Confirm, define Confirm-all/Discard-all, store `{version,digest,rules}`, reject non-identical re-stage while pending, and require the rendered version on confirm/discard. Add stale-button, double-confirm, confirm-after-discard, and overwrite-pending tests.

3. **[P0] — A scoped find can produce a false global all-clear — R1 lines 109–130; R4 lines 194–217.** After fixing only managerId, an all-pin find still has three violations, but `invariantIds:["inv-null"]` is clean; R1 would clear the red matrix and announce “0 violations.” Add `checkedInvariantIds`, `confirmedInvariantCount`, and `fullSweep`; show global green only when all confirmed pins were checked. Test both a clean strict subset and confirmed pins plus `invariantIds:[]`.

4. **[P0] — Pending-rule cards create an injection-to-confirm path — R7 lines 310–313.** Rule values are agent-controlled non-empty strings, while the existing UI commonly builds with `innerHTML`. Mandate DOM creation plus `textContent` for every rule key/value—never raw HTML or handler attributes—and add a native hostile-HTML test proving no element executes or confirms before the real click.

5. **[P0] — R3 still permits oversized error text — R3 lines 160–174.** Capping only `reason`/detail does not bound caller-controlled `UNKNOWN_PERSONA.personaId` or `STALE_EVIDENCE.staleIds`; probes exceeded the 1,500-character contract. Specify: after redaction, any oversized error becomes `{code: originalCode, reason:"detail withheld by output budget"}`, then repeat the canary assertion. Test oversized persona IDs and large stale-ID arrays.

6. **[P0] — The final authority is circular and the committed SHA story is broken — R13 lines 479–486.** The verifier counts its own unchecked final box, but line 12 forbids checking it before it passes. Tag only that box `(VERIFY-SELF)`, exempt it explicitly, and test that ordinary unchecked boxes still fail. Also commit implementation first, evaluate that committed SHA, then either leave artifacts uncommitted or use an evidence-only commit whose `evaluatedSha` equals its parent and whose diff is restricted to `eval/out`; otherwise the final commit immediately invalidates `traceFile embeds current sha`.

7. **[P0] — Submission-critical work is conditional — Schedule lines 56, 65–67; Phase 2 lines 401–486.** R13 contains LICENSE, README/Devpost truth, human-eval protocol, and verifier authority, yet is skipped if Phase 1 misses noon. Split mandatory R13-core from optional hardening and execute it regardless. The plan currently has 46 unchecked boxes and no actual `(OPT)` tags, so the advertised cuts are not mechanically possible.

8. **[P1] — Contract migration is incomplete and underspecified — R1 Step 2; R7 Step 2; R9 Step 2.** Explicitly migrate `tests/tools.test.mjs` stage helpers, every reducer `PIN_INVARIANTS` assertion, R5 freshness setup, `EVAL.md`’s `NO_COUNTEREXAMPLE`/human-sim text, and `eval/run.mjs`’s `human-sim` handling. Test exact stage/read envelopes and removal of legacy `PIN_INVARIANTS`. Replace “recompute revisions” with: smoke/round-2 stage returns r17, confirm yields r18; round-10 stages return r21/r22, confirms yield r22/r23. Preserve the scorer’s existing kind/tool filters and require Completed, matched, invocation ID, and non-empty violations.

9. **[P1] — The canonical judge prompt cannot cross the handshake or reach GREEN — R10 lines 383–395.** A tool cannot wait for confirmation, and fixing only managerId leaves `[P2,P4]` with three violations; the prompt never calls prepare. Replace it with two literal prompts: setup stages exact rules and stops for Confirm-all; finish re-reads, finds, guides manager/group/priority fixes, re-finds clean, and prepares the packet. Replace the generic existing tagline rather than merely adding another line.

10. **[P1] — R11’s export contract conflicts with earlier work — R5 lines 248–253; R11 lines 403–428.** Full rule content may legally contain `CANARY_`, so export either aborts or leaks; a clean-sweep-only packet also lacks the earlier witness snapshot. If retained, reject reserved canary strings during R4 validation, define the witness as a labeled historical snapshot or omit it, and update R5’s future `#apply enabled` assertion to target Finalize instead.

11. **[P1] — Recovery can destroy unrelated work — Stop condition lines 58–62.** Delete `git checkout -- . && git clean -fd`. Record task-owned paths, save a patch, restore only those paths, and move task-created untracked files aside.

12. **[P2] — Rollback omits the evidence-ID allocator — R2 lines 140–153.** `nextId` is module-global, so a rolled-back failure can consume `E-1`. Put the allocator inside the store snapshot and test the next emitted ID after rollback.

## Holds

- **Axis 1 holds partially:** R5 closes stale GREEN; R4 closes the ghost-field repro; R8/R9 close the visible-priority hole; R1 closes full-sweep stale-matrix behavior.
- **Axes 2/4 hold partially:** confirm-before-find sequencing and post-confirm revision arithmetic are coherent once the exact constants above replace “recompute.”
- **Axis 5 holds partially:** reload is an honest in-memory reset; zero-pin prepare and empty evidence gates are sound; export excludes persona values and evidence payloads.
- **Axis 7 holds partially:** explicit trace path, freshness check, and SHA equality close the lexicographic-old-trace bug.
- **Axis 8 holds:** top-level-only registration, `document.modelContext`, zero dependencies, no apply tool, and immediate-return handshake rules are unambiguous.

All eight axes were attacked; none holds end-to-end without changes.

## Cuts

Cut immediately:

- R11 Steps 1–3: loses downloadable packet.
- R12 Steps 1–2: loses visible timeline.
- Split and cut R10b status strip: loses progress visualization; keep tagline, two prompts, reset, and demo script.
- Split and cut R8b matrix keyboard/aria-live extras: keep labels, priority selector, and expression validation.
- Cut R13 static-server hardening box: loses traversal hardening.
- Cut R7 per-rule confirmation: loses granular approval; keep digest-bound Confirm-all.

Do not cut R7, R8 core, R9, R10 core, or mandatory R13-core.

Verification: `npm test` passed 54/54. Harness and eval were not run; no files were modified.
