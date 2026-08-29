# Devpost draft — four answers

## What it does

IdentityMap Witness is a profile-mapping workbench where the mapping draft you are
editing — expressions, source priority, and the business invariants you just pinned —
lives only in the page until you save. A WebMCP agent works inside that unsaved
session through five least-privilege tools: it stages your invariants, searches a
synthetic persona pool for the MINIMAL set of people that violate them, shows
field-level provenance with the losing sources visible, previews fixes without
touching your draft, and assembles a review packet that dies the moment you edit
anything it depended on. Apply is a plain button the agent cannot press.

Two things we do NOT claim, up front: draft-preview is first-party standard
(Okta, Auth0, Adobe, DocuSign all have it), and nothing stops any page-local agent
from running the same deterministic engine. The claim is narrower and demonstrated:
the page AUTHORS the contract that makes agent help on dirty state safe — least
privilege, redaction at the source, revision fencing with fingerprint-exact
invalidation, and an auditable minimal witness.

## How we built it

Zero-dependency Node 20 + vanilla ES modules; one isomorphic engine (EL-subset
parser, evaluator with candidates provenance, invariant checker, exhaustive
minimal-witness search) shared verbatim by the page, the tests, and the ablation.
`document.modelContext.registerTool` in the top-level document only; every tool
returns after the UI has already rendered; payloads capped at 1500 chars; a
canary-based PII guard is enforced in unit tests, the CDP harness, and the eval
sweep. A custom Chrome-152 harness drives the tools BY NAME over the CDP WebMCP
domain (page-side executeTool-by-name throws — measured) across three cold
sessions and a 10-round relay: stale rejection, wrong-revision recovery, and a
pin-coverage flip, all traced to committed JSON.

## Challenges we ran into

The honest evaluation was harder than the code. Our first benchmark design was
rigged (the API arm lost only because we withheld its inputs) — an adversarial
review caught it, so we rebuilt: the API comparison is now a labeled
persisted-state ABLATION (0/4 session defects visible pre-save, by construction),
the oracle was hand-derived on paper before the engine existed and stays
watermarked UNAUDITED until a human signs a row-by-row audit commit, and the
Browser-Use / Full-CDP arms are declared designed-not-run instead of simulated.
Platform truths cost real measurement too: a pending tool call dies at ~22s, so
every human step is a two-phase handshake; iframe registration silently does
nothing; the CDP WebMCP domain reports enable-OK even when the page API is absent,
so the only presence proof we trust is a completed round trip.

## What's next

Run the two arms we only designed; swap synthetic personas for a real
SCIM-shaped dataset behind the same redaction contract; and test the undocumented
admin-console preview XHR we deliberately left untested. The engine and the
fencing pattern (fingerprinted evidence + revision-gated packets) are reusable for
any "agent proves, human signs" surface — contract signer paths and CRM merges are
next on the list.
