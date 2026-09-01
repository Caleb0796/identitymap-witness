# IdentityMap Witness demo — 3-minute shooting script (v4)

Record on the remote Render origin (https://identitymap-witness.onrender.com) in
ChatGPT's built-in browser. Keep the consent gate visible on camera, use synthetic
personas only, narrate in English with audio, and keep the final cut under 3:00
(target 2:55). Upload to YouTube as **public** (unlisted does not satisfy the
rules).

Two concessions come first: draft preview exists as a first-party pattern, and
another page-local agent could run this same engine. The contribution claimed
below is the page-authored contract and its evidence lifecycle.

Structure: explain first (what it is, the problem, the benefit), then the live
demo, then impact. The first minimal counterexample must still be visible within
the first 15 seconds — satisfy that with B-roll: Part 1's narration plays over
pre-recorded app footage that includes the witness-matrix moment, not over
slides.

## Context for a collaborator with zero background (human or AI)

Read this once and the script below needs no other context.

- The product is a single web page: an **identity-mapping workbench** holding an
  intentionally broken, unsaved draft. The draft maps person fields
  (displayName, group, managerId, department, email) from three sources
  (ad, hris, okta) using small expressions. Eight synthetic personas (P1–P8)
  are the test population. Four defects are seeded: a casing bug in the group
  expression, an empty string standing in for a missing manager, a flipped
  source priority, and a present-but-empty value that wins a merge.
- The page registers **five WebMCP tools** via `document.modelContext` that a
  browser agent (e.g. ChatGPT's built-in browser) can call: read the session,
  stage rule proposals, find a minimal counterexample set, preview a redacted
  patch, prepare a review packet. **There is no save or apply tool.**
- Key on-screen elements: a revision badge (`r17` at load), two copy buttons
  (**Copy prompt 1 — setup**, **Copy prompt 2 — after Confirm all**), a
  **Reset demo** button (reloads the page), pending-rule cards (each shows the
  canonical rule fields, a version, and a content fingerprint), a **Confirm
  all** button, a STALE banner, a counterexample matrix, a provenance rail, a
  review packet with GREEN/blocked states, and **Apply mapping (manual page
  control)** — a button the agent cannot invoke.
- The verified walk (numbers are load-bearing; do not improvise): fresh page is
  r17 → human clicks Confirm all → r18 → agent finds witness **{P2, P3, P4}** →
  human fixes managerId (`user.managerId`) → r19, evidence goes STALE → agent
  re-finds **{P2, P4}** → human fixes group → r20 → re-find **{P4}** → human
  switches priority from **ad → hris → okta** to **hris → ad → okta** → r21,
  all evidence stales → re-find → clean sweep, packet prepared GREEN. Staging
  and find calls never change the revision; only human confirm/edits do.
- After Confirm all, page focus lands on the **Copy prompt 2** button on its
  own — no mouse hunting on camera.
- Terminal receipts that exist and can be filmed: `node tools/verify.mjs` ends
  in `STATUS CODE_COMPLETE`; `node eval/run.mjs` ends in `RESULT: PASS`;
  `npm test` reports 281 passing; the e2e writes a 12-round trace file.
- A real platform constraint shaped the design: a pending WebMCP tool call dies
  after roughly 22 seconds, so human approval cannot happen inside a tool call.
  Staging returns immediately; the human confirms on the page; the agent is
  told to re-read afterwards.

## How this script maps to the judging criteria

| Criterion | Where it lands |
|---|---|
| WebMCP Leverage | Part 1 (the page authors a five-tool, least-privilege surface) and Part 2 (two-phase confirm; revision-bound evidence) |
| Execution | Part 2 (complete working flow on a remote origin) and Part 3 (tests, e2e trace, write oracle) |
| Potential Impact | Part 1 (the problem is general) and Part 3 (any page with a draft can author the same contract) |
| Creativity & Ambition | Part 2 (proof with a lifecycle — evidence dies on dependency edits) and Part 3 (concessions stated plainly) |

## Verbatim two-prompt handshake

Use the page's two copy buttons. Do not combine these prompts: the agent must stop
while the staged rules await visible human confirmation.

**Prompt 1 — setup**

> Read the mapping session on this page. Stage exactly these three invariants and then stop and tell me to confirm them on the page: (1) contractors must never map into the employees group; (2) if no source supplies managerId the target must stay null; (3) hris is the source of truth for department. Do not call any other tool until I tell you I confirmed.

**Prompt 2 — only after clicking Confirm all**

> I confirmed the rules. Re-read the session, then find the minimal counterexample set. Walk me through fixing every violation: tell me exactly which expression or the priority order to change in the page UI. After each of my edits, re-find at the current revision. When violations reach zero, prepare the review packet from the fresh evidence ids.

## The script

Each block gives SCREEN (what is on camera), ACTION (what the human does), and
SAY (narration to read aloud, written to sound like a person, not a press
release). Read at a relaxed pace; the lines are sized for it.

### Part 1 — what this is, the problem, the benefit (0:00–0:45)

SCREEN: pre-recorded B-roll of the live app, in this order: the full page at
r17 → the four-step guide strip → pending-rule cards appearing → **the witness
matrix filling with {P2, P3, P4}** (this shot must land inside the first 15
seconds) → the STALE banner flashing after an edit. No slides.

SAY:
1. "This is IdentityMap Witness. It's a web page where an AI agent helps you
   review unsaved work — here, a broken identity-mapping draft — and the page
   itself decides what the agent is allowed to do."
2. "Because that's the real problem with agents and drafts: you get 'looks
   fine to me', and you can't tell if it's true. To get real help you'd
   normally hand over save and apply. And while you keep editing, the agent's
   old answers quietly go stale underneath you."
3. "So this page publishes exactly five WebMCP tools: read the draft, propose
   rules, prove violations, preview a fix, prepare a review. No save. No
   apply. Rules only turn on when I click. And every proof is pinned to a
   revision of the draft — that part matters in a minute."

### Part 2 — the demo (0:45–2:20)

D1 — the handshake (0:45–1:12)
- SCREEN: live recording starts. Consent gate on camera.
- ACTION: click **Reset demo**; pass the consent gate; badge shows r17. Click
  **Copy prompt 1 — setup**, paste into ChatGPT, send. The agent stages three
  rules; pending cards appear; the badge still shows r17. Then click
  **Confirm all**; badge becomes r18; focus lands on the second copy button.
- SAY:
4. "Let's run it for real. Fresh page, revision seventeen. I copy prompt one
   into ChatGPT — it asks the agent to stage three business rules and then
   stop."
5. "And there they are — pending cards, with a version and a fingerprint of
   the exact text. The revision hasn't moved. It proposed the rules; it can't
   turn them on. That part is my click."
6. (droppable if over time) "It couldn't wait for me inside a tool call even
   if it wanted to — those die in about twenty seconds. So waiting became
   page state instead."

D2 — the proof (1:12–1:37)
- ACTION: click **Copy prompt 2 — after Confirm all** (focus is already on
  it), paste, send. The agent re-reads, then finds. The matrix fills with
  {P2, P3, P4}. Open one provenance row that shows a losing source candidate.
- SAY:
7. "I confirmed, so — prompt two. The agent re-reads and goes hunting. And
   here's the heart of it: three synthetic people. That's the smallest set
   that triggers every broken rule in this draft. Not a sample — proof, with
   provenance: which source won, which lost, and why."

D3 — proof dies (1:37–2:00)
- ACTION: the agent names the exact fix; type `user.managerId` into the grid
  input. Badge becomes r19; STALE banner appears; stale evidence is struck
  through. The agent re-reads and re-finds; the witness shrinks to {P2, P4}.
- SAY:
8. "Now watch this. It tells me the exact fix, I type it — one field. Revision
   nineteen. And everything that depended on that field just died: banner,
   struck-through rows, the lot. It can't reuse any of it. It re-checks, and
   the witness shrinks to two."

D4 — finish clean (2:00–2:20)
- ACTION: apply the agent's group fix (r20, re-find shows {P4}); switch the
  priority selector from **ad → hris → okta** to **hris → ad → okta** (r21 —
  every remaining evidence record stales — re-find reaches a clean sweep);
  the packet is prepared and holds GREEN. Do not touch **Apply mapping
  (manual page control)**.
- SAY:
9. "Two more fixes, same rhythm — every edit gets a fresh check. Down to one
   person, then zero. The green light only shows because this sweep covered
   every rule, and the packet is built from fresh evidence only. Apply? Still
   an ordinary button on the page. The agent just doesn't have it."

### Part 3 — receipts, honesty, impact (2:20–2:55)

- SCREEN: quick terminal cuts — `node tools/verify.mjs` tail with
  `STATUS CODE_COMPLETE`, `node eval/run.mjs` tail with `RESULT: PASS`, the
  12-round trace file. Then back to the page holding GREEN; end card with the
  live URL and repository address.
- SAY:
10. "Under the hood: two hundred eighty-one tests, a twelve-round end-to-end
    trace driving real Chrome, and a write oracle that audits every tool call
    — a failed call has to leave state byte-for-byte untouched."
11. (protected — never cut) "Two honest notes. Draft preview itself isn't new.
    And another agent living in this page could run the same engine. What's
    new is the contract."
12. "And the contract is the point of WebMCP: the page knows the stakes, so
    the page sets the boundary — any site with a draft can wire this up.
    IdentityMap Witness finds the smallest set of synthetic people proving
    every violated rule on an unsaved draft — and the proof dies when you
    edit what it depended on."

### If the cut runs long

Cut in this order, nothing else: line 6 (the twenty-second aside), then the
"with provenance…" tail of line 7, then compress line 10 to "281 tests, a
12-round real-browser trace, and a write oracle on every call." Line 11 is
never cut.

## Recording checklist

1. ChatGPT desktop app; open the built-in browser; enable site tools in the
   browser permission settings; pick a model with WebMCP support enabled.
2. Type the full `https://identitymap-witness.onrender.com` URL (include the
   scheme).
3. One full dry run first. State is tab-local: **Reset demo** reloads the page
   and restores r17, so retakes are cheap.
4. Record with the ChatGPT side panel visible so tool calls are on camera.
5. Record Part 2 first, act by act; keep raw takes. Assemble Part 1's B-roll
   from the best Part 2 footage afterwards. If the agent misbehaves, Reset and
   retake — a rejected call (STALE_CONFIRM, stale evidence) is usable footage,
   not a failure: it shows the contract firing.
6. Narration: read the SAY lines slowly; re-record audio in post if needed.
7. Export 1080p, final length under 3:00. Upload to YouTube **public**.
8. Write `evidence/video-final.txt` with the YouTube URL, the HEAD commit sha,
   and the recording date.

## Optional 30-second teaser (not the submission video)

| t | shot | narration |
|---|---|---|
| 0–4s | Open at r17 with the consent gate visible. Click **Copy prompt 1 — setup** and paste it into ChatGPT. | “This draft has not been saved. The page exposes a safety workflow, not a save button.” |
| 5–8s | The agent reads, stages three rules, and stops. Show the complete pending-rule cards, version, content fingerprint, and unchanged r17. | “The agent can propose the rules, but it cannot put them in force.” |
| 9s | The human visibly reviews the cards and clicks **Confirm all**; the badge becomes r18. | “Only my click confirms exactly what is on screen.” |
| 10–15s | Click **Copy prompt 2 — after Confirm all**, paste it, and cut to the returned minimal witness `{P2, P3, P4}` and four matrix rows. | “Three synthetic people prove every violated rule in this unsaved draft.” |
| 16–21s | Open one provenance row, then change managerId through the real grid input; r19 and the STALE banner appear. | “I edit one dependency. The evidence that relied on it dies immediately.” |
| 22–26s | The agent re-reads at r19 and re-finds the smaller `{P2, P4}` witness before suggesting the next edit. | “The next decision starts from the current draft, not the dead proof.” |
| 27–30s | Fast-cut: human group edit → re-find at r20; human priority change from **ad → hris → okta** to **hris → ad → okta** → re-find at r21; then prepare from the fresh clean-sweep evidence and hold on GREEN. Do not click **Apply mapping (manual page control)**. | “Every edit gets a fresh check; only fresh evidence closes the review.” |
