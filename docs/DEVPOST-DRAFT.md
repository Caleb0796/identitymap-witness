# Devpost draft — four answers

## What it does

Two concessions come first. Unsaved-draft preview is already a first-party product
pattern, and another page-local agent with the same state and rules could run the
same deterministic engine. IdentityMap Witness therefore does not claim uniqueness
or that another integration is incapable of this work.

IdentityMap Witness demonstrates a narrower contribution: a page-authored safety
workflow for agent help on a dirty profile-mapping draft. An agent stages three
business invariants for review; a human visibly confirms them. The agent then uses
five least-privilege WebMCP tools to inspect the current draft and exhaustively find
the smallest set of synthetic personas covering every violated rule, show redacted
field-level provenance, preview fixes without changing state, and prepare a review
packet only from fresh evidence. Any relevant human edit invalidates the old proof.
The agent must re-read and re-find at the new revision; Apply remains a manual page
control and is not exposed as a WebMCP tool.

The two-copy judge path makes that authority boundary visible. Prompt 1 stops with
the rules staged as pending at r17. A human reviews the exact canonical content and
clicks the version-bound Confirm all control, which advances to r18. Prompt 2 begins
by re-reading the confirmed session, then requires a fresh find after every human
edit before a green packet can be prepared.

IdentityMap Witness finds the smallest set of synthetic people proving every violated rule on an unsaved draft — and the proof dies when you edit what it depended on.

## How we built it

The project uses dependency-free Node 21+ and vanilla ES modules. One isomorphic
engine implements the expression subset, value and candidate provenance,
invariant checks, and exhaustive minimal-witness search for the page, tests, and
evaluation. Strict tool schemas reject extra or malformed input. Staging produces a
canonical pending object; confirmation occurs only through the version-bound page
control for that exact content. All five tools are failure-atomic, payloads are
capped at 1,500 characters, and evidence and packets are bound to the dependencies,
revision, and fresh ids from which they were produced.

The Chrome 152 relay opens a fresh user-data directory with WebMCP enabled. Three
cold registration sessions prove a completed five-tool round trip. A 12-round E2E
trace drives real DOM events for confirmation, expression edits, group edits, and
priority changes while checking stale rejection, revision recovery, hostile text,
invalid-input atomicity, packet coverage, and a final clean sweep. The hand-derived
oracle is marked `audited: true` and bound to commit `a575653` with an
`Oracle-Audited: yes` trailer. The latest local eval report completed all three
layers at exit 0, recovered all four seeded defect classes with an audited size-3
minimal witness, and recorded zero write-oracle, failed-state-hash, and PII-canary
failures.

## Challenges we ran into

The hardest part was making the evaluation say only what the evidence supports. An
early comparison disadvantaged the API arm by withholding the unsaved inputs. We
replaced it with an explicitly by-construction persisted-state ablation and stopped
calling it a competitive benchmark. Browser-Use and Full-CDP remain documented
designs rather than simulated results.

Platform behavior also forced the interaction design. A pending WebMCP call dies
at about 22 seconds, so confirmation cannot be a long-running tool call: staging
returns immediately, a human confirms on the page, and the next prompt makes the
agent re-read. Adversarial tests then exposed the less obvious edges—detached stale
Confirm controls, wrong revisions, stale packet ids, hidden allocator drift,
hostile rule text, invalid expressions, and present-but-empty source values. Each
became an executable contract. The remaining model-quality evidence is deliberately
human-run and is not claimed complete until its six pixel-backed artifacts exist.

## What's next

The current limits are explicit:

1. The eight personas and all identity values are synthetic.
2. Draft state and evidence are tab-local rather than durable across sessions.
3. Exhaustive witness search is demonstrated only at the small fixture scale.
4. No real identity provider, admin console, or save operation is connected.
5. FNV-1a fingerprints identify canonical visible content but are not
   cryptographic signatures.
6. Browser-Use and Full-CDP comparative arms are designed, not run.

Next steps are to run those external comparison arms, evaluate search strategies on
larger consented datasets, integrate a real identity provider behind the same
redaction boundary, and replace local content fingerprints with signed audit
receipts where cross-session trust is required. The immediate submission work is
more modest: execute the three fresh human model-evaluation scenarios, record the
remote demo, and publish only the evidence those runs actually produce.

## Testing instructions

**ChatGPT built-in browser:** Open the built-in browser, enable site tools for the
site, navigate to the full `https://identitymap-witness.onrender.com` URL, and pass
the visible consent gate. Use **Copy prompt 1 — setup**, send it, review the pending
cards, and click **Confirm all**. Then use **Copy prompt 2 — after Confirm all** and
send it.

**Local:** Clone the repository, run the tests, and start the local server:

```bash
git clone https://github.com/Caleb0796/identitymap-witness.git
cd identitymap-witness
npm test
node harness/serve.mjs
```

Launch Chrome 152 in a fresh profile with WebMCP enabled:

```bash
imw_profile_dir="$(mktemp -d)"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$imw_profile_dir" \
  --enable-features=WebMCP \
  http://127.0.0.1:4173
```

Follow the same two-prompt flow locally. **Apply mapping (manual page control)** is
not exposed to the agent as a WebMCP tool and is never clicked in either path.
