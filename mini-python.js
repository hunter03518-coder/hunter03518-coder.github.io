/* Mini Python for Hunter's Code Lab: print, variables, math, if/elif/else, for/while loops. */
(function (root) {
  "use strict";

  var MAX_STEPS = 10000;
  var MAX_LINES = 20000;

  function Oops(line, msg) {
    this.line = line;
    this.message = "Line " + line + ": " + msg;
  }

  // ---------- values ----------
  var NONE = { t: "none" };
  var TRUE = { t: "bool", v: true };
  var FALSE = { t: "bool", v: false };
  function int(n) { return { t: "int", v: n }; }
  function flt(n) { return { t: "float", v: n }; }
  function str(s) { return { t: "str", v: s }; }
  function bool(b) { return b ? TRUE : FALSE; }
  function isNum(x) { return x.t === "int" || x.t === "float" || x.t === "bool"; }
  function numVal(x) { return x.t === "bool" ? (x.v ? 1 : 0) : x.v; }
  function isIntLike(x) { return x.t === "int" || x.t === "bool"; }
  function kind(x) {
    return { int: "a number", float: "a number", str: "words (a string)", bool: "True/False", none: "None", list: "a list" }[x.t];
  }

  function fmtFloat(n) {
    if (n === Infinity) return "inf";
    if (n === -Infinity) return "-inf";
    if (isNaN(n)) return "nan";
    if (Number.isInteger(n) && Math.abs(n) < 1e16) return n + ".0";
    var s = String(n);
    if (s.indexOf("e") !== -1) s = s.replace(/e\+?(-?)(\d)$/, "e$10$2").replace("e", "e+").replace("e+-", "e-");
    return s;
  }
  function show(x) {
    switch (x.t) {
      case "int": return String(x.v);
      case "float": return fmtFloat(x.v);
      case "str": return x.v;
      case "bool": return x.v ? "True" : "False";
      case "none": return "None";
      case "list": return "[" + x.v.map(repr).join(", ") + "]";
    }
    return "?";
  }
  function repr(x) {
    if (x.t === "str") return "'" + x.v.replace(/\\/g, "\\\\").replace(/'/g, "\\'").replace(/\n/g, "\\n") + "'";
    return show(x);
  }
  function truthy(x) {
    switch (x.t) {
      case "int": case "float": return x.v !== 0;
      case "bool": return x.v;
      case "str": return x.v.length > 0;
      case "list": return x.v.length > 0;
    }
    return false;
  }

  // ---------- tokenizer (one line at a time) ----------
  var OPS = ["**=", "//=", "**", "//", "==", "!=", "<=", ">=", "+=", "-=", "*=", "/=", "%=",
    "+", "-", "*", "/", "%", "<", ">", "=", "(", ")", ",", ":", "[", "]"];

  function tokenize(text, line) {
    var toks = [];
    var i = 0;
    while (i < text.length) {
      var c = text[i];
      if (c === " " || c === "\t") { i++; continue; }
      if (c === "#") break;
      if (c === '"' || c === "'") {
        var q = c, j = i + 1, s = "";
        while (j < text.length && text[j] !== q) {
          if (text[j] === "\\" && j + 1 < text.length) {
            var e = text[j + 1];
            s += e === "n" ? "\n" : e === "t" ? "\t" : e;
            j += 2;
          } else { s += text[j]; j++; }
        }
        if (j >= text.length) throw new Oops(line, "your words are missing a closing " + q + " quote. Start and end them with the same quote, like print(" + q + "hi" + q + ")");
        toks.push({ k: "str", v: s });
        i = j + 1;
        continue;
      }
      if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(text[i + 1] || ""))) {
        var m = /^(\d+\.\d*|\.\d+|\d+)([eE][+-]?\d+)?/.exec(text.slice(i));
        var raw = m[0].replace(/_/g, "");
        var isF = /[.eE]/.test(raw);
        toks.push({ k: "num", v: isF ? flt(parseFloat(raw)) : int(parseInt(raw, 10)) });
        i += m[0].length;
        if (/[A-Za-z_]/.test(text[i] || "")) throw new Oops(line, "names can't start with a number. Try putting the letters first, like num1");
        continue;
      }
      if (/[A-Za-z_]/.test(c)) {
        var n = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i))[0];
        toks.push({ k: "name", v: n });
        i += n.length;
        continue;
      }
      var op = null;
      for (var o = 0; o < OPS.length; o++) {
        if (text.substr(i, OPS[o].length) === OPS[o]) { op = OPS[o]; break; }
      }
      if (!op) {
        if (c === "\u201c" || c === "\u201d" || c === "\u2018" || c === "\u2019")
          throw new Oops(line, "that's a curly quote (" + c + "). Use a straight quote \" or ' instead");
        throw new Oops(line, "I don't understand the symbol '" + c + "'");
      }
      toks.push({ k: "op", v: op });
      i += op.length;
    }
    return toks;
  }

  // ---------- expression parser ----------
  function Parser(toks, line) { this.t = toks; this.p = 0; this.line = line; }
  Parser.prototype.peek = function () { return this.t[this.p]; };
  Parser.prototype.isOp = function (v) { var x = this.t[this.p]; return x && x.k === "op" && x.v === v; };
  Parser.prototype.isName = function (v) { var x = this.t[this.p]; return x && x.k === "name" && x.v === v; };
  Parser.prototype.next = function () { return this.t[this.p++]; };
  Parser.prototype.expectOp = function (v, msg) {
    if (!this.isOp(v)) throw new Oops(this.line, msg);
    this.p++;
  };
  Parser.prototype.done = function () { return this.p >= this.t.length; };

  Parser.prototype.expr = function () { return this.orExpr(); };
  Parser.prototype.orExpr = function () {
    var l = this.andExpr();
    while (this.isName("or")) { this.p++; l = { k: "or", a: l, b: this.andExpr() }; }
    return l;
  };
  Parser.prototype.andExpr = function () {
    var l = this.notExpr();
    while (this.isName("and")) { this.p++; l = { k: "and", a: l, b: this.notExpr() }; }
    return l;
  };
  Parser.prototype.notExpr = function () {
    if (this.isName("not")) { this.p++; return { k: "not", a: this.notExpr() }; }
    return this.cmp();
  };
  var CMP = { "==": 1, "!=": 1, "<": 1, ">": 1, "<=": 1, ">=": 1 };
  Parser.prototype.cmp = function () {
    var first = this.sum();
    var ops = [], rest = [];
    while (true) {
      var x = this.peek();
      if (x && x.k === "op" && CMP[x.v]) { this.p++; ops.push(x.v); rest.push(this.sum()); continue; }
      if (x && x.k === "op" && x.v === "=") throw new Oops(this.line, "to check if two things are the same, use two equals signs ==, like if x == 5:");
      break;
    }
    if (!ops.length) return first;
    return { k: "cmp", first: first, ops: ops, rest: rest };
  };
  Parser.prototype.sum = function () {
    var l = this.term();
    while (this.isOp("+") || this.isOp("-")) { var o = this.next().v; l = { k: "bin", op: o, a: l, b: this.term() }; }
    return l;
  };
  Parser.prototype.term = function () {
    var l = this.unary();
    while (this.isOp("*") || this.isOp("/") || this.isOp("//") || this.isOp("%")) {
      var o = this.next().v; l = { k: "bin", op: o, a: l, b: this.unary() };
    }
    return l;
  };
  Parser.prototype.unary = function () {
    if (this.isOp("-")) { this.p++; return { k: "neg", a: this.unary() }; }
    if (this.isOp("+")) { this.p++; return this.unary(); }
    return this.power();
  };
  Parser.prototype.power = function () {
    var base = this.atom();
    if (this.isOp("**")) { this.p++; return { k: "bin", op: "**", a: base, b: this.unary() }; }
    return base;
  };
  Parser.prototype.atom = function () {
    var x = this.next();
    var line = this.line;
    if (!x) throw new Oops(line, "this line ends too early. Something is missing at the end");
    if (x.k === "num") return { k: "lit", v: x.v };
    if (x.k === "str") return { k: "lit", v: str(x.v) };
    if (x.k === "name") {
      if (x.v === "True") return { k: "lit", v: TRUE };
      if (x.v === "False") return { k: "lit", v: FALSE };
      if (x.v === "None") return { k: "lit", v: NONE };
      if (x.v === "true" || x.v === "false")
        throw new Oops(line, "Python spells it with a capital letter: " + (x.v === "true" ? "True" : "False"));
      if (KEYWORDS[x.v]) throw new Oops(line, "'" + x.v + "' can't go here");
      if (this.isOp("(")) {
        this.p++;
        var args = [], kw = {};
        while (!this.isOp(")")) {
          if (this.done()) throw new Oops(line, "you opened a ( but didn't close it. Add a ) at the end");
          var a = this.peek(), b = this.t[this.p + 1];
          if (a.k === "name" && b && b.k === "op" && b.v === "=") {
            this.p += 2; kw[a.v] = this.expr();
          } else args.push(this.expr());
          if (this.isOp(",")) { this.p++; continue; }
          if (!this.isOp(")")) {
            if (this.done()) throw new Oops(line, "you opened a ( but didn't close it. Add a ) at the end");
            throw new Oops(line, "put a comma between things inside the ( ), like print(\"hi\", name)");
          }
        }
        this.p++;
        return { k: "call", name: x.v, args: args, kw: kw };
      }
      return { k: "name", v: x.v };
    }
    if (x.k === "op" && x.v === "(") {
      if (this.isOp(")")) throw new Oops(line, "there's nothing inside these ( )");
      var e = this.expr();
      this.expectOp(")", "you opened a ( but didn't close it. Add a ) at the end");
      return e;
    }
    if (x.k === "op" && x.v === "[") {
      var items = [];
      while (!this.isOp("]")) {
        if (this.done()) throw new Oops(line, "you opened a [ but didn't close it. Add a ] at the end");
        items.push(this.expr());
        if (this.isOp(",")) this.p++;
        else if (!this.isOp("]")) throw new Oops(line, "put a comma between the things in your list");
      }
      this.p++;
      return { k: "list", items: items };
    }
    if (x.k === "op" && x.v === ")") throw new Oops(line, "there's an extra ) here, or something is missing before it");
    throw new Oops(line, "I didn't expect '" + x.v + "' here");
  };

  var KEYWORDS = { "if": 1, "elif": 1, "else": 1, "for": 1, "while": 1, "in": 1, "and": 1, "or": 1, "not": 1, "print": 0, "pass": 1, "break": 1, "continue": 1, "def": 1, "return": 1, "import": 1 };

  function parseExpr(toks, line, what) {
    if (!toks.length) throw new Oops(line, what || "something is missing here");
    var p = new Parser(toks, line);
    var e = p.expr();
    if (!p.done()) {
      var x = p.peek();
      if (x.k === "op" && x.v === ")") throw new Oops(line, "there's an extra ) here");
      if (x.k === "op" && x.v === ":") throw new Oops(line, "I didn't expect a ':' here");
      throw new Oops(line, "I got confused at '" + (x.k === "str" ? '"' + x.v + '"' : x.k === "num" ? show(x.v) : x.v) + "'. Is a + or a comma missing?");
    }
    return e;
  }

  // ---------- statements ----------
  function parseProgram(src) {
    var raw = src.replace(/\r\n?/g, "\n").split("\n");
    var lines = [];
    for (var i = 0; i < raw.length; i++) {
      var text = raw[i].replace(/\t/g, "    ");
      var toks = tokenize(text, i + 1);
      if (!toks.length) continue;
      var indent = /^ */.exec(text)[0].length;
      lines.push({ n: i + 1, indent: indent, toks: toks });
    }
    var pos = 0;

    function block(indent) {
      var body = [];
      while (pos < lines.length) {
        var L = lines[pos];
        if (L.indent < indent) break;
        if (L.indent > indent) throw new Oops(L.n, "this line is pushed in (indented) but it shouldn't be. Remove the spaces at the start");
        pos++;
        body.push(statement(L, indent));
      }
      return body;
    }

    function childBlock(L, word) {
      var next = lines[pos];
      if (!next || next.indent <= L.indent)
        throw new Oops(next && next.indent <= L.indent ? next.n : L.n,
          next ? "the lines inside your '" + word + "' need to be pushed in with spaces, like 4 spaces at the start" :
            "after a '" + word + "' line ending in ':' you need at least one pushed-in line below it");
      return block(next.indent);
    }

    function needColon(L, word) {
      var last = L.toks[L.toks.length - 1];
      if (!(last.k === "op" && last.v === ":")) throw new Oops(L.n, "'" + word + "' lines need a colon ':' at the end");
      return L.toks.slice(1, -1);
    }

    function statement(L, indent) {
      var t = L.toks, first = t[0], n = L.n;
      if (first.k === "name") {
        var w = first.v;
        if (w === "print" || w === "Print" || w === "PRINT") {
          if (w !== "print") throw new Oops(n, "Python is picky about capitals. Use print with a small p, like print(\"hi\")");
          if (!(t[1] && t[1].k === "op" && t[1].v === "(")) {
            var inner = t[1] && t[1].k === "str" ? t[1].v.replace(/^\(|\)$/g, "") : "hi";
            throw new Oops(n, "print needs parentheses, like print(\"" + inner + "\")");
          }
          var e = parseExpr(t, n);
          if (e.k !== "call") throw new Oops(n, "print needs parentheses around everything, like print(\"hi\")");
          return { k: "expr", e: e, n: n };
        }
        if (w === "if") return ifChain(L, indent);
        if (w === "elif" || w === "else") throw new Oops(n, "'" + w + "' needs an 'if' right above it, at the same indent");
        if (w === "for") {
          var body = needColon(L, "for");
          if (!(body[0] && body[0].k === "name") || !(body[1] && body[1].k === "name" && body[1].v === "in"))
            throw new Oops(n, "a for loop looks like this: for i in range(3):");
          if (KEYWORDS[body[0].v]) throw new Oops(n, "'" + body[0].v + "' can't be used as a loop name");
          var iter = parseExpr(body.slice(2), n, "say what to loop over, like for i in range(3):");
          return { k: "for", v: body[0].v, iter: iter, body: childBlock(L, "for"), n: n };
        }
        if (w === "while") {
          var cond = parseExpr(needColon(L, "while"), n, "say when the loop should keep going, like while x < 5:");
          return { k: "while", cond: cond, body: childBlock(L, "while"), n: n };
        }
        if (w === "pass") return { k: "pass", n: n };
        if (w === "break" || w === "continue") return { k: w, n: n };
        if (w === "def" || w === "import" || w === "class" || w === "return" || w === "def")
          throw new Oops(n, "mini Python doesn't know '" + w + "' yet. It supports print, variables, math, and simple if/for loops");
        var op = t[1] && t[1].k === "op" ? t[1].v : null;
        if (op === "=" || op === "+=" || op === "-=" || op === "*=" || op === "/=" || op === "//=" || op === "%=" || op === "**=") {
          if (KEYWORDS[w] || w === "True" || w === "False" || w === "None") throw new Oops(n, "'" + w + "' is a special word, so it can't be a variable name");
          var rhs = parseExpr(t.slice(2), n, "put something after the =, like " + w + " = 5");
          return { k: "assign", name: w, op: op, e: rhs, n: n };
        }
      }
      if (t[0].k === "num" && t[1] && t[1].k === "op" && t[1].v === "=")
        throw new Oops(n, "the variable name goes on the left, like x = " + show(t[0].v));
      return { k: "expr", e: parseExpr(t, n), n: n };
    }

    function ifChain(L, indent) {
      var branches = [];
      var cond = parseExpr(needColon(L, "if"), L.n, "say what to check, like if x > 3:");
      branches.push({ cond: cond, body: childBlock(L, "if") });
      var elseBody = null;
      while (pos < lines.length && lines[pos].indent === indent && lines[pos].toks[0].k === "name") {
        var M = lines[pos], w = M.toks[0].v;
        if (w === "elif") {
          pos++;
          branches.push({ cond: parseExpr(needColon(M, "elif"), M.n, "say what to check, like elif x > 3:"), body: childBlock(M, "elif") });
        } else if (w === "else") {
          pos++;
          if (needColon(M, "else").length) throw new Oops(M.n, "'else' doesn't take a check. Just write else:");
          elseBody = childBlock(M, "else");
          break;
        } else break;
      }
      return { k: "if", branches: branches, elseBody: elseBody, n: L.n };
    }

    var prog = block(0);
    if (pos < lines.length) throw new Oops(lines[pos].n, "this line's indent doesn't line up with the lines above it");
    return prog;
  }

  // ---------- evaluation ----------
  function run(src) {
    var out = [];
    var vars = Object.create(null);
    var steps = 0;
    var BREAK = {}, CONT = {};

    function step(n) {
      if (++steps > MAX_STEPS)
        throw new Oops(n, "whoa, your code ran more than 10,000 steps, so I stopped it. Is there a loop that never ends?");
    }

    function binop(op, a, b, n) {
      if (op === "+") {
        if (isNum(a) && isNum(b)) return numRes(a, b, numVal(a) + numVal(b));
        if (a.t === "str" && b.t === "str") return str(a.v + b.v);
        if (a.t === "list" && b.t === "list") return { t: "list", v: a.v.concat(b.v) };
        if ((a.t === "str" && isNum(b)) || (isNum(a) && b.t === "str"))
          throw new Oops(n, "you can't add words and numbers together with +. Try a comma in print, or str(), like \"Age: \" + str(8)");
        throw new Oops(n, "I can't add " + kind(a) + " and " + kind(b));
      }
      if (op === "*") {
        if (isNum(a) && isNum(b)) return numRes(a, b, numVal(a) * numVal(b));
        if (a.t === "str" && isIntLike(b)) return str(a.v.repeat(Math.max(0, Math.min(numVal(b), 100000))));
        if (isIntLike(a) && b.t === "str") return str(b.v.repeat(Math.max(0, Math.min(numVal(a), 100000))));
        throw new Oops(n, "I can't multiply " + kind(a) + " by " + kind(b) + ". Words can only be multiplied by a whole number, like \"ha\" * 3");
      }
      if (!isNum(a) || !isNum(b)) {
        var nm = { "-": "subtract", "/": "divide", "//": "divide", "%": "use % on", "**": "use ** on" }[op];
        throw new Oops(n, "I can only " + nm + " numbers, not " + (isNum(a) ? kind(b) : kind(a)));
      }
      var x = numVal(a), y = numVal(b);
      if (op === "-") return numRes(a, b, x - y);
      if ((op === "/" || op === "//" || op === "%") && y === 0)
        throw new Oops(n, "you can't divide by zero. Even computers can't do that!");
      if (op === "/") return flt(x / y);
      if (op === "//") return numRes(a, b, Math.floor(x / y));
      if (op === "%") return numRes(a, b, x - y * Math.floor(x / y));
      if (op === "**") {
        if (x === 0 && y < 0) throw new Oops(n, "0 can't be raised to a negative power");
        var r = Math.pow(x, y);
        return isIntLike(a) && isIntLike(b) && y >= 0 ? int(r) : flt(r);
      }
    }
    function numRes(a, b, r) { return isIntLike(a) && isIntLike(b) ? int(r) : flt(r); }

    function compare(op, a, b, n) {
      if (op === "==") return eq(a, b);
      if (op === "!=") return !eq(a, b);
      var x, y;
      if (isNum(a) && isNum(b)) { x = numVal(a); y = numVal(b); }
      else if (a.t === "str" && b.t === "str") { x = a.v; y = b.v; }
      else throw new Oops(n, "I can't compare " + kind(a) + " with " + kind(b) + " using " + op);
      return op === "<" ? x < y : op === ">" ? x > y : op === "<=" ? x <= y : x >= y;
    }
    function eq(a, b) {
      if (isNum(a) && isNum(b)) return numVal(a) === numVal(b);
      if (a.t !== b.t) return false;
      if (a.t === "list") return a.v.length === b.v.length && a.v.every(function (x, i) { return eq(x, b.v[i]); });
      return a.v === b.v;
    }

    function toInt(x, n) {
      if (isNum(x)) return int(Math.trunc(numVal(x)));
      if (x.t === "str" && /^\s*[+-]?\d+\s*$/.test(x.v)) return int(parseInt(x.v, 10));
      throw new Oops(n, "I can't turn " + repr(x) + " into a whole number");
    }

    function needInt(x, n, what) {
      if (!isIntLike(x)) throw new Oops(n, what + " needs a whole number, like range(5)");
      return numVal(x);
    }

    function call(e, n) {
      var args = e.args.map(function (a) { return ev(a, n); });
      switch (e.name) {
        case "print":
          var sep = e.kw.sep ? show(ev(e.kw.sep, n)) : " ";
          var end = e.kw.end ? show(ev(e.kw.end, n)) : "\n";
          var text = args.map(show).join(sep) + end;
          if (out.length && out.pending) { out[out.length - 1] += text; } else out.push(text);
          out.pending = !/\n$/.test(text);
          if (out.length > MAX_LINES) throw new Oops(n, "that's more than " + MAX_LINES + " lines of output, so I stopped");
          return NONE;
        case "range":
          if (args.length < 1 || args.length > 3) throw new Oops(n, "range needs 1 to 3 numbers, like range(5)");
          var a0 = 0, a1, st = 1;
          if (args.length === 1) a1 = needInt(args[0], n, "range");
          else { a0 = needInt(args[0], n, "range"); a1 = needInt(args[1], n, "range"); if (args[2]) st = needInt(args[2], n, "range"); }
          if (st === 0) throw new Oops(n, "the step in range can't be 0");
          var count = Math.max(0, Math.ceil((a1 - a0) / st));
          if (count > MAX_STEPS) throw new Oops(n, "that range is too big. Mini Python stops after 10,000 steps");
          var list = [];
          for (var k = 0; k < count; k++) list.push(int(a0 + k * st));
          return { t: "list", v: list };
        case "str": return str(args.length ? show(args[0]) : "");
        case "int": return args.length ? toInt(args[0], n) : int(0);
        case "float":
          if (!args.length) return flt(0);
          if (isNum(args[0])) return flt(numVal(args[0]));
          if (args[0].t === "str" && !isNaN(parseFloat(args[0].v))) return flt(parseFloat(args[0].v));
          throw new Oops(n, "I can't turn " + repr(args[0]) + " into a number");
        case "len":
          if (args[0] && (args[0].t === "str" || args[0].t === "list")) return int(args[0].v.length);
          throw new Oops(n, "len needs words or a list, like len(\"frog\")");
        case "abs":
          if (args[0] && isNum(args[0])) return args[0].t === "float" ? flt(Math.abs(args[0].v)) : int(Math.abs(numVal(args[0])));
          throw new Oops(n, "abs needs a number");
        case "round":
          if (!args[0] || !isNum(args[0])) throw new Oops(n, "round needs a number");
          if (args[1]) { var f = Math.pow(10, numVal(args[1])); return flt(Math.round(numVal(args[0]) * f) / f); }
          var v = numVal(args[0]), r = Math.round(v);
          if (Math.abs(v % 1) === 0.5) r = 2 * Math.round(v / 2);
          return int(r);
        case "max": case "min":
          var items = args.length === 1 && args[0].t === "list" ? args[0].v : args;
          if (!items.length) throw new Oops(n, e.name + " needs some numbers");
          return items.reduce(function (m, x) { return compare(e.name === "max" ? ">" : "<", x, m, n) ? x : m; });
        case "input":
          throw new Oops(n, "mini Python can't ask questions with input() yet. Set a variable instead, like name = \"Hunter\"");
      }
      if (vars[e.name] !== undefined) throw new Oops(n, "'" + e.name + "' is a variable, not a command, so it can't have ( ) after it");
      throw new Oops(n, "I don't know the command '" + e.name + "' yet. Mini Python knows print, range, str, int, len, abs, round, min and max");
    }

    function ev(e, n) {
      switch (e.k) {
        case "lit": return e.v;
        case "name":
          var v = vars[e.v];
          if (v === undefined) throw new Oops(n, "I don't know what '" + e.v + "' is yet. Set it first, like " + e.v + " = 5");
          return v;
        case "list": return { t: "list", v: e.items.map(function (x) { return ev(x, n); }) };
        case "neg":
          var a = ev(e.a, n);
          if (!isNum(a)) throw new Oops(n, "a minus sign only works on numbers");
          return a.t === "float" ? flt(-a.v) : int(-numVal(a));
        case "not": return bool(!truthy(ev(e.a, n)));
        case "and": var l = ev(e.a, n); return truthy(l) ? ev(e.b, n) : l;
        case "or": var o = ev(e.a, n); return truthy(o) ? o : ev(e.b, n);
        case "bin": return binop(e.op, ev(e.a, n), ev(e.b, n), n);
        case "cmp":
          var left = ev(e.first, n);
          for (var i = 0; i < e.ops.length; i++) {
            var right = ev(e.rest[i], n);
            if (!compare(e.ops[i], left, right, n)) return FALSE;
            left = right;
          }
          return TRUE;
        case "call": return call(e, n);
      }
    }

    function exec(body) {
      for (var i = 0; i < body.length; i++) {
        var s = body[i];
        step(s.n);
        switch (s.k) {
          case "expr": ev(s.e, s.n); break;
          case "assign":
            if (s.op === "=") vars[s.name] = ev(s.e, s.n);
            else {
              if (vars[s.name] === undefined) throw new Oops(s.n, "I don't know what '" + s.name + "' is yet. Set it first, like " + s.name + " = 0");
              vars[s.name] = binop(s.op.slice(0, -1), vars[s.name], ev(s.e, s.n), s.n);
            }
            break;
          case "if":
            var done = false;
            for (var b = 0; b < s.branches.length; b++) {
              if (truthy(ev(s.branches[b].cond, s.n))) { var r = exec(s.branches[b].body); if (r) return r; done = true; break; }
            }
            if (!done && s.elseBody) { var r2 = exec(s.elseBody); if (r2) return r2; }
            break;
          case "for":
            var it = ev(s.iter, s.n), seq;
            if (it.t === "list") seq = it.v;
            else if (it.t === "str") seq = it.v.split("").map(str);
            else throw new Oops(s.n, "I can't loop over " + kind(it) + ". Try range(), like for i in range(3):");
            for (var j = 0; j < seq.length; j++) {
              vars[s.v] = seq[j];
              var fr = exec(s.body);
              if (fr === BREAK) break;
              if (j < seq.length - 1) step(s.n);
            }
            break;
          case "while":
            while (truthy(ev(s.cond, s.n))) {
              var wr = exec(s.body);
              if (wr === BREAK) break;
              step(s.n);
            }
            break;
          case "break": return BREAK;
          case "continue": return CONT;
        }
      }
      return null;
    }

    var error = null;
    try {
      exec(parseProgram(src));
    } catch (err) {
      if (err instanceof Oops) error = { line: err.line, message: err.message };
      else error = { line: 0, message: "Something went wrong inside mini Python. Try changing your code a little." };
    }
    var text = out.join("");
    var lines = text === "" ? [] : text.replace(/\n$/, "").split("\n");
    return { lines: lines, error: error };
  }

  var api = { run: run };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  else root.MiniPython = api;
})(this);
