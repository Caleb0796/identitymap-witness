import { test } from "node:test";
import assert from "node:assert/strict";
import { isValidChatGptEvidence } from "../tools/verify-evidence.mjs";

const freshConfirmationFlow = {
  origin: "identitymap-witness.onrender.com",
  modelContextPresent: true,
  toolCount: 5,
  staleRejectionObserved: true,
  pendingConfirmationObserved: true,
  humanConfirmAllObserved: true,
};

test("accepts the required R7 confirmation-flow transcription fields", () => {
  assert.equal(isValidChatGptEvidence(freshConfirmationFlow), true);
});

test("rejects the legacy direct-pin evidence shape", () => {
  const { pendingConfirmationObserved, humanConfirmAllObserved, ...legacy } = freshConfirmationFlow;
  assert.equal(isValidChatGptEvidence(legacy), false);
});

test("requires both pending and human-confirm beats as exact booleans", () => {
  for (const field of ["pendingConfirmationObserved", "humanConfirmAllObserved"]) {
    assert.equal(isValidChatGptEvidence({ ...freshConfirmationFlow, [field]: false }), false);
    assert.equal(isValidChatGptEvidence({ ...freshConfirmationFlow, [field]: "true" }), false);
  }
});

test("requires the exact deployed origin and visible model-context presence", () => {
  assert.equal(isValidChatGptEvidence({
    ...freshConfirmationFlow,
    origin: "attacker-identitymap-witness.onrender.com.evil",
  }), false);
  assert.equal(isValidChatGptEvidence({
    ...freshConfirmationFlow,
    modelContextPresent: false,
  }), false);
});
