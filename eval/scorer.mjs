// Machine-readable scorer — maps the four defect classes (frozen in
// data/defects.md at T1) onto relay-trace observations and the oracle.
import { readFile, readdir } from "node:fs/promises";

// Transcribed from data/defects.md (frozen; the loop may not edit either copy).
export const CLASS_MAP = {
  DC1: { personaId: "P2", invariantId: "inv-forbid", field: "group" },
  DC2: { personaId: "P3", invariantId: "inv-null", field: "managerId" },
  DC3: { personaId: "P4", invariantId: "inv-sot", field: "department" },
  DC4: { personaId: "P5", invariantId: "inv-sot", field: "department" },
};

export async function latestTrace() {
  const dir = new URL("./out/", import.meta.url);
  const files = (await readdir(dir)).filter((f) => f.startsWith("relay-") && f.endsWith(".json")).sort();
  if (!files.length) throw new Error("no relay trace in eval/out — run harness/relay.mjs --e2e first");
  const f = files.at(-1);
  return { file: `eval/out/${f}`, trace: JSON.parse(await readFile(new URL(f, dir))) };
}

export async function score() {
  const { file, trace } = await latestTrace();
  const oracle = JSON.parse(await readFile(new URL("../data/oracle.json", import.meta.url)));
  const find = trace.trace.find((t) => t.kind === "tool" && t.toolName === "find_mapping_counterexample" && t.payload?.violations);
  if (!find) throw new Error("trace has no successful find_mapping_counterexample");
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
    traceFile: file,
    classes,
    recall: `${Object.values(classes).filter(Boolean).length}/4`,
    falsePositives,
    witness, witnessMinimal,
    oracleAudited: oracle.audited === true,
  };
}
