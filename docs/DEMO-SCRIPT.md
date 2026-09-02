# IdentityMap Witness demo — 3-minute shooting script (v6)

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

v6 change (2026-09-01): the official rules require audio that covers "what you
built **and how you used WebMCP**", and the first judging criterion is "How
thoroughly and skillfully does the project use WebMCP?" v5 named WebMCP in only
two of twelve lines. v6 keeps the story and the verified walk but states the
WebMCP mechanism at every beat, puts the registered tool surface on camera, and
moves the 22-second/two-phase line into the default cut.

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
- How the page uses WebMCP (every narration claim below is backed by the code):
  it registers **five tools** with `document.modelContext.registerTool` —
  `read_mapping_session`, `stage_mapping_invariants`,
  `find_mapping_counterexample`, `preview_mapping_patch`,
  `prepare_mapping_review`. Each has a strict JSON schema
  (`additionalProperties:false`, per-property descriptions), a description
  under 500 characters, `untrustedContentHint:true`; only the read tool has
  `readOnlyHint:true`. Registration is bound to an `AbortSignal` that fires on
  `pagehide`. Tool outputs are capped at 1,500 characters. Every tool except
  the read takes `expectedRevision`; a stale value is refused with
  `REVISION_MISMATCH` and the current revision. Failed calls roll the store
  back to the pre-call snapshot. **There is no save or apply tool.**
- Key on-screen elements: a revision badge (`r17` at load), two copy buttons
  (**Copy prompt 1 — setup**, **Copy prompt 2 — after Confirm all**), a
  **Reset demo** button (reloads the page), pending-rule cards (each shows the
  canonical rule fields, a version, and a content fingerprint), a **Confirm
  all** button, a STALE banner, a counterexample matrix with a
  `Minimal witness (N): …` summary line above it, a provenance rail, a review
  packet with GREEN/blocked states, and **Apply mapping (manual page
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
  `npm test` reports 292 passing; the e2e writes a 12-round trace file.
- A real platform constraint shaped the design: a pending WebMCP tool call dies
  after roughly 22 seconds,
  observed in our own ChatGPT in-app-browser testing on 2026-08-29; the measurement is not part of this repository's automated evidence.
  Human approval therefore cannot happen inside a tool call. Staging returns
  immediately; the human confirms on the page; the agent is told to re-read
  afterwards. Narration says "in our testing" for this reason.
- Trademark note: the rules forbid third-party trademarks in the video without
  permission. The narration names Active Directory and Okta once, in line 1, as
  the systems the scenario models (no logos, no marks on screen; the page shows
  only the lowercase source keys `ad`/`hris`/`okta`). If you prefer zero risk,
  read line 1 with "your directory, HR, and your identity provider" instead.

## How this script maps to the judging criteria (official wording)

| Criterion (rules text) | Where it lands |
|---|---|
| **WebMCP Leverage** — "How thoroughly and skillfully does the project use WebMCP? Does the code reflect genuine effort and a working, non-trivial implementation?" | Line 3 (five registered tools, schemas, descriptions, no save/apply tool), line 4 (tool calls on camera), lines 5–6 (staging is a tool, confirming is not; the 22-second constraint → two-phase design), line 7 (revision-bound calls refused when stale), line 8 (stale evidence ids cannot build a packet), line 10 (budgets, `readOnlyHint`/`untrustedContentHint`, `AbortSignal`), line 12 (the page authors the tools) |
| **Execution** — "a working or runnable project that has a complete, coherent product experience — not just a technical proof of concept" | Part 2 end to end on the remote origin; Part 3 receipts (292 tests, 12-round trace, write oracle) |
| **Potential Impact** — "a credible, specific case for solving a real problem for a real audience" | Lines 1–2 (the identity-mapping job and its concrete failure modes), line 12 (any page with an unsaved draft can author the same contract) |
| **Creativity & Ambition** — "how creative and novel is the concept and does the project differ from existing concepts" | Lines 7–9 (proof with a lifecycle — evidence dies on dependency edits), line 11 (concessions stated plainly, contribution named precisely) |

Rule check: the video must be under three minutes, include a clear demo of the
project functioning, and have audio covering what was built **and how WebMCP was
used**; public on YouTube; no third-party trademarks or copyrighted music.

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
release). Read at a relaxed pace; the lines are sized for it (about 470 words).

### Part 1 — what this is, the problem, the benefit (0:00–0:55)

SCREEN: pre-recorded B-roll of the live app, in this order: the full page at
r17 → the four-step guide strip → **the registered tool surface** (Chrome 152
with `--enable-features=WebMCP`: DevTools → Application → WebMCP panel listing
the five tools with their descriptions; fallback: `src/tools/defs.mjs` in an
editor scrolled to the five definitions so `annotations` are readable) →
pending-rule cards appearing → **the witness matrix filling with {P2, P3, P4}**
(this shot must land inside the first 15 seconds) → the STALE banner flashing
after an edit. No slides.

SAY:
1. "If you run user accounts, people's data lives in three systems — Active
   Directory, HR, and an identity provider like Okta. This page merges them
   into one profile, and this draft is broken."
2. "Broken quietly. A contractor is about to land in the employees group
   because of a capital letter. Someone with no manager got an empty string
   instead of null."
3. "I want an AI agent to catch that before I save, without handing it the
   keys. So the page doesn't let it guess at the DOM: it registers five WebMCP
   tools on document.modelContext — read, stage, find, preview, prepare — with
   strict schemas and descriptions the agent reads. No save tool, no apply
   tool. They don't exist."

### Part 2 — the demo (0:55–2:22)

D1 — the handshake (0:55–1:20)
- SCREEN: live recording starts. Consent gate on camera. The ChatGPT side
  panel stays in frame so the tool calls are visible; hold on the two call
  entries (`read_mapping_session`, `stage_mapping_invariants`) when they
  appear.
- ACTION: click **Reset demo**; pass the consent gate; badge shows r17. Click
  **Copy prompt 1 — setup**, paste into ChatGPT, send. The agent stages three
  rules; pending cards appear; the badge still shows r17. Then click
  **Confirm all**; badge becomes r18; focus lands on the second copy button.
- SAY:
4. "In ChatGPT's browser, prompt one asks the agent to stage three rules in
   plain English — contractors never in the employees group, no manager means
   null, HR owns department — then stop. Side panel: two tool calls, read then
   stage."
5. "The rules come back as pending cards — text, version, fingerprint. But
   the revision badge didn't move. Staging is a tool;
   confirming isn't. No tool can turn these on — a click on the page does.
   Mine."
6. "We learned why the hard way: in our testing, a WebMCP call that waits for
   a person dies in about twenty-two seconds. So approval lives in page
   state."

D2 — the proof (1:20–1:42)
- SCREEN: the side panel shows `find_mapping_counterexample` with
  `expectedRevision: 18`; the matrix gets the summary line
  `Minimal witness (3): P2, P3, P4 · 4 violation rows, including alternate witnesses`.
  Optional insert (usable footage from any take): a call refused with
  `REVISION_MISMATCH` and `currentRevision` in the side panel.
- ACTION: click **Copy prompt 2 — after Confirm all** (focus is already on
  it), paste, send. The agent re-reads, then finds. The matrix fills with
  {P2, P3, P4} plus the P5 alternate row. Open one provenance row that shows a
  losing source candidate.
- SAY:
7. "Prompt two. The agent re-reads, then calls find — each call carries the
   revision it expects; a stale one is refused. Three test people, P2, P3,
   P4: the smallest set that trips every rule. Click a row for receipts —
   which value won and why."

D3 — proof dies (1:42–2:02)
- ACTION: the agent names the exact fix; type `user.managerId` into the grid
  input. Badge becomes r19; STALE banner appears; the summary line and the
  rows are struck through. The agent re-reads and re-finds; the witness
  shrinks to {P2, P4}.
- SAY:
8. "It names the exact fix. I type it — the manager field. Version nineteen:
   every proof that touched that field just died on screen. Dead evidence
   can't build a packet; the agent re-finds at the new revision. Two people
   now."

D4 — finish clean (2:02–2:22)
- ACTION: apply the agent's group fix (r20, re-find shows {P4}); switch the
  priority selector from **ad → hris → okta** to **hris → ad → okta** (r21 —
  every remaining evidence record stales — re-find reaches a clean sweep);
  the packet is prepared and holds GREEN. Do not touch **Apply mapping
  (manual page control)**.
- SAY:
9. "Same rhythm twice more. Fix the contractor check — one. Flip the order so
   HR beats the directory — zero. Green lights only on fresh evidence for
   every rule. And Apply? A plain page button, not in the tool list."

### Part 3 — how it's built, honesty, impact (2:22–2:58)

- SCREEN: `src/tools/defs.mjs` scrolled to one tool definition (description,
  schema, `annotations`) and `app.js` at the `AbortController`/`pagehide`
  lines — two seconds each; then quick terminal cuts — `node tools/verify.mjs`
  tail with `STATUS CODE_COMPLETE`, `node eval/run.mjs` tail with
  `RESULT: PASS`, the 12-round trace file. Then back to the page holding GREEN;
  end card with the live URL and repository address.
- SAY:
10. "Under the hood the tools keep WebMCP's budgets — descriptions under five
    hundred characters, outputs under fifteen hundred — readOnlyHint only on
    read, untrustedContentHint on all five, registration on an AbortSignal.
    Two hundred ninety-two tests, a twelve-round trace, a write oracle on
    every call."
11. (protected — never cut) "Two honest notes: draft preview isn't a new
    idea, and another agent living in this page could run the same engine.
    What we add is the contract."
12. "That's what WebMCP is for: the page knows the stakes, so the page authors
    the tools. Any site with an unsaved draft can do this. IdentityMap
    Witness — the fewest synthetic people proving every broken rule, and proof
    that dies when you edit what it depended on."

### If the cut runs long

Trim in this order, nothing else: line 10's budget clause ("descriptions under
five hundred characters, outputs under fifteen hundred") → line 7's "Click a
row…" tail → line 2's second example. Lines 6 and 11 are never cut: line 6 is
the WebMCP design insight judges score, line 11 is the concession rule.

## Recording checklist

1. ChatGPT desktop app; open the built-in browser; enable site tools in the
   browser permission settings; pick a model with WebMCP support enabled.
2. Type the full `https://identitymap-witness.onrender.com` URL (include the
   scheme).
3. One full dry run first. State is tab-local: **Reset demo** reloads the page
   and restores r17, so retakes are cheap.
4. Record with the ChatGPT side panel visible so tool calls are on camera; the
   tool names in the panel are evidence for the first judging criterion.
5. For the Part 1 tool-surface shot, open the live URL in Chrome 152 launched
   with `--enable-features=WebMCP` and a fresh `--user-data-dir`, then
   DevTools → Application → WebMCP; if the panel is unavailable, film
   `src/tools/defs.mjs` in an editor instead.
6. Record Part 2 first, act by act; keep raw takes. Assemble Part 1's B-roll
   from the best Part 2 footage afterwards. If the agent misbehaves, Reset and
   retake — a rejected call (REVISION_MISMATCH, STALE_CONFIRM, stale evidence)
   is usable footage, not a failure: it shows the contract firing.
7. Narration: read the SAY lines slowly; re-record audio in post if needed.
8. No logos, no music you do not own. Export 1080p, final length under 3:00.
   Upload to YouTube **public**.
9. Write `evidence/video-final.txt` with the YouTube URL, the HEAD commit sha,
   and the recording date.

## Optional 30-second teaser (not the submission video)

| t | shot | narration |
|---|---|---|
| 0–4s | Open at r17 with the consent gate visible. Click **Copy prompt 1 — setup** and paste it into ChatGPT. | “This draft has not been saved. The page exposes five WebMCP tools, not a save button.” |
| 5–8s | The agent reads, stages three rules, and stops. Show the complete pending-rule cards, version, content fingerprint, and unchanged r17. | “The agent can propose the rules, but no tool can put them in force.” |
| 9s | The human visibly reviews the cards and clicks **Confirm all**; the badge becomes r18. | “No tool can confirm — my click on the page does, on exactly what is on screen.” |
| 10–15s | Click **Copy prompt 2 — after Confirm all**, paste it, and cut to the returned minimal witness `{P2, P3, P4}` and four matrix rows. | “Three synthetic people prove every violated rule in this unsaved draft.” |
| 16–21s | Open one provenance row, then change managerId through the real grid input; r19 and the STALE banner appear. | “I edit one dependency. The evidence that relied on it dies immediately.” |
| 22–26s | The agent re-reads at r19 and re-finds the smaller `{P2, P4}` witness before suggesting the next edit. | “The next decision starts from the current draft, not the dead proof.” |
| 27–30s | Fast-cut: human group edit → re-find at r20; human priority change from **ad → hris → okta** to **hris → ad → okta** → re-find at r21; then prepare from the fresh clean-sweep evidence and hold on GREEN. Do not click **Apply mapping (manual page control)**. | “Every edit gets a fresh check; only fresh evidence closes the review.” |
