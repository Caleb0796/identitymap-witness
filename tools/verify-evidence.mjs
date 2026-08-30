const EXPECTED_ORIGINS = new Set([
  "identitymap-witness.onrender.com",
  "https://identitymap-witness.onrender.com",
  "https://identitymap-witness.onrender.com/",
]);

export function isValidChatGptEvidence(value) {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    && value.modelContextPresent === true
    && value.toolCount === 5
    && value.staleRejectionObserved === true
    && value.pendingConfirmationObserved === true
    && value.humanConfirmAllObserved === true
    && typeof value.origin === "string"
    && EXPECTED_ORIGINS.has(value.origin);
}
