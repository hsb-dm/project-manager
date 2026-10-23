// The Indonesian dictionary out of the served page (Oct 2026, performance stage 3).
// UI_ID, the English -> Indonesian dictionary tr() reads, is written in the files that use it: core.js starts it
// (var UI_ID={...}) and some 130 blocks in 45 files add to it as the page loads. That is about 350 KB the served page
// carried for everyone, though only someone reading Indonesian needs it. The build takes every block out of the code
// it bundles and writes what they add up to as one file, /assets/i18n-id.<hash>.json, which the page asks for only
// when Indonesian is needed (src/core.js ZC_I18N, src/i18n.js zcI18nLoad). src/ keeps every block where it is, so a
// test that loads a file as written has its words, and the standalone file carries the dictionary inside.
//
// The blocks this takes, and nothing else:
// - var UI_ID={...}: the dictionary's start (src/core.js). It becomes var UI_ID=ZC_I18N.lazy();
// - Object.assign(UI_ID,{...}): adds, a later block winning over an earlier one. It becomes void 0;
// - a small function called at once with the words as an object, whose body writes UI_ID, such as
//   (function(d){ ... if(!(k in UI_ID)) UI_ID[k]=d[k] ... })({...}): most add only what is not there yet (the first
//   block wins), one adds the engine's sentences by their key (src/scoring-panel.js). It becomes void 0, or, when
//   its value is kept (var SC_T=(function(t){ ... })({...}), src/scoring-settings.js), var SC_T=<that value as JSON>.
// Each must run as the page loads: at the top of its script, or at the own level of a function called at once there
// (a module's (function(){ ... })()). The build stops on one it cannot place, and on anything left that writes to
// UI_ID; reading it (tr(), localizeVisibleText) is what the rest of the code does.
//
// What they add up to is found by running them, in the page's order, in a sandbox that holds UI_ID and the shared
// code (ScoringEngine, for the sentences): the page's own semantics, whichever rule each block follows, and the keys
// in the page's order. A key given different words by two blocks, or twice in one object literal, is a conflict: the
// page would keep what the last Object.assign, or the first block that only adds, gave it, and silently drop the rest.
// conflicts() lists them; build.js stops on any (Oct 2026: the 224 there were are settled to the terms of
// docs/GLOSSARY-ID.md), and node build.js --i18n-conflicts lists them all.
"use strict";
const vm = require("vm");
const { stripJs } = require("./build-strip");

// the tokens of a script, with each bracket's partner and the bracket around every token
function tokens(src) {
  const list = [], open = [];
  stripJs(src, (t, at, v) => {
    const tok = { t, at, v, k: list.length, parent: open.length ? open[open.length - 1] : -1 };
    if (t === "open") open.push(tok.k);
    else if (t === "close") { const o = open.pop(); if (o != null) { list[o].close = tok.k; tok.open = o; tok.parent = list[o].parent; } }
    list.push(tok);
  });
  return list;
}
const isP = (tok, v) => !!tok && (tok.t === "punc" || tok.t === "open" || tok.t === "close") && tok.v === v;
const isName = (tok, v) => !!tok && tok.t === "name" && (v === undefined || tok.v === v);
const isOpen = (tok, v) => !!tok && tok.t === "open" && tok.v === v && tok.close != null;

// the { of `function name(...) {`: the function token, or null
function fnOfBody(T, b) {
  const close = T[b - 1];
  if (!close || close.t !== "close" || close.v !== "(") return null;
  let f = T[close.open - 1];
  if (isName(f) && f.v !== "function" && isName(T[close.open - 2], "function")) f = T[close.open - 2];
  return isName(f, "function") ? f : null;
}
// a function called at once, (function(){...})(...) or (function(){...}(...)): the tokens of its whole expression and
// of its arguments' parentheses, or null
function iifeOf(T, b) {
  const f = fnOfBody(T, b); if (!f) return null;
  const wrap = T[f.k - 1]; if (!isOpen(wrap, "(")) return null;
  const after = T[T[b].close + 1];
  if (after && after.t === "close" && after.k === wrap.close && isOpen(T[wrap.close + 1], "(")) return { from: wrap.k, to: T[wrap.close + 1].close, args: wrap.close + 1 };
  if (isOpen(after, "(") && T[after.close + 1] && T[after.close + 1].k === wrap.close) return { from: wrap.k, to: wrap.close, args: after.k };
  return null;
}
// runs as the script loads: at its top, or at the own level of a function called at once that does
function atLoad(T, parent) {
  while (parent !== -1) {
    if (T[parent].v !== "{") return false;
    const call = iifeOf(T, parent); if (!call) return false;
    parent = T[call.from].parent;
  }
  return true;
}
// UI_ID written at token k: UI_ID=, UI_ID[...]=, UI_ID.x=, ++ / -- / op=, Object.assign(UI_ID, delete UI_ID[...]
function writesAt(T, k) {
  const p = T[k - 1], n = T[k + 1];
  if (isP(p, "(") && isName(T[k - 2], "assign")) return true;
  if (isName(p, "delete")) return true;
  let j = k + 1;
  if (isP(n, "[")) { let depth = 0; for (; j < T.length; j++) { if (isP(T[j], "[")) depth++; else if (isP(T[j], "]") && --depth === 0) break; } j++; }
  else if (isP(n, ".")) j = k + 3;
  const a = T[j], b = T[j + 1];
  if (isP(a, "++") || isP(a, "--")) return true;
  return !!a && a.t === "punc" && (a.v === "=" ? !isP(b, "=") : /^[-+*/%&|^]$/.test(a.v) && isP(b, "=") && !isP(T[j + 2], "="));
}

const SMALL = 600;   /* the body of a function that only fills UI_ID: a module doing more than that is never taken for one */
// the dictionary statements of one script: [{ kind, name, from, to (character offsets) }]
function statements(src, file, given) {
  const T = given || tokens(src), found = [];
  const taken = k => found.some(s => k >= s.a && k <= s.b);
  for (const tok of T) {
    if (!isName(tok, "UI_ID") || taken(tok.k)) continue;
    const p1 = T[tok.k - 1], n1 = T[tok.k + 1], n2 = T[tok.k + 2];
    let s = null;
    if (isName(p1, "var") && isP(n1, "=") && isOpen(n2, "{")) s = { kind: "var", a: n2.k, b: n2.close, start: p1.k };
    else if (isOpen(p1, "(") && isName(T[tok.k - 2], "assign") && isP(T[tok.k - 3], ".") && isName(T[tok.k - 4], "Object")) s = { kind: "assign", a: tok.k - 4, b: p1.close, start: tok.k - 4 };
    else {
      /* the innermost function around it that is called at once, with the words as an object, and writes UI_ID */
      for (let up = tok.parent; up !== -1 && !s; up = T[up].parent) {
        if (T[up].v !== "{" || !fnOfBody(T, up)) continue;
        const call = iifeOf(T, up);
        if (!call || T[T[up].close].at - T[up].at >= SMALL) continue;
        let words = false, writes = false;
        for (let j = call.args + 1; j < T[call.args].close; j++) if (isOpen(T[j], "{") && T[j].parent === call.args) words = true;
        for (let j = up + 1; j < T[up].close; j++) if (isName(T[j], "UI_ID") && writesAt(T, j)) writes = true;
        if (!words || !writes) continue;
        const v1 = T[call.from - 1], v2 = T[call.from - 2], v3 = T[call.from - 3];
        if (isP(v1, "=") && isName(v2) && isName(v3, "var")) s = { kind: "value", a: call.from, b: call.to, start: v3.k, name: v2.v };
        else s = { kind: "call", a: call.from, b: call.to, start: call.from };
      }
    }
    if (!s) continue;
    if (!atLoad(T, T[s.start].parent)) throw new Error(file + ": a UI_ID block the build cannot place (it does not run as the page loads), near: " + src.slice(T[s.a].at, T[s.a].at + 160));
    found.push(s);
  }
  return found.map(s => ({ kind: s.kind, name: s.name, from: T[s.a].at, to: T[s.b].at + 1 })).sort((x, y) => x.from - y.from);
}
// what is left of a script must not write to UI_ID — but for the line that starts it (var UI_ID=ZC_I18N.lazy()) and
// the functions that add the dictionary when it arrives (src/i18n.js zcI18n...)
function writesLeft(src, file) {
  const T = tokens(src);
  const lazy = k => isName(T[k - 1], "var") && isP(T[k + 1], "=") && isName(T[k + 2], "ZC_I18N") && isP(T[k + 3], ".") && isName(T[k + 4], "lazy");
  const loader = k => { for (let up = T[k].parent; up !== -1; up = T[up].parent) { const f = T[up].v === "{" && fnOfBody(T, up); if (f && isName(T[f.k + 1]) && /^zcI18n/.test(T[f.k + 1].v)) return true; } return false; };
  for (const tok of T) if (isName(tok, "UI_ID") && !lazy(tok.k) && writesAt(T, tok.k) && !loader(tok.k)) throw new Error(file + ": something still writes to UI_ID, which the served page loads apart (build-i18n.js): " + src.slice(Math.max(0, tok.at - 80), tok.at + 80));
}
// var NAME=<value>; earlier in the same script, as the page loads it: the value's text, or null. A block may name its
// keys by such a constant (src/scoring-kinds.js: [SK_INTRO]:"..."), so the sandbox is given it first.
function constantBefore(src, name, before) {
  const T = tokens(src);
  for (const tok of T) {
    if (tok.at >= before) break;
    if (!isName(tok, name) || !isName(T[tok.k - 1], "var") && !isP(T[tok.k - 1], ",") || !isP(T[tok.k + 1], "=") || !atLoad(T, tok.parent)) continue;
    let j = tok.k + 2; const from = T[j] && T[j].at;
    for (; j < T.length; j++) { const x = T[j]; if (x.parent === tok.parent && x.t !== "close" && (isP(x, ";") || isP(x, ","))) break; if (x.t === "open" && x.close != null) j = x.close; }
    if (j >= T.length || from == null) return null;
    return src.slice(from, T[j].at);
  }
  return null;
}
// runs text in the sandbox, first giving it the constants of its script it names
function runWith(ctx, text, src, at, file) {
  for (let tries = 0; ; tries++) {
    try { return vm.runInContext(text, ctx); } catch (e) {
      const m = e && e.name === "ReferenceError" && /^(\w+) is not defined/.exec(e.message), init = m && tries < 20 ? constantBefore(src, m[1], at) : null;
      if (init == null) throw new Error(file + ": a UI_ID block could not be read on its own (" + (e && e.message) + "), near: " + src.slice(at, at + 160));
      vm.runInContext("var " + m[1] + "=(" + init + ");", ctx);
    }
  }
}
// a string literal's value: most are JSON already; the rest ('...', \x..) are read by one shared sandbox
let literalCtx = null;
function literal(text) {
  if (text.charAt(0) === '"') try { return JSON.parse(text); } catch (e) { /* a JavaScript-only escape */ }
  return vm.runInContext(text, literalCtx || (literalCtx = vm.createContext({})));
}
// The keys one object literal of a block gives twice ("Save":"Simpan", … "Save":"Simpan dulu"): the language keeps the
// second without a word, and the sandbox never sees the first. [{ key, values }] for every key written twice or more
// with different words; T: the script's tokens, from/to: the block's characters.
function givenTwice(T, code, from, to) {
  const seen = new Map();   /* "<object>\u0001<key>" -> [values] */
  let lo = 0, hi = T.length;   /* the block's first token: they are in the order of the text */
  while (lo < hi) { const mid = (lo + hi) >> 1; if (T[mid].at < from) lo = mid + 1; else hi = mid; }
  for (let i = lo; i < T.length && T[i].at < to; i++) {
    const tok = T[i];
    if (tok.t !== "str" && tok.t !== "name") continue;
    const p = T[tok.k - 1], c = T[tok.k + 1], v = T[tok.k + 2], n = T[tok.k + 3];
    if (!p || !(isOpen(p, "{") || isP(p, ",")) || !isP(c, ":") || !v || v.t !== "str" || !n || !(isP(n, ",") || n.t === "close")) continue;
    if (tok.parent < 0 || T[tok.parent].v !== "{") continue;
    const key = tok.t === "str" ? literal(code.slice(tok.at, tok.v)) : tok.v, value = literal(code.slice(v.at, v.v));
    const id = tok.parent + "\u0001" + key, l = seen.get(id) || [];
    l.push(value); seen.set(id, l);
  }
  const out = [];
  for (const [id, values] of seen) if (new Set(values).size > 1) out.push({ key: id.slice(id.indexOf("\u0001") + 1), values });
  return out;
}
// strings, numbers, booleans, null, arrays and plain objects only
function plain(v) {
  if (v === null || typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && isFinite(v))) return true;
  if (Array.isArray(v)) return v.every(plain);
  if (typeof v !== "object" || Object.getPrototypeOf(Object.getPrototypeOf(v) || {}) !== null) return false;
  return Object.keys(v).every(k => plain(v[k]));
}

// blocks: [{ file, code }] in the page's order (comments already out); shared: the shared scripts, run first in the
// sandbox as in the page. Returns the blocks' code without the dictionary, the dictionary, and every key's proposals.
function extract(blocks, shared) {
  const ctx = vm.createContext({});
  (shared || []).forEach(s => vm.runInContext(s, ctx));
  vm.runInContext("var UI_ID;", ctx);
  const proposals = new Map();   /* key -> [{ file, value }], every block that gives it words */
  const propose = (file, obj) => { Object.keys(obj).forEach(k => { const l = proposals.get(k) || []; l.push({ file, value: obj[k] }); proposals.set(k, l); }); };
  const twice = [];   /* [{ file, key, values }]: a key one object literal gives twice, with different words */
  const out = blocks.map(b => {
    const T = tokens(b.code), list = statements(b.code, b.file, T);
    let code = b.code;
    for (const s of list) {
      givenTwice(T, b.code, s.from, s.to).forEach(x => twice.push({ file: b.file, key: x.key, values: x.values }));
      const text = b.code.slice(s.from, s.to);
      /* what it gives words to, on its own */
      const alone = runWith(ctx, "(function(UI_ID){ var __v=(" + text + "); return { add: UI_ID, value: __v }; })(" + (s.kind === "var" ? "undefined" : "{}") + ")", b.code, s.from, b.file);
      propose(b.file, s.kind === "var" ? alone.value : alone.add);
      /* and what it does to the dictionary so far, as in the page */
      if (s.kind === "var") vm.runInContext("UI_ID=(" + text + ");", ctx);
      else s.value = vm.runInContext("(" + text + ")", ctx);
      if (s.kind === "value" && !plain(s.value)) throw new Error(b.file + ": var " + s.name + " holds more than plain data");
    }
    for (const s of list.slice().reverse()) {
      const to = s.kind === "var" ? "ZC_I18N.lazy()" : s.kind === "value" ? JSON.stringify(s.value).replace(/<\//g, "<\\/") : "void 0";
      code = code.slice(0, s.from) + to + code.slice(s.to);
    }
    writesLeft(code, b.file);
    return { file: b.file, code, taken: list.length };
  });
  const dict = vm.runInContext("UI_ID", ctx);
  if (!dict || typeof dict !== "object") throw new Error("build-i18n.js: no var UI_ID={...} found");
  if (Object.prototype.hasOwnProperty.call(dict, "__proto__")) throw new Error("build-i18n.js: a UI_ID key may not be __proto__");
  const json = JSON.stringify(dict);
  return { blocks: out, dict: JSON.parse(json), json, proposals, twice, statements: out.reduce((a, b) => a + b.taken, 0), files: new Set(out.filter(b => b.taken).map(b => b.file)).size };
}
// keys given different words by more than one block, or twice in one: what each file gave, and what the page keeps.
// The build stops on any (build.js): one English text has one Indonesian wording, the one docs/GLOSSARY-ID.md gives.
function conflicts(result) {
  const list = [];
  for (const [key, l] of result.proposals) if (new Set(l.map(x => x.value)).size > 1) list.push({ key, kept: result.dict[key], given: l });
  for (const t of result.twice || []) list.push({ key: t.key, kept: t.values[t.values.length - 1], given: t.values.map(value => ({ file: t.file + " (twice in one block)", value })), twice: true });
  return list;
}
// the message the build stops with: what clashes, and how to settle it
function conflictMessage(list, more) {
  const show = list.slice(0, more || 8).map(c => "  " + JSON.stringify(c.key) + "\n" + c.given.map(g => "      " + g.file + ": " + JSON.stringify(g.value)).join("\n")).join("\n");
  return "build.js: " + list.length + " English text" + (list.length === 1 ? " has" : "s have") + " different Indonesian words in the UI_ID blocks, so the page would show one of them and the other block would be ignored:\n"
    + show + (list.length > (more || 8) ? "\n  … and " + (list.length - (more || 8)) + " more (node build.js --i18n-conflicts lists them all)" : "") + "\n"
    + "Fix: give the English text the same Indonesian words in every block that has it (docs/GLOSSARY-ID.md has the standard terms), or keep it in one block only. Never change the English: it is the key.";
}
module.exports = { extract, conflicts, conflictMessage, statements, tokens };
