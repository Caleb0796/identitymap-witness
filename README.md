# IdentityMap Witness

WebMCP Challenge entry (Devpost, deadline 2026-09-03 13:00 PT). A profile-mapping
workbench where a human pins business invariants and an agent — over
`document.modelContext` tools — finds the minimal persona set that violates them
against the **unsaved** mapping draft, with redacted provenance and precise
evidence invalidation when the human edits mid-session. The agent never applies.

- What we claim and what we concede: `SPEC.md` §2 (draft-preview is first-party
  standard everywhere; the claim is the invariant-driven minimal-witness loop).
- Tests and benchmark: `EVAL.md` (3 arms run; Browser-Use and Full-CDP arms are
  **designed, not run** — stated here on purpose).
- Build plan: `docs/plans/2026-08-29-identitymap-witness.md`. Execution: `RALPH.md`.
- Key third-party evidence: `evidence/okta-public-api-2026-08-29.md`.

Status: plan r2 — reviewed by codex gpt-5.6-sol (ultra) 2026-08-29, all 17 P1
findings addressed or scope-cut (`reviews/codex-sol-2026-08-29.md`); reviewer's
win estimate 3% as-planned / 12% with fixes. Awaiting go/no-go before loop start.

```bash
npm test                        # layer 1
node harness/relay.mjs --smoke  # layer 2 (needs local Chrome 152)
node harness/relay.mjs --e2e    # layer 3
node eval/run.mjs               # arms + thresholds + kill lines
```
