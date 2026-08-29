# Golden walk — hand-derived, BEFORE any engine code exists

Derived 2026-08-29 by walking SPEC.md r2 §6 semantics over the §4 golden state.
The engine (plan T4) must REPRODUCE this table (`tests/golden.test.mjs`); the human
oracle audit checks THIS file row by row before flipping `oracle.audited`.

Rules applied (from SPEC §6, restated so the walk is self-contained):
- Resolution order = priority + okta ⇒ **ad → hris → okta**. First source where the
  attribute is PRESENT (`in`) wins; present-but-`""` wins over later sources.
- Missing everywhere → null. `null` poisons concat; `"" + x → x`. `"" == null` → false.
- provSource convention: ident → winning source; literal → `literal`; call → its
  argument's source; concat → `expr`; eq → `expr`; ternary → provSource of the
  RETURNED branch; branch recorded as then/else.

Golden expressions (SPEC §4): displayName = `user.firstName + " " + user.lastName`;
group = `user.userType == "contractor" ? "contractors" : "employees"`;
managerId = `user.managerId == null ? "" : user.managerId`;
department = `user.department`; email = `user.email`. Priority `["ad","hris"]`.

## Walk (8 personas × 5 fields)

| persona | field | resolution walk | value | provSource | branch |
|---|---|---|---|---|---|
| P1 | displayName | FN: ad✗ hris✗ okta✓; LN: okta✓ | `CANARY_FN_P1 CANARY_LN_P1` | expr | — |
| P1 | group | userType: ad✗ hris "employee"; `"employee"=="contractor"`→false | `employees` | literal | else |
| P1 | managerId | managerId hris `M100`; `M100==null`→false | `M100` | hris | else |
| P1 | department | ad✗ hris `Engineering` | `Engineering` | hris | — |
| P1 | email | okta | `CANARY_EM_P1@example.invalid` | okta | — |
| P2 | displayName | okta FN/LN | `CANARY_FN_P2 CANARY_LN_P2` | expr | — |
| P2 | group | userType hris **`Contractor`**; `"Contractor"=="contractor"`→false (exact-case) | `employees` | literal | else |
| P2 | managerId | hris `M200` | `M200` | hris | else |
| P2 | department | hris `Marketing` | `Marketing` | hris | — |
| P2 | email | okta | `CANARY_EM_P2@example.invalid` | okta | — |
| P3 | displayName | okta | `CANARY_FN_P3 CANARY_LN_P3` | expr | — |
| P3 | group | hris `employee` → false | `employees` | literal | else |
| P3 | managerId | managerId: ad✗ hris✗ okta✗ → null; `null==null`→true | `""` | literal | then |
| P3 | department | hris `Support` | `Support` | hris | — |
| P3 | email | okta | `CANARY_EM_P3@example.invalid` | okta | — |
| P4 | displayName | FN: ad✗ **hris✓ `CANARY_FN_P4H`**; LN: hris✗ okta✓ | `CANARY_FN_P4H CANARY_LN_P4` | expr | — |
| P4 | group | hris `employee` → false | `employees` | literal | else |
| P4 | managerId | hris `M400` | `M400` | hris | else |
| P4 | department | **ad `Sales` present → wins** (hris `Engineering` loses) | `Sales` | ad | — |
| P4 | email | okta | `CANARY_EM_P4@example.invalid` | okta | — |
| P5 | displayName | okta | `CANARY_FN_P5 CANARY_LN_P5` | expr | — |
| P5 | group | hris `employee` → false | `employees` | literal | else |
| P5 | managerId | hris `M500` | `M500` | hris | else |
| P5 | department | **ad `""` PRESENT → wins by presence** (hris `Finance` loses) | `` (empty) | ad | — |
| P5 | email | okta | `CANARY_EM_P5@example.invalid` | okta | — |
| P6 | displayName | okta | `CANARY_FN_P6 CANARY_LN_P6` | expr | — |
| P6 | group | hris **`Employee`**; `"Employee"=="contractor"`→false | `employees` | literal | else |
| P6 | managerId | hris `M600` | `M600` | hris | else |
| P6 | department | hris `Ops` | `Ops` | hris | — |
| P6 | email | okta | `CANARY_EM_P6@example.invalid` | okta | — |
| P7 | displayName | okta | `CANARY_FN_P7 CANARY_LN_P7` | expr | — |
| P7 | group | hris `contractor` (lowercase); `=="contractor"`→**true** | `contractors` | literal | then |
| P7 | managerId | hris `M700` | `M700` | hris | else |
| P7 | department | hris `Legal` | `Legal` | hris | — |
| P7 | email | okta | `CANARY_EM_P7@example.invalid` | okta | — |
| P8 | displayName | okta | `CANARY_FN_P8 CANARY_LN_P8` | expr | — |
| P8 | group | hris `employee` → false | `employees` | literal | else |
| P8 | managerId | hris `M800` | `M800` | hris | else |
| P8 | department | hris `Design` | `Design` | hris | — |
| P8 | email | okta | `CANARY_EM_P8@example.invalid` | okta | — |

## Violations under the three pins (SPEC §5)

| # | invariant | persona | field | why | defect class |
|---|---|---|---|---|---|
| V1 | inv-forbid | P2 | group | category `contractor` (case-insensitive match) mapped into `employees` — the EXPRESSION's exact-case `==` missed hris's `Contractor` | DC1 |
| V2 | inv-null | P3 | managerId | no source supplies managerId ⇒ target must be null; draft coalesces to `""` | DC2 |
| V3 | inv-sot | P4 | department | hris has non-null non-empty `Engineering` but provSource = ad (`Sales`) — priority misordered in the draft | DC3 |
| V4 | inv-sot | P5 | department | hris has `Finance` but ad's present-but-empty `""` wins ⇒ provSource = ad | DC4 |

Non-violations that prove the checks are not vacuous: P6 (`Employee`, category
employee — case trap does NOT false-positive), P7 (lowercase contractor maps
correctly — the defect is conditional, not universal), P1/P8 fully clean.

## Minimal witness derivation

Violated invariant set = {inv-forbid, inv-null, inv-sot}. Persona coverage:
P2→{forbid}, P3→{null}, P4→{sot}, P5→{sot}. No persona covers two invariants ⇒
minimum size = 3. Valid minimal sets: **[P2,P3,P4]** and **[P2,P3,P5]**. Any size-2
subset misses at least one invariant (checked by enumeration of the 6 pairs over
{P2,P3,P4,P5}: every pair omits forbid, null, or sot).

## Snapshot contrast (persisted-state ablation input)

`persisted-snapshot.json` (last-saved state): group uses
`String.toLowerCase(user.userType) == "contractor" ? …` (case-robust), managerId
is plain `user.managerId` (stays null when missing), priority `["hris","ad"]`
(truth-first), pins `[]`. Under the SAME personas: P2 group → `contractors` (OK),
P3 managerId → null (OK), P4/P5 department → hris values (OK). Zero violations ⇒
0/4 defect classes visible pre-save, BY CONSTRUCTION — the ablation's labeled
expectation, not a benchmark win.
