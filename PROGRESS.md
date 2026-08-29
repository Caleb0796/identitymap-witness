2026-08-29T20:52:01Z T1 all green — npm test 3/3 (fixture, oracle, snapshot); golden-walk hand-derived first
2026-08-29T20:52:01Z T2 all green — npm test 5/5; smoke exit 0: 3 cold sessions, present+5tools+roundtrip r17+matrix4+(-32602)+no-canary
2026-08-29T21:17:58Z T3 green — npm test 13/13; parser rejects 9 out-of-grammar forms with positions
2026-08-29T21:19:06Z T4 green — npm test 24/24; golden cross-check: engine reproduces hand-walk 8x5
2026-08-29T21:19:45Z T5 green — npm test 29/29; golden violations == oracle; snapshot state clean
2026-08-29T21:20:22Z T6 green — npm test 33/33; exhaustive witness == oracle [P2,P3,P4]; no size-2 cover (enumerated)
2026-08-29T21:21:05Z T7 green — npm test 38/38; fingerprint invalidation + clean-to-violating catch
2026-08-29T21:21:39Z T8 green — npm test 42/42; redaction covers keys, values, diffs; PII_GUARD throws
