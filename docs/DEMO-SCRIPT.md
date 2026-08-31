# IdentityMap Witness demo — 3-minute shooting script (v3)

Record on the remote Render origin (https://identitymap-witness.onrender.com) in
ChatGPT's built-in browser. Keep the consent gate visible on camera, use synthetic
personas only, narrate in English with audio, and keep the final cut under 3:00
(target 2:55). The first counterexample result must be visible within the first
15 seconds — this script satisfies that with a cold open. Upload to YouTube as
**public** (unlisted does not satisfy the rules).

Two concessions come first: draft preview exists as a first-party pattern, and
another page-local agent could run this same engine. The contribution claimed
below is the page-authored contract and its evidence lifecycle.

## How this script maps to the judging criteria

| Criterion | Where it lands |
|---|---|
| WebMCP Leverage | Act 1 (five least-privilege tools; staging cannot confirm; two-phase handshake designed around the measured ~22s tool-call timeout) and Act 3 (revision-bound evidence) |
| Execution | Act 0 (working product on a remote origin), Act 2 (exhaustive minimal witness + redacted provenance), Act 4 (recovery to a gated all-clear), Act 5 (tests, e2e trace, write oracle) |
| Potential Impact | Act 6 (unsaved-draft applicability; the page authors the boundary) |
| Creativity & Ambition | Act 3 (evidence with a lifecycle — proof dies on dependency edit) and Act 5 (stated concessions as a feature, not a footnote) |

## Verbatim two-prompt handshake

Use the page's two copy buttons. Do not combine these prompts: the agent must stop
while the staged rules await visible human confirmation.

**Prompt 1 — setup**

> Read the mapping session on this page. Stage exactly these three invariants and then stop and tell me to confirm them on the page: (1) contractors must never map into the employees group; (2) if no source supplies managerId the target must stay null; (3) hris is the source of truth for department. Do not call any other tool until I tell you I confirmed.

**Prompt 2 — only after clicking Confirm all**

> I confirmed the rules. Re-read the session, then find the minimal counterexample set. Walk me through fixing every violation: tell me exactly which expression or the priority order to change in the page UI. After each of my edits, re-find at the current revision. When violations reach zero, prepare the review packet from the fresh evidence ids.

## Act-by-act script

Each act lists on-screen action and the narration lines to read. Lines are short
on purpose; read them slowly. If the cut runs long, drop N2-4 first, then N5-1's
enumeration.

### Act 0 — cold open: the result (0:00–0:15)

Pre-record this moment separately: page already at r18 with rules confirmed,
prompt 2 pasted, the find call returning. Open the video mid-result.

- Action: matrix fills with the minimal witness `{P2, P3, P4}`; hold on the
  matrix and the revision badge.
- **N0-1:** "This profile-mapping draft is unsaved — and broken."
- **N0-2:** "An agent just proved it: three synthetic people covering every
  violated rule. Its page tools cannot save, apply, or change the draft."
- **N0-3:** "Rewind — the best part is what the agent could *not* do."

### Act 1 — the handshake (0:15–0:50)

- Action: click **Reset demo** (page reloads), pass the consent gate on camera,
  badge shows r17. Click **Copy prompt 1 — setup**, paste into ChatGPT, send.
- **N1-1:** "The page registers five WebMCP tools. None can save. None can
  confirm rules."
- Action: the agent reads and stages; pending-rule cards show every canonical
  field, a version, and a content fingerprint. The revision badge still shows r17.
- **N1-2:** "A pending tool call dies in about twenty-two seconds — so approval
  can't hide inside a tool call. Staging returns instantly, as a proposal."
- **N1-3:** "Every canonical field, a version, a content fingerprint. The revision
  hasn't moved."
- Action: click **Confirm all**; badge becomes r18; focus lands on the
  **Copy prompt 2 — after Confirm all** button — the page itself points at the
  next step.
- **N1-4:** "My click — bound to that exact version — puts the rules in force.
  The page authors the safety contract. Not the agent."

### Act 2 — the proof (0:50–1:25)

- Action: click **Copy prompt 2 — after Confirm all**, paste, send. The agent
  re-reads the confirmed session, then finds. Matrix shows `{P2, P3, P4}`.
- **N2-1:** "Prompt two: the agent re-reads the confirmed session, then hunts."
- **N2-2:** "Not a sample — the smallest set of synthetic people covering every
  violated rule, found by exhaustive search."
- Action: open one provenance row, including a losing source candidate.
- **N2-3:** "The provenance rail shows which source won, which lost, and why.
  Identity-bearing values stay minimized."
- **N2-4:** "Four defect classes are live in this draft: a casing bug, an empty
  string posing as a manager, a flipped source priority, and an empty value
  that wins a merge."

### Act 3 — proof dies (1:25–1:55)

- Action: the agent names the exact fix; type `user.managerId` into the real
  grid input. Badge becomes r19; the STALE banner appears; dependent evidence
  is struck through.
- **N3-1:** "The agent tells me exactly what to fix. I type it — one field."
- **N3-2:** "Revision nineteen. Every piece of evidence that depended on that
  field just died. Fingerprint-level, immediate."
- Action: the agent re-reads at r19 and re-finds; the witness shrinks to
  `{P2, P4}`.
- **N3-3:** "No reuse of dead proof: it re-reads at the current revision and
  re-finds. The witness shrinks to two people."

### Act 4 — finish honestly (1:55–2:20)

- Action: apply the agent's group fix through the grid (r20), let it re-find;
  change the priority selector from **ad → hris → okta** to
  **hris → ad → okta** (r21) — every remaining evidence record stales — let it
  re-find to a clean sweep, then prepare the packet. Hold on GREEN. Never click
  **Apply mapping (manual page control)**.
- **N4-1:** "Two more fixes. Each one kills what depended on it; each gets a
  fresh check at the current revision."
- **N4-2:** "Zero violations — and the all-clear only shows because this sweep
  covered every confirmed rule. The review packet is built from fresh evidence
  only."
- **N4-3:** "Apply is a manual page control, not a WebMCP tool. We never click
  it."

### Act 5 — receipts and concessions (2:20–2:40)

- Action: quick terminal cuts — `node tools/verify.mjs` ending in
  `STATUS CODE_COMPLETE`, `node eval/run.mjs` ending in `RESULT: PASS`, the
  12-round trace file, and the test count.
- **N5-1:** "Under the hood: 281 tests, a twelve-round real-browser trace, and
  a write oracle auditing every tool call — a failed call must leave state
  byte-identical."
- **N5-2:** "Two concessions: draft preview exists as a first-party pattern;
  another page agent could run this same engine. The claim is narrower — the
  page-authored contract and this evidence lifecycle."

### Act 6 — impact and close (2:40–2:55)

- Action: return to the page holding GREEN; end card with the live URL and
  repository address.
- **N6-1:** "This demo keeps the draft unsaved while the agent reviews it. WebMCP
  lets the page define the boundary."
- **N6-2:** "IdentityMap Witness finds the smallest set of synthetic people
  proving every violated rule on an unsaved draft — and the proof dies when
  you edit what it depended on."

## Recording checklist

1. ChatGPT desktop app; open the built-in browser; enable site tools in the
   browser permission settings; pick a model with WebMCP support enabled.
2. Type the full `https://identitymap-witness.onrender.com` URL (include the
   scheme).
3. One full dry run first. State is tab-local: the **Reset demo** control reloads
   the page and restores r17, so retakes are cheap.
4. Record with the ChatGPT side panel visible so tool calls are on camera.
5. Shoot act by act; keep raw takes. If the agent misbehaves, use **Reset demo**
   and retake — a rejected call (STALE_CONFIRM, stale evidence) is usable footage,
   not a failure: it shows the contract firing.
6. Narration: read the N-lines slowly; re-record audio in post if needed.
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
| 27–30s | Fast-cut: human group edit → re-find at r20; human priority edit to **hris → ad → okta** → re-find at r21; then prepare from the fresh clean-sweep evidence and hold on GREEN. Do not click **Apply mapping (manual page control)**. | “Every edit gets a fresh check; only fresh evidence closes the review.” |
