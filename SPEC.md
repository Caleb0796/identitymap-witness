# IdentityMap Witness — SPEC (r4, remedy contracts)

Authority note: this file + `EVAL.md` + `docs/plans/2026-08-29-identitymap-witness.md`
are the three authorities. Narrative docs restate them and lose on conflict.
Deadline: **Devpost 2026-09-03 13:00 PT**. r2 incorporates the 2026-08-29
gpt-5.6-sol adversarial review (`reviews/codex-sol-2026-08-29.md`): direction cut,
defective-by-design golden draft, full tool schemas, fingerprint invalidation,
honest eval relabeling. r4 changelog — R1: clean sweeps are successful results,
with explicit checked scope and full-sweep-gated global all-clear UI; R2: every
failed tool result restores byte-identical store state, including its id allocator;
R4: invariant validation and tool schemas fail closed, empty sessions cannot turn
green, witness caps are enforced, and annotations disclose derived-state writes
and untrusted output; R5: review packets carry their evidence ids and become stale
after the next relevant session edit, disabling Apply until fresh evidence is prepared;
R7: agents can only stage digest-bound rule proposals, while a human must confirm
the exact pending version before pins become authoritative and revision advances.

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
| C10 | Registration shape: `await Promise.resolve(document.modelContext.registerTool({name, description, inputSchema, annotations, execute: async (args, {signal}) => ({content:[{type:"text", text}]})}, {signal: pageLifetimeSignal}))`. Registration may return void or a Promise; an already-aborted invocation does not enter a handler, and non-BFCache page teardown aborts the page-lifetime signal | probe/index.html |

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
  pins: [],            // confirmed §5 invariants — never persisted
  pending: null,       // agent proposal awaiting version-bound human review
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

Every submitted invariant set has 1–8 rules. Each rule has exactly the keys shown
for its type plus optional `id`; resolved IDs (`id` or `pin-N`) are non-empty and
unique. An id is at most 64 characters and other free-form rule text is at most
128 characters. `field` is one of `displayName`, `group`, `managerId`, `department`,
or `email`; `source` is one of `okta`, `hris`, or `ad`; all other rule values are
non-empty strings. Transport shape, type, and size failures use `INVALID_INPUT`;
unknown rule semantics, duplicate resolved rule ids, unsupported enums, and any
string containing the reserved `CANARY_` sentinel use `BAD_RULE`. Valid rules
are recursively canonicalized by object-key order. The pending proposal carries an
eight-digit FNV-1a content fingerprint over that canonical JSON; this is a
non-cryptographic display digest, never a signature, and equality is always checked
against the canonical JSON rather than the digest. The checker
also fails `BAD_RULE` if an invariant's referenced output field is absent, even
though strict staging makes that state unreachable through the tool.

Semantics (`src/engine/invariants.mjs`):
- `forbidden_group`: persona.category matches (case-insensitive) ⇒ mapped group value
  must not equal `group` (case-insensitive compare — the CHECKER is case-robust; the
  defective EXPRESSION is not; that asymmetry is DC1).
- `null_if_missing`: a source supplies `dependsOn` only when its profile owns that
  JSON property. If no source supplies it, target MUST be `null` — `""` fails.
- `source_of_truth`: whenever the named source owns a non-null, non-empty value for
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
- `user.X` resolves through `[...priority, "okta"]`; first source with X as an
  **own JSON property** wins. Prototype-chain properties are absent unless an
  identically named own property is explicitly present; present-but-`""` wins over
  later sources (DC4's trap).
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
`read_mapping_session`; it is a nonnegative safe integer at most
`Number.MAX_SAFE_INTEGER`. Application code enforces the contract even if a draft
WebMCP implementation does not validate JSON Schema. Error precedence is: a
non-plain/non-JSON top-level input or invalid revision → `INVALID_INPUT`; a valid
but stale revision → `REVISION_MISMATCH {currentRevision}` before remaining
arguments; then remaining shape/type/budget validation; then domain validation.
Tool object schemas reject additional properties. Every
success payload includes `revision`. One text content item;
`JSON.stringify(payload).length <= 1500` (over-budget → violations trimmed to ids-only
and the list capped to fit, with `truncated:true` + `violationsTotal`; irreducibly
over → `EVALUATOR_FAILED`). UI renders BEFORE return. Every tool has
`untrustedContentHint:true`; only `read_mapping_session` has `readOnlyHint:true`.
The other four use `readOnlyHint:false` because they stage pending state or record
derived evidence/packets. Hints are not security. No apply/save/push tool exists.
All failed calls restore the full snapshot, including both hidden allocators.

Caller-controlled limits are: 8 invariants; invariant ids 64 characters; other
rule text 128; expressions 512; 8 invariant ids; 8 persona ids of 64 characters;
16 evidence ids of 32 characters; evidence ids match `E-<positive integer>`.
All id arrays are unique. These same limits appear in JSON Schema and runtime code.

**read_mapping_session** (readOnly true)
- in: `{}` — out: `{revision, priority, fields: [{field, expr, defectFree: null}],
  pinIds: [string], pendingRuleIds: [string], pendingVersion: integer|null, personaCount}`
  (`defectFree` is always null — the page never grades itself; the agent judges.)

**stage_mapping_invariants** (readOnly false — pending proposal only)
- in: `{expectedRevision, invariants: [{id?, type, ...perTypeFields}]}` (1–8), with
  a strict `oneOf` schema for the three exact §5 shapes.
- Dispatches `STAGE_RULES` and returns immediately without changing confirmed pins,
  evidence, or revision. The first proposal gets a monotonically increasing pending
  version; an identical canonical re-stage is idempotent and keeps that version.
  A different proposal while one awaits review fails `PENDING_EXISTS` with reason
  `different rules are already awaiting human review — the human must confirm or discard them first`.
  Any §5 validation failure → `BAD_RULE {reason}` before dispatch. out:
  `{revision, status:"pending_confirmation", pendingVersion, pendingRuleIds, digest,
  nextStep:"the human must review and confirm the pending rules on the page; then call read_mapping_session"}`.

**find_mapping_counterexample** (readOnly false — records evidence, no draft change)
- in: `{expectedRevision, invariantIds?: [string], maxPersonas?: integer}` where
  `invariantIds` has at most 8 unique ids and `maxPersonas` is 1–8.
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
  result remains citable evidence. Unknown pin id → `BAD_RULE`. Invalid
  `maxPersonas` shape/range → `INVALID_INPUT`; an effective checked pin set of zero →
  `NO_INVARIANTS` and no evidence. With a pending-only proposal, its reason says
  pending rules await human confirmation; otherwise it says “no pinned invariants —
  ask the human to pin business rules first”. A minimal witness larger than `maxPersonas` →
  `WITNESS_EXCEEDS_CAP {witnessSize,maxPersonas}` without evidence. Engine throw
  → `EVALUATOR_FAILED`.

**preview_mapping_patch** (readOnly false — records evidence, DOES NOT edit the draft)
- in: `{expectedRevision, field, expr, personaIds: [string]}` where `field` is a
  defined output field, `expr` is at most 512 characters, and `personaIds` contains
  1–8 unique ids.
- Parses `expr` (→ `INVALID_AST {position}`), evaluates ONLY the named personas
  under draft-with-patch-overlaid, re-checks all pins on the patched field.
  out: `{revision, field, diffs: [{personaId, before, after}], remainingViolations,
  evidenceId}` (`firstName`, `lastName`, `email`, `displayName`, and `managerId`
  diffs are `"<redacted:changed>"`). Unknown persona →
  `UNKNOWN_PERSONA`. The human applies the patch by editing the UI themselves —
  the tool never writes the draft (that keeps the human the author of every edit).

**prepare_mapping_review** (readOnly false — records a packet)
- in: `{expectedRevision, evidenceIds: [string]}` with 0–16 unique ids matching
  `E-<positive integer>`.
- With zero confirmed pinned invariants, fails `NO_INVARIANTS` (including while
  unconfirmed rules are pending); otherwise an empty
  `evidenceIds` array fails `NO_EVIDENCE`. These gates precede evidence lookup and
  packet assembly. Fails `STALE_EVIDENCE {staleIds}` if ANY referenced evidence
  is stale.
  Packet-green rule (r3, run2 safety fix): only CLOSING evidence — kinds
  `counterexample` and `clean-sweep`, which assert on the CURRENT draft — counts
  toward coverage; `patch-preview` evidence is hypothetical and can never close a
  pin. Every current pin id must appear in the union of the CLOSING evidences'
  fingerprints AND no violation remains un-resolved in the newest closing
  evidence per pin → `blockers: []`; otherwise blockers list
  `{pin, reason: "uncovered"|"violating"}`. `PII_GUARD` if the canary sweep of the
  assembled packet trips. out: `{revision, packetId, coverage, blockers, evidenceIds}`.
  Stored `pinsCovered` contains exactly the pin ids whose coverage value is `true`.
  Apply (plain UI) enables ONLY when this packet is fresh and `blockers: []` — and
  stays unused in the demo.

## 8. Store semantics (fingerprints, not vibes)

- Authoritative mutations — `EDIT_EXPRESSION{field, expr}`, `SET_PRIORITY{priority}`,
  `CONFIRM_RULES{version}` (full pin replacement), and `UNPIN{id}` — bump
  `revision` by 1. `STAGE_RULES{rules}` sets `pending` without a revision bump;
  `DISCARD_RULES{version}` clears it without a bump. Confirmation and discard both
  fail `STALE_CONFIRM` unless the supplied version exactly matches the live pending
  version. Only the human UI dispatches those two version-bound actions.
  `recordEvidence`/`recordPacket` do NOT bump (derived data).
- Tool calls are failure-atomic: `runTool` snapshots the state and store-local id
  allocator plus the store-local pending-version counter on entry. Every final
  `ok:false` restores that complete snapshot by rebinding the state, so `revision`,
  `pins`, `pending`, `evidence`, `packets`, and both hidden counters are exactly as
  they were before the call. Incomplete, non-JSON, malformed-rule, digest-mismatched,
  or derived-record/allocator-incoherent snapshots are rejected fail-closed.
- Packet freshness is derived on every render: `packetFresh(pkt, state)` is true
  exactly when `pkt.revision === state.revision` and every id in
  `pkt.evidenceIds` exists in `state.evidence` and is not stale. Packet UI status
  precedence is STALE, then BLOCKED, then GREEN; only a fresh GREEN packet enables
  Apply. A fresh `find_mapping_counterexample` + `prepare_mapping_review` after a
  repair creates a fresh packet again.
- Evidence fingerprint (recorded at creation):
  `{fields: [every field evaluated], invariants: [every pin checked], personas: [every persona evaluated]}`
  — for `find_…` that is ALL fields × named pins × all personas; for `preview_…`
  it is `[field]` × all pins × named personas.
- Invalidation: `EDIT_EXPRESSION(f)` stales evidence with `f ∈ fingerprint.fields`;
  `SET_PRIORITY` stales ALL evidence (priority feeds every resolution);
  `CONFIRM_RULES`/`UNPIN` stale evidence whose `fingerprint.invariants` changed
  membership OR whose canonical rule CONTENT changed under an unchanged id (r3,
  run2 safety fix) — AND packet-green re-checks pin coverage regardless, so a new
  pin makes old packets incomplete-by-coverage even where evidence stays fresh.
- Consequence stated honestly: a `find_…` evidence stales on ANY expression edit
  (its fingerprint spans all fields). "Fingerprint-exact" earns its name on
  `preview_…` evidence and on the invariant axis. SPEC §2's wording matches this.

## 9. Redaction (PII_GUARD)

Whenever identity-bearing keys `firstName`, `lastName`, or `email` are present in
an okta/hris/ad source profile, their values use the corresponding canary format:
`CANARY_FN_<id>` / `CANARY_LN_<id>` / `CANARY_EM_<id>@example.invalid`. Every
okta profile carries at least `firstName`; hris/ad profiles may omit identity
keys. The redaction walk covers payload keys AND values AND nested candidates/diffs.
`CANARY_` is a synthetic fixture tripwire, not a general PII detector. The concrete
output boundary minimizes diffs for `firstName`, `lastName`, `email`, `displayName`,
and `managerId`; invariant details never include raw evaluated or source-of-truth
values. They retain invariant id, persona id, field, expected source, and actual
source where applicable. Any `CANARY_` substring in any tool result at any point =
layer-1 failure + kill K2. Allowed out: synthetic persona ids, category labels,
field names, provenance source names, booleans, and non-identity value diffs. This
claim is scoped to the eight synthetic personas; no real identity provider is wired.

## 10. UI + deploy layout

Page sources live at the repo root, while `render.yaml` publishes a generated,
curated `public` directory containing only `index.html`, `style.css`, `app.js`,
`data/personas.json`, and the recursively discovered ESM dependency graph. The
local server enforces the same public asset boundary and rejects repository
internals. `window.__imw` is a frozen inspection-only test surface: every exposed
member is a function returning a structured clone. It exposes no store, dispatch,
restore, renderer, tool runner, mutable personas, or mutable UI object. Real
expression changes and pending confirm/discard actions are driven through DOM controls.
Components: mapping grid (field / editable expr / provenance chip), priority
select, confirmed invariant chips, a pending-rules region showing every canonical
field plus version and non-cryptographic digest, version-bound Confirm all/Discard
buttons, counterexample matrix (persona × invariant), provenance rail (candidates
chain, losing sources visible), packet panel with blockers +
stale watermark, revision badge, Apply disabled-unless-green and never used.
All rule-controlled pending, confirmed-pin, grid, matrix, and provenance content is
built with `createElement` and `textContent`, never HTML parsing.

Confirm, discard, unpin, expression editing, priority selection, and Apply are
manual page controls and are not exposed as WebMCP tools. That is a protocol
boundary, not proof that only a person can click: a browser agent or extension with
general page-control authority may operate DOM controls. Any future privileged
deployment needs browser-mediated or out-of-band authorization rather than a DOM
label or `event.isTrusted` check.

## 11. Demo beats (single direction, updated to golden walk)

The filmed structure is `docs/DEMO-SCRIPT.md` (v5): explain first, then the live
walk, then receipts. The walk is the golden walk and nothing shorter: the agent
stages 3 invariants at r17 and stops → the human reviews and clicks Confirm all
(r18) → the agent finds witness {P2,P3,P4} with provenance → the human fixes
`managerId` in the UI (r19), dependent evidence goes STALE and a prepare over the
old ids is REJECTED (`STALE_EVIDENCE`) → re-find {P2,P4} → the human fixes `group`
(r20) → re-find {P4} → the human switches priority to `hris → ad → okta` (r21) →
re-find is a clean sweep → prepare over the fresh id → GREEN; Apply untouched. A
packet cannot go green before the third edit: after the managerId fix alone three
violations remain (§7), so any cut that shows GREEN earlier is wrong.

## 12. Public-material rules

No WindTunnel, no arXiv 2508.09171, no uniqueness claims, concessions #1/#2 stated
before any judge asks. Judging map (see the criteria table in
`docs/DEMO-SCRIPT.md`): Leverage = the page-authored five-tool surface and the
two-phase confirm; Execution = EVAL layers all green + error recovery on camera;
Impact = any page holding an unsaved draft can author the same contract;
Creativity = witness search + provenance + revision-bound evidence that expires.
