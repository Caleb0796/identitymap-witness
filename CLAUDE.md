# identitymap-witness — session rules

Authorities, in order: `SPEC.md` → `EVAL.md` → `docs/plans/2026-08-29-identitymap-witness.md`.
`RALPH.md` governs the loop. README restates; on conflict the authorities win.

Hard rules (also enforced by tests where possible):
- `document.modelContext` only. The identifier `navigator.modelContext` is banned in
  `src/**` and `harness/**` (dead API, measured 2026-08-29).
- Registration top-level only; no apply/save/push tool ever registered.
- No tool call may wait on human input (22.3s measured timeout — two-phase handshake).
- No `CANARY_` substring in any tool payload (PII guard).
- Never read or write `/Users/calebwei/mcp/outpocket` (frozen, live sprint).
- Numbers in any report/message come from command output in the same session (D-38).
- Public materials: never cite WindTunnel or arXiv 2508.09171; no uniqueness claims;
  concede first-party draft-preview up front (SPEC §2).
- Human-gated (never attempt): account signup/login, Render deploy auth, ChatGPT-browser
  evidence capture, video, Devpost, flipping the repo public.
