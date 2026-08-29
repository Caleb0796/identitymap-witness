// Minimal witness search — exhaustive over the persona pool (≤8 personas ⇒ ≤255
// non-empty subsets), so minimality is provable, not greedy-approximate (review P2).
import { parse } from "./parser.mjs";
import { evaluate } from "./eval.mjs";
import { checkInvariants } from "./invariants.mjs";

export function evaluateAll(state, personas) {
  const asts = Object.fromEntries(Object.entries(state.expressions).map(([f, e]) => [f, parse(e)]));
  const outputs = {};
  for (const p of personas) {
    outputs[p.id] = { fields: {} };
    for (const [field, ast] of Object.entries(asts))
      outputs[p.id].fields[field] = evaluate(ast, p, { priority: state.priority });
  }
  return outputs;
}

export function findWitness(state, personas) {
  const outputs = evaluateAll(state, personas);
  const violations = checkInvariants(state.pins ?? [], personas, outputs);
  const violated = [...new Set(violations.map((v) => v.invariantId))].sort();
  const coverage = Object.fromEntries((state.pins ?? []).map((p) => [p.id, violated.includes(p.id)]));
  if (violated.length === 0) return { personaIds: [], violations: [], coverage };

  const pool = [...new Set(violations.map((v) => v.personaId))].sort();
  const covers = (subset) => {
    const got = new Set(violations.filter((v) => subset.includes(v.personaId)).map((v) => v.invariantId));
    return violated.every((i) => got.has(i));
  };

  // subsets in (size, lexicographic) order — first hit is the canonical minimum
  for (let size = 1; size <= pool.length; size++) {
    const idx = Array.from({ length: size }, (_, i) => i);
    while (true) {
      const subset = idx.map((i) => pool[i]);
      if (covers(subset)) return { personaIds: subset, violations, coverage };
      let k = size - 1;
      while (k >= 0 && idx[k] === pool.length - size + k) k--;
      if (k < 0) break;
      idx[k]++;
      for (let j = k + 1; j < size; j++) idx[j] = idx[j - 1] + 1;
    }
  }
  return { personaIds: pool, violations, coverage };
}
