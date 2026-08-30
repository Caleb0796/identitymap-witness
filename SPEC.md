# IdentityMap Witness — SPEC (r4, remedy contracts)

Authority note: this file + `EVAL.md` + `docs/plans/2026-08-29-identitymap-witness.md`
are the three authorities. Narrative docs restate them and lose on conflict.
Deadline: **Devpost 2026-09-03 13:00 PT**. r2 incorporates the 2026-08-29
gpt-5.6-sol adversarial review (`reviews/codex-sol-2026-08-29.md`): direction cut,
defective-by-design golden draft, full tool schemas, fingerprint invalidation,
honest eval relabeling. r4 changelog — R1: clean sweeps are successful results,
with explicit checked scope and full-sweep-gated global all-clear UI; R2: every
failed tool result restores byte-identical store state, including its id allocator.

## 1. One line

A profile-mapping workbench page whose draft **contains today's unsaved mistakes**;
a human pins business invariants, an agent (via WebMCP) finds the minimal persona
set that witnesses the violations, with redacted provenance, and every human edit
invalidates exactly the evidence whose recorded fingerprint it touches. Apply never
belongs to the agent.

## 2. The claim (narrowed twice — do not widen it back)

CONCEDED #1: "preview an unsaved mapping" is first-party standard (Okta preview,
Auth0 Actions test-runner, Adobe/DocuSign validation).

CONCEDED #2 (the strongest rebuttal, stated before a judge says it): any page-local
agent — DOM scraper, CDP, userscript — given the same dirty draft and pins could run
the same deterministic engine. We do not claim impossibility anywhere.

CLAIMED (all of it, nothing else):

> The page AUTHORS the contract that makes agent help on dirty state safe and
> cheap: five least-privilege tools, redaction at the source, revision fencing
> with fingerprint-exact invalidation, and a minimal-witness search the human can
> audit — demonstrated end-to-end with pre-registered checks, in the runtime the
> challenge targets.

Leverage story for judges: the loop consumes page-exclusive session state
(unsaved expressions, unsaved priority order, never-persisted pins), updates the
visible UI before every tool return, and survives a mid-session human edit. The
persisted-state ablation (EVAL) quantifies WHICH defects exist only pre-save — as
a workflow property, by construction, labeled as such.

Evidence kept honest: Okta's public Profile Mappings API is list/get/update only
(`evidence/okta-public-api-2026-08-29.md`); its admin-console preview XHR is
undocumented and untested (disclosed).

## 3. Measured platform constraints (violating any = bug)

Measured in ~/mcp/outpocket (evidence/V0–V6, harness/drive.mjs) 2026-08-29:

| # | Constraint | Source |
|---|---|---|
| C1 | API surface is `document.modelContext`; identifier `navigator.modelContext` is dead and banned in `src/**`, `harness/**` | V0/V1 |
| C2 | Demo runtime: ChatGPT built-in browser (Chromium 151), `document.modelContext` present | V1 |
| C3 | Local automation: Chrome 152 + `--enable-features=WebMCP` (= `WebMCPTesting`) + fresh `--user-data-dir`; flag required in every mode | flag 实测 |
| C4 | Tool call pending >~22.3s dies. No tool waits on a human. Two-phase handshake only | V4 |
| C5 | Page-JS `executeTool(name,…)` throws; by-name calls go over CDP `WebMCP.invokeTool` → `WebMCP.toolResponded` correlated by invocationId; unknown name = -32602 at send | drive.mjs |
| C6 | `getTools()` returns a Promise | drive.mjs |
| C7 | `WebMCP.enable` returns OK with no page API — presence check is the completed round trip, nothing else | drive.mjs |
| C8 | Registration top-level document only; iframe/worker registration silently does nothing | HANDOVER §3 r11 |
| C9 | Remote HTTPS origins show a consent gate in the ChatGPT browser; localhost doesn't. Video records against the deployed remote origin, consent click included | V6 |
| C10 | Registration shape (working in prod): `document.modelContext.registerTool({name, description, inputSchema, annotations, execute: async (args) => ({content:[{type:"text", text}]})}[, {signal}])`. The `{signal}` second argument is OPTIONAL and unused here (no dynamic unregistration in scope) | probe/index.html |

## 4. Golden state (defective by design — this IS the demo)

Direction is CUT from scope (r2): one mapping direction, Okta-sources → app.
No `direction` field, no `appuser` namespace, no D1 defect class.

```js
// The dirty draft the page loads with. Four seeded session mistakes, keyed DC1–DC4.
state = {
  revision: 17,
  priority: ["ad", "hris"],            // DC3: author set AD first today; HRIS is truth
  expressions: {
    displayName: 'user.firstName + " " + user.lastName',                  // clean
    group:       'user.userType == "contractor" ? "contractors" : "employees"', // DC1 trap: exact-case compare
    managerId:   'user.managerId == null ? "" : user.managerId',          // DC2 trap: null coalesced to ""
    department:  'user.department',                                       // resolves through DC3's bad priority; P5 adds DC4
    email:       'user.email',                                            // clean
  },
  pins: [],            // human pins §5 invariants during the demo — never persisted
  evidence: {},        // id -> {kind, revision, fingerprint, stale, payload}
  packets: {},         // id -> {evidenceIds, revision, pinsCovered, blockers}
}
```

Expected violations under §5 pins + §7 fixture, HAND-WALKED in `data/golden-walk.md`
before any engine code exists (plan T1):
- P2 (userType `"Contractor"`, capital C) → group `"employees"` → **inv-forbid** (DC1)
- P3 (EU, managerless) → managerId `""` ≠ null → **inv-null** (DC2)
- P4 (ad "Sales" / hris "Engineering") → department from `ad` → **inv-sot** (DC3)
- P5 (ad `""` / hris "Finance") → `""` present wins, source `ad` → **inv-sot** (DC4)
- P1 baseline persona: zero violations (the "single test user all green" opening beat)
Minimal witness over violated invariants: size **3** — `[P2,P3,P4]` or `[P2,P3,P5]`.

## 5. Invariants (exactly 3 types)

```json
[
 {"id":"inv-forbid","type":"forbidden_group","personaCategory":"contractor","group":"employees"},
 {"id":"inv-null","type":"null_if_missing","field":"managerId","dependsOn":"managerId"},
 {"id":"inv-sot","type":"source_of_truth","field":"department","source":"hris"}
]
```

Semantics (`src/engine/invariants.mjs`):
- `forbidden_group`: persona.category matches (case-insensitive) ⇒ mapped group value
  must not equal `group` (case-insensitive compare — the CHECKER is case-robust; the
  defective EXPRESSION is not; that asymmetry is DC1).
- `null_if_missing`: if no source supplies `dependsOn`, target MUST be `null` — `""` fails.
- `source_of_truth`: whenever the named source has a non-null, non-empty value for
  `field`, the target's provenance.source must equal it.

## 6. Expression language subset

Grammar (anything else → `INVALID_AST`):
```
expr    := ternary
ternary := eqchain ("?" expr ":" expr)?
eqchain := concat (("==" | "!=") concat)?
concat  := term ("+" term)*
term    := STRING | NULL | ident | call
ident   := "user" "." NAME
call    := ("String.toUpperCase" | "String.toLowerCase") "(" expr ")"
```
Semantics:
- `user.X` resolves through `[...priority, "okta"]`; first source with X **present
  (`in`)** wins; present-but-`""` wins over later sources (DC4's trap).
- missing everywhere → `null`. `""` is present-and-empty, not null.
- `null` poisons concat (`null + "x" → null`); `"" + "x" → "x"`.
- `"" == null` → false; `null == null` → true. Equality on strings is exact-case.
- Provenance per evaluation:
  `{value, prov: {source, branch, candidates: [{source, present, value}], inputs: [{ref, source}]}}`
  — `candidates` lists EVERY source consulted in priority order (losing sources are
  therefore named; EVAL layer-1 asserts P4's losing `hris` candidate appears).
  Identity-field candidate values are redacted at the tool boundary like all values.

## 7. Tools — complete contracts (5, top-level, no more)

Common rules: input `expectedRevision` required on every tool except
`read_mapping_session`; on mismatch → error `REVISION_MISMATCH` with
`{currentRevision}`. Every success payload includes `revision`. One text content
item; `JSON.stringify(payload).length <= 1500` (over-budget → violations trimmed to
ids-only and the list capped to fit, with `truncated:true` + `violationsTotal`;
irreducibly over → `EVALUATOR_FAILED`). UI renders BEFORE return.
`annotations: {readOnlyHint}` as listed — hints, not security. No apply/save/push
tool exists.

**read_mapping_session** (readOnly true)
- in: `{}` — out: `{revision, priority, fields: [{field, expr, defectFree: null}], pinIds: [string], personaCount}`
  (`defectFree` is always null — the page never grades itself; the agent judges.)

**stage_mapping_invariants** (readOnly false — pins only)
- in: `{expectedRevision, invariants: [{id?, type, ...perTypeFields}]}` (≤8)
- REPLACES the full pin set atomically (append semantics rejected — resubmit the
  whole set; simplest deterministic rule). Unknown type / missing per-type field →
  `BAD_RULE {reason}`. out: `{revision, pinIds}` (revision has bumped by 1).

**find_mapping_counterexample** (readOnly true — records evidence, no draft change)
- in: `{expectedRevision, invariantIds: [string], maxPersonas?: number<=8}`
- Evaluates ALL personas × ALL expressions, checks the named pins, exhaustive
  minimal witness (2^8 subsets max). A violating success returns `{revision,
  cleanSweep:false, fullSweep, checkedInvariantIds, personaIds, violations:
  [{invariantId, personaId, field, detail}], coverage: {invId: bool}, evidenceIds}`.
  No violations is also a success: `{revision, cleanSweep:true, fullSweep,
  checkedInvariantIds, confirmedInvariantCount, checked, personaIds:[],
  violations:[], evidenceIds}`; its single `clean-sweep` evidence id is citable by
  `prepare_mapping_review`. `fullSweep` is true exactly when the checked invariant
  set equals all confirmed pins, whether the request omitted `invariantIds` or
  explicitly named every pin. A scoped clean result never clears the existing
  matrix or presents a global all-clear; only `cleanSweep && fullSweep` renders
  `clean sweep — 0 violations across {checked} personas at r{revision}`. The
  `NO_COUNTEREXAMPLE` error code no longer exists. Unknown pin id → `BAD_RULE`.
  Engine throw → `EVALUATOR_FAILED`.

**preview_mapping_patch** (readOnly true — records evidence, DOES NOT edit the draft)
- in: `{expectedRevision, field, expr, personaIds: [string]}`
- Parses `expr` (→ `INVALID_AST {position}`), evaluates ONLY the named personas
  under draft-with-patch-overlaid, re-checks all pins on the patched field.
  out: `{revision, field, diffs: [{personaId, before, after}], remainingViolations,
  evidenceId}` (identity-field diffs are `"<redacted:changed>"`). Unknown persona →
  `UNKNOWN_PERSONA`. The human applies the patch by editing the UI themselves —
  the tool never writes the draft (that keeps the human the author of every edit).

**prepare_mapping_review** (readOnly true — records a packet)
- in: `{expectedRevision, evidenceIds: [string]}`
- Fails `STALE_EVIDENCE {staleIds}` if ANY referenced evidence is stale.
  Packet-green rule (r3, run2 safety fix): only CLOSING evidence — kinds
  `counterexample` and `clean-sweep`, which assert on the CURRENT draft — counts
  toward coverage; `patch-preview` evidence is hypothetical and can never close a
  pin. Every current pin id must appear in the union of the CLOSING evidences'
  fingerprints AND no violation remains un-resolved in the newest closing
  evidence per pin → `blockers: []`; otherwise blockers list
  `{pin, reason: "uncovered"|"violating"}`. `PII_GUARD` if the canary sweep of the
  assembled packet trips. out: `{revision, packetId, coverage, blockers}`.
  Apply (plain UI) enables ONLY on `blockers: []` — and stays unused in the demo.

## 8. Store semantics (fingerprints, not vibes)

- Mutating actions — `EDIT_EXPRESSION{field, expr}`, `SET_PRIORITY{priority}`,
  `PIN_INVARIANTS{invariants}` (full replace), `UNPIN{id}` — bump `revision` by 1.
  `recordEvidence`/`recordPacket` do NOT bump (derived data).
- Tool calls are failure-atomic: `runTool` snapshots the state and store-local id
  allocator on entry. Every final `ok:false` restores that snapshot by rebinding
  the state, so `revision`, `pins`, `evidence`, `packets`, and the next allocated
  evidence or packet id are exactly as they were before the call.
- Evidence fingerprint (recorded at creation):
  `{fields: [every field evaluated], invariants: [every pin checked], personas: [every persona evaluated]}`
  — for `find_…` that is ALL fields × named pins × all personas; for `preview_…`
  it is `[field]` × all pins × named personas.
- Invalidation: `EDIT_EXPRESSION(f)` stales evidence with `f ∈ fingerprint.fields`;
  `SET_PRIORITY` stales ALL evidence (priority feeds every resolution);
  `PIN_INVARIANTS`/`UNPIN` stale evidence whose `fingerprint.invariants` changed
  membership OR whose canonical rule CONTENT changed under an unchanged id (r3,
  run2 safety fix) — AND packet-green re-checks pin coverage regardless, so a new
  pin makes old packets incomplete-by-coverage even where evidence stays fresh.
- Consequence stated honestly: a `find_…` evidence stales on ANY expression edit
  (its fingerprint spans all fields). "Fingerprint-exact" earns its name on
  `preview_…` evidence and on the invariant axis. SPEC §2's wording matches this.

## 9. Redaction (PII_GUARD)

Identity fields: `firstName`, `lastName`, `email` in EVERY source profile
(okta/hris/ad) carry canaries `CANARY_FN_<id>` / `CANARY_LN_<id>` /
`CANARY_EM_<id>@example.invalid`. The redaction walk covers payload keys AND
values AND nested candidates/diffs. Any `CANARY_` substring in any tool result at
any point = layer-1 failure + kill K2. Allowed out: persona ids, category labels,
field names, provenance source names, booleans, and non-identity value diffs.

## 10. UI + deploy layout

Page lives at REPO ROOT (`index.html`, `style.css`, `app.js` importing
`./src/...`, fetching `./data/personas.json`) so one static publish of `.` serves
everything (fixes the review's 404 finding; `render.yaml` publishes `.`).
Test hook: `window.__imw = {store, render, runTool}` — the harness's "human edit"
dispatches through it; documented as a test surface, not an API.
Components: mapping grid (field / editable expr / provenance chip), priority
select, invariant chips, counterexample matrix (persona × invariant), provenance
rail (candidates chain, losing sources visible), packet panel with blockers +
stale watermark, revision badge, Apply disabled-unless-green and never used.

## 11. Demo beats (single direction, updated to golden walk)

30s: 0–6s P1 all green → 7–14s human pins 3 invariants; agent returns witness
{P2,P3,P4} with provenance → 15–22s human fixes `managerId` expr in the UI
(r17→r18) → 23–27s stale packet REJECTED (`STALE_EVIDENCE`) → 28–30s re-find +
packet green; Apply untouched. 3min: pain 20s → dirty draft tour 25s → five-tool
loop 55s → ablation + protocol-E2E receipts 40s → stale/PII guards 25s → limits
(concessions #1/#2, designed-not-run arms) 15s.

## 12. Public-material rules

No WindTunnel, no arXiv 2508.09171, no uniqueness claims, concessions #1/#2 stated
before any judge asks. Judging map: Leverage = session-state loop above; Execution
= EVAL layers all green + error recovery on camera; Impact = Okta-admin 4,000-user
push story; Creativity = witness search + provenance + fencing as a page-authored
contract.
