# Devpost submission copy

This file is the source of truth for the English text and media used in the
Devpost submission. The video URL is intentionally excluded.

## Project overview

### Project name

IdentityMap Witness

### Elevator pitch

Catch identity-mapping mistakes before they go live. A WebMCP agent proves every
broken rule with the fewest test users, then rechecks every edit while a human
keeps control.

### Thumbnail

Use `docs/assets/devpost/thumbnail.png` (the same 3:2 image as `02-witness.png`):
the live minimal-witness state with `modelContext: present`, `tools: 5/5 registered`, and the
counterexample matrix visible.

## Project details

### About the project

## Inspiration

Identity teams combine records from Active Directory, an HR system, and an
identity provider such as Okta before those profiles drive access. The merge rules
often sit in an administrator's browser as an unsaved draft. A case-sensitive
check can put a contractor in the employees group, a missing manager can become an
empty string instead of `null`, or stale directory data can override HR.

Those mistakes are easy to miss without the right edge cases. An AI agent could
help, but unrestricted UI control creates another risk: it may guess what a field
means, rely on an older draft, or act before a person reviews the evidence.

## What it does

Two things up front: unsaved-draft preview already exists as a first-party product
pattern, and another page-local agent with the same state and rules could run this
same engine. What this entry adds is the page-authored safety contract and an
evidence lifecycle that makes old proof expire.

IdentityMap Witness reviews an identity-mapping draft before anything is saved. A
**witness** is the smallest set of synthetic users needed to expose every safety
rule the draft currently breaks.

The page and the agent work as a team:

1. The agent reads the exact unsaved draft and its revision.
2. The agent stages three safety rules, but they remain pending until a person
   reviews the cards and clicks **Confirm all**.
3. It finds the fewest synthetic users that demonstrate every violation and shows
   which source value won, which lost, and why.
4. It previews a redacted fix; the person makes the actual page edit.
5. The edit marks dependent evidence **STALE**. The agent must test the new
   revision before it can prepare a **GREEN** review packet.

The agent never receives a Save or Apply tool. **Apply mapping (manual page
control)** remains an ordinary page control outside the WebMCP surface and is not
used in the demo.

## Why WebMCP

The page is the source of truth: it owns the live draft, understands its fields
and rules, knows the revision, and defines the allowed operations. WebMCP exposes
that knowledge through five structured, least-privilege tools instead of making an
agent infer semantics from labels and DOM layout.

The tools return redacted, revision-bound evidence and reject calls against old
state. A person and an agent can therefore reason about data that has not reached
a server while confirmation and editing remain visibly human-controlled. A generic
browser agent could inspect the page, but the page-authored contract makes the
workflow reviewable and resistant to stale conclusions.

## How we built it

The application uses vanilla JavaScript, ES modules, and Node 21+. Five
`document.modelContext` tools read the session, stage rules, find a minimal
counterexample set, preview a patch, and prepare the review packet. One
deterministic engine powers the browser, tests, and evaluation.

Strict schemas reject extra or malformed input. Failed tool calls leave the committed draft unchanged. Outputs are size-limited; CANARY_ fixture strings are redacted, and before/after diffs for firstName, lastName, email, displayName, and managerId are minimized — a synthetic tripwire, not a general PII detector. Each evidence record keeps the revision and dependencies needed to decide whether it is still valid.

The suite contains 281 passing tests. Chrome 152 runs three fresh-session
registration checks and a 12-round trace using real DOM edits and WebMCP calls. A
hand-audited oracle confirms that the first find returns `{P2, P3, P4}` — one of
two audited size-3 minimal sets — with four violation rows that together cover
all four seeded defect classes.

## Challenges we ran into

The hardest problem was preventing a correct answer from becoming dangerous after
the draft changed. Expressions, source priority, and confirmed rules can all
invalidate earlier reasoning, so evidence is bound to its exact dependencies.
Relevant edits strike through old rows and block the old packet.

Human approval also could not wait inside one long-running tool call: pending calls
ended after roughly 22 seconds,
observed in our own ChatGPT in-app-browser testing on 2026-08-29; the measurement is not part of this repository's automated evidence.
The tool now stages rule cards and returns; a person confirms them; the next agent
turn re-reads the state. Stale
buttons, malformed inputs, hostile text, and empty source values became executable
failure cases.

## What's next

The demo uses eight synthetic personas, tab-local state, and an exhaustive search
sized for this fixture. No real identity provider or save operation is connected.
Unsaved-draft preview is not new by itself, and another page-local agent could run
the same engine. The contribution is the page-authored safety contract and the
lifecycle that makes old proof expire. The Browser-Use and Full-CDP comparison
arms are designed, not run, so no comparative result is claimed.

Next, we would connect a real provider behind the same redaction boundary, test
larger consented datasets, persist review history, and use signed audit receipts
where cross-session trust is required.

## Try it

1. Open `https://identitymap-witness.onrender.com` in ChatGPT's in-app browser and
   enable site tools for the page.
2. Pass the visible consent gate, use **Copy prompt 1 — setup**, paste the prompt
   into chat, and send it.
3. Review the three pending rule cards and click **Confirm all**; then use
   **Copy prompt 2 — after Confirm all** and send it.
4. Follow the suggested edits. Watch each change make old evidence **STALE**, then
   finish with a fresh **GREEN** packet. Do not click **Apply mapping (manual page
   control)**.

### Built with

`webmcp, javascript, node.js, chrome, html5, css3, render, chatgpt`

### Try it out links

1. `https://identitymap-witness.onrender.com`
2. `https://github.com/Caleb0796/identitymap-witness`

### Image gallery

Upload these four 3:2 English screenshots in order:

1. `docs/assets/devpost/01-confirmation.png` — `A human reviews three pending
   safety rules before confirming them.`
2. `docs/assets/devpost/02-witness.png` — `The minimal witness: three synthetic
   users, four violation rows, every broken rule exposed.`
3. `docs/assets/devpost/03-stale.png` — `A relevant page edit immediately marks
   the previous evidence STALE.`
4. `docs/assets/devpost/04-green.png` — `Fresh checks produce a revision-bound
   GREEN review packet.`

## Additional info

### Submitter Type

Team of Individuals

### Countries of residence

United States

### Organization name

Leave blank.

### App Status

New

### Existing-project explanation

Leave blank.

### Live URL

`https://identitymap-witness.onrender.com`

### Testing instructions

No credentials are required. The live site uses synthetic data only.

1. Open the live URL in ChatGPT's in-app browser and enable site tools. Pass the
   visible consent gate. Confirm the header shows `modelContext: present`,
   `tools: 5/5 registered`, and `r17`.
2. Click **Copy prompt 1 — setup**, paste the prompt into chat, and send it. The
   agent must stage three rules and stop while the revision remains `r17`.
3. Review the pending cards and click **Confirm all**. The revision becomes `r18`.
4. Click **Copy prompt 2 — after Confirm all**, paste, and send it. The first
   minimal witness should be `{P2, P3, P4}`.
5. Follow the agent's suggested page edits. Each relevant edit must show **STALE**
   and force a fresh check. After the three suggested edits the flow ends with
   zero violations and a **GREEN** packet (typically at `r21`).

Do not click **Apply mapping (manual page control)**. It is a page control, not a
WebMCP tool.
Local fallback instructions are in the public repository README.

### Public code repository

`https://github.com/Caleb0796/identitymap-witness`

### Agents or clients tested

ChatGPT's in-app browser for manual tool registration and stale-evidence checks;
Google Chrome 152 with WebMCP enabled for three fresh-session registration checks
and a 12-round DOM and tool-call test harness.

### AI tools used

Claude Code and OpenAI Codex for planning, implementation, adversarial review,
and test and evaluation tooling; ChatGPT's in-app browser for manual WebMCP
testing.

### Learning derived

Significant

### Career value

Yes
