// Persisted-state ablation — NOT a competitive arm, NOT a kill line (review r2).
// Runs the SAME engine over the last-saved snapshot (no dirty edits, no pins) and
// reports which defect classes are visible pre-save. The expected answer is 0/4,
// BY CONSTRUCTION: the defects are session-introduced. The number quantifies the
// workflow property "today's mistakes live pre-save", not superiority — any
// page-local agent handed the same dirty draft could run this same engine.
import { readFile } from "node:fs/promises";
import { findWitness } from "../src/engine/witness.mjs";
import { CLASS_MAP } from "./scorer.mjs";

export const LABEL =
  "persisted-state ablation: defects are session-introduced BY CONSTRUCTION; " +
  "0/4 visible pre-save is the expected workflow property, not a benchmark win";

const PINS = [
  { id: "inv-forbid", type: "forbidden_group", personaCategory: "contractor", group: "employees" },
  { id: "inv-null", type: "null_if_missing", field: "managerId", dependsOn: "managerId" },
  { id: "inv-sot", type: "source_of_truth", field: "department", source: "hris" },
];

export async function ablate() {
  const personas = JSON.parse(await readFile(new URL("../data/personas.json", import.meta.url)));
  const snapshot = JSON.parse(await readFile(new URL("../data/persisted-snapshot.json", import.meta.url)));
  // NOTE: pins are handed to the ablation arm even though they are unsaved state —
  // being GENEROUS to the baseline makes the result conservative: even with the
  // human's invariants, the saved expressions/priority contain no defects to find.
  const r = findWitness({ ...snapshot, pins: PINS }, personas);
  const visible = {};
  for (const [dc, m] of Object.entries(CLASS_MAP)) {
    visible[dc] = r.violations.some((v) => v.personaId === m.personaId && v.invariantId === m.invariantId && v.field === m.field);
  }
  return {
    label: LABEL,
    visibleClasses: Object.entries(visible).filter(([, v]) => v).map(([k]) => k),
    visible: `${Object.values(visible).filter(Boolean).length}/4`,
    violations: r.violations.length,
  };
}
