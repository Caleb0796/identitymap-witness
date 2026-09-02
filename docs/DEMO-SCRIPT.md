# IdentityMap Witness demo — 3-minute shooting script (v5)

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

- The product is a single web page: an **identity-mapping workbench**. The
  real-world job it models: a company's employee data lives in three systems
  — `ad` (Active Directory, the IT account system), `hris` (the HR system),
  and `okta` (the sign-on/permissions system) — and an admin writes merge
  rules deciding, per field (displayName, group, managerId, department,
  email), which system wins and how values combine. The page holds an
  intentionally broken, **unsaved draft** of those rules. Eight synthetic
  personas (P1–P8) are the test population; no real system is connected.
  Four defects are seeded, each with a real-world sting: a case-sensitive
  check lets a `Contractor` (capital C) land in the employees group (an
  access-control mistake); a missing manager becomes an empty string instead
  of null (breaks anything that checks for a manager); Active Directory
  incorrectly outranks HR for department (stale data wins); and a
  present-but-empty value beats a real value in the merge.
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
  control)** — a button not exposed through the five WebMCP tools.
- The verified walk (numbers are load-bearing; do not improvise): fresh page is
  r17 → human clicks Confirm all → r18 → agent finds witness **{P2, P3, P4}** →
  human fixes managerId (`user.managerId`) → r19, evidence goes STALE → agent
  re-finds **{P2, P4}** → human fixes group → r20 → re-find **{P4}** → human
  switches priority from **ad → hris → okta** to **hris → ad → okta** → r21,
  all evidence stales → re-find → clean sweep, packet prepared GREEN. Staging
  and find calls never change the revision; only human confirm/edits do.
- After Confirm all, page focus lands on the **Copy prompt 2 — after Confirm all**
  button on its own — no mouse hunting on camera.
- Terminal receipts that exist and can be filmed: the last line of
  `node tools/verify.mjs` begins with `STATUS CODE_COMPLETE`; `node eval/run.mjs` ends in `RESULT: PASS`;
  `npm test` reports 281 passing; the e2e writes a 12-round trace file.
- A real platform constraint shaped the design: a pending WebMCP tool call dies
  after roughly 22 seconds,
  observed in our own ChatGPT in-app-browser testing on 2026-08-29; the measurement is not part of this repository's automated evidence.
  Human approval therefore cannot happen inside a tool call. Staging returns
  immediately; the human confirms on the page; the agent is told to re-read
  afterwards.

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

### Part 1 — what this is, the problem, the benefit (0:00–0:52)

SCREEN: pre-recorded B-roll of the live app, in this order: the full page at
r17 → the four-step guide strip → pending-rule cards appearing → **the witness
matrix filling with {P2, P3, P4}** (this shot must land inside the first 15
seconds) → the STALE banner flashing after an edit. No slides.

SAY:
1. "If you run user accounts for a company, you know this job: people's data
   lives in three systems — Active Directory, HR, and Okta — and something
   has to merge them into one profile. This page is that mapping. And this
   draft of it is broken."
2. "Broken quietly, too. A contractor is about to land in the employees group
   because of a capital letter. Someone with no manager got an empty string
   instead of null. And the wrong system is winning the department field."
3. "I want an AI agent to catch all that before I save — without handing it
   the keys. So the page gives it five WebMCP tools: read the draft, propose
   rules, prove what's broken, preview a fix, prepare a review. No save. No
   apply. And every proof is pinned to the draft's version."

### Part 2 — the demo (0:52–2:20)

D1 — the handshake (0:52–1:14)
- SCREEN: live recording starts. Consent gate on camera.
- ACTION: click **Reset demo**; pass the consent gate; badge shows r17. Click
  **Copy prompt 1 — setup**, paste into ChatGPT, send. The agent stages three
  rules; pending cards appear; the badge still shows r17. Then click
  **Confirm all**; badge becomes r18; focus lands on the second copy button.
- SAY:
4. "Watch it work. I copy prompt one into ChatGPT. It asks the agent to stage
   three rules in plain English — contractors never go in the employees
   group; no manager means null; HR is the source of truth for department —
   and then stop."
5. "The rules come back as pending cards: exact text, a version, a
   fingerprint. But look at the badge — nothing changed. The agent can
   propose. No tool can turn them on — a click on the page does. Mine."
6. (include only if the cut runs short) "It couldn't wait for my click inside
   a tool call anyway — those die in about twenty-two seconds. So waiting became
   page state."

D2 — the proof (1:14–1:38)
- ACTION: click **Copy prompt 2 — after Confirm all** (focus is already on
  it), paste, send. The agent re-reads, then finds. The matrix fills with
  {P2, P3, P4}. Open one provenance row that shows a losing source candidate.
- SAY:
7. "Prompt two. The agent re-reads, then hunts. Three test people — P2, P3,
   P4. That's the smallest group that trips every broken rule at once. Click
   a row and you get receipts: which system's value won, which lost, and
   why."

D3 — proof dies (1:38–2:00)
- ACTION: the agent names the exact fix; type `user.managerId` into the grid
  input. Badge becomes r19; STALE banner appears; stale evidence is struck
  through. The agent re-reads and re-finds; the witness shrinks to {P2, P4}.
- SAY:
8. "It tells me the exact fix. I type it — the manager field. Version
   nineteen — and look: every proof that touched that field just died on
   screen, struck through. It re-checks. Now it's two people."

D4 — finish clean (2:00–2:20)
- ACTION: apply the agent's group fix (r20, re-find shows {P4}); switch the
  priority selector from **ad → hris → okta** to **hris → ad → okta** (r21 —
  every remaining evidence record stales — re-find reaches a clean sweep);
  the packet is prepared and holds GREEN. Do not touch **Apply mapping
  (manual page control)**.
- SAY:
9. "Same rhythm twice more. Fix the contractor check — down to one. Flip the
   order so HR beats Active Directory — everything re-checks — zero. Green
   only lights up because the sweep covered every rule with fresh proof. And
   Apply? A plain button on the page. The agent doesn't have it."

### Part 3 — receipts, honesty, impact (2:20–2:58)

- SCREEN: quick terminal cuts — `node tools/verify.mjs` tail with
  `STATUS CODE_COMPLETE`, `node eval/run.mjs` tail with `RESULT: PASS`, the
  12-round trace file. Then back to the page holding GREEN; end card with the
  live URL and repository address.
- SAY:
10. "Behind it: two hundred eighty-one tests, a twelve-round trace in real
    Chrome, and a write oracle on every single call."
11. (protected — never cut) "Two honest notes: draft preview isn't a new
    idea, and another agent living in this page could run the same engine.
    What we add is the contract."
12. "That's WebMCP's point — the page knows the stakes, so the page sets the
    rules. Any site with a draft can do this. IdentityMap Witness finds the
    smallest set of synthetic people proving every violated rule on an
    unsaved draft — and the proof dies when you edit what it depended on."

### If the cut runs long

Line 6 is already out of the default cut — add it back only if the runtime
lands under 2:50. If the cut runs long, trim in this order, nothing else: the
"Click a row…" tail of line 7, then line 2's third example, then line 10.
Line 11 is never cut.

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
| 9s | The human visibly reviews the cards and clicks **Confirm all**; the badge becomes r18. | “No tool can confirm — my click on the page does, on exactly what is on screen.” |
| 10–15s | Click **Copy prompt 2 — after Confirm all**, paste it, and cut to the returned minimal witness `{P2, P3, P4}` and four matrix rows. | “Three synthetic people prove every violated rule in this unsaved draft.” |
| 16–21s | Open one provenance row, then change managerId through the real grid input; r19 and the STALE banner appear. | “I edit one dependency. The evidence that relied on it dies immediately.” |
| 22–26s | The agent re-reads at r19 and re-finds the smaller `{P2, P4}` witness before suggesting the next edit. | “The next decision starts from the current draft, not the dead proof.” |
| 27–30s | Fast-cut: human group edit → re-find at r20; human priority change from **ad → hris → okta** to **hris → ad → okta** → re-find at r21; then prepare from the fresh clean-sweep evidence and hold on GREEN. Do not click **Apply mapping (manual page control)**. | “Every edit gets a fresh check; only fresh evidence closes the review.” |
