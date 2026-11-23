// Tiny safe arithmetic evaluator (no eval / Function). Recursive descent:
//   expr   := term (('+'|'-') term)*
//   term   := unary (('*'|'/'|'%') unary)*
//   unary  := ('-'|'+') unary | power
//   power  := atom ('^' unary)?          (right-associative)
//   atom   := number | const | func '(' expr (',' expr)* ')' | '(' expr ')'

const FUNCS: Record<string, (...a: number[]) => number> = {
  sqrt: Math.sqrt, abs: Math.abs, sin: Math.sin, cos: Math.cos, tan: Math.tan,
  log: Math.log10, ln: Math.log, round: Math.round, floor: Math.floor, ceil: Math.ceil,
  min: Math.min, max: Math.max, pow: Math.pow,
};
const CONSTS: Record<string, number> = { pi: Math.PI, e: Math.E };

export function calculate(input: string): number {
  const src = input.replace(/(\d)\s*[x×]\s*(?=[\d(.])/gi, '$1*').replace(/÷/g, '/').trim();
  if (src.length > 200) throw new Error('Expression too long.');
  let i = 0;
  const peek = () => src[i];
  const ws = () => { while (src[i] === ' ') i++; };

  function number_(): number {
    const m = /^(\d+\.?\d*|\.\d+)(e[+-]?\d+)?/i.exec(src.slice(i));
    if (!m) throw new Error(`Unexpected "${src[i] ?? 'end'}" at position ${i}.`);
    i += m[0].length;
    return parseFloat(m[0]);
  }
  function atom(): number {
    ws();
    const c = peek();
    if (c === '(') {
      i++;
      const v = expr();
      ws();
      if (peek() !== ')') throw new Error('Missing closing parenthesis.');
      i++;
      return v;
    }
    const id = /^[a-z]+/i.exec(src.slice(i));
    if (id) {
      const name = id[0].toLowerCase();
      i += id[0].length;
      ws();
      if (peek() === '(') {
        const fn = FUNCS[name];
        if (!fn) throw new Error(`Unknown function "${name}".`);
        i++;
        const args = [expr()];
        ws();
        while (peek() === ',') { i++; args.push(expr()); ws(); }
        if (peek() !== ')') throw new Error('Missing closing parenthesis.');
        i++;
        return fn(...args);
      }
      if (name in CONSTS) return CONSTS[name];
      throw new Error(`Unknown name "${name}".`);
    }
    return number_();
  }
  function power(): number {
    const base = atom();
    ws();
    if (peek() === '^' || (peek() === '*' && src[i + 1] === '*')) {
      i += peek() === '^' ? 1 : 2;
      return Math.pow(base, unary());
    }
    return base;
  }
  function unary(): number {
    ws();
    if (peek() === '-') { i++; return -unary(); }
    if (peek() === '+') { i++; return unary(); }
    return power();
  }
  function term(): number {
    let v = unary();
    for (;;) {
      ws();
      const c = peek();
      if (c === '*' && src[i + 1] !== '*') { i++; v *= unary(); }
      else if (c === '/') { i++; v /= unary(); }
      else if (c === '%') {
        i++;
        const rhs = unary();
        v = v % rhs;
      }
      else return v;
    }
  }
  function expr(): number {
    let v = term();
    for (;;) {
      ws();
      const c = peek();
      if (c === '+') { i++; v += term(); }
      else if (c === '-') { i++; v -= term(); }
      else return v;
    }
  }

  const result = expr();
  ws();
  if (i < src.length) throw new Error(`Unexpected "${src[i]}" at position ${i}.`);
  if (!Number.isFinite(result)) throw new Error('The result is not a finite number (division by zero?).');
  return result;
}

export function formatNumber(n: number): string {
  if (Number.isInteger(n)) return n.toLocaleString('en-US', { useGrouping: false });
  return String(parseFloat(n.toPrecision(12)));
}
