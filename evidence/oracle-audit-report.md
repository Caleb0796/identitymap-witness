# Independent oracle audit report

## Method

I implemented a separate recursive-descent parser and evaluator for the expression grammar in `SPEC.md` §6 and ran it over all eight personas and the five golden expressions from §4. The evaluator resolves fields in `ad → hris → okta` order using property presence, preserves present-but-empty strings, returns `null` when a field is absent everywhere, propagates `null` through concatenation, uses exact-case string equality, and carries the returned branch's provenance through ternaries.

I independently applied the three invariant definitions from `SPEC.md` §5, enumerated persona subsets for the set-cover check, and parsed all 40 rows of `data/golden-walk.md` for a second cell-by-cell comparison. I did not import or execute any file under `src/engine/**`.

## 40-cell comparison

| Persona | Field | Independent value | Independent provSource | Oracle value | Oracle provSource | Result |
|---|---|---|---|---|---|---|
| P1 | displayName | `CANARY_FN_P1 CANARY_LN_P1` | `expr` | `CANARY_FN_P1 CANARY_LN_P1` | `expr` | match |
| P1 | group | `employees` | `literal` | `employees` | `literal` | match |
| P1 | managerId | `M100` | `hris` | `M100` | `hris` | match |
| P1 | department | `Engineering` | `hris` | `Engineering` | `hris` | match |
| P1 | email | `CANARY_EM_P1@example.invalid` | `okta` | `CANARY_EM_P1@example.invalid` | `okta` | match |
| P2 | displayName | `CANARY_FN_P2 CANARY_LN_P2` | `expr` | `CANARY_FN_P2 CANARY_LN_P2` | `expr` | match |
| P2 | group | `employees` | `literal` | `employees` | `literal` | match |
| P2 | managerId | `M200` | `hris` | `M200` | `hris` | match |
| P2 | department | `Marketing` | `hris` | `Marketing` | `hris` | match |
| P2 | email | `CANARY_EM_P2@example.invalid` | `okta` | `CANARY_EM_P2@example.invalid` | `okta` | match |
| P3 | displayName | `CANARY_FN_P3 CANARY_LN_P3` | `expr` | `CANARY_FN_P3 CANARY_LN_P3` | `expr` | match |
| P3 | group | `employees` | `literal` | `employees` | `literal` | match |
| P3 | managerId | `""` | `literal` | `""` | `literal` | match |
| P3 | department | `Support` | `hris` | `Support` | `hris` | match |
| P3 | email | `CANARY_EM_P3@example.invalid` | `okta` | `CANARY_EM_P3@example.invalid` | `okta` | match |
| P4 | displayName | `CANARY_FN_P4H CANARY_LN_P4` | `expr` | `CANARY_FN_P4H CANARY_LN_P4` | `expr` | match |
| P4 | group | `employees` | `literal` | `employees` | `literal` | match |
| P4 | managerId | `M400` | `hris` | `M400` | `hris` | match |
| P4 | department | `Sales` | `ad` | `Sales` | `ad` | match |
| P4 | email | `CANARY_EM_P4@example.invalid` | `okta` | `CANARY_EM_P4@example.invalid` | `okta` | match |
| P5 | displayName | `CANARY_FN_P5 CANARY_LN_P5` | `expr` | `CANARY_FN_P5 CANARY_LN_P5` | `expr` | match |
| P5 | group | `employees` | `literal` | `employees` | `literal` | match |
| P5 | managerId | `M500` | `hris` | `M500` | `hris` | match |
| P5 | department | `""` | `ad` | `""` | `ad` | match |
| P5 | email | `CANARY_EM_P5@example.invalid` | `okta` | `CANARY_EM_P5@example.invalid` | `okta` | match |
| P6 | displayName | `CANARY_FN_P6 CANARY_LN_P6` | `expr` | `CANARY_FN_P6 CANARY_LN_P6` | `expr` | match |
| P6 | group | `employees` | `literal` | `employees` | `literal` | match |
| P6 | managerId | `M600` | `hris` | `M600` | `hris` | match |
| P6 | department | `Ops` | `hris` | `Ops` | `hris` | match |
| P6 | email | `CANARY_EM_P6@example.invalid` | `okta` | `CANARY_EM_P6@example.invalid` | `okta` | match |
| P7 | displayName | `CANARY_FN_P7 CANARY_LN_P7` | `expr` | `CANARY_FN_P7 CANARY_LN_P7` | `expr` | match |
| P7 | group | `contractors` | `literal` | `contractors` | `literal` | match |
| P7 | managerId | `M700` | `hris` | `M700` | `hris` | match |
| P7 | department | `Legal` | `hris` | `Legal` | `hris` | match |
| P7 | email | `CANARY_EM_P7@example.invalid` | `okta` | `CANARY_EM_P7@example.invalid` | `okta` | match |
| P8 | displayName | `CANARY_FN_P8 CANARY_LN_P8` | `expr` | `CANARY_FN_P8 CANARY_LN_P8` | `expr` | match |
| P8 | group | `employees` | `literal` | `employees` | `literal` | match |
| P8 | managerId | `M800` | `hris` | `M800` | `hris` | match |
| P8 | department | `Design` | `hris` | `Design` | `hris` | match |
| P8 | email | `CANARY_EM_P8@example.invalid` | `okta` | `CANARY_EM_P8@example.invalid` | `okta` | match |

The same 40 value/provenance pairs in `data/golden-walk.md` matched both the independent results and `data/oracle.json`.

## Violation check

| Invariant | Persona | Field | Independent reason | Oracle row | Result |
|---|---|---|---|---|---|
| `inv-forbid` | P2 | group | Category comparison is case-insensitive, while the draft's exact-case comparison maps `Contractor` to `employees`. | DC1 | match |
| `inv-null` | P3 | managerId | No source contains `managerId`; the draft returns `""` instead of `null`. | DC2 | match |
| `inv-sot` | P4 | department | HRIS contains non-empty `Engineering`, but the mapped provenance is `ad`. | DC3 | match |
| `inv-sot` | P5 | department | HRIS contains non-empty `Finance`, but AD's present `""` wins and the mapped provenance is `ad`. | DC4 | match |

No other persona/invariant pair violated the three checks.

## Minimal-witness check

Coverage is P2 → `{inv-forbid}`, P3 → `{inv-null}`, P4 → `{inv-sot}`, and P5 → `{inv-sot}`. No persona covers two invariant types.

Every pair fails to cover the full set: P2+P3 misses `inv-sot`; P2+P4 and P2+P5 miss `inv-null`; P3+P4 and P3+P5 miss `inv-forbid`; P4+P5 misses both `inv-forbid` and `inv-null`. Therefore the minimum size is 3, with the two valid minimum sets `[P2, P3, P4]` and `[P2, P3, P5]`, matching `data/oracle.json`.

## DISCREPANCIES

None. The independent evaluator, `data/oracle.json`, and all 40 value/provenance rows in `data/golden-walk.md` agree.

Signed: OpenAI Codex (GPT-5)
Timestamp: 2026-08-30T00:54:21Z (2026-08-29 17:54:21 PDT)
