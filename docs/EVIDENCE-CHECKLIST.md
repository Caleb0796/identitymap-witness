# ENTRY_READY — human evidence checklist

Automated CODE_COMPLETE checks do not make the entry ready. A human owner must
verify every item below from the final deployed commit and check the boxes by hand.
This file intentionally does not mark human work complete.

- [ ] **Final deployment re-verification.** After the Phase 2 commit is pushed,
      verify `https://identitymap-witness.onrender.com/`, `/app.js`,
      `/data/personas.json`, and `/src/tools/defs.mjs` from the remote origin.
      Confirm the `.mjs` response has a JavaScript content type. In a fresh
      WebMCP-capable browser, verify the consent gate, exactly two independent copy
      buttons, visible copy status, Reset-as-reload behavior, r17, and five tools.

- [ ] **Three cold human model-evaluation runs.** Execute
      [`docs/HUMAN-EVAL-PROTOCOL.md`](HUMAN-EVAL-PROTOCOL.md) on 2026-09-01 in
      three distinct new ChatGPT conversations and fresh built-in browser sessions.
      Produce exactly these six paired artifacts:
      `evidence/model-eval-direct.{png,json}`,
      `evidence/model-eval-ambiguous.{png,json}`, and
      `evidence/model-eval-stale.{png,json}`. Verify each JSON parses and every
      asserted value is readable in its paired raw full-window PNG.

- [ ] **Refresh the legacy ChatGPT evidence from DIRECT.** Replace the old
      direct-pin `evidence/chatgpt-run.png` and `evidence/chatgpt-run.json` during
      the exact two-prompt DIRECT run. The new PNG must visibly support remote
      origin, five tools, the pending-confirmation beat, the human Confirm all
      result, and the STALE/rejection beat. The JSON must contain the exact boolean
      fields `pendingConfirmationObserved: true`,
      `humanConfirmAllObserved: true`, and `staleRejectionObserved: true` only when
      each fact is readable in that PNG. If either confirmation beat is unreadable,
      do not write `true`; leave verification TODO and recapture.

- [ ] **Audit record verification.** Confirm [`data/oracle.json`](../data/oracle.json)
      still has `audited: true`, [`data/golden-walk.md`](../data/golden-walk.md)
      remains the row-by-row source, and commit `a575653` contains the exact
      `Oracle-Audited: yes` trailer. Run `node eval/run.mjs` from the final commit
      and verify exit 0, `oracleAudited: true`, and `watermark: null`. Do not edit
      the audited oracle as part of this checklist.

- [ ] **Final video.** Record the deployed-origin walkthrough from
      [`docs/DEMO-SCRIPT.md`](DEMO-SCRIPT.md). Keep consent and human Confirm all
      visible, show the first minimal counterexample by 15 seconds, show an edit
      making evidence visibly STALE, show the agent re-read/re-find at the current
      revision, and finish on a fresh GREEN packet without Apply. Record the final
      filename and duration in `evidence/video-final.txt`.

- [ ] **Freeze evidence commit (before flipping public).** `eval/out/` is
      gitignored, but README links `eval/out/report.json`. From the final code
      commit run `node tools/verify.mjs` (green), then commit ONE fresh pair with
      `git add -f eval/out/report.json eval/out/relay-$(git rev-parse --short HEAD).json`
      in an evidence-only commit whose diff touches nothing but `eval/out/`
      (message prefix `evidence:`). Without this, the README report link 404s on
      the public repository.

- [ ] **Public repository and submission.** Verify the MIT [`LICENSE`](../LICENSE),
      make the repository public, submit the live URL, video, repository, and the
      four current answers from [`docs/DEVPOST-DRAFT.md`](DEVPOST-DRAFT.md), then
      record the submitted Devpost URL in `evidence/devpost-submitted.txt`.

- [ ] **Freeze rehearsal.** Before 12:00 PT on 2026-09-03, use a clean profile to
      rehearse the deployed two-prompt path, evidence links, video link, and public
      repository. Confirm no submission language upgrades the labeled
      by-construction ablation or the designed-not-run Browser-Use/Full-CDP arms
      into measured competitive results.
