# External review response — 2026-08-31

The external reviewer assessed the entry as a “strong idea, evidence not fully
landed.” The lead accepted two findings as actionable in this round.

**`eval/out/` holds only `.gitkeep`; the report and trace are not in the
repository — accurate; working as designed.** Git tracks only
`eval/out/.gitkeep`; the generated report and relay traces remain ignored because
the report is bound to HEAD. Committing them before the final code state would
bind them to a superseded commit. The gap closes in the evidence-only freeze
commit scheduled by [`docs/EVIDENCE-CHECKLIST.md`](../docs/EVIDENCE-CHECKLIST.md),
and the README now states that lifecycle explicitly.

**No GitHub Actions — accepted.** The baseline had no workflow; this round adds a
minimal unit-test workflow that checks out the repository, selects Node 22, and
runs `npm test`. Browser-bound smoke, E2E, and eval gates remain local by design
because CI runners are not assumed to provide the required WebMCP-enabled Chrome;
their outputs are frozen into the evidence commit.

**The evidence checklist still shows the cold model runs, screenshots/JSON,
report, and trace as incomplete — accurate; deliberately human-gated.** The three
cold runs and their paired artifacts have an executable protocol in
[`docs/HUMAN-EVAL-PROTOCOL.md`](../docs/HUMAN-EVAL-PROTOCOL.md), scheduled before
submission, while the report and HEAD-bound trace are created from the final code
state. The unchecked checklist is an honest statement of remaining work, not a
broken gate.

**The existing ChatGPT screenshot proves registration and a stale rejection, not
a complete five-tool run — accurate and already enforced.** The current artifact
shows the registered tool count and stale-rejection beat but not the complete
pending-to-human-confirm sequence, and the verifier's content probe returns TODO
because the required confirmation fields are absent. The DIRECT scenario in the
human-eval protocol recaptures the complete run with pending confirmation and
**Confirm all** visible.

**The UI reads as abstract at first glance — acknowledged; rejected for this
cycle.** The UI is frozen days from the deadline, and the E2E trace asserts its
first-screen controls, confirmation flow, matrix, and provenance structure.
First-glance comprehension is instead carried by the 3-minute demo's cold open
and the README's two-phase judge path.
