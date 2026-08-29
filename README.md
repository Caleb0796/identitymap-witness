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

Status 2026-08-29 EOD: **CODE_COMPLETE candidate** — T1–T12 built and green
(70+ unit tests… run `npm test` for the live number; smoke ×3 cold sessions;
10-round E2E with stale-rejection/recovery/pin-coverage; eval 9/9 thresholds,
PASS-UNAUDITED pending the human oracle audit). Plan r2 followed after the
gpt-5.6-sol ultra review (`reviews/codex-sol-2026-08-29.md`, win estimate 12%
with fixes — all 17 P1s addressed). Remaining work is the human checklist:
`docs/EVIDENCE-CHECKLIST.md` (ChatGPT evidence, oracle audit, video, submission).

**Live:** https://identitymap-witness.onrender.com (Render static, deployed
2026-08-29 15:49 PDT from `616aea3`; `/`, `/app.js`, `/data/personas.json`,
`/src/tools/defs.mjs` all verified 200 with correct MIME; remote origin smoke:
local Chrome 152 sees `document.modelContext`, 5 tools, Completed round trip r17).

Benchmark honesty: the API comparison is a labeled persisted-state ABLATION
(0/4 session defects visible pre-save, by construction). Browser-Use and
Full-CDP arms are **designed, not run**. The scripted relay is protocol E2E;
the agent-quality evidence is the human ChatGPT-browser run.

```bash
npm test                        # layer 1
node harness/relay.mjs --smoke  # layer 2 (needs local Chrome 152)
node harness/relay.mjs --e2e    # layer 3
node eval/run.mjs               # arms + thresholds + kill lines
```
