# IdentityMap Witness demo — shot by shot

Record on the remote Render origin in ChatGPT's built-in browser. Keep the consent
gate visible, use synthetic personas only, include narration, and keep the final
cut under three minutes. The first counterexample result must be visible within
the first 15 seconds.

## Verbatim two-prompt handshake

Use the page's two copy buttons. Do not combine these prompts: the agent must stop
while the staged rules await visible human confirmation.

**Prompt 1 — setup**

> Read the mapping session on this page. Stage exactly these three invariants and then stop and tell me to confirm them on the page: (1) contractors must never map into the employees group; (2) if no source supplies managerId the target must stay null; (3) hris is the source of truth for department. Do not call any other tool until I tell you I confirmed.

**Prompt 2 — only after clicking Confirm all**

> I confirmed the rules. Re-read the session, then find the minimal counterexample set. Walk me through fixing every violation: tell me exactly which expression or the priority order to change in the page UI. After each of my edits, re-find at the current revision. When violations reach zero, prepare the review packet from the fresh evidence ids.

## 30-second cut

| t | shot | narration |
|---|---|---|
| 0–4s | Open at r17 with the consent gate visible. Click **Copy prompt 1 — setup** and paste it into ChatGPT. | “This draft has not been saved. The page exposes a safety workflow, not a save button.” |
| 5–8s | The agent reads, stages three rules, and stops. Show the complete pending-rule cards, version, content fingerprint, and unchanged r17. | “The agent can propose the rules, but it cannot put them in force.” |
| 9s | The human visibly reviews the cards and clicks **Confirm all**; the badge becomes r18. | “Only my click confirms exactly what is on screen.” |
| 10–15s | Click **Copy prompt 2 — after Confirm all**, paste it, and cut to the returned minimal witness `{P2,P3,P4}` and four matrix rows. | “Three synthetic people prove every violated rule in this unsaved draft.” |
| 16–21s | Open one provenance row, then change managerId through the real grid input; r19 and the STALE banner appear. | “I edit one dependency. The evidence that relied on it dies immediately.” |
| 22–26s | The agent re-reads at r19 and re-finds the smaller `{P2,P4}` witness before suggesting the next edit. | “The next decision starts from the current draft, not the dead proof.” |
| 27–30s | Fast-cut: human group edit → re-find at r20; human priority edit → re-find at r21; then prepare from the fresh clean-sweep evidence and hold on GREEN. Do not click Apply. | “Every edit gets a fresh check; only fresh evidence closes the review.” |

## Three-minute cut

1. **0:00–0:15 — result first.** Run the exact two-prompt handshake above: prompt
   1 stages and stops, the human visibly clicks Confirm all, prompt 2 re-reads and
   finds `{P2,P3,P4}`. Keep the pending cards, revision change, and matrix legible.
2. **0:15–0:40 — what failed.** Show the four session-introduced defect classes:
   contractor group casing, missing-manager empty string, flipped source priority,
   and present-but-empty source resolution. State both concessions aloud: draft
   preview is a first-party product pattern, and another page agent could run the
   same deterministic engine; the page-authored workflow and evidence lifecycle
   are what this demo evaluates.
3. **0:40–1:15 — inspect the proof.** Walk the matrix and provenance rail, including
   a losing source candidate. Explain that the witness is the smallest audited set
   covering every currently violated confirmed rule, not a sample of convenience.
4. **1:15–1:45 — make proof die.** Change managerId in the real grid. Hold on r19,
   the struck-through matrix, and the STALE banner. The agent then re-reads and
   re-finds the smaller witness at the current revision before suggesting more.
5. **1:45–2:15 — recover honestly.** Apply the remaining human edits through the
   group input and priority selector. After the group change, re-find at r20;
   after the priority change, re-find at r21. Finish with a full clean sweep and
   prepare a packet from those fresh evidence ids. Hold on GREEN; never click Apply.
6. **2:15–2:45 — receipts.** Show a fresh `eval/out/report.json` and its PASS result,
   the 12-round relay trace, three cold-session registration smoke runs, zero
   write-oracle failures, and the by-construction ablation label. Do not present
   Browser-Use or Full-CDP as measured comparisons.
7. **2:45–3:00 — limits and close.** State that the demo covers an unsaved synthetic
   mapping draft and does not exercise the product's save operation. End on:
   “IdentityMap Witness finds the smallest set of synthetic people proving every
   violated rule on an unsaved draft — and the proof dies when you edit what it
   depended on.”
