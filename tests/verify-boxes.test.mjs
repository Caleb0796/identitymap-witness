import { test } from "node:test";
import assert from "node:assert/strict";
import { countUncheckedRequiredBoxes } from "../tools/verify-boxes.mjs";

test("counts only ordinary unchecked remedy-plan boxes", () => {
  const markdown = [
    "- [ ] required step",
    "- [x] completed step",
    "- [ ] `(OPT)` optional step",
    "- [ ] (VERIFY-SELF) verifier bootstrap",
    "  - [ ] indented prose example",
    "- [ ] required even when its continuation mentions tags",
    "  continuation contains (OPT) and (VERIFY-SELF)",
  ].join("\n");
  assert.equal(countUncheckedRequiredBoxes(markdown), 2);
});

test("exclusions apply only when the tag is on the checkbox line", () => {
  assert.equal(countUncheckedRequiredBoxes([
    "- [ ] required step",
    "  `(OPT)` appears only on the next line",
    "- [ ] another required step\r",
    "  (VERIFY-SELF) also appears only later",
  ].join("\n")), 2);
});

test("rejects non-string plan input", () => {
  assert.throws(() => countUncheckedRequiredBoxes(null), /markdown must be a string/);
});
