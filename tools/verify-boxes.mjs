export function countUncheckedRequiredBoxes(markdown) {
  if (typeof markdown !== "string") throw new TypeError("markdown must be a string");
  return markdown.split(/\r?\n/).filter((line) =>
    line.startsWith("- [ ] ")
    && !line.includes("(OPT)")
    && !line.includes("(VERIFY-SELF)"))
    .length;
}
