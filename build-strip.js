// Comments out of the served page (Oct 2026, performance stage 2).
// About a tenth of the page build.js writes was comments, in its CSS and its JavaScript: some 350 KB of the 3.6 MB,
// about 110 KB of what a visit downloads compressed. They are for the people who read src/, not for the browser,
// so the build leaves them out of what it writes. src/ keeps every one of them.
//
// What is removed, and nothing else:
// - in a <script> (JavaScript): // to the end of the line, and /* to the next */. Strings ('...', "..."), template
//   literals (`...${ ... }...`, nested to any depth) and regular expressions (/.../flags, with [classes]) are read
//   as what they are, so "image/*", "*/*" or /https?:\/\/[^/]*/ are never mistaken for a comment;
// - in a <style> (CSS): /* to the next */, outside strings and url(...);
// - the spaces before a comment, and a line that held only a comment.
// A comment is replaced by what keeps the code the same: nothing where a space or a line break is already there;
// in JavaScript, which reads a comment as a space, a space between two pieces that would otherwise run together
// (a/**/b is "a b", a+/**/+b is "a+ +b", never "a++b"), and a line break for a /* */ that spanned lines, as a line
// break can matter there (return, a++, automatic semicolons); in CSS, which reads a comment as nothing that still
// keeps its two sides apart, the space that was before it, or the shortest comment, /**/, between two pieces that
// would otherwise run together (.a/**/.b stays .a.b, 1px/**/solid never becomes 1pxsolid).
// Not touched: HTML comments, scripts that are not JavaScript (type="application/json" ...), CSS written inside a
// JavaScript string, inline event handlers, and whatever build.js does not hand to stripHtml (shared/*).
//
// Telling a regular expression from a division (both start with /) follows the rule tokenizers use: a / starts a
// regular expression where a value cannot end - at the start, after an operator or punctuator such as ( [ { , ; = :,
// after a keyword such as return or typeof, after the ) of if (...), while (...), for (...) and with (...), and
// after a } - and is a division after a name, a number, a string, a template, a regular expression, a ] or the )
// of an expression. tests/build-strip.test.js holds the cases; build.js compiles every script it writes.
"use strict";

const LS = String.fromCharCode(0x2028), PS = String.fromCharCode(0x2029), NBSP = String.fromCharCode(0xa0), BOM = String.fromCharCode(0xfeff);
const LT = c => c === "\n" || c === "\r" || c === LS || c === PS;
const WS = c => c === " " || c === "\t" || c === "\f" || c === "\v" || c === NBSP || c === BOM;
const hasLineBreak = s => { for (let k = 0; k < s.length; k++) if (LT(s.charAt(k))) return true; return false; };
const idStart = k => (k >= 65 && k <= 90) || (k >= 97 && k <= 122) || k === 95 || k === 36 || k === 92 || k >= 128;
const idPart = k => idStart(k) || (k >= 48 && k <= 57);
const digit = k => k >= 48 && k <= 57;
const KEYWORD_BEFORE_EXPR = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await", "extends"]);
const PAREN_KEYWORDS = new Set(["if", "while", "for", "with"]);

// The output so far, as pieces. Dropping a comment takes back the spaces before it.
class Out {
  constructor() { this.parts = []; }
  push(s) { if (s) this.parts.push(s); }
  str() { return this.parts.join(""); }
  last() { for (let k = this.parts.length - 1; k >= 0; k--) { const p = this.parts[k]; if (p) return p.charAt(p.length - 1); } return ""; }
  // the spaces and tabs at the end, taken back; whether there were any
  trimSpaces() {
    let any = false;
    while (this.parts.length) {
      const p = this.parts[this.parts.length - 1], t = p.replace(/[ \t\f\v]+$/, "");
      if (t.length === p.length) return any;
      any = true;
      if (t) { this.parts[this.parts.length - 1] = t; return any; }
      this.parts.pop();
    }
    return any;
  }
  // nothing on this line yet (or nothing at all): a token boundary either way
  atLineStart() { const c = this.last(); return c === "" || LT(c); }
}

// Where a comment was, from `end` on in the source: what goes in its place. The spaces before it are already taken
// back (spaceBefore: there were some).
// - JavaScript reads a comment as a space, or as a line break when it spans lines: a space where two pieces would
//   otherwise run together, a line break where there is none.
// - CSS reads a comment as nothing, but the pieces either side stay apart (a/**/b is a and b, not ab): a space
//   where there was one, and where the two would run together the shortest comment, /**/, to keep them apart.
function afterComment(out, src, end, spannedLines, css, spaceBefore) {
  let j = end; while (j < src.length && WS(src.charAt(j))) j++;
  const next = src.charAt(j);
  if (out.atLineStart()) {
    // the comment began its line: the spaces after it go, and the line too if nothing else was on it
    if (next === "\r" && src.charAt(j + 1) === "\n") return j + 2;
    return LT(next) ? j + 1 : j;
  }
  if (spannedLines && !css) { if (!LT(next) && j < src.length) out.push("\n"); return j; }
  if (j > end || LT(next) || !next) return end;   // a space or a line break follows anyway
  const prev = out.last();
  if (css) { if (spaceBefore) out.push(" "); else if (cssWord(prev) && cssWord(next)) out.push("/**/"); }
  else if (jsNeedsSpace(prev, next)) out.push(" ");
  return end;
}
const jsNeedsSpace = (a, b) => !/[(){}\[\];,]/.test(a) && !/[(){}\[\];,]/.test(b);
const cssWord = c => !!c && (idPart(c.charCodeAt(0)) || c === "-" || c === "." || c === "#" || c === "%" || c === "+");

// ---------- JavaScript ----------
function stripJs(src) {
  const out = new Out(), n = src.length;
  let i = 0;
  // the last thing read that is not a space or a comment: whether a / here starts a regular expression
  let prev = { t: "start", v: "" };
  // one entry per open {, ${ or (; a ( remembers whether it is the head of if / while / for / with
  const stack = [];
  const regexAllowed = () => {
    switch (prev.t) {
      case "start": return true;
      case "name": return !prev.prop && KEYWORD_BEFORE_EXPR.has(prev.v);
      case "num": case "str": case "tpl": case "regex": return false;
      default:
        if (prev.v === "]" || prev.v === "++" || prev.v === "--") return false;
        if (prev.v === ")") return !!prev.head;
        return true;
    }
  };
  const readString = q => {
    let j = i + 1;
    while (j < n) {
      const c = src.charAt(j);
      if (c === "\\") { j += src.charAt(j + 1) === "\r" && src.charAt(j + 2) === "\n" ? 3 : 2; continue; }
      j++;
      if (c === q) break;
      if (c === "\n" || c === "\r") { j--; break; }   // not JavaScript; stop at the line as a browser would
    }
    out.push(src.slice(i, j)); i = j; prev = { t: "str" };
  };
  // template text from i (after the ` or the } of a ${ ... }) to the closing ` or the next ${
  const readTemplate = () => {
    let j = i;
    while (j < n) {
      const c = src.charAt(j);
      if (c === "\\") { j += 2; continue; }
      if (c === "`") { j++; out.push(src.slice(i, j)); i = j; prev = { t: "tpl" }; return; }
      if (c === "$" && src.charAt(j + 1) === "{") { j += 2; out.push(src.slice(i, j)); i = j; stack.push("${"); prev = { t: "punc", v: "${" }; return; }
      j++;
    }
    out.push(src.slice(i, j)); i = j;
  };
  const readRegex = () => {
    let j = i + 1, cls = false;
    while (j < n) {
      const c = src.charAt(j);
      if (c === "\\") { j += 2; continue; }
      if (LT(c)) break;
      j++;
      if (cls) { if (c === "]") cls = false; } else if (c === "[") cls = true; else if (c === "/") break;
    }
    while (j < n && idPart(src.charCodeAt(j))) j++;   // flags
    out.push(src.slice(i, j)); i = j; prev = { t: "regex" };
  };
  while (i < n) {
    const c = src.charAt(i), k = src.charCodeAt(i), d = src.charAt(i + 1);
    if (WS(c) || LT(c)) { let j = i + 1; while (j < n && (WS(src.charAt(j)) || LT(src.charAt(j)))) j++; out.push(src.slice(i, j)); i = j; continue; }
    if (c === "/" && d === "/") {
      let j = i + 2; while (j < n && !LT(src.charAt(j))) j++;
      out.trimSpaces();
      if (out.atLineStart()) { if (src.charAt(j) === "\r" && src.charAt(j + 1) === "\n") j += 2; else if (j < n) j++; }   // the line held only this
      i = j; continue;
    }
    if (c === "/" && d === "*") {
      const e = src.indexOf("*/", i + 2), end = e < 0 ? n : e + 2;
      const spaceBefore = out.trimSpaces();
      i = afterComment(out, src, end, hasLineBreak(src.slice(i + 2, end)), false, spaceBefore);
      continue;
    }
    if (c === "'" || c === '"') { readString(c); continue; }
    if (c === "`") { out.push(c); i++; readTemplate(); continue; }
    if (c === "/") {
      if (regexAllowed()) { readRegex(); continue; }
      const op = d === "=" ? "/=" : "/"; out.push(op); i += op.length; prev = { t: "punc", v: op }; continue;
    }
    if (idStart(k)) {
      let j = i + 1; while (j < n && idPart(src.charCodeAt(j))) j++;
      const word = src.slice(i, j); out.push(word); i = j;
      prev = { t: "name", v: word, prop: prev.t === "punc" && (prev.v === "." || prev.v === "?.") };
      continue;
    }
    if (digit(k) || (c === "." && digit(src.charCodeAt(i + 1)))) {
      let j = i + 1;
      while (j < n) {
        const x = src.charAt(j);
        if (/[\w.]/.test(x)) { j++; continue; }
        if ((x === "+" || x === "-") && /[eE]/.test(src.charAt(j - 1)) && !/^0[xX]/.test(src.slice(i, j))) { j++; continue; }
        break;
      }
      out.push(src.slice(i, j)); i = j; prev = { t: "num" }; continue;
    }
    if (c === "{") { stack.push("{"); out.push(c); i++; prev = { t: "punc", v: "{" }; continue; }
    if (c === "}") { const top = stack.pop(); out.push(c); i++; if (top === "${") readTemplate(); else prev = { t: "punc", v: "}" }; continue; }
    if (c === "(") { stack.push(prev.t === "name" && !prev.prop && PAREN_KEYWORDS.has(prev.v) ? "(head" : "("); out.push(c); i++; prev = { t: "punc", v: "(" }; continue; }
    if (c === ")") {
      let top = ""; while (stack.length) { top = stack.pop(); if (top.charAt(0) === "(") break; }   // (anything left open inside is not JavaScript)
      out.push(c); i++; prev = { t: "punc", v: ")", head: top === "(head" }; continue;
    }
    if ((c === "+" || c === "-") && d === c) { out.push(c + d); i += 2; prev = { t: "punc", v: c + d }; continue; }
    if (c === "?" && d === "." && !digit(src.charCodeAt(i + 2))) { out.push("?."); i += 2; prev = { t: "punc", v: "?." }; continue; }
    out.push(c); i++; prev = { t: "punc", v: c };
  }
  return out.str();
}

// ---------- CSS ----------
function stripCss(src) {
  const out = new Out(), n = src.length;
  let i = 0, from = 0;
  const flush = () => { if (i > from) out.push(src.slice(from, i)); };
  while (i < n) {
    const c = src.charAt(i);
    if (c === "/" && src.charAt(i + 1) === "*") {
      flush();
      const e = src.indexOf("*/", i + 2), end = e < 0 ? n : e + 2;
      const spaceBefore = out.trimSpaces();
      i = from = afterComment(out, src, end, false, true, spaceBefore);
      continue;
    }
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) { const x = src.charAt(j); if (x === "\\") { j += 2; continue; } j++; if (x === c) break; if (x === "\n") { j--; break; } }
      i = j; continue;
    }
    // url( without quotes: up to the ) it is the address, a "/*" in it too
    if ((c === "u" || c === "U") && /^url\(/i.test(src.slice(i, i + 4)) && !/[\w-]/.test(src.charAt(i - 1))) {
      let j = i + 4; while (j < n && WS(src.charAt(j))) j++;
      if (src.charAt(j) !== "'" && src.charAt(j) !== '"') { while (j < n) { const x = src.charAt(j); if (x === "\\") { j += 2; continue; } j++; if (x === ")") break; } }
      i = j; continue;
    }
    if (c === "\\") { i += 2; continue; }
    i++;
  }
  flush();
  return out.str();
}

// ---------- the page: the <script> and <style> elements in its HTML ----------
const JS_TYPES = /^(|text\/javascript|application\/javascript|module)$/i;
function stripHtml(html) {
  const out = [], lower = html.toLowerCase(), re = /<(script|style)\b([^>]*)>/gi;
  let i = 0, m;
  while ((m = re.exec(html))) {
    const tag = m[1].toLowerCase(), open = m.index + m[0].length, close = lower.indexOf("</" + tag, open);
    if (close < 0) break;
    const body = html.slice(open, close), type = ((/\btype\s*=\s*["']?([^"'\s>]*)/i.exec(m[2]) || [])[1] || "").trim();
    out.push(html.slice(i, open));
    out.push(tag === "style" ? stripCss(body) : JS_TYPES.test(type) && !/\bsrc\s*=/i.test(m[2]) ? stripJs(body) : body);
    i = close; re.lastIndex = close;
  }
  out.push(html.slice(i));
  return out.join("");
}

module.exports = { stripJs, stripCss, stripHtml };
