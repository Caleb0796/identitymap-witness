# WebMCP security issue + fix plan

> Prepared for a later GPT-5.6 Sol High implementation run. This document is a
> plan, not an implementation. Execute it top to bottom and do not mark a box
> complete until the named test or gate has passed in that run.

## Audit snapshot

- Repository: `Caleb0796/identitymap-witness`
- Audited branch: `main`
- Audited commit: `b4a14ed93e16ac6e48b5b7cea84f96ea969aa974`
- Sync result on 2026-08-30 PT: `git pull --ff-only origin main` reported
  `Already up to date.`
- Pre-existing local change: `.DS_Store` is modified. Preserve it and never stage,
  overwrite, or revert it while executing this plan.
- Baseline: `npm test` reported 210 tests, 210 passed, 0 failed, 0 skipped.
- Audit inputs: current source and tests, focused runtime probes, the WebMCP draft
  dated 2026-08-26, Chrome's WebMCP security guidance, and the local
  `webmcp-site-author` contract.

If HEAD is no longer the audited commit when this plan is executed, first re-run
every reproduction below against the new HEAD. Do not blindly apply line-numbered
edits to changed code. Drop a finding only when a regression test proves it is
already fixed.

## Security model for this plan

Treat the WebMCP caller as potentially prompt-injected or malicious. Treat every
tool argument as untrusted even when an `inputSchema` exists: the current WebMCP
imperative execution algorithm parses an object and invokes the callback, but does
not require JSON Schema validation before invocation. Browser behavior can also
differ while the standard is a draft. Application validation is therefore the
security boundary.

This repository currently uses eight static synthetic personas and has no real
identity-provider or save path. Findings that expose `managerId` or make manual UI
controls agent-clickable therefore have limited present confidentiality/authority
impact, but they become production blockers before any real profiles or privileged
actions are connected.

Primary references:

- WebMCP draft: https://webmachinelearning.github.io/webmcp/
- Chrome WebMCP tool security: https://developer.chrome.com/docs/ai/webmcp/secure-tools
- WebMCP input-validation security discussion: https://github.com/webmachinelearning/webmcp/issues/121

## Constraints the implementation must preserve

1. Keep exactly the five existing tool names and keep registration on
   `document.modelContext` in the top-level page only.
2. Never add an apply, save, push, commit, or confirmation WebMCP tool.
3. No tool may wait for a person. Preserve the two-call/manual-step flow.
4. No `CANARY_` substring may leave any success or error response.
5. Every final tool text remains at most 1,500 characters.
6. Failed calls remain byte-identical across the full store snapshot, including
   both hidden allocators.
7. Keep `untrustedContentHint:true` on all five tools. Keep `readOnlyHint:true`
   only on `read_mapping_session`.
8. Add no dependency. Use browser-safe ESM and `node:test`.
9. Do not edit `data/personas.json`, `data/oracle.json`,
   `data/golden-walk.md`, `data/persisted-snapshot.json`, or `data/defects.md`.
10. Never read or write `/Users/calebwei/mcp/outpocket`.
11. Do not weaken, delete, skip, or special-case an existing test or evaluator.
12. Do not commit or push unless the user separately requests it. Render deploys
    from `main`, so an unsolicited push would be an external deployment.

## Findings

| ID | Priority | Finding | Verified impact |
|---|---:|---|---|
| WSEC-01 | P0 | Prototype-chain properties are treated as supplied profile fields | A rule with `dependsOn:"toString"` has no own-field supplier but produces `cleanSweep:true`, followed by a packet with `blockers:[]`. `user.toString`, `user.constructor`, and `user.__proto__` also resolve as present from `ad`. |
| WSEC-02 | P1 | Schemas are not enforced in handlers and variable-size arguments have no input budgets | A 10,000-character rule value is accepted and persisted in pending state; unexpected top-level properties are accepted. Larger inputs can consume parser, canonicalization, DOM, snapshot, and witness work before the output budget acts. |
| WSEC-03 | P1 contract breach; current data synthetic | The privacy boundary only catches `CANARY_` and omits `managerId` | `preview_mapping_patch` returned raw `M100`; a source-of-truth violation returned `PRIVATE_MANAGER_42` in WebMCP text. The tools claim redacted values. |
| WSEC-04 | P2 | Registration success and cancellation are not handled according to the current API lifecycle | `registerTool()` is neither awaited nor caught, the badge increments before success, no registration signal is supplied, and the execute callback ignores its cancellation signal. |
| WSEC-05 | P2, latent under the static fixture | Page rendering still parses data-bearing strings with `innerHTML` | `renderRail()` interpolates `personaId` into HTML. A future external persona source would turn a crafted id into same-origin script execution. The grid is also rebuilt through an HTML string even though DOM APIs suffice. |
| WSEC-06 | P2 trust-model gap | “Human-only” is a protocol claim, not an enforceable DOM boundary | The native harness confirms rules with `button.click()`, and `window.__imw` exposes the mutable store plus `runTool`. A browser agent with general UI control can operate page controls even when no equivalent WebMCP tool exists. |
| WSEC-07 | P2 development-harness exposure | The local WebMCP server serves repository internals | A live probe to `/.git/HEAD` returned HTTP 200 with 21 bytes. The path containment check also uses a string prefix rather than a path-segment boundary. |

Current-code evidence map (line numbers apply only to the audited commit):

- WSEC-01: `src/engine/eval.mjs:11`, `src/engine/invariants.mjs:27`,
  `src/tools/defs.mjs:124`, `src/store/reducer.mjs:165`, and
  `src/tools/redact.mjs:12`.
- WSEC-02: handler entry points at `src/tools/defs.mjs:46-155`, schemas at
  `src/tools/defs.mjs:185-237`, and partial rule validation in
  `src/tools/validate.mjs:14-64`.
- WSEC-03: `src/tools/redact.mjs:5-19` and raw interpolation at
  `src/engine/invariants.mjs:31,39`.
- WSEC-04: `app.js:280-333`.
- WSEC-05: `app.js:105-162`.
- WSEC-06: `index.html:66`, `app.js:302,336`, and
  `harness/relay.mjs:93-98`.
- WSEC-07: `harness/serve.mjs:11-17`.

### Controls already present — preserve them

- No `exposedTo` option is set, so the tools are not intentionally shared with
  cross-origin documents.
- All outputs are marked untrusted, only the actual read tool is marked read-only,
  and tool names/descriptions fit Chrome's current recommended budgets. The
  measured maximums were 27 characters for a name and 227 for a description.
- A unified finalizer redacts canaries, budgets final responses, and rolls failed
  calls back. Revision fencing and evidence freshness are extensively tested.
- No WebMCP tool applies or saves a mapping.

---

## Phase 0 — reproduce and freeze the baseline

- [x] Record `git status --short --branch`, `git rev-parse HEAD`, Node version,
      and the output summary from `npm test`. Preserve the existing `.DS_Store`.
- [x] Re-run the WSEC-01 end-to-end reproduction as a failing unit test: stage and
      confirm one `null_if_missing` rule with `dependsOn:"toString"`; independently
      prove no profile owns that key; find must currently return a false clean
      sweep and prepare must currently return `blockers:[]`.
- [x] Re-run the WSEC-02 probe with a short id and a 10,000-character `group`;
      record that the current call succeeds and pending state retains all 10,000
      characters. Do not use an input large enough to destabilize the workstation.
- [x] Re-run WSEC-03 with a non-canary marker such as
      `PRIVATE_MANAGER_42`; record every final tool text containing the marker.
- [x] Start `harness/serve.mjs` on an ephemeral loopback port, request only
      `/.git/HEAD`, record status and response length without printing contents,
      then close the server.

Do not commit the intentionally failing tests from this phase. Land each
regression test together with its fix in the task that follows.

## Phase 1 — correctness and boundary hotfixes

### S1 / WSEC-01 — own-property semantics; false GREEN must become impossible

Files in scope:

- `src/engine/eval.mjs`
- `src/engine/invariants.mjs`
- `src/tools/defs.mjs`
- `src/store/reducer.mjs`
- `src/tools/redact.mjs`
- `tests/prov.test.mjs`
- `tests/validate.test.mjs`
- `tests/tools.test.mjs`
- `SPEC.md`

Required behavior:

- A source supplies a profile attribute only when that profile has the attribute
  as an own property. Never use `name in profile` for this decision.
- Target-expression membership and diff-shape detection also use own-property
  checks. Prototype names must not pass an existence check by inheritance.
- Do not simply ban the strings `toString`, `constructor`, or `__proto__`:
  an explicitly present own property must retain normal semantics. Fix the lookup,
  not just the three known spellings.

- [x] Add evaluator tests for `user.toString`, `user.constructor`, and
      `user.__proto__` over ordinary empty profile objects. Each candidate is
      absent, the result is `null`, and provenance source is `null`.
- [x] Add the positive control: an own `toString` profile property is present and
      resolves from the correct source.
- [x] Add a full tool-flow regression for the audited exploit. With no own
      `toString` field, the confirmed `null_if_missing` rule must produce
      `cleanSweep:false`; the packet must contain a `violating` blocker and must
      never be GREEN.
- [x] Replace the unsafe membership checks with one small local/shared
      `hasOwn` helper in the files that need it. Do not introduce an abstraction
      beyond own-property checking.
- [x] Update SPEC §5/§6 to define “supplies/present” as an own JSON property.
- [x] Run the focused tests, then `npm test`.

Acceptance gate: the exact exploit that previously returned `blockers:[]` now
returns at least one `violating` blocker, while an explicitly owned prototype-named
attribute still works.

### S2 / WSEC-02 — runtime argument validation and resource budgets

Files in scope:

- `src/tools/validate.mjs`
- `src/tools/defs.mjs`
- `src/engine/parser.mjs` only if a parser-local defensive check is still needed
- `tests/validate.test.mjs`
- `tests/annotations.test.mjs`
- `tests/atomicity.test.mjs`
- `tests/finalizer.test.mjs`
- `SPEC.md`

Use these exact limits in both JSON Schema and runtime validation:

```js
MAX_INVARIANTS = 8
MAX_INVARIANT_ID_CHARS = 64
MAX_RULE_TEXT_CHARS = 128
MAX_EXPRESSION_CHARS = 512
MAX_INVARIANT_IDS = 8
MAX_PERSONA_IDS = 8
MAX_PERSONA_ID_CHARS = 64
MAX_EVIDENCE_IDS = 16
MAX_EVIDENCE_ID_CHARS = 32
MAX_REVISION = Number.MAX_SAFE_INTEGER
```

Runtime checks must reject non-plain/non-JSON objects, unexpected properties,
wrong types, non-safe revisions, oversized strings, oversized arrays, and duplicate
id-array entries before expensive parsing/evaluation or any state change. Use a new
stable `INVALID_INPUT` error code for transport/shape/budget failures; retain
`BAD_RULE` for semantically invalid invariants, `INVALID_AST` for bounded expression
syntax, and existing domain errors.

Error precedence for fenced tools:

1. The top-level input must be a plain object with a nonnegative safe-integer
   `expectedRevision`; otherwise return `INVALID_INPUT`.
2. A valid but stale `expectedRevision` returns `REVISION_MISMATCH` before checking
   the remaining arguments.
3. Validate the remaining shape, types, and budgets.
4. Run domain validation and then the handler.

Schema requirements:

- Add matching `maxLength`, `maxItems`, `uniqueItems`, and revision `maximum`.
- Make `preview_mapping_patch.field` use the existing `OUTPUT_FIELDS` enum.
- Require `preview_mapping_patch.personaIds` to have at least one item.
- Keep `invariantIds` optional; if present it may still be empty so the existing
  `NO_INVARIANTS` domain behavior remains testable, but it is bounded and unique.
- Keep `evidenceIds:[]` representable so the existing `NO_EVIDENCE` result remains
  an application-level gate; bound and deduplicate non-empty arrays.
- Add an evidence-id pattern matching the store's `E-<positive integer>` format.

- [x] Add table-driven schema/runtime parity tests for all five tools.
- [x] Add unexpected-property and wrong-type cases for every tool, including the
      zero-argument read tool.
- [x] Add boundary tests at exactly each limit and one over each limit.
- [x] Reproduce the 10,000-character stage input and assert `INVALID_INPUT`, no
      pending state, no allocator movement, response length at most 1,500, and no
      `CANARY_`.
- [x] Add large duplicate arrays for invariant, persona, and evidence ids; all fail
      before evaluator/store methods are called.
- [x] Add `INVALID_INPUT` to the finalizer and atomicity error matrices.
- [x] Migrate the existing `LONG_PIN` tests deliberately: caller-supplied long
      values now exercise `INVALID_INPUT`, while separate pre-seeded/test-double
      cases must continue exercising finalizer budgeting and rollback. Do not make
      `restore()` reject the snapshot captured immediately before an invalid call,
      and do not delete the existing privacy/output-budget assertions merely
      because the transport limit makes one old route unreachable.
- [x] Implement without a JSON Schema dependency. The schema documents/discovers
      the contract; the hand-written runtime validator enforces the same contract.
- [x] Update SPEC §5/§7 with limits, error code, and precedence.
- [x] Run focused tests, `npm test`, `node harness/relay.mjs --smoke`, and
      `node harness/relay.mjs --e2e`.

Acceptance gate: no variable-size caller input reaches parsing, canonicalization,
snapshot mutation, evidence lookup, or DOM rendering without a deterministic bound.

### S3 / WSEC-03 — minimize sensitive values in WebMCP outputs

Files in scope:

- `src/tools/redact.mjs`
- `src/engine/invariants.mjs`
- `tests/redact.test.mjs`
- `tests/tools.test.mjs`
- `tests/finalizer.test.mjs`
- `SPEC.md`
- `README.md`

Required behavior:

- Treat `managerId` as identity-bearing in patch diffs, even when its value does
  not use the canary prefix.
- Never interpolate raw `got.value` or source-of-truth values into violation
  details. Use fixed semantic text such as `target is non-null` or
  `a different source won`; source names and field names may remain structured.
- Preserve the `CANARY_` tripwire as a test sentinel, but stop describing it as a
  general PII detector. Document the exact minimized fields and the synthetic-only
  scope.
- Keep enough structured information for an agent to identify the invariant,
  persona, field, expected source, and actual source without returning raw identity
  values.

- [x] Add a non-canary `managerId` fixture inside a test only. Assert the marker is
      absent from `find_mapping_counterexample`, `preview_mapping_patch`, all error
      envelopes, and serialized WebMCP text.
- [x] Assert manager-id patch `before` and `after` are
      `"<redacted:changed>"`.
- [x] Add source-of-truth and null-if-missing violation tests proving details contain
      no raw profile value.
- [x] Implement the minimal field-aware redaction/detail changes.
- [x] Correct tool descriptions, SPEC §7/§9, and README privacy wording so they
      match the implemented boundary exactly.
- [x] Run focused tests and `npm test`.

Acceptance gate: both `PRIVATE_MANAGER_42` and every `CANARY_` marker are absent
from every final tool text, while existing group-fix behavior still gives the agent
enough information to continue the demo.

## Phase 2 — WebMCP lifecycle and page hardening

### S4 / WSEC-04 — truthful registration and cancellation lifecycle

Files in scope:

- `app.js`
- `harness/relay.mjs`
- `tests/toplevel.test.mjs`
- `tests/harness-discipline.test.mjs`
- `SPEC.md`

Required behavior:

- Feature-detect `document.modelContext?.registerTool` rather than only the parent
  object.
- Create one page-lifetime `AbortController` and pass its signal as the second
  registration argument for every tool. Abort on a non-BFCache page teardown; do
  not accidentally unregister tools on a persisted `pagehide`.
- Treat both synchronous throws and returned-promise rejections as registration
  failures. Await `Promise.resolve(registerTool(...))`; increment the visible count
  only after that tool succeeds. Continue attempting the remaining tools, but keep
  the badge off and report a concise generic failure if any registration fails.
- Keep the only `registerTool(` call site in `app.js`.
- Accept the execute callback's second `{signal}` argument and fail before
  `runTool` if already aborted. With S2's strict bounds, synchronous work remains
  short; do not add asynchronous chunking unless a measured test proves it needed.

- [x] Add a native assertion that the visible registration count equals
      `(await document.modelContext.getTools()).length` after initialization.
- [x] Add a focused failure-path test around a mocked registration operation that
      rejects, without creating another real `registerTool` call site.
- [x] Add an already-aborted execution test proving no store state or allocator
      changes.
- [x] Implement promise/error/signal handling and lifecycle cleanup.
- [x] Update SPEC C10 and §7 to match the current Promise and execute-signal API.
- [x] Run `npm test`, smoke, and E2E.

Acceptance gate: the page never advertises 5/5 before five registration operations
have actually succeeded, and an already-cancelled invocation cannot enter a handler.

### S5 / WSEC-05 — remove data-bearing HTML parsing sinks

Files in scope:

- `app.js`
- `tests/toplevel.test.mjs` or a new narrowly named DOM-sink test
- `harness/relay.mjs`

- [x] Add a source-level guard that `app.js` contains no assignment to
      `innerHTML`/`outerHTML` and no `insertAdjacentHTML`.
- [x] Rebuild the provenance rail with `createElement`, `textContent`, and explicit
      attributes/classes. Do not feed `personaId`, expression text, provenance, or
      profile values through an HTML parser.
- [x] Rebuild grid rows with DOM APIs as well; preserve labels, ids,
      `aria-describedby`, validation state, and change handlers.
- [x] Extend the native hostile-text check to cover a crafted persona id or other
      data value without editing the frozen persona file. Assert exact visible text,
      zero injected elements, and no side-effect global.
- [x] Run `npm test` and E2E.

Acceptance gate: no data-bearing HTML-string sink remains in `app.js`, and the
existing interactive flow and accessibility assertions still pass.

### S6 / WSEC-06 — make the manual-control trust boundary honest and narrow

Files in scope:

- `app.js`
- `index.html`
- `harness/relay.mjs`
- `tests/harness-discipline.test.mjs`
- `README.md`
- `SPEC.md`
- `EVAL.md`

Do not attempt to “solve” this with `event.isTrusted`: browser-agent UI input can
still be trusted input, so that would create another false claim. In a static page,
the accurate guarantee is that confirm/apply are not WebMCP tools, not that every
browser agent is technically unable to click them.

- [x] Replace `window.__imw = {store, render, runTool, ...}` with a frozen,
      read-only test surface exposing only snapshot/inspection functions that return
      structured clones. Do not expose `dispatch`, `restore`, `runTool`, `render`,
      mutable `personas`, or the mutable `ui` object.
- [x] Update the harness to read through that inspection surface. All mutations
      must continue through real DOM events or WebMCP calls.
- [x] Add a native assertion that mutating an inspected clone cannot mutate live
      state and that the forbidden capabilities are absent.
- [x] Change UI/docs wording from absolute “human-only / never enabled for the
      agent” to exact wording such as “manual page control; not exposed as a
      WebMCP tool.” Keep the demo protocol asking the person to perform the step.
- [x] Add a short threat-model paragraph: a browser agent or extension with general
      page-control authority may click DOM controls; a future privileged deployment
      needs browser-mediated or out-of-band authorization, not a DOM label.
- [x] Run `npm test`, smoke, E2E, and the human-eval evidence validator tests.

Acceptance gate: public claims match the enforceable capability boundary, and the
production page no longer publishes direct mutable store/tool handles.

### S7 / WSEC-07 — restrict the local server to public application assets

Files in scope:

- `harness/serve.mjs`
- a new `tests/serve-security.test.mjs`
- `render.yaml` only after separately verifying whether the live static publisher
  exposes non-public repository files

- [x] Add server tests proving `/`, `/app.js`, `/style.css`, required
      `/src/**/*.mjs`, and `/data/personas.json` remain readable.
- [x] Add negative tests for `/.git/HEAD`, `/package.json`, `/tests/...`, dotfiles,
      NUL/invalid encoding, backslash variants, and encoded dot-segment traversal.
- [x] Replace the `startsWith(ROOT)` check with path-segment-safe containment using
      resolved/relative paths, then apply an explicit public-asset allowlist.
- [x] Re-run the audited `/.git/HEAD` probe; require 404 or 403 with an empty/generic
      body and never print repository metadata.
- [x] Inspect the deployed origin for the same paths without authenticating or
      changing deployment state. If Render already excludes them, record that and
      leave `render.yaml` unchanged. If it serves them, create a zero-dependency
      curated publish directory/build step and verify the complete live asset graph
      locally before changing `staticPublishPath`.
- [x] Run `npm test`, smoke, and E2E.

Acceptance gate: the development server cannot read any repository-internal file,
and all modules required by the WebMCP page still load.

## Phase 3 — contract synchronization and final verification

- [x] Re-read the full diff hunk by hunk. Confirm it touches only the scoped files
      and the plan checkbox updates; `.DS_Store` remains untouched.
- [x] Search three ways for each changed boundary: prototype membership (` in ` and
      `hasOwn`), WebMCP registration/cancellation (`registerTool`, `AbortSignal`,
      `signal`), and output/privacy sinks (`innerHTML`, raw value interpolation,
      `CANARY_`, `managerId`).
- [x] Re-run the four original runtime reproductions. Record old versus new results
      in the final response, not in a new report file.
- [x] Run `npm test` and require zero failures.
- [x] Run `node harness/relay.mjs --smoke` and require three successful cold
      sessions.
- [x] Run `node harness/relay.mjs --e2e` and require the complete flow to pass.
- [x] Run `node eval/run.mjs`; require exit 0 and a trace bound to the current HEAD.
- [x] Run `node tools/verify.mjs`. Its final human-only checklist may remain; no
      newly introduced code/security gate may be red.
- [x] Re-check the five tools from a fresh WebMCP-capable browser profile: exact
      count, exact names, annotations, schemas, one successful call each, one
      rejected oversized call, one stale-revision recovery, and no sensitive marker
      in any final text.

## Done definition

The implementation is complete only when:

1. WSEC-01's exploit cannot produce clean evidence or a green packet.
2. Every caller-controlled string and array is bounded and runtime-validated before
   expensive work or state change.
3. Non-canary manager identifiers never appear in WebMCP output.
4. Registration count reflects resolved registrations and cancellation is accepted
   by the callback.
5. No data-bearing HTML parsing sink or mutable test backdoor remains in the page.
6. Manual-control claims describe the actual boundary rather than an unenforceable
   “human-only” property.
7. The local server denies repository internals.
8. Unit, smoke, E2E, eval, and verifier code gates are green; any remaining item is
   explicitly human-only and unrelated to these findings.
