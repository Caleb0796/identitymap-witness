# IdentityMap Witness — SPEC

Authority note: this file + `EVAL.md` + `docs/plans/2026-08-29-identitymap-witness.md`
are the three authorities for this repo. Narrative docs (README) restate them and lose
on conflict. Deadline: **Devpost 2026-09-03 13:00 PT** (verified 2026-08-29).

## 1. One line

A profile-mapping workbench page where a human pins business invariants, an agent
(via WebMCP) searches a synthetic persona pool for the **minimal counterexample set**
that violates them against the **unsaved** mapping draft, with **redacted provenance**
and **dependency-closure invalidation** when the human edits mid-session. Apply never
belongs to the agent.

## 2. The claim (narrowed — do not widen it back)

CONCEDED, not claimed: "preview an unsaved mapping" is first-party standard.
Okta Profile Mapping Preview, Auth0 Actions test-runner, Adobe/DocuSign field
validation all do draft-preview. Any pitch sentence resting on "preview before save"
is a defect (lint-worthy).

CLAIMED (the only line we defend, end to end):

> Given invariants the human just wrote — which exist nowhere but this page —
> the agent computes the minimal witness set over a persona pool, returns only
> redacted categories + field-level provenance, and every human edit precisely
> invalidates (and only invalidates) the evidence that depended on the edited paths.

Baseline honesty: the API arm (`EVAL.md` arm B) gets the same deterministic engine.
The measured gap it cannot close: unsaved expressions + unpersisted pins. Evidence:
Okta public Profile Mappings API has exactly 3 endpoints (list/get/update), no
preview/evaluate — see `evidence/okta-public-api-2026-08-29.md`.

## 3. Measured platform constraints (violating any of these = bug)

All measured in ~/mcp/outpocket (evidence/V0–V6, harness/drive.mjs) 2026-08-29:

| # | Constraint | Source |
|---|---|---|
| C1 | API surface is `document.modelContext`. The identifier `navigator.modelContext` is dead and BANNED in code | V0/V1, BANNED.txt IR-1 |
| C2 | Target demo runtime: ChatGPT built-in browser (Chromium 151), `document.modelContext` present | V1.png/V1.json |
| C3 | Local automation: Chrome 152 + `--enable-features=WebMCP` (or `WebMCPTesting`, interchangeable) + fresh `--user-data-dir` per launch; flag required in every mode incl. headless | flag 实测 |
| C4 | A tool call pending >~22.3s dies (measured in ChatGPT browser). NO tool may wait for human input. Two-phase handshake only: tool returns immediately; human acts in UI; agent re-reads new revision | V4 |
| C5 | From page JS, `document.modelContext.executeTool(name, ...)` THROWS (wants a RegisteredTool handle). By-name automated calls go over CDP `WebMCP.invokeTool` → correlate `WebMCP.toolResponded` by invocationId; status Completed/Error/Canceled; unknown name = -32602 at send | drive.mjs |
| C6 | `getTools()` returns a Promise — every count is `(await ...).length` | drive.mjs IR-18 |
| C7 | `WebMCP.enable` returns OK even with no page API — never use as presence check; `Schema.getDomains` doesn't list WebMCP; the completed round trip is the only discriminator | drive.mjs |
| C8 | Registration only in the top-level document; iframe/worker registration silently does nothing | HANDOVER §3 r11 |
| C9 | Remote HTTPS origins trigger a human consent gate in the ChatGPT browser; localhost does not. The video MUST be recorded against the deployed remote origin, consent click included | V6 |
| C10 | Registration call shape (working in prod at webmcp-probe): `document.modelContext.registerTool({name, description, inputSchema, annotations, execute: async (args) => ({content:[{type:"text", text}]})}, {signal})` | probe/index.html |

## 4. State model

```js
// src/store/reducer.mjs — single source of truth for the page
state = {
  revision: 17,                       // bumps on EVERY mutation
  direction: "user_to_app",           // or "app_to_user"
  priority: ["hris", "ad"],           // source-of-record order for user.* attrs
  expressions: {                      // the DIRTY mapping draft (target field -> EL string)
    department: 'user.department',
    managerId:  'user.managerId',
    group:      'user.userType == "employee" ? "employees" : "contractors"',
    email:      'user.email',
    displayName:'user.firstName + " " + user.lastName',
  },
  pushModes: { department: "PUSH", managerId: "PUSH", group: "PUSH", email: "DONT_PUSH", displayName: "PUSH" },
  pins: [],                           // human-pinned invariants (see §5), draft-only
  evidence: {},                       // id -> {kind, revision, deps:{fields,invariants,personas}, stale, payload}
  packets: {},                        // reviewPacketId -> {evidenceIds, revision, blockers}
}
```

Page-exclusive by construction: `expressions` edits, `pins`, `priority`, `direction`
live only in the reducer until the human clicks the plain-UI Save (out of demo scope).
The API arm receives a snapshot WITHOUT dirty edits and WITHOUT pins (see EVAL arm B).

## 5. Invariants (exactly 3 types — do not add a 4th before the deadline)

```json
[
 {"id":"inv-forbid","type":"forbidden_group","personaCategory":"contractor","group":"employees"},
 {"id":"inv-null","type":"null_if_missing","field":"managerId","dependsOn":"managerId"},
 {"id":"inv-sot","type":"source_of_truth","field":"department","source":"hris"}
]
```

Semantics (checker in `src/engine/invariants.mjs`):
- `forbidden_group`: no persona whose `category` matches may map into `group` value.
- `null_if_missing`: if no source supplies `dependsOn`, target field MUST be null (not "", not a default).
- `source_of_truth`: target field's provenance.source MUST equal the named source whenever that source has a non-null value.

## 6. Expression language subset (Okta-EL-shaped, ours)

Grammar (all of it — anything else is `INVALID_AST`):
```
expr    := ternary
ternary := or ("?" expr ":" expr)?
or      := eq (("==" | "!=") eq)*      // boolean context only inside ternary cond
eq      := concat
concat  := term ("+" term)*
term    := STRING | NULL | ident | call
ident   := ("user" | "appuser") "." NAME
call    := ("String.toUpperCase" | "String.toLowerCase") "(" expr ")"
```
Null/empty semantics (defect classes live here — get them exactly right):
- missing attribute → `null`; `""` is empty-but-present, NOT null.
- `null + "x"` → `null` (poisoning concat), `"" + "x"` → `"x"`.
- `null == null` → true; `"" == null` → false.
- `user.X` resolves through `priority`: first source (then okta base profile) with the
  attribute **present** wins — present-but-empty ("") STILL WINS over a later source
  (this is defect class D5's trap).
Provenance: every evaluation returns `{value, prov: {source, inputs:[{ref, source}], branch}}`.

## 7. Tools (5, top-level, no more)

| name | mode | mutates draft? | errors |
|---|---|---|---|
| `read_mapping_session` | read | no | NO_DRAFT |
| `stage_mapping_invariants` | stage | pins only | BAD_RULE, REVISION_MISMATCH |
| `find_mapping_counterexample` | preview | evidence only | REVISION_MISMATCH, NO_COUNTEREXAMPLE, EVALUATOR_FAILED |
| `preview_mapping_patch` | preview | evidence only | REVISION_MISMATCH, INVALID_AST, UNKNOWN_PERSONA |
| `prepare_mapping_review` | prepare | packets only | REVISION_MISMATCH, STALE_EVIDENCE, PII_GUARD |

Rules binding all five:
- Every tool takes `expectedRevision` except `read_mapping_session`; mismatch → `REVISION_MISMATCH` with `{currentRevision}` in the payload so the agent recovers in one step.
- UI updates synchronously BEFORE the tool returns (dispatch → render → return).
- Result = single text content item, `JSON.stringify(payload).length <= 1500` (tested).
- `annotations: {readOnlyHint: <bool>}` per table. Annotations are hints, not security.
- NOT REGISTERED, EVER: apply/save/push/mutate-backend anything. Apply is a plain
  disabled-until-green button in the UI and stays disabled in the whole demo.

## 8. Redaction (PII_GUARD)

Persona identity fields (`firstName`, `lastName`, `email` values) carry canary values
(`CANARY_FN_P3`, `CANARY_EM_P7@example.invalid`, ...). The redaction layer maps every
outgoing payload; any leak of a `CANARY_` substring in ANY tool result at ANY point =
test failure + eval kill-line K2. Tool payloads may carry: personaId (`P1..P8`),
category labels, field NAMES, provenance sources, boolean/status values, and diffs for
NON-identity fields only. Identity-field diffs render as `"<redacted:changed>"`.

## 9. UI (one page, no framework)

`src/page/index.html` + `app.js` + `register.js` (ES modules, no build step):
- mapping grid: field | expression input | pushMode | per-field provenance chip
- direction toggle + priority select
- invariant chips (pin/unpin) — human-editable
- counterexample matrix: persona × invariant, violating cells red, click → provenance rail
- provenance rail: source chain per field, branch taken
- packet panel: coverage %, blockers, stale watermark over any stale evidence
- Apply button: plain UI, disabled unless latest packet green — never enabled in demo
- revision badge always visible (r17 → r18 moment is the demo's money shot)

## 10. Demo scripts (from the reviewed idea card, unchanged)

30s: 0–6s single-persona all-green → 7–14s two human invariants typed, agent finds 2
counterexamples → 15–22s human allows one legal null + edits one expression (r17→r18)
→ 23–27s old review packet REJECTED stale → 28–30s recheck green, Apply still human.

3min: pain 20s → dirty state 25s → five-tool loop 55s → arms A/B/C same-fixture 40s →
stale/PII guards 25s → results + kill lines 15s.

## 11. Public-material rules

- Never cite WindTunnel or arXiv 2508.09171 anywhere public.
- No "world-first/unique" claims; nearest-neighbor concessions stated up front (§2).
- Judging map: Leverage = dirty-state closed loop; Execution = EVAL.md layers 1–3 all
  green; Impact = Okta-admin persona + 4,000-employee push story; Creativity = minimal
  witness set + provenance + closure invalidation (NOT draft-preview).
