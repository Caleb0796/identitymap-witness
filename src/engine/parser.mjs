// EL subset parser — SPEC.md r2 §6 grammar, nothing more. Anything outside the
// grammar throws {code: "INVALID_AST", position}.

function err(msg, position) {
  return Object.assign(new Error(`${msg} at ${position}`), { code: "INVALID_AST", position });
}

function tokenize(src) {
  const toks = [];
  let i = 0;
  while (i < src.length) {
    const c = src[i];
    if (c === " " || c === "\t" || c === "\n") { i++; continue; }
    if (c === '"') {
      let j = i + 1, v = "";
      while (j < src.length && src[j] !== '"') {
        if (src[j] === "\\" && j + 1 < src.length) { v += src[j + 1]; j += 2; }
        else { v += src[j]; j++; }
      }
      if (j >= src.length) throw err("unterminated string", i);
      toks.push({ t: "str", v, pos: i }); i = j + 1; continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i;
      while (j < src.length && /[A-Za-z0-9_]/.test(src[j])) j++;
      const w = src.slice(i, j);
      toks.push({ t: w === "null" ? "null" : "name", v: w, pos: i }); i = j; continue;
    }
    if (src.startsWith("==", i)) { toks.push({ t: "eq", pos: i }); i += 2; continue; }
    if (src.startsWith("!=", i)) { toks.push({ t: "neq", pos: i }); i += 2; continue; }
    const single = { ".": "dot", "+": "plus", "?": "q", ":": "colon", "(": "lp", ")": "rp" }[c];
    if (single) { toks.push({ t: single, pos: i }); i++; continue; }
    throw err(`unexpected character '${c}'`, i);
  }
  toks.push({ t: "eof", pos: src.length });
  return toks;
}

export function parse(src) {
  const toks = tokenize(src);
  let p = 0;
  const peek = () => toks[p];
  const next = () => toks[p++];
  const expect = (t, what) => {
    const tok = next();
    if (tok.t !== t) throw err(`expected ${what ?? t}, got ${tok.t}`, tok.pos);
    return tok;
  };

  function term() {
    const tok = next();
    if (tok.t === "str") return { k: "str", v: tok.v };
    if (tok.t === "null") return { k: "null" };
    if (tok.t === "name") {
      if (tok.v === "user") {
        expect("dot", ".");
        const n = expect("name", "attribute name");
        return { k: "ident", name: n.v };
      }
      if (tok.v === "String") {
        expect("dot", ".");
        const fnTok = expect("name", "String function");
        const fn = { toUpperCase: "upper", toLowerCase: "lower" }[fnTok.v];
        if (!fn) throw err(`unknown function String.${fnTok.v}`, fnTok.pos);
        expect("lp", "(");
        const arg = expr();
        expect("rp", ")");
        return { k: "call", fn, arg };
      }
      throw err(`unknown namespace '${tok.v}' (only user.* and String.* exist)`, tok.pos);
    }
    throw err(`unexpected token ${tok.t}`, tok.pos);
  }

  function concat() {
    const parts = [term()];
    while (peek().t === "plus") { next(); parts.push(term()); }
    return parts.length === 1 ? parts[0] : { k: "concat", parts };
  }

  function eqchain() {
    const l = concat();
    if (peek().t === "eq" || peek().t === "neq") {
      const op = next().t;
      const r = concat();
      return { k: op, l, r };
    }
    return l;
  }

  function expr() {
    const cond = eqchain();
    if (peek().t === "q") {
      next();
      const thenE = expr();
      expect("colon", ":");
      const elseE = expr();
      return { k: "ternary", cond, then: thenE, else: elseE };
    }
    return cond;
  }

  const ast = expr();
  const tail = peek();
  if (tail.t !== "eof") throw err(`trailing input ${tail.t}`, tail.pos);
  return ast;
}
