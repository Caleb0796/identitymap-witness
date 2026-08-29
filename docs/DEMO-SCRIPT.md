# Demo scripts — shot by shot

Recording rules (binding): remote Render origin, ChatGPT built-in browser, the
consent gate stays IN the cut (SPEC C9), result visible in the first 10–15s,
audio narration, under 3 minutes. Record AFTER outpocket D4.

## 30-second cut

| t | shot | line |
|---|---|---|
| 0–6s | Page open at r17. Ask the agent: "check this mapping against P1". Agent reads session, previews P1 — all green | "One test user, all green. Ship it? Watch." |
| 7–14s | Type two pins in chat: contractors never in employees; missing manager stays null; HRIS owns department. Agent stages pins (r18), runs find → matrix lights up: P2, P3, P4 — three people, three different latent failures | "Three invariants I just wrote — and the minimal set of people who break them. Provenance on every cell, no PII in any tool payload." |
| 15–22s | Human fixes managerId expression in the grid (r19). Revision badge ticks. STALE watermark appears over the matrix | "I fix one line myself. Every piece of evidence that depended on it just died — nothing else did." |
| 23–27s | Agent tries to assemble the old packet → STALE_EVIDENCE rejection on screen; re-find → smaller witness [P2,P4] | "The agent can't launder stale evidence past me." |
| 28–30s | Fast-forward fixes → clean sweep → packet GREEN. Cursor hovers Apply — and doesn't click | "Apply was never the agent's to click." |

## 3-minute cut

1. (20s) Pain: an Okta admin pushing a new bidirectional-era mapping to 4,000
   employees; a test-admin happy path hides contractor/EU/priority failures.
   State the two concessions ON CAMERA (draft-preview is first-party standard;
   any page agent could run this engine) — then the actual claim: the page
   AUTHORS the safety contract.
2. (25s) The dirty draft tour: four session mistakes (case compare, null→"",
   priority flipped, empty-wins), revision badge, pins panel empty.
3. (55s) Five-tool loop, live: read → stage (r18) → find (matrix, provenance
   rail with losing sources) → preview group fix (diff, draft untouched) →
   prepare → blockers "violating".
4. (40s) Receipts: eval/out/report.json on screen — 9/9 thresholds; the
   ablation line read ALOUD with its by-construction label; three cold-session
   smoke; the 10-round trace; Browser-Use and Full-CDP arms named as
   designed-not-run.
5. (25s) Guards, live: mid-edit stale rejection replay; wrong-revision recovery;
   canary grep over the full trace returning nothing.
6. (15s) Limits + close: unaudited-oracle watermark until the human audit;
   undocumented admin preview XHR untested; "the agent proves, the human signs."
