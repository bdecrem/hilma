class FormulaError extends Error {
  constructor(code) {
    super(code);
    this.code = code;
  }
}

const KNOWN_FUNCTIONS = new Set(["SUM", "AVERAGE", "MIN", "MAX", "COUNT"]);
const PLAIN_NUMBER_RE = /^[+-]?(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?$/;
const TOKEN_NUMBER_RE = /^(?:[0-9]+(?:\.[0-9]+)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/;
const TOKEN_CELL_REF_RE = /^([A-Za-z])([0-9]{1,2})(?![0-9])/;
const TOKEN_IDENT_RE = /^[A-Za-z]+/;

function isPlainNumber(s) {
  return typeof s === "string" && PLAIN_NUMBER_RE.test(s.trim());
}

function cellName(col, row) {
  return String.fromCharCode(65 + col) + row;
}

function lex(src) {
  const tokens = [];
  let pos = 0;

  while (pos < src.length) {
    const ch = src[pos];
    if (/\s/.test(ch)) {
      pos++;
      continue;
    }

    const numberMatch = TOKEN_NUMBER_RE.exec(src.slice(pos));
    if (numberMatch) {
      tokens.push({
        type: "number",
        value: Number(numberMatch[0]),
      });
      pos += numberMatch[0].length;
      continue;
    }

    if (/[A-Za-z]/.test(ch)) {
      const cellMatch = TOKEN_CELL_REF_RE.exec(src.slice(pos));
      if (cellMatch) {
        const col = cellMatch[1].toUpperCase().charCodeAt(0) - 65;
        const row = Number(cellMatch[2]);
        if (col < 0 || col > 25 || row < 1 || row > 99) {
          throw new FormulaError("#ERR!");
        }
        tokens.push({
          type: "ref",
          name: cellMatch[1].toUpperCase() + row,
          col,
          row,
        });
        pos += cellMatch[0].length;
        continue;
      }

      const identMatch = TOKEN_IDENT_RE.exec(src.slice(pos));
      tokens.push({ type: "ident", name: identMatch[0].toUpperCase() });
      pos += identMatch[0].length;
      continue;
    }

    if ("+-*/(),:".includes(ch)) {
      tokens.push({ type: "punct", value: ch });
      pos++;
      continue;
    }

    throw new FormulaError("#ERR!");
  }

  return tokens;
}

function parseFormula(src) {
  const tokens = lex(src);
  let pos = 0;

  function peek() {
    return tokens[pos];
  }

  function fail() {
    throw new FormulaError("#ERR!");
  }

  function parseExpression() {
    const left = parseUnary();
    return parseBinaryFrom(left, "+-");
  }

  function parseUnary() {
    const t = peek();
    if (t && t.type === "punct" && (t.value === "-" || t.value === "+")) {
      pos++;
      return { type: "unary", op: t.value, operand: parseUnary() };
    }
    return parsePrimary();
  }

  function parseBinaryFrom(left, ops) {
    let node = left;
    for (;;) {
      const t = peek();
      if (t && t.type === "punct" && ops.includes(t.value)) {
        pos++;
        const right = parseUnary();
        node = { type: "binary", op: t.value, left: node, right };
        continue;
      }
      return node;
    }
  }

  function parseMultiplicative() {
    const left = parseUnary();
    return parseBinaryFrom(left, "*/");
  }

  function parseOptionalPrimary() {
    return parsePrimary();
  }

  function parsePrimary() {
    const t = peek();

    if (!t) fail();

    if (t.type === "punct" && t.value === "(") {
      pos++;
      const e = parseAdditive();
      const closing = peek();
      if (!closing || closing.type !== "punct" || closing.value !== ")") fail();
      pos++;
      return e;
    }

    if (t.type === "number") {
      pos++;
      return { type: "num", value: t.value };
    }

    if (t.type === "ref") {
      pos++;
      const colon = peek();
      if (colon && colon.type === "punct" && colon.value === ":") {
        pos++;
        const end = peek();
        if (!end || end.type !== "ref") fail();
        pos++;
        return {
          type: "range",
          start: { col: t.col, row: t.row },
          end: { col: end.col, row: end.row },
        };
      }
      return { type: "cell", name: t.name };
    }

    if (t.type === "ident") {
      pos++;
      const next = peek();
      if (next && next.type === "punct" && next.value === "(") {
        return parseCall(t.name);
      }
      fail();
    }

    fail();
  }

  function parseCall(name) {
    pos++; // We already consumed the open-parenthesis? No; see below.
    throw new FormulaError("#ERR!");
  }

  function parseAdditive() {
    const left = parseMultiplicative();
    const node = parseBinaryFrom(left, "+-");
    return node;
  }

  function parseCallFixed(name) {
    // consume the '('
    if (!(peek() && peek().type === "punct" && peek().value === "(")) fail();
    pos++;

    const next = peek();
    if (next && next.type === "punct" && next.value === ")") fail();

    const args = [];
    for (;;) {
      args.push(parseAdditive());
      const t = peek();
      if (t && t.type === "punct" && t.value === ",") {
        pos++;
        continue;
      }
      if (t && t.type === "punct" && t.value === ")") {
        pos++;
        return { type: "call", name, args };
      }
      fail();
    }
  }

  function parseMultiplicativeFixed() {
    const left = parseUnary();
    return parseBinaryFrom(left, "*/");
  }

  function parsePrimaryFixed() {
    const t = peek();

    if (!t) fail();

    if (t.type === "punct" && t.value === "(") {
      pos++;
      const e = parseAdditiveFixed();
      const closing = peek();
      if (!closing || closing.type !== "punct" || closing.value !== ")") fail();
      pos++;
      return e;
    }

    if (t.type === "number") {
      pos++;
      return { type: "num", value: t.value };
    }

    if (t.type === "ref") {
      pos++;
      const colon = peek();
      if (colon && colon.type === "punct" && colon.value === ":") {
        pos++;
        const end = peek();
        if (!end || end.type !== "ref") fail();
        pos++;
        return {
          type: "range",
          start: { col: t.col, row: t.row },
          end: { col: end.col, row: end.row },
        };
      }
      return { type: "cell", name: t.name };
    }

    if (t.type === "ident") {
      const identName = t.name;
      const next = peek();
      if (
        peek() &&
        peek().type === "punct" &&
        peek().value === "("
      ) {
        pos++;
        const call = parseCallFixed(identName);
        return call;
      }
      fail();
    }

    fail();
  }

  function parseAdditiveFixed() {
    const left = parseMultiplicativeFixed();
    return parseBinaryFrom(left, "+-");
  }

  const ast = parseAdditiveFixed();
  if (pos !== tokens.length) fail();
  return ast;
}

function collectRangeValues(start, end, displayCell) {
  const colMin = Math.min(start.col, end.col);
  const colMax = Math.max(start.col, end.col);
  const rowMin = Math.min(start.row, end.row);
  const rowMax = Math.max(start.row, end.row);
  const values = [];

  for (let row = rowMin; row <= rowMax; row++) {
    for (let col = colMin; col <= colMax; col++) {
      const rich = displayCell(cellName(col, row));
      if (rich.kind === "error") {
        throw new FormulaError(rich.code);
      }
      if (rich.kind === "num") {
        values.push(rich.value);
      }
    }
  }

  return values;
}

function createEval(cells, displayCell) {
  function numericValue(rich) {
    if (rich.kind === "error") throw new FormulaError(rich.code);
    if (rich.kind === "text") throw new FormulaError("#VALUE!");
    if (rich.kind === "empty") return 0;
    return rich.value;
  }

  function evalNode(node) {
    if (node.type === "num") return { kind: "num", value: node.value };

    if (node.type === "cell") return displayCell(node.name);

    if (node.type === "range") throw new FormulaError("#ERR!");

    if (node.type === "unary") {
      const value = numericValue(evalNode(node.operand));
      return { kind: "num", value: node.op === "-" ? -value : value };
    }

    if (node.type === "binary") {
      const left = numericValue(evalNode(node.left));
      const right = numericValue(evalNode(node.right));

      if (node.op === "+") return { kind: "num", value: left + right };
      if (node.op === "-") return { kind: "num", value: left - right };
      if (node.op === "*") return { kind: "num", value: left * right };
      if (node.op === "/") {
        if (right === 0) throw new FormulaError("#DIV/0!");
        return { kind: "num", value: left / right };
      }
      throw new FormulaError("#ERR!");
    }

    if (node.type === "call") {
      const name = node.name;
      if (!KNOWN_FUNCTIONS.has(name)) throw new FormulaError("#NAME?");

      const values = [];

      for (const arg of node.args) {
        if (arg.type === "range") {
          const rangeValues = collectRangeValues(arg.start, arg.end, displayCell);
          for (const value of rangeValues) values.push(value);
          continue;
        }

        const rich = evalNode(arg);
        if (rich.kind === "error") throw new FormulaError(rich.code);
        if (rich.kind === "num") values.push(rich.value);
      }

      if (name === "SUM") {
        return { kind: "num", value: values.reduce((a, b) => a + b, 0) };
      }

      if (name === "AVERAGE") {
        if (values.length === 0) throw new FormulaError("#DIV/0!");
        return {
          kind: "num",
          value: values.reduce((a, b) => a + b, 0) / values.length,
        };
      }

      if (name === "MIN") {
        return { kind: "num", value: values.length === 0 ? 0 : Math.min(...values) };
      }

      if (name === "MAX") {
        return { kind: "num", value: values.length === 0 ? 0 : Math.max(...values) };
      }

      if (name === "COUNT") {
        return { kind: "num", value: values.length };
      }

      throw new FormulaError("#NAME?");
    }

    throw new FormulaError("#ERR!");
  }

  return evalNode;
}

export function computeSheet(cells) {
  const state = new Map();
  const path = [];

  function displayCell(name) {
    const existing = state.get(name);
    if (existing && existing.status === "done") return existing.value;

    if (existing && existing.status === "visiting") {
      const index = path.indexOf(name);
      if (index >= 0) {
        for (let i = index; i < path.length; i++) {
          state.set(path[i], {
            status: "done",
            value: { kind: "error", code: "#LOOP!" },
          });
        }
      }
      return { kind: "error", code: "#LOOP!" };
    }

    state.set(name, { status: "visiting" });
    path.push(name);

    let value;
    try {
      value = computeRaw(name, cells[name]);
    } catch (e) {
      value = {
        kind: "error",
        code: e instanceof FormulaError ? e.code : "#ERR!",
      };
    } finally {
      path.pop();
    }

    state.set(name, { status: "done", value });
    return value;
  }

  function evalFormulaText(src) {
    const ast = parseFormula(src);
    const evalNode = createEval(cells, displayCell);
    return evalNode(ast);
  }

  function computeRaw(name, raw) {
    if (raw === undefined || raw === null) return { kind: "empty" };

    if (typeof raw === "number") {
      return Number.isFinite(raw)
        ? { kind: "num", value: raw }
        : { kind: "text", value: String(raw) };
    }

    if (typeof raw !== "string") {
      return { kind: "text", value: String(raw) };
    }

    if (raw.startsWith("=")) {
      return evalFormulaText(raw.slice(1));
    }

    if (raw === "") return { kind: "empty" };

    const trimmed = raw.trim();
    if (isPlainNumber(trimmed)) {
      return { kind: "num", value: Number(trimmed) };
    }

    return { kind: "text", value: raw };
  }

  function toOutput(rich) {
    if (rich.kind === "error") return rich.code;
    if (rich.kind === "text") return rich.value;
    if (rich.kind === "num") return rich.value;
    return 0;
  }

  function toOutputRaw(raw) {
    if (raw === undefined || raw === null) return "";

    if (typeof raw === "number") {
      return Number.isFinite(raw) ? raw : String(raw);
    }

    if (typeof raw !== "string") return String(raw);
    if (raw === "") return "";

    const trimmed = raw.trim();
    if (isPlainNumber(trimmed)) return Number(trimmed);

    return raw;
  }

  const out = {};

  for (const key of Object.keys(cells)) {
    const raw = cells[key];
    if (typeof raw === "string" && raw.startsWith("=")) {
      out[key] = toOutput(displayCell(key));
    } else {
      out[key] = toOutputRaw(raw);
    }
  }

  return out;
}
