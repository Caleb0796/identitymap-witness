// Machine-readable scorer — maps the four defect classes (frozen in
// data/defects.md at T1) onto relay-trace observations and the oracle.
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

// Transcribed from data/defects.md (frozen; the loop may not edit either copy).
export const CLASS_MAP = {
  DC1: { personaId: "P2", invariantId: "inv-forbid", field: "group" },
  DC2: { personaId: "P3", invariantId: "inv-null", field: "managerId" },
  DC3: { personaId: "P4", invariantId: "inv-sot", field: "department" },
  DC4: { personaId: "P5", invariantId: "inv-sot", field: "department" },
};

export async function score(tracePath) {
  if (typeof tracePath !== "string" || !tracePath)
    throw new Error("score(tracePath) requires an explicit trace path");
  const trace = JSON.parse(await readFile(tracePath, "utf8"));
  return scoreTrace(trace, tracePath);
}

export async function scoreTrace(trace, tracePath,
  head = execFileSync("git", ["rev-parse", "--short", "HEAD"], { encoding: "utf8" }).trim()) {
  if (trace.sha !== head)
    throw new Error(`trace sha ${JSON.stringify(trace.sha)} does not match current HEAD ${head}`);
  if (!Array.isArray(trace.trace)) throw new Error("trace.trace must be an array");
  const oracle = JSON.parse(await readFile(new URL("../data/oracle.json", import.meta.url)));
  const find = trace.trace.find((t) => t.kind === "tool"
    && t.toolName === "find_mapping_counterexample"
    && t.status === "Completed"
    && t.matched === true
    && typeof t.invocationId === "string"
    && t.invocationId.trim().length > 0
    && Array.isArray(t.payload?.violations)
    && t.payload.violations.length > 0);
  if (!find) throw new Error("trace has no qualifying find_mapping_counterexample");
  const seen = find.payload.violations;
  const classes = {};
  for (const [dc, m] of Object.entries(CLASS_MAP)) {
    classes[dc] = seen.some((v) => v.personaId === m.personaId && v.invariantId === m.invariantId && v.field === m.field);
  }
  const expectedKeys = new Set(oracle.expectedViolations.map((v) => `${v.personaId}|${v.invariantId}|${v.field}`));
  const falsePositives = seen.filter((v) => !expectedKeys.has(`${v.personaId}|${v.invariantId}|${v.field}`)).length;
  const witness = find.payload.personaIds;
  const witnessMinimal = witness.length === oracle.minimalWitness.size
    && oracle.minimalWitness.sets.some((s) => JSON.stringify(s) === JSON.stringify(witness));
  return {
    traceFile: tracePath,
    classes,
    recall: `${Object.values(classes).filter(Boolean).length}/4`,
    falsePositives,
    witness, witnessMinimal,
    oracleAudited: oracle.audited === true,
  };
}
