# Run-2 review triage (2026-08-29 evening)

A second gpt-5.6-sol review arrived after the build shipped. PROVENANCE CAVEAT:
it was fed `reviews/codex-sol-2026-08-29-prompt.txt` — which embeds the **r1**
plan and states "this repo is a PLAN (no code yet)" — while reading the **r2**
repo that already contains the built, passing code. Most findings therefore
grade a superseded input. Verbatim review: `codex-sol-2026-08-29-run2.md`.

## Accepted and FIXED (real holes in shipped code — the review earned its run)

| finding | fix | proof |
|---|---|---|
| A clean `preview_mapping_patch` (hypothetical, draft untouched) could close pins → `blockers:[]` on an unchanged defective draft | prepare counts only CLOSING kinds (`counterexample`, `clean-sweep`); preview evidence never covers a pin | tests/tools.test.mjs "SAFETY: a hypothetical preview must NOT close a real packet" — red before fix, green after |
| Same-ID pin with REPLACED rule content kept old evidence fresh (fingerprints held ids, not content) | PIN_INVARIANTS compares canonical rule content per id; content change stales dependent evidence | tests/reducer.test.mjs "SAFETY: same-ID pin CONTENT replacement stales dependent evidence" — red before fix, green after |
| K5 checks file existence, not content | verify.mjs content-validates `evidence/chatgpt-run.json` (`toolCount:5`, `staleRejectionObserved:true`, onrender origin) | tools/verify.mjs HUMAN-REMAINING probe |
| Error-precedence and anti-greedy minimality untested | tests added; both pass against existing code (revision fencing already first; search already exhaustive) | tools.test / witness.test additions |

## Rejected as stale (grades the r1 prompt, already absent from the repo)

Greedy set cover · missing `candidates` provenance · missing `recordPacket` ·
`defs-browser.js` import · `src/page` root topology · missing `window.__imw` ·
`violated` payload shape · two directions/`appuser`/D1–D5/size-2 oracle ·
8-round e2e · three-arm/K1 design · "verifier never created" · T3 pre-checked
boxes · README claims "unsupported against no-code state" (the no-code state was
the PROMPT's framing; every README number reproduces from command output — see
PROGRESS.md and eval/out/). Each of these was fixed in r2 (commit 1b31723) or
built in T1–T12 (commits 98a47fb..a121810).

## Standing limitations it restated correctly (already disclosed, unchanged)

Same-author fixture/oracle (mitigation: human audit gate, report watermark);
ablation is by-construction, zero comparative-evidence credit (label printed in
the report and README); SIMULATED/designed-not-run arms carry no evidence weight.

Post-fix gate state: npm test 54/54 · smoke ×3 · e2e 10 rounds · verify
CODE_COMPLETE — all re-run after the fixes.
