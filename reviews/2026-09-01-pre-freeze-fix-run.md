# Pre-freeze fix run — 2026-09-01

Outcome: **PASS**. All accepted findings were implemented in six part commits on
top of the expected local documentation commits `69117fd` and `205344e`. The
mandatory final verifier exited 0 and ended in `STATUS CODE_COMPLETE`. Nothing
was pushed.

## Finding disposition

| Finding | Change executed | Test added or adjusted |
|---|---|---|
| IMW-07, IMW-08 | Added `ABORTED` and `INVALID_INPUT` to all five oracle error-code sets. `ABORTED` accepts only `{code}`; `INVALID_INPUT` requires the existing nonempty reason envelope. | `tests/eval-oracle.test.mjs` now exercises both codes for every tool, including equal before/after snapshots and missing, empty, or extra-key rejection cases. |
| IMW-09 | Added the frozen r20 re-find before the priority edit. It returns only `P4`, exactly two rows, and `cleanSweep:false`; later evidence and packet ids and EVAL round text were shifted accordingly. | `harness/relay.mjs` assertions `round8 r20 witness`, `round8 r20 violations`, `round8 r20 is not a clean sweep`, and all later exact-id assertions. The 12-round e2e and `eval/run.mjs` both passed. |
| IMW-01 | Tool dispatch now flushes every valid, changed, in-budget grid draft through `commitExpressionInput`; invalid and overlong text remains local. Added the mapping gloss explaining that boundary. | Round 12 assertions `tool call flushes input-only edit`, `read returns flushed managerId expression`, and `revision badge shows flushed revision` prove r26 → r27 on an input-only edit. |
| IMW-06 | Replaced all five tool descriptions and added metadata descriptions to every input-schema property without changing any other schema keyword. | `tests/annotations.test.mjs` checks exact tool descriptions, the 500-character cap, recursive property-description coverage, and a full schema snapshot with descriptions stripped. |
| IMW-05 | Added recovery-grade reasons for no confirmed pins, an explicitly empty confirmed-pin subset, and `NO_EVIDENCE`; preserved the pending-only reason. The oracle now requires a reason envelope for `NO_EVIDENCE`. | Exact runtime reasons are pinned in `tests/validate.test.mjs`; accepted and malformed oracle envelopes are pinned in `tests/eval-oracle.test.mjs`. |
| IMW-02, lead D2 | Total clipboard failure now exposes a visible readonly selected prompt, marks the status as an error, and gives the exact keyboard-copy recovery instruction. Success clears and hides the fallback. | `tests/judge-mode.test.mjs` pins both handler paths. Smoke session 1 forces Clipboard API rejection and legacy-copy failure, checks the exact selected prompt/status, then verifies success cleanup. |
| IMW-04 | With WebMCP present, both copy buttons remain disabled until all five registrations resolve; any rejection leaves them disabled and shows the reset-to-retry badge. WebMCP-absent mode leaves them enabled. | `tests/toplevel.test.mjs` covers loading, partial failure, success, and the gating expressions; the browser boot boundary verifies both buttons are enabled after five successful registrations. |
| IMW-03 | Added a computed `witness-summary` above the matrix without filtering alternate violation rows. It disappears on a clean sweep. | E2E pins the exact summaries at r18 (`P2,P3,P4`, four rows), r19 (`P2,P4`, three rows), r20 (`P4`, two rows), and the hidden/empty state at r21. |
| lead D1 | Added exact WebMCP-absent browser guidance and toggled it from method-based presence detection. | `tests/judge-mode.test.mjs` pins both the markup and `hidden = present` behavior. |
| IMW-14, IMW-15, IMW-18, lead D3–D6 | Tightened page language for page-only confirmation, field-or-priority edits, confirmed rules, no-save-path Apply semantics, synthetic-only data, winning sources, row-level provenance, stale evidence ids, provenance meaning, and GREEN coverage. Added the requested linked-row styling while preserving focus-visible styling. | New `page guidance identifies the human-only controls and evidence boundaries` assertions pin every changed phrase and the matrix-link/focus CSS. No existing test or e2e assertion pinned the old GREEN sentence exactly, so the conditional wording change was permitted. |
| IMW-10 | Moved the README concessions above the blockquote pitch. | Exact order probe verified the concessions occur before the pitch; the Devpost elevator pitch was unchanged. |
| IMW-11 | Narrowed the README session-read and preview language and replaced the Devpost privacy paragraph with the committed-draft, synthetic-tripwire, and identity-minimized-diff boundary. | Exact-string probes confirmed the two README changes and the complete replacement Devpost paragraph. |
| IMW-12 | Qualified the roughly 22-second timeout once in each of `docs/DEVPOST-DRAFT.md`, `docs/DEMO-SCRIPT.md`, and `SPEC.md` with the 2026-08-29 in-app-browser observation and non-automated-evidence caveat. | A file-content probe counted the exact qualification once in each document. Demo narration line 6 was unchanged. |
| IMW-16 | Documented that schema-valid state can exceed the 1,500-character payload cap and fail with `EVALUATOR_FAILED` rather than being silently truncated. | Exact-string probe plus the full repository test suite. |
| IMW-17 | Rewrote the README review-packet row so coverage/blockers determine completeness and only a fresh blocker-free packet turns GREEN. | Exact-string probe plus the full repository test suite. |
| IMW-19 | Replaced SPEC §12's first sentence with the prohibited-reference, no-uniqueness, concede-first rule. | Exact-string probe plus the full repository test suite. |
| Part F | Added `tools/capture-gallery.mjs`, using `harness/chrome.mjs` and `harness/cdp.mjs`. It drives only the frozen r17 → r21 walk, asserts every witness and row count, captures 1500×1000 PNGs at device scale 1, and copies `02-witness.png` to `thumbnail.png`. | A local proof run wrote all five 1500×1000 PNGs, verified the thumbnail hash matched `02-witness.png`, and visually confirmed all three pending cards, the r18 witness, r19 STALE banner, and r21 GREEN packet. The tracked PNGs were then restored as required. |

## Per-part commits and gates

| Part | Commit | Verification before commit |
|---|---|---|
| A | `45221ad` | Focused oracle tests passed; `npm test` 282/282; 12-round e2e passed; eval reported PASS with scorer 4/4 and zero oracle/hash failures. |
| B | `cdd0081` | Focused annotations, validation, and oracle tests passed; `npm test` 286/286; three-session registration smoke passed. |
| C | `701d417` | Focused judge/registration tests passed; `npm test` 291/291; three-session smoke and 12-round e2e passed. |
| D | `ecd2aac` | Focused page-guidance test passed; `npm test` 292/292. |
| E | `c261da5` | Exact order/string/qualification probes passed; `npm test` 292/292. |
| F | `1c8c739` | Syntax check and local Chrome capture proof passed; generated PNGs were restored; `npm test` 292/292. |

The first Part A `npm test` attempt inside the restricted sandbox could not bind
the local server (`listen EPERM`). It was rerun with the required local-server
permission and passed; all reported counts above come from successful runs.

## E2E evidence and packet id map

The extra r20 find consumes `E-4`, so the exact post-change allocator sequence is:

| Id | Round/state | Meaning |
|---|---|---|
| `E-1` | r18 | Initial counterexample: witness `P2,P3,P4`, four violation rows. |
| `E-2` | r19 | Counterexample after managerId repair: witness `P2,P4`, three rows. |
| `E-3` | r19 | Group preview evidence; non-closing. |
| `E-4` | r20 | Frozen counterexample required by IMW-09: witness `P4`, two rows. |
| `E-5` | r21 | Initial full clean-sweep evidence. |
| `PKT-6` | r21 | Initial blocker-free GREEN packet from `E-5`. |
| `E-7` | r21 | Clean-sweep evidence from revision-mismatch recovery. |
| `PKT-8` | r22 | Added-pin packet, blocked by uncovered `pin-extra`. |
| `PKT-9` | r23 | GREEN packet after restoring the original confirmed rule set. |
| `E-10` | r25 | Fresh clean-sweep evidence after the break-and-repair exercise. |
| `PKT-11` | r25 | Recovered blocker-free GREEN packet from `E-10`. |

Round 12 allocates no evidence or packet ids. Its valid change commits r26, and
the input-only managerId draft is flushed by the next read to the final r27.

## Final PUSH_GATE

Run at HEAD `1c8c739`:

```text
gate  npm test: exit 0
gate  --smoke: exit 0
gate  --e2e: exit 0
gate  eval/run.mjs: exit 0
check fresh audited report is bound to HEAD and trace: ok
STATUS CODE_COMPLETE (ENTRY_READY is the human checklist above + docs/EVIDENCE-CHECKLIST.md)
```

## Skipped and intentionally unchanged

- No accepted finding was skipped.
- The browser-level clipboard rejection test was added because it was cheap in
  the existing smoke session.
- The GREEN sentence was changed because tests and e2e checked GREEN behavior but
  did not pin the old sentence.
- `docs/HUMAN-EVAL-PROTOCOL.md` and `docs/EVIDENCE-CHECKLIST.md` contained none of
  the Part D strings as quotations, so the conditional quote update did not apply.
- `docs/CODEX-REMEDY-PLAN.md`, `docs/plans/**`, `CLAUDE.md`, tool names, schema
  shapes, prompts, control labels, tagline, and the r17 → r21 walk were unchanged
  by the six fix commits.
- The gallery proof PNGs were restored; Part F contains only the capture tool.
- No push, GitHub mutation, deployment, Devpost action, or external evidence
  capture was performed.

## Origin-relative handoff

`git log --oneline origin/main..HEAD`:

```text
1c8c739 tools: Part F capture the frozen gallery walk
c261da5 docs: IMW-10 IMW-11 IMW-12 IMW-16 IMW-17 IMW-19
ecd2aac fix: IMW-14 IMW-15 IMW-18 and D3-D6 page precision
701d417 fix: IMW-02 IMW-03 IMW-04 and D1-D2 UI behavior
cdd0081 fix: IMW-05 IMW-06 clarify the tool surface
45221ad fix: IMW-01 IMW-07 IMW-08 IMW-09 engine correctness
205344e docs: pre-freeze consistency pass — concede-first, DC4 witness fact, labels, SPEC §11 walk, EVAL gates, superseded banners
69117fd docs: Devpost submission copy, README opener, gallery assets; concede-first + drop unmeasured 'more accurate'
```

`git diff origin/main --stat` reports 26 files changed, 1,271 insertions, and 322
deletions, including the two expected pre-existing local documentation commits and
their gallery assets. The report itself is intentionally left as the sole
uncommitted file so the requested history remains exactly one commit for each of
Parts A–F.
