# IdentityMap Witness — EVAL & TEST protocol

Companion to `SPEC.md`. Numbers reported anywhere must come from a command's printed
output in the same session (outpocket rule D-38 applies here verbatim). Every eval run
writes its raw trace under `eval/out/` and is committed.

## Layer 1 — deterministic unit tests (`npm test` = `node --test`)

| suite | file | what it proves |
|---|---|---|
| lexer/parser | tests/parser.test.mjs | grammar of SPEC §6 exactly; anything else → INVALID_AST |
| eval semantics | tests/eval.test.mjs | null vs "" table, concat poisoning, ternary branches, priority resolution incl. present-but-empty wins |
| provenance | tests/prov.test.mjs | every value carries {source, inputs, branch}; D4 conflict provenance names the losing source |
| invariants | tests/invariants.test.mjs | 3 types × pass/violate × edge (null category, absent group) |
| witness search | tests/witness.test.mjs | finds ALL seeded violations; returned set is minimal (== oracle minimum, which is 2 in the fixture); deterministic order |
| reducer/revision | tests/reducer.test.mjs | every action bumps revision exactly once; closure invalidation marks exactly the evidence whose deps intersect the edit (and no other) |
| tools | tests/tools.test.mjs | all 5 tools: happy path, every error code in SPEC §7, payload ≤1500 chars, REVISION_MISMATCH carries currentRevision |
| redaction | tests/redact.test.mjs | no CANARY_ substring in any payload across every tool × every fixture persona; identity diffs = "<redacted:changed>" |

Gate: `npm test` exit 0, 0 fail, 0 skip. Target ≥ 60 tests.

## Layer 2 — page/registration integration (local Chrome 152)

Harness `harness/relay.mjs` (patterns from outpocket/harness/drive.mjs, reimplemented —
outpocket is frozen, nothing is imported from it):
- launch Chrome 152 with `--enable-features=WebMCP --headless=new --remote-debugging-port=<p> --user-data-dir=<fresh>` serving `src/page/` over `http://127.0.0.1:<port>`
- presence: `Runtime.evaluate` → `typeof document.modelContext !== "undefined"`
- tool count: `(await document.modelContext.getTools()).length === 5`
- calls by name via CDP `WebMCP.invokeTool` / `WebMCP.toolResponded` correlation (SPEC C5)
- asserts: page DOM reflects each call BEFORE its response (matrix cell count read via
  Runtime.evaluate inside the toolResponded window is already updated)

Gate: `node harness/relay.mjs --smoke` exit 0.

## Layer 3 — E2E relay eval (the 5-round story, scripted)

`node harness/relay.mjs --e2e` drives, in one browser session:
1. agent: read_mapping_session → r17
2. agent: stage_mapping_invariants(3 pins) → r18
3. agent: find_mapping_counterexample → evidence E1..En (expects 2 personas)
4. HUMAN SIMULATED: Runtime.evaluate dispatches EDIT_EXPRESSION(managerId) → r19; harness asserts evidence deps on managerId → stale, others NOT stale
5. agent: prepare_mapping_review(old evidence) → MUST fail STALE_EVIDENCE
6. agent: find_mapping_counterexample (incremental) → fresh evidence
7. agent: prepare_mapping_review → packet green, coverage 3/3
8. failure recovery: invoke with wrong expectedRevision → REVISION_MISMATCH → recover in one retry
Trace → `eval/out/relay-<git-sha>.json` (every invocationId, status, payload, timing).

Gate: exit 0 AND trace shows stale-rejection round trip AND zero Canceled/timeout.

## Benchmark — 3 arms run, 2 arms designed-not-run

Fixture (`data/personas.json` + `data/defects.md`): 8 personas × 2 directions.
Seeded defect classes:
- D1 wrong-direction write (bidirectional row writes app→user when direction says user→app)
- D2 case-sensitive group compare ("Employees" vs "employees")
- D3 managerless EU persona gets non-null managerId
- D4 HRIS/AD priority conflict on department
- D5 null ≠ empty ("" treated as missing)
Oracle: `data/oracle.json` — expected value + provenance source per (persona, field,
direction) + invariant truth table + minimal witness set (= 2). HUMAN-AUDITED: Caleb
signs a commit trailer `Oracle-Audited: yes` after row-by-row check (~1h). Until that
commit exists, every report is watermarked `oracle: UNAUDITED`.

| arm | what runs | metrics captured |
|---|---|---|
| A native-preview (simulated) | scripted model of per-persona manual Preview: interactions = personas × fields checked; label SIMULATED in report | human interaction count |
| B API + same engine (the kill arm) | node script given persisted snapshot ONLY (no dirty edits, no pins) + the SAME engine | defect recall, which classes invisible |
| C WebMCP | Layer-3 run over the full fixture | recall, FP, minimal-set size, interactions, stale/PII counters |
| Browser-Use | DESIGNED-NOT-RUN (time). Design in this file, absence stated in README + video | — |
| Full-CDP | DESIGNED-NOT-RUN (time). Same disclosure | — |

Report: `node eval/run.mjs` → `eval/out/report.json` + human-readable summary printed.

## Thresholds (pre-registered — written before any arm runs)

PASS requires ALL:
- C recall 5/5 defect classes; false positives ≤ 1
- C minimal witness set size == oracle minimum (2)
- stale mutations = 0; wrong-direction writes = 0; PII canary leaks = 0
- B (API arm) recall ≤ 3/5 — i.e. dirty-only defects (those introduced by unsaved
  edits/pins) are invisible to it BY MEASUREMENT, not by assertion
- A interaction count ≥ 2× C interaction count

KILL lines (any one fires → stop, write postmortem, fold into outpocket ERP):
- K1: arm B recall within 5% of arm C on the same fixture → the WebMCP layer added nothing
- K2: any CANARY_ leak that survives a fix attempt same-day
- K3: any stale-evidence packet accepted (fencing broken) that survives a fix attempt same-day
- K4: schedule gate — by 2026-08-31 18:00 PT Layers 1–2 not green → abort project
- K5: demo does not run in the real ChatGPT built-in browser against the deployed
  remote origin by 2026-09-01 21:00 PT → abort to ERP-only endgame

Resolved before coding started: the spec-card kill line "public preview endpoint covers
arbitrary batch profiles" did NOT fire — Okta public API = list/get/update only
(`evidence/okta-public-api-2026-08-29.md`, captured 2026-08-29). The undocumented
admin-console preview XHR remains UNTESTED and is disclosed as such wherever arm
results are shown (it belongs to a CDP-class arm, which is designed-not-run).

## Evidence pack (what ships with the submission)

- `eval/out/report.json` + all relay traces (committed)
- ChatGPT-browser run: PNG + transcribed JSON, V1-style (HUMAN task, ~30min)
- deployed URL (Render static) + public repo (MIT) — flip public only after freeze
- video <3min with audio; first 10–15s show the running result; recorded on the
  remote origin with the consent gate visible (SPEC C9)
