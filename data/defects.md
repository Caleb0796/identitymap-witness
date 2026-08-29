# Defect classes — what the session introduced, where it lives, who witnesses it

The scorer (`eval/scorer.mjs`) reads THIS mapping. Frozen at T1; loop may not edit.

| class | session mistake (lives ONLY in the unsaved draft) | draft location | witness persona | violated invariant | field |
|---|---|---|---|---|---|
| DC1 | exact-case `== "contractor"` misses HRIS-cased `Contractor` | `expressions.group` | P2 | inv-forbid | group |
| DC2 | null "helpfully" coalesced to `""` — breaks null-if-missing | `expressions.managerId` | P3 | inv-null | managerId |
| DC3 | priority reordered to `["ad","hris"]` — AD beats the system of record | `priority` | P4 | inv-sot | department |
| DC4 | AD's present-but-empty `""` wins by presence under that order | `priority` (+AD data shape) | P5 | inv-sot | department |

Contrast personas (must stay clean, proving checks aren't vacuous): P6 (cased
`Employee`, category employee — no false positive), P7 (lowercase contractor —
expression works when case matches), P1/P8 (fully clean; P1 is the demo's
"single test user all green" opening beat).

Persisted snapshot (`persisted-snapshot.json`) contains none of these mistakes;
the ablation therefore expects 0/4 visible pre-save, by construction.
