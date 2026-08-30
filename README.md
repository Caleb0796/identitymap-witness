# IdentityMap Witness

> IdentityMap Witness finds the smallest set of synthetic people proving every violated rule on an unsaved draft — and the proof dies when you edit what it depended on.

This WebMCP Challenge entry is a profile-mapping workbench. A human defines the
business invariants; five page-authored `document.modelContext` tools let an agent
inspect the unsaved draft, find an exhaustive minimal counterexample set, preview
redacted fixes, and prepare a revision-bound review packet. The agent cannot save
or Apply changes.

**Live demo:** https://identitymap-witness.onrender.com

## Current status

- [`data/oracle.json`](data/oracle.json) is human-audited. Commit `a575653` carries
  the required `Oracle-Audited: yes` trailer.
- The latest local [`eval/out/report.json`](eval/out/report.json) completed with
  unit, three-cold-session smoke, and 12-round real-DOM E2E layers at exit 0. It
  reports 4/4 seeded defect classes, the audited size-3 oracle witness, zero
  write-oracle/hash/PII failures, `oracleAudited: true`, and no watermark. Generated
  eval output is intentionally git-ignored; reproduce it with `node eval/run.mjs`.
- Final `npm test` count: **210 tests, 210 passed, 0 failed, 0 skipped**. No
  coverage percentage is claimed.
- The remaining entry work is human-run model evaluation, final video capture,
  public-repository verification, and submission. See
  [`docs/EVIDENCE-CHECKLIST.md`](docs/EVIDENCE-CHECKLIST.md).

## Two-phase judge path

The first-screen action bar offers two independently labeled copy buttons with the
exact evaluated prompts, a visible polite live-region copy result, and a Reset
control that only reloads the page.

1. **Copy prompt 1 — setup.** The agent reads the session and stages exactly three
   invariants. Staging creates pending cards but does not change the confirmed pins
   or revision. The agent must stop at r17.
2. **Human Confirm all.** The human reviews the pending rule text, version, and
   content fingerprint, then clicks the page's real Confirm control. That
   version-bound click confirms the rules and advances to r18.
3. **Copy prompt 2 — after Confirm all.** The agent must re-read the now-confirmed
   session before finding witnesses. Every human grid or priority edit invalidates
   dependent evidence; after each edit the agent re-reads/re-finds at the current
   revision and prepares only from fresh evidence ids.

Apply remains a human-only page control and is outside the demo path.

## Five WebMCP tools

| tool | authority |
|---|---|
| `read_mapping_session` | Read the current redacted draft, confirmed rules, pending state, and revision. |
| `stage_mapping_invariants` | Stage canonical pending rules for human review; it cannot confirm them. |
| `find_mapping_counterexample` | Exhaustively find a minimal synthetic witness against confirmed rules. |
| `preview_mapping_patch` | Preview a redacted patch without mutating the draft. |
| `prepare_mapping_review` | Build a packet only from complete, fresh evidence. |

## Run locally

Node 21 or newer is required because the Chrome relay uses the native WebSocket
client.

```bash
git clone https://github.com/Caleb0796/identitymap-witness.git
cd identitymap-witness
npm test
node harness/serve.mjs  # `npm run serve` is equivalent
```

With the server running, launch Chrome 152 in a fresh profile with WebMCP enabled:

```bash
imw_profile_dir="$(mktemp -d)"
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
  --user-data-dir="$imw_profile_dir" \
  --enable-features=WebMCP \
  http://127.0.0.1:4173
```

Alternatively, open the [live demo](https://identitymap-witness.onrender.com) in a
fresh WebMCP-capable browser profile and pass the visible consent gate.

Run all executable gates from the repository root:

```bash
npm test
node harness/relay.mjs --smoke  # Chrome 152, three fresh cold profiles
node harness/relay.mjs --e2e    # 12 rounds of real DOM events and recovery
node eval/run.mjs               # thresholds, oracle binding, write oracle
```

## Scope and evidence honesty

Two concessions come before the claim: unsaved-draft preview is already a
first-party product pattern, and another page-local agent with the same state and
rules could run the deterministic engine. The evaluated contribution is the
page-authored safety workflow and its evidence lifecycle, not uniqueness or an
impossibility result.

The fixture has eight synthetic personas. State is tab-local; the witness search is
exhaustive only at this fixture's scale; no real identity provider or save path is
connected. FNV-1a fingerprints identify visible canonical content but are not
cryptographic signatures. Browser-Use and Full-CDP comparisons are designed, not
run. The persisted-state API comparison is a by-construction ablation, not a
competitive benchmark.

Read the exact contract in [`SPEC.md`](SPEC.md), the reproducible gates in
[`EVAL.md`](EVAL.md), and the oracle derivation in
[`data/golden-walk.md`](data/golden-walk.md).
