# Codex Desktop plan — evidence tasks 1 & 2

> **Superseded (2026-09-01).** Historical execution plan from 2026-08-29. Its numbers (54/54 tests, 10-round E2E), the direct-pin driver prompts, and the evidence JSON template are obsolete: current gates are 292 tests and a 12-round E2E; staging leaves r17 until a human clicks Confirm all; the evidence verifier also requires `pendingConfirmationObserved` and `humanConfirmAllObserved`. Authorities: `SPEC.md` → `EVAL.md` → `docs/CODEX-REMEDY-PLAN.md`.

Self-contained objective for Codex Desktop. Repo: `/Users/calebwei/mcp/identitymap-witness`
(git, remote `Caleb0796/identitymap-witness`, private). Live page:
https://identitymap-witness.onrender.com — a WebMCP demo (5 tools on
`document.modelContext`) already built, tested (54/54 unit, 3-cold-session CDP
smoke, 10-round E2E), deployed. Deadline: Devpost 2026-09-03 13:00 PT.

Your job is EXACTLY two evidence tasks. Acceptance is mechanical: after each,
`node tools/verify.mjs` (run from the repo root) must flip the matching
`HUMAN-REMAINING TODO` line to `done`. Do not touch anything outside the listed
outputs.

## Hard rules (violating any = stop and report)

- Never modify: `src/**`, `harness/**`, `eval/**` (code), `app.js`, `index.html`,
  `data/golden-walk.md`, `data/personas.json`, `data/persisted-snapshot.json`,
  `data/oracle.json` values (Task 2 may flip ONLY the `audited` boolean, nothing else).
- Never touch `/Users/calebwei/mcp/outpocket` (frozen live sprint) or flip this
  repo public.
- Transcription discipline: evidence JSON records ONLY what the screenshot pixels
  show. A field you cannot read off the PNG stays absent, with a note. Never infer.
- Independence discipline (Task 2): do NOT import or execute `src/engine/**`.
  The audit's whole value is recomputation by a different implementation.
- No WindTunnel citations, no arXiv 2508.09171, no uniqueness claims, anywhere.
- Commits: small, message prefix `evidence:`; push after each task.

## Task 1 — ChatGPT built-in browser run (target: ~45 min)

Goal: capture `evidence/chatgpt-run.png` + `evidence/chatgpt-run.json` proving
the deployed page works in the ChatGPT built-in browser, INCLUDING the
stale-rejection beat. `tools/verify.mjs` content-validates the JSON:
`toolCount === 5`, `staleRejectionObserved === true`, `origin` containing
`onrender.com`.

Steps:
1. In the ChatGPT desktop app, open the built-in browser (⌘T) and load
   https://identitymap-witness.onrender.com . A consent gate appears for remote
   origins — the HUMAN clicks it (hand off; do not bypass).
2. Confirm the header badges read: `origin: identitymap-witness.onrender.com`,
   `modelContext: present`, `tools: 5/5 registered`, `r17`.
3. Drive the ChatGPT agent with these prompts, in order (each tool returns fast;
   never ask the agent to wait for a human mid-call):
   a. "Read the mapping session on this page and list the tools you can see."
      → expect 5 tools, revision 17.
   b. "Stage these three invariants, then find the minimal counterexample set:
      contractors must never map into the employees group; if no source supplies
      managerId the target must stay null; hris is the source of truth for
      department." → expect revision 18, witness P2/P3/P4, matrix shows 4 rows.
   c. HUMAN (or you, in the page UI — not via the agent): edit the `managerId`
      expression in the grid to exactly `user.managerId` and press Enter. The
      revision badge ticks to r19 and the red STALE banner appears.
   d. "Prepare the review packet from the evidence ids you got earlier."
      → expect the tool to FAIL with STALE_EVIDENCE. This failure is the money
      shot — it must be visible in the transcript/page when you screenshot.
   e. "Find the counterexample set again at the current revision." → smaller
      witness (P2, P4).
4. Screenshot the FULL window showing: the four header badges, the matrix (with
   stale strikethrough or the fresh re-find), and the ChatGPT transcript line
   showing the STALE_EVIDENCE rejection. Save as `evidence/chatgpt-run.png`.
5. Write `evidence/chatgpt-run.json` by transcribing the PNG only:

```json
{
  "origin": "https://identitymap-witness.onrender.com",
  "modelContextPresent": true,
  "toolCount": 5,
  "revisionSeen": "r17→r19 (as visible)",
  "staleRejectionObserved": true,
  "observedAt": "<ISO timestamp of the capture>",
  "chatgptModel": "<only if visible in the UI, else omit>",
  "note": "Transcribed from evidence/chatgpt-run.png; every field above is readable in the pixels. Nothing inferred."
}
```

6. `git add evidence/chatgpt-run.png evidence/chatgpt-run.json && git commit -m "evidence: ChatGPT built-in browser run (5 tools, stale rejection observed)" && git push`
7. Run `node tools/verify.mjs` — the ChatGPT line must now read `done`. If it
   does not, the JSON is missing a required field; fix the transcription (never
   fabricate) or re-capture.

Failure modes: consent gate loops → reload once, then report. Tools absent →
check the badges; if `modelContext: absent`, the browser build lacks WebMCP —
report, do not fake. Agent calls the wrong tool → rephrase using the exact tool
names visible in step 3a.

## Task 2 — independent oracle audit (target: ~60 min)

Goal: independently recompute the golden oracle and, if it holds, hand the human
a one-line sign-off. `data/oracle.json.audited` gates `eval/run.mjs` (exit 2 →
exit 0).

Inputs to read: `SPEC.md` §4 (golden state) + §5 (invariant semantics) + §6
(expression semantics — the null/empty and present-but-empty rules are the
traps), `data/personas.json`, `data/oracle.json`, `data/golden-walk.md`.

Steps:
1. Write your OWN tiny evaluator (scratch file OUTSIDE the repo, or pure
   reasoning — anything except importing `src/engine/**`) implementing SPEC §6
   exactly: resolution order `priority + okta`, first PRESENT source wins,
   present-but-empty `""` wins, missing→null, null poisons concat, `"" == null`
   is false, exact-case string equality.
2. Recompute all 8 personas × 5 fields under the golden expressions and priority
   `["ad","hris"]`. Compare value AND provSource against
   `oracle.json.expectedValues` (provSource convention is defined at the top of
   `data/golden-walk.md`).
3. Recheck the violation set against SPEC §5 semantics (checker is
   case-insensitive; the draft expression is not — that asymmetry is DC1).
   Expect exactly the 4 rows in `oracle.json.expectedViolations`.
4. Verify minimal-witness size 3 by set-cover reasoning over the violations
   (P2 covers forbid, P3 covers null, P4|P5 covers sot; show no pair suffices).
5. Cross-check `data/golden-walk.md`'s table matches `oracle.json` cell-for-cell
   (transcription errors count as discrepancies).
6. Write `evidence/oracle-audit-report.md`: method statement (what you
   implemented, that you never imported src/engine), the full 40-cell
   comparison table, violation/witness checks, and a DISCREPANCIES section
   (expected: none). Sign it with your model identity and timestamp.
7. If ZERO discrepancies: commit the report
   (`evidence: independent oracle audit — 0 discrepancies`) and push, then print
   this for the human — DO NOT run it yourself, the flip is the human's
   signature by design:

```
cd /Users/calebwei/mcp/identitymap-witness && python3 -c "import json,io; p='data/oracle.json'; o=json.load(open(p)); o['audited']=True; io.open(p,'w').write(json.dumps(o,indent=2)+'\n')" && git add data/oracle.json && git commit -m "oracle: flip audited after independent codex audit + my row-by-row read

Oracle-Audited: yes" && git push && node eval/run.mjs
```

8. If ANY discrepancy: commit the report WITHOUT any flip instruction, and stop —
   a wrong oracle invalidates the eval and must come back to the authors.

## Done definition

`node tools/verify.mjs` shows, at minimum:
```
HUMAN-REMAINING done  ChatGPT-browser evidence (PNG + content-validated JSON)
HUMAN-REMAINING done  oracle audit flipped        ← after the human runs the flip line
```
Remaining after you: video (09-02, after the outpocket D4 recording) and Devpost
submission (09-03 am). Those are out of your scope — do not attempt them.
