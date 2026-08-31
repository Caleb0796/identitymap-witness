// Deterministic evaluator — SPEC.md r2 §6 semantics. Provenance on every value:
// {source, branch, candidates, inputs}. Resolution consults EVERY source in
// priority order (+ okta tail) so losing candidates stay visible to the rail.

const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function resolve(name, persona, priority) {
  const order = [...priority, "okta"];
  const candidates = [];
  let winner = null;
  for (const source of order) {
    const prof = persona.profiles?.[source] ?? {};
    const present = hasOwn(prof, name);
    candidates.push({ source, present, value: present ? prof[name] : undefined });
    if (present && winner === null) winner = { source, value: prof[name] };
  }
  return { winner, candidates };
}

export function evaluate(ast, persona, { priority }) {
  switch (ast.k) {
    case "str":
      return { value: ast.v, prov: { source: "literal", branch: null, candidates: [], inputs: [] } };
    case "null":
      return { value: null, prov: { source: "literal", branch: null, candidates: [], inputs: [] } };
    case "ident": {
      const { winner, candidates } = resolve(ast.name, persona, priority);
      return {
        value: winner ? winner.value : null,
        prov: {
          source: winner ? winner.source : null,
          branch: null,
          candidates,
          inputs: [{ ref: `user.${ast.name}`, source: winner ? winner.source : null }],
        },
      };
    }
    case "call": {
      const arg = evaluate(ast.arg, persona, { priority });
      const value = arg.value == null ? null
        : ast.fn === "upper" ? String(arg.value).toUpperCase() : String(arg.value).toLowerCase();
      return { value, prov: arg.prov };
    }
    case "concat": {
      const parts = ast.parts.map((p) => evaluate(p, persona, { priority }));
      const value = parts.some((p) => p.value === null) ? null : parts.map((p) => String(p.value)).join("");
      return { value, prov: {
        source: "expr", branch: null, candidates: [],
        inputs: parts.flatMap((p) => p.prov.inputs),
      } };
    }
    case "eq":
    case "neq": {
      const l = evaluate(ast.l, persona, { priority });
      const r = evaluate(ast.r, persona, { priority });
      const same = l.value === r.value; // strict: "" !== null, exact-case strings
      return { value: ast.k === "eq" ? same : !same, prov: {
        source: "expr", branch: null, candidates: [],
        inputs: [...l.prov.inputs, ...r.prov.inputs],
      } };
    }
    case "ternary": {
      const cond = evaluate(ast.cond, persona, { priority });
      const branch = cond.value ? "then" : "else";
      const taken = evaluate(cond.value ? ast.then : ast.else, persona, { priority });
      return { value: taken.value, prov: {
        source: taken.prov.source,
        branch,
        candidates: taken.prov.candidates,
        inputs: [...cond.prov.inputs, ...taken.prov.inputs],
      } };
    }
    default:
      throw Object.assign(new Error(`unknown AST node ${ast.k}`), { code: "EVALUATOR_FAILED" });
  }
}
