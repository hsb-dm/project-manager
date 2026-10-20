/* SMART SCORING — THE DOCUMENTS A BRIEF POINTS TO, READ FOR THE AI (Oct 2026). docs/SMART-SCORING.md §5.4.1

   What it does. When an admin turns on Settings → Smart Scoring → "Let the AI read the brief's documents"
   (settings.ai.readDocs, off by default) and a task does not opt out (meta.aiReadDocs === false), an AI suggestion
   for the task's scores (server/scoring-ai.js) also gets the text of the documents its brief links to or has
   attached — a Google Doc with the campaign brief, a deck, a sheet of sizes — so the estimate rests on what the work
   really is. Only for Smart Scoring's suggestions: AI Intelligence and the brief refiner never come here.

   What may be read, and nothing else.
   - Google Docs, Slides and Sheets and Google Drive files shared "anyone with the link": found as https links in the
     brief's fields, the description and the task's attachments, on docs.google.com/document|presentation|
     spreadsheets/d/<id> and drive.google.com/file/d/<id> or /open?id=<id>. Only the id is taken from the link; the
     address fetched is built here (a Doc as text, Slides as text, a Sheet's first sheet as CSV, a Drive file through
     Drive's download), never the one typed. Redirects are followed by hand, at most five, only to docs.google.com,
     drive.google.com, drive.usercontent.google.com (where Drive's downloads go) and *.googleusercontent.com, always
     https, never with a user name, a port or an address as a number; a sign-in page (a redirect to
     accounts.google.com, or a web page instead of the export) means the document is not shared publicly. 10 seconds
     and 5 MB per document, counted as it arrives — the download stops at the limit. No cookie or key is ever sent.
   - Files attached to the task and stored on this server (server/filestore.js, "This server" storage): .txt, .md,
     .csv and .tsv as text; .docx (word/document.xml) and .pptx (ppt/slides/slideN.xml, in order) through a small zip
     reader — the central directory only, stored or deflated entries only, each entry and the whole read held to a
     size (a zip bomb stops at the limit, a size that lies is refused); .pdf with a basic text extraction — the page
     tree in order, FlateDecode streams, the Tj, TJ, ' and " operators, fonts' ToUnicode maps — which gives up
     ("unsupported", no_text) on a scanned PDF or one whose text cannot be told apart from noise. 15 MB per file.
     Files kept on Google Drive are read through their link like any Drive file. Anything else (.doc, .xlsx, …) is
     listed as unsupported; pictures, video and design files are not documents and are not listed.

   How much. At most 5 documents per ask (the rest are "limit"); their text has links and e-mail addresses taken
   out, markup dropped and spaces collapsed; the workspace's budget (settings.ai.docsChars: 5 000, 15 000 or 30 000
   characters in all) is shared fairly — each document gets an even share, and what a short one does not use goes to
   the longer ones; what was cut says so. Text read is kept in memory for 10 minutes per document (a Google file with
   its ETag or Last-Modified, asked again with them after that; a stored file by its content hash), a failure for one
   minute, so asking again does not fetch again. The text itself is never stored: a run records each document's
   title, kind, status and characters sent.

   module.exports = { findRefs, plan, fit, outDoc, createReader, … } — pure helpers and a reader whose fetch is
   injectable (tests use a fake Google). */
const zlib = require("zlib"), util = require("util"), crypto = require("crypto"), fs = require("fs");
const filestore = require("./filestore");
const inflateRaw = util.promisify(zlib.inflateRaw), inflate = util.promisify(zlib.inflate);

const LIMITS = Object.freeze({
  docs: 5, found: 20, links: 60,
  budgets: Object.freeze([5000, 15000, 30000]), budget: 15000,
  fetchBytes: 5 * 1024 * 1024, fileBytes: 15 * 1024 * 1024, timeoutMs: 10000, redirects: 5,
  ttlMs: 10 * 60 * 1000, failTtlMs: 60 * 1000, cacheEntries: 100,
  /* the text kept of one document before it is cleaned and shared out: twice the largest budget */
  rawChars: 60000,
  zipEntries: 5000, zipEntryBytes: 10 * 1024 * 1024, zipTotalBytes: 40 * 1024 * 1024, slides: 300,
  pdfObjects: 200000, pdfPages: 2000, pdfStreamBytes: 8 * 1024 * 1024, pdfInflateBytes: 40 * 1024 * 1024
});
const KIND_NAME = Object.freeze({ gdoc: "Google Docs document", gslides: "Google Slides presentation", gsheet: "Google Sheets spreadsheet (its first sheet)", gdrive: "file on Google Drive", file: "file attached to the task" });
const PRODUCT = Object.freeze({ gdoc: "Google Docs", gslides: "Google Slides", gsheet: "Google Sheets", gdrive: "Google Drive" });
const TEXT_EXT = new Set(["txt", "md", "markdown", "csv", "tsv"]);
const READ_EXT = new Set(["txt", "md", "markdown", "csv", "tsv", "docx", "pptx", "pdf"]);
const OTHER_DOC_EXT = new Set(["doc", "xls", "xlsx", "ppt", "rtf", "odt", "ods", "odp", "key", "pages", "numbers"]);
const NOT_DOC_EXT = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "heic", "tif", "tiff", "bmp", "mp4", "m4v", "mov", "webm", "avi", "mkv", "mp3", "wav", "m4a", "aac", "psd", "ai", "eps", "indd", "sketch", "fig", "aep", "prproj", "zip", "rar", "7z", "ttf", "otf", "woff", "woff2"]);
const STATUSES = ["ready", "read", "not_public", "too_large", "unsupported", "error", "limit"];

const isObj = v => !!v && typeof v === "object" && !Array.isArray(v);
const extOf = name => { const m = /\.([a-z0-9]{1,10})$/i.exec(String(name || "").trim()); return m ? m[1].toLowerCase() : ""; };
const sha = s => crypto.createHash("sha256").update(String(s)).digest("hex").slice(0, 16);

/* ---------- the text: links and e-mail addresses out, markup dropped, spaces collapsed ----------
   Every pattern has a bounded length, so a hostile document cannot make the server spin (a quadratic regex on 60 000
   characters of "[[[[" would). */
/* control characters, soft hyphens, zero-width and direction marks, byte-order marks and replacement characters, built
   from their codes so that no invisible character sits in this file */
const cc = c => String.fromCharCode(c), span = (x, y) => cc(x) + "-" + cc(y);
const CTRL = new RegExp("[" + span(0, 8) + cc(11) + cc(12) + span(14, 31) + span(0x7f, 0x9f) + cc(0xad) + span(0x200b, 0x200f) + span(0x202a, 0x202e) + span(0x2060, 0x2069) + cc(0xfeff) + cc(0xfffd) + "]", "g");
/* spaces of every width, collapsed to one */
const SPACES = new RegExp("[ " + cc(9) + cc(12) + cc(11) + cc(0xa0) + cc(0x1680) + span(0x2000, 0x200a) + cc(0x202f) + cc(0x205f) + cc(0x3000) + "]+", "g");
const asLink = m => { const tail = m.match(/[.,;:!?)\]]+$/); return "[link]" + (tail ? tail[0] : ""); };
function cleanDoc(raw) {
  let s = typeof raw === "string" ? raw : "", cut = false;
  if (s.length > LIMITS.rawChars) { s = s.slice(0, LIMITS.rawChars); cut = true; }
  s = s.replace(/\r\n?/g, "\n").replace(CTRL, "")
    .replace(/<[^<>\n]{0,300}>/g, " ")
    .replace(/\[([^[\]\n]{0,300})\]\(([^()\s]{0,2000})\)/g, "$1")
    .replace(/[^\s@<>()[\]"',;:]{1,64}@[^\s@<>()[\]"',;:]{1,255}\.[a-z]{2,24}/gi, "[e-mail]")
    .replace(/\b[a-z][a-z0-9+.-]{0,20}:\/\/[^\s<>"'`]{1,2000}/gi, asLink)
    .replace(/\bwww\.[^\s<>"'`]{1,2000}/gi, asLink)
    .replace(/\b(?:[a-z0-9-]{1,63}\.){1,8}[a-z]{2,24}\/[^\s<>"'`]{0,2000}/gi, asLink)
    .replace(/[<>]/g, " ")
    .replace(SPACES, " ")
    .replace(/ *\n */g, "\n").replace(/\n{2,}/g, "\n").trim();
  return { text: s, cut };
}
/* a document's name: one line, no markup, no link, at most 100 characters */
function cleanTitle(v) {
  const s = cleanDoc(typeof v === "string" ? v.slice(0, 600) : "").text.replace(/\n/g, " ").replace(/["`]/g, "").trim();
  if (!s || /^\[(link|e-mail)\][.,;:!?]*$/.test(s)) return "";
  const c = Array.from(s); return c.length > 100 ? c.slice(0, 99).join("").trim() + "…" : s;
}
const fallbackTitle = r => (r.kind === "file" ? "" : PRODUCT[r.kind] + " · " + String(r.id || "").slice(0, 6));

/* ---------- Google links: the id is all that is taken ---------- */
const GOOGLE_ID = /^[A-Za-z0-9_-]{10,128}$/;
const DOCS_PATH = /^\/(document|presentation|spreadsheets)\/(?:u\/\d{1,2}\/)?d\/([A-Za-z0-9_-]{10,128})(?:\/|$)/;
const DRIVE_PATH = /^\/(?:u\/\d{1,2}\/)?file\/d\/([A-Za-z0-9_-]{10,128})(?:\/|$)/;
const DOCS_KIND = { document: "gdoc", presentation: "gslides", spreadsheets: "gsheet" };
const CANON = { gdoc: "https://docs.google.com/document/d/", gslides: "https://docs.google.com/presentation/d/", gsheet: "https://docs.google.com/spreadsheets/d/", gdrive: "https://drive.google.com/file/d/" };
/* {kind, id, ref} for a link to a Google Doc, Slides, Sheet or Drive file — https, the host itself (no user name, no
   port), the path Google uses; anything else is null */
function parseGoogleUrl(s) {
  if (typeof s !== "string" || !s || s.length > 2048 || !/^https:\/\//i.test(s.trim())) return null;
  let u; try { u = new URL(s.trim()); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const host = u.hostname.toLowerCase();
  let kind = null, id = null, m;
  if (host === "docs.google.com" && (m = DOCS_PATH.exec(u.pathname))) { kind = DOCS_KIND[m[1]]; id = m[2]; }
  else if (host === "drive.google.com") {
    if ((m = DRIVE_PATH.exec(u.pathname))) { kind = "gdrive"; id = m[1]; }
    else if (/^\/open\/?$/.test(u.pathname)) { const q = u.searchParams.get("id"); if (q && GOOGLE_ID.test(q)) { kind = "gdrive"; id = q; } }
  }
  return kind ? { kind, id, ref: CANON[kind] + id } : null;
}
/* the address fetched: built from the id, never the one typed */
function exportUrl(r) {
  const id = encodeURIComponent(r.id);
  if (r.kind === "gdoc") return "https://docs.google.com/document/d/" + id + "/export?format=txt";
  if (r.kind === "gslides") return "https://docs.google.com/presentation/d/" + id + "/export/txt";
  if (r.kind === "gsheet") return "https://docs.google.com/spreadsheets/d/" + id + "/export?format=csv";
  if (r.kind === "gdrive") return "https://drive.google.com/uc?export=download&id=" + id;
  return null;
}
/* where a redirect may lead: Google's own document and download hosts, https, no user name, no port */
function allowedHop(href) {
  let u; try { u = new URL(String(href)); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase();
  if (h === "docs.google.com" || h === "drive.google.com" || h === "drive.usercontent.google.com") return u;
  if (h.length <= 253 && /^[a-z0-9-]+(?:\.[a-z0-9-]+)*\.googleusercontent\.com$/.test(h)) return u;
  return null;
}
/* Google's sign-in: the document is not shared with "anyone with the link" */
function isLogin(u) { const h = u.hostname.toLowerCase(); return h === "accounts.google.com" || (h === "www.google.com" && /^\/(accounts|a\/|servicelogin|signin)/i.test(u.pathname)); }

/* ---------- the documents a task points to (no fetching here) ---------- */
/* link text written [text](address) or <a href="address">text</a> names the document */
function linkTitle(s, i, len) {
  const before = s.slice(Math.max(0, i - 302), i);
  if (before.endsWith("](")) { const o = before.lastIndexOf("[", before.length - 2); if (o >= 0) return before.slice(o + 1, before.length - 2); }
  if (/href\s*=\s*["']?$/i.test(before.slice(-12))) {
    const gt = s.indexOf(">", i + len), end = gt < 0 ? -1 : s.toLowerCase().indexOf("</a>", gt);
    if (gt >= 0 && gt - (i + len) < 400 && end > gt && end - gt < 400) return s.slice(gt + 1, end);
  }
  return "";
}
/* in the order of the brief's fields, the description, then the attachments; each document once; at most 20 listed.
   files: [{id, name, type, source, url}]; isStored(url): the file is one this server stored */
function findRefs(o) {
  o = o || {};
  const out = [], seen = new Set(), add = r => { if (out.length >= LIMITS.found || seen.has(r.key)) return; seen.add(r.key); out.push(r); };
  let looked = 0;
  (Array.isArray(o.texts) ? o.texts : []).forEach(t => {
    const s = typeof t === "string" ? t : Array.isArray(t) ? t.filter(x => typeof x === "string").join(" ") : "";
    const re = /https:\/\/[^\s<>"'`()[\]{}|\\^]{1,2048}/gi; let m;
    while ((m = re.exec(s)) && looked < LIMITS.links) {
      looked++;
      const url = m[0].replace(/[.,;:!?*_~]+$/, ""), g = parseGoogleUrl(url); if (!g) continue;
      add({ ref: g.ref, key: g.id, kind: g.kind, id: g.id, title: cleanTitle(linkTitle(s, m.index, m[0].length)) });
    }
  });
  (Array.isArray(o.files) ? o.files : []).forEach(f => {
    if (!isObj(f)) return;
    const name = String(f.name || ""), ext = extOf(name), url = String(f.url || "");
    if (f.type === "image" || f.type === "video" || f.type === "audio" || NOT_DOC_EXT.has(ext)) return;
    const g = parseGoogleUrl(url);
    if (g) { add({ ref: g.ref, key: g.id, kind: g.kind, id: g.id, title: cleanTitle(name), unsupported: g.kind === "gdrive" && OTHER_DOC_EXT.has(ext) }); return; }
    const m = filestore.URL_RE.exec(url);
    if (!m || f.source !== "server" || (typeof o.isStored === "function" && !o.isStored(url))) return;
    const fext = m[2] !== "bin" ? m[2] : ext;
    if (!READ_EXT.has(fext) && !OTHER_DOC_EXT.has(fext)) return;
    add({ ref: "file:" + String(f.id || m[1]).slice(0, 64), key: "sha:" + m[1], kind: "file", sha: m[1], name: m[1] + "." + m[2], ext: fext, title: cleanTitle(name), unsupported: !READ_EXT.has(fext) });
  });
  return out;
}
/* what will be read: the first 5 readable ones; the rest "limit"; a type that cannot be read "unsupported" */
function plan(refs) {
  let n = 0;
  return (Array.isArray(refs) ? refs : []).map(r => {
    const base = Object.assign({}, r, { title: r.title || fallbackTitle(r) });
    if (r.unsupported) return Object.assign(base, { status: "unsupported", reason: "type" });
    n++;
    return Object.assign(base, n <= LIMITS.docs ? { status: "ready" } : { status: "limit", reason: "max_docs" });
  });
}
/* the budget shared fairly: the shortest documents first get what they need, up to an even share of what is left, so
   what a short document does not use goes to the others; a document cut says so. Returns each with text, chars, cut,
   reason and the hash of the text sent. */
function fit(docs, budget) {
  const total = LIMITS.budgets.indexOf(budget) >= 0 ? budget : LIMITS.budget;
  const list = (Array.isArray(docs) ? docs : []).map(d => Object.assign({}, d));
  const read = list.map((d, i) => ({ d, i })).filter(x => x.d.status === "read").map(x => { const c = cleanDoc(x.d.raw); return Object.assign(x, { chars: Array.from(c.text), pre: c.cut }); });
  let left = total;
  read.slice().sort((a, b) => a.chars.length - b.chars.length || a.i - b.i).forEach((x, k, all) => {
    const share = Math.floor(left / (all.length - k)), take = Math.min(x.chars.length, share);
    x.take = take; left -= take;
  });
  read.forEach(x => {
    const d = x.d, cut = x.pre || x.take < x.chars.length;
    const text = x.take < x.chars.length ? x.chars.slice(0, Math.max(0, x.take - 1)).join("").trim() + "…" : x.chars.join("");
    d.text = text; d.chars = Array.from(text).length; d.hash = sha(text);
    if (cut) { d.cut = true; d.reason = "budget"; } else { delete d.cut; delete d.reason; }
    delete d.raw;
  });
  list.forEach(d => { delete d.raw; });
  return list;
}
/* what a person and a run see of a document: never its text */
function outDoc(d) {
  const o = { ref: d.ref, kind: d.kind, title: d.title || fallbackTitle(d), status: STATUSES.indexOf(d.status) >= 0 ? d.status : "error" };
  if (typeof d.chars === "number" && (o.status === "read")) o.chars = d.chars;
  if (d.cut) o.cut = true;
  if (d.reason) o.reason = String(d.reason).slice(0, 40);
  return o;
}

/* ---------- reading bytes as text ---------- */
function decodeText(buf) {
  let b = buf.subarray(0, LIMITS.rawChars * 4 + 8);
  if (b[0] === 0xff && b[1] === 0xfe) return new TextDecoder("utf-16le").decode(b.subarray(2));
  if (b[0] === 0xfe && b[1] === 0xff) { const c = Buffer.from(b.subarray(2, 2 + ((b.length - 2) & ~1))); c.swap16(); return new TextDecoder("utf-16le").decode(c); }
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) b = b.subarray(3);
  if (b.subarray(0, 8192).includes(0)) return null;
  return new TextDecoder("utf-8").decode(b);
}
const looksHtml = buf => /^\s*(<!doctype\s+html|<html[\s>]|<head[\s>])/i.test(buf.subarray(0, 512).toString("latin1"));
const entity = { lt: "<", gt: ">", amp: "&", quot: "\"", apos: "'" };
const decodeEntities = s => s.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|lt|gt|amp|quot|apos);/gi, (m, e) => {
  if (e[0] !== "#") return entity[e.toLowerCase()];
  const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
  return n > 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : "";
});

/* ---------- a small zip reader: the central directory, stored or deflated entries, every size held ---------- */
const zipError = code => Object.assign(new Error("zip: " + code), { zip: code });
function zipEntries(buf) {
  let eocd = -1;
  for (let i = buf.length - 22, min = Math.max(0, buf.length - 65557); i >= min; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) throw zipError("corrupt");
  const count = buf.readUInt16LE(eocd + 10), size = buf.readUInt32LE(eocd + 12), offset = buf.readUInt32LE(eocd + 16);
  if (count === 0xffff || size === 0xffffffff || offset === 0xffffffff) throw zipError("zip64");
  if (count > LIMITS.zipEntries) throw zipError("zip_limits");
  if (offset + size > eocd) throw zipError("corrupt");
  const out = [];
  for (let i = 0, p = offset; i < count; i++) {
    if (p + 46 > eocd || buf.readUInt32LE(p) !== 0x02014b50) throw zipError("corrupt");
    const nlen = buf.readUInt16LE(p + 28), elen = buf.readUInt16LE(p + 30), clen = buf.readUInt16LE(p + 32);
    out.push({ name: buf.toString("utf8", p + 46, Math.min(eocd, p + 46 + nlen)), flags: buf.readUInt16LE(p + 8), method: buf.readUInt16LE(p + 10), csize: buf.readUInt32LE(p + 20), usize: buf.readUInt32LE(p + 24), offset: buf.readUInt32LE(p + 42) });
    p += 46 + nlen + elen + clen;
  }
  return out;
}
/* one entry's bytes: never more than it says it holds, never more than the entry limit or what is left of the read */
async function zipRead(buf, e, budget) {
  if (e.flags & 1) throw zipError("encrypted");
  if (e.method !== 0 && e.method !== 8) throw zipError("method");
  if (e.usize > LIMITS.zipEntryBytes || e.usize > budget.left) throw zipError("zip_limits");
  if (e.offset + 30 > buf.length || buf.readUInt32LE(e.offset) !== 0x04034b50) throw zipError("corrupt");
  const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28);
  if (start + e.csize > buf.length) throw zipError("corrupt");
  const data = buf.subarray(start, start + e.csize);
  let out;
  if (e.method === 0) out = data;
  else {
    try { out = await inflateRaw(data, { maxOutputLength: Math.max(1, e.usize) }); }
    catch (err) { throw zipError(err && (err.code === "ERR_BUFFER_TOO_LARGE" || /maxOutputLength|too large/i.test(String(err.message))) ? "zip_limits" : "corrupt"); }
  }
  if (out.length !== e.usize) throw zipError("corrupt");
  budget.left -= out.length;
  return out;
}
/* the words of a Word or PowerPoint part: the text runs, a line per paragraph */
function xmlText(xml, ns) {
  const T = ns + ":t", P = ns + ":p";
  let out = "", i = 0, inText = false;
  while (i < xml.length && out.length <= LIMITS.rawChars) {
    const lt = xml.indexOf("<", i), end = lt < 0 ? xml.length : lt;
    if (inText && end > i) out += decodeEntities(xml.slice(i, end));
    if (lt < 0) break;
    const gt = xml.indexOf(">", lt); if (gt < 0) break;
    const tag = xml.slice(lt + 1, gt), closing = tag[0] === "/", self = tag[tag.length - 1] === "/";
    const name = (closing ? tag.slice(1) : tag).split(/[\s/]/, 1)[0];
    if (name === T) inText = !closing && !self;
    else if (closing && name === P) out += "\n";
    else if (!closing && name === ns + ":tab" && tag.replace(/\s+/g, "") === ns + ":tab/") out += " ";   /* a tab in the text, not a tab stop */
    else if (!closing && (name === ns + ":br" || name === "w:cr")) out += "\n";
    i = gt + 1;
  }
  return out;
}
async function officeText(buf) {
  let entries;
  try { entries = zipEntries(buf); } catch (e) { return zipStatus(e); }
  const budget = { left: LIMITS.zipTotalBytes };
  try {
    const doc = entries.find(e => e.name === "word/document.xml");
    if (doc) return { status: "read", raw: xmlText((await zipRead(buf, doc, budget)).toString("utf8"), "w") };
    const slides = entries.map(e => [e, /^ppt\/slides\/slide(\d{1,4})\.xml$/.exec(e.name)]).filter(x => x[1]).sort((a, b) => +a[1][1] - +b[1][1]).slice(0, LIMITS.slides);
    if (!slides.length) return { status: "unsupported", reason: "type" };
    let raw = "";
    for (const [e, m] of slides) {
      const t = xmlText((await zipRead(buf, e, budget)).toString("utf8"), "a").trim();
      if (t) raw += "Slide " + m[1] + ": " + t + "\n";
      if (raw.length > LIMITS.rawChars) break;
    }
    return { status: "read", raw };
  } catch (e) { return zipStatus(e); }
}
function zipStatus(e) {
  const c = e && e.zip;
  if (c === "zip_limits") return { status: "too_large", reason: "zip_limits" };
  if (c === "zip64" || c === "encrypted" || c === "method") return { status: "unsupported", reason: c };
  return { status: "error", reason: "corrupt" };
}

/* ---------- a basic PDF text reader ---------- */
const WS = new Set([0, 9, 10, 12, 13, 32]), DELIM = new Set("()<>[]{}/%".split("").map(c => c.charCodeAt(0)));
/* "<< … >>" starting at i, nested dictionaries and strings skipped */
function dictAt(s, i) {
  if (s.substr(i, 2) !== "<<") return "";
  let depth = 0, j = i;
  const stop = Math.min(s.length, i + 200000);
  while (j < stop) {
    const c = s[j];
    if (c === "(") { j = literalEnd(s, j); continue; }
    if (c === "<" && s[j + 1] === "<") { depth++; j += 2; continue; }
    if (c === ">" && s[j + 1] === ">") { depth--; j += 2; if (depth === 0) return s.slice(i, j); continue; }
    j++;
  }
  return "";
}
function literalEnd(s, i) { let depth = 0; for (let j = i; j < s.length; j++) { const c = s[j]; if (c === "\\") { j++; continue; } if (c === "(") depth++; else if (c === ")" && --depth === 0) return j + 1; } return s.length; }
/* a literal string's bytes (as a latin1 string): escapes, octal codes and nesting */
function literal(s, i) {
  let out = "", depth = 0, j = i;
  for (; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") {
      const n = s[j + 1]; j++;
      if (n === "n") out += "\n"; else if (n === "r") out += "\r"; else if (n === "t") out += "\t"; else if (n === "b") out += "\b"; else if (n === "f") out += "\f";
      else if (n >= "0" && n <= "7") { let o = n; while (o.length < 3 && s[j + 1] >= "0" && s[j + 1] <= "7") o += s[++j]; out += String.fromCharCode(parseInt(o, 8) & 255); }
      else if (n === "\r") { if (s[j + 1] === "\n") j++; }
      else if (n !== "\n" && n !== undefined) out += n;
      continue;
    }
    if (c === "(") { if (depth++ > 0) out += c; continue; }
    if (c === ")") { if (--depth === 0) return [out, j + 1]; out += c; continue; }
    out += c;
  }
  return [out, j];
}
const hexBytes = h => { const x = h.replace(/[^0-9a-f]/gi, ""); let out = ""; for (let k = 0; k < x.length; k += 2) out += String.fromCharCode(parseInt((x.substr(k, 2) + "0").slice(0, 2), 16)); return out; };
/* a ToUnicode map: bfchar and bfrange, the code length from the codespace */
function parseCMap(t) {
  const map = new Map(), ranges = []; let len = 0;
  const cs = /begincodespacerange([\s\S]{0,2000}?)endcodespacerange/.exec(t); if (cs) { const m = /<([0-9a-f]+)>/i.exec(cs[1]); if (m) len = Math.ceil(m[1].length / 2); }
  const utf16 = h => { const b = hexBytes(h); let s = ""; for (let k = 0; k + 1 < b.length; k += 2) s += String.fromCharCode((b.charCodeAt(k) << 8) | b.charCodeAt(k + 1)); return s; };
  let m; const ch = /beginbfchar([\s\S]*?)endbfchar/g;
  while ((m = ch.exec(t)) && map.size < 100000) { const p = /<([0-9a-f]{1,8})>\s*<([0-9a-f]{0,64})>/gi; let q; while ((q = p.exec(m[1])) && map.size < 100000) { map.set(parseInt(q[1], 16), utf16(q[2])); if (!len) len = Math.ceil(q[1].length / 2); } }
  const rg = /beginbfrange([\s\S]*?)endbfrange/g;
  while ((m = rg.exec(t)) && ranges.length < 20000) {
    const p = /<([0-9a-f]{1,8})>\s*<([0-9a-f]{1,8})>\s*(?:<([0-9a-f]{0,64})>|\[([^\]]{0,20000})\])/gi; let q;
    while ((q = p.exec(m[1])) && ranges.length < 20000) {
      const lo = parseInt(q[1], 16), hi = parseInt(q[2], 16); if (!(hi >= lo) || hi - lo > 65535) continue;
      if (!len) len = Math.ceil(q[1].length / 2);
      if (q[3] !== undefined) { const base = utf16(q[3]); ranges.push({ lo, hi, base }); }
      else { const list = (q[4].match(/<([0-9a-f]{0,64})>/gi) || []).map(x => utf16(x.slice(1, -1))); list.forEach((v, k) => { if (lo + k <= hi && map.size < 100000) map.set(lo + k, v); }); }
    }
  }
  return { map, ranges, len: len || 2 };
}
function cmapChar(cm, code) {
  if (cm.map.has(code)) return cm.map.get(code);
  for (const r of cm.ranges) if (code >= r.lo && code <= r.hi) { if (!r.base) return ""; const last = r.base.charCodeAt(r.base.length - 1) + (code - r.lo); return r.base.slice(0, -1) + String.fromCharCode(last & 0xffff); }
  return null;
}
/* a string shown in a font: through its ToUnicode map; a simple font's bytes as Latin-1; a two-byte font with no map
   cannot be read */
function showText(bytes, font) {
  if (font && font.cmap) {
    let out = "", unknown = 0; const n = font.cmap.len;
    for (let k = 0; k + n <= bytes.length; k += n) { let code = 0; for (let b = 0; b < n; b++) code = (code << 8) | bytes.charCodeAt(k + b); const c = cmapChar(font.cmap, code); if (c === null) unknown++; else out += c; }
    return { text: out, bad: unknown > (bytes.length / n) / 2 };
  }
  if (bytes.charCodeAt(0) === 0xfe && bytes.charCodeAt(1) === 0xff) { let out = ""; for (let k = 2; k + 1 < bytes.length; k += 2) out += String.fromCharCode((bytes.charCodeAt(k) << 8) | bytes.charCodeAt(k + 1)); return { text: out, bad: false }; }
  if (font && font.twoByte) return { text: "", bad: true };
  let zeros = 0; for (let k = 0; k < bytes.length; k++) if (bytes.charCodeAt(k) === 0) zeros++;
  return zeros * 3 > bytes.length ? { text: "", bad: true } : { text: bytes, bad: false };
}
/* the text a content stream shows, with a font map for Tf; lines where the text moves down */
function contentText(c, fonts, acc) {
  const ops = []; let i = 0, font = null;
  const show = b => { const r = showText(b, font); if (r.bad) acc.bad++; else if (r.text) { acc.good++; acc.out += r.text; } };
  while (i < c.length && acc.out.length <= LIMITS.rawChars) {
    const code = c.charCodeAt(i), ch = c[i];
    if (WS.has(code)) { i++; continue; }
    if (ch === "%") { const e = c.indexOf("\n", i); i = e < 0 ? c.length : e + 1; continue; }
    if (ch === "(") { const [s, j] = literal(c, i); ops.push({ s }); i = j; continue; }
    if (ch === "<") { if (c[i + 1] === "<") { i += 2; continue; } const e = c.indexOf(">", i); if (e < 0) break; ops.push({ s: hexBytes(c.slice(i + 1, e)) }); i = e + 1; continue; }
    if (ch === ">") { i++; continue; }
    if (ch === "[") { ops.push({ open: true }); i++; continue; }
    if (ch === "]") { ops.push({ close: true }); i++; continue; }
    let j = i + 1; while (j < c.length && !WS.has(c.charCodeAt(j)) && !DELIM.has(c.charCodeAt(j))) j++;
    if (ch === "/") { ops.push({ name: c.slice(i + 1, j) }); i = j; continue; }
    const tok = c.slice(i, j); i = j;
    if (/^[-+]?(?:\d+\.?\d*|\.\d+)$/.test(tok)) { ops.push({ num: +tok }); continue; }
    const nums = ops.filter(o => "num" in o).map(o => o.num);
    if (tok === "Tf") { const nm = ops.filter(o => o.name !== undefined).pop(); font = nm && fonts ? fonts.get(nm.name) || null : null; }
    else if (tok === "Tj") { const s = ops.filter(o => o.s !== undefined).pop(); if (s) show(s.s); }
    else if (tok === "'" || tok === "\"") { acc.out += "\n"; const s = ops.filter(o => o.s !== undefined).pop(); if (s) show(s.s); }
    else if (tok === "TJ") { ops.forEach(o => { if (o.s !== undefined) show(o.s); else if ("num" in o && o.num < -180) acc.out += " "; }); }
    else if (tok === "Td" || tok === "TD") { acc.out += nums.length >= 2 && Math.abs(nums[nums.length - 1]) > 0.01 ? "\n" : " "; }
    else if (tok === "T*") acc.out += "\n";
    else if (tok === "Tm") { const y = nums.length >= 6 ? nums[nums.length - 1] : null; acc.out += y !== null && acc.y !== null && Math.abs(y - acc.y) > 0.5 ? "\n" : " "; acc.y = y; }
    else if (tok === "ET") acc.out += " ";
    ops.length = 0;
  }
}
async function pdfText(buf) {
  const s = buf.toString("latin1");
  if (s.slice(0, 1024).indexOf("%PDF-") < 0) return { status: "error", reason: "corrupt" };
  if (/\/Encrypt\s*(?:\d+\s+\d+\s+R|<<)/.test(s.slice(-65536)) || /\/Encrypt\s*\d+\s+\d+\s+R/.test(s.slice(0, 4096))) return { status: "unsupported", reason: "encrypted" };
  /* every object: where it is (plain), or its text (inside an object stream) */
  const where = new Map(), inner = new Map();
  const re = /(\d{1,10})\s+(\d{1,5})\s+obj\b/g; let m, n = 0;
  while ((m = re.exec(s)) && n++ < LIMITS.pdfObjects) where.set(+m[1], re.lastIndex);
  let inflated = 0;
  const decode = async (dict, data) => {
    const f = /\/Filter\s*(\/[A-Za-z0-9]+|\[[^\]]{0,200}\])/.exec(dict), filters = f ? f[1].match(/\/[A-Za-z0-9]+/g) || [] : [];
    if (!filters.length) return data;
    if (filters.length > 1 || (filters[0] !== "/FlateDecode" && filters[0] !== "/Fl")) return null;
    if (/\/Predictor\s+(?:[2-9]|1\d)/.test(dict)) return null;
    const max = Math.min(LIMITS.pdfStreamBytes, LIMITS.pdfInflateBytes - inflated); if (max <= 0) return null;
    const opt = { maxOutputLength: max, finishFlush: zlib.constants.Z_SYNC_FLUSH };
    let out = null;
    try { out = await inflate(data, opt); } catch (e) { try { out = await inflateRaw(data, opt); } catch (e2) { out = null; } }
    if (out) inflated += out.length;
    return out;
  };
  /* an object's dictionary text and its stream's bytes, decoded (null when it cannot be) */
  const objAt = async num => {
    if (inner.has(num)) return { dict: inner.get(num), stream: null };
    const at = where.get(num); if (at === undefined) return null;
    const end = s.indexOf("endobj", at), body = s.slice(at, end < 0 ? Math.min(s.length, at + 200000) : end);
    const k = body.search(/\bstream\r?\n/);
    if (k < 0) return { dict: body, stream: null };
    const dict = body.slice(0, k);
    let d = at + k + 6; if (s[d] === "\r") d++; if (s[d] === "\n") d++;
    let e = s.indexOf("endstream", d); if (e < 0) return { dict, stream: null };
    if (s[e - 1] === "\n") e--; if (s[e - 1] === "\r") e--;
    return { dict, stream: e > d ? await decode(dict, buf.subarray(d, e)) : Buffer.alloc(0) };
  };
  const ref = (txt, key) => { const r = new RegExp("\\/" + key + "\\s*(\\d+)\\s+\\d+\\s+R").exec(txt); return r ? +r[1] : null; };
  /* object streams: the objects packed inside them */
  for (const [num] of where) {
    if (inner.size > LIMITS.pdfObjects) break;
    const at = where.get(num), head = s.slice(at, at + 400);
    if (!/\/Type\s*\/ObjStm/.test(head)) continue;
    const o = await objAt(num); if (!o || !o.stream) continue;
    const t = o.stream.toString("latin1"), first = +((/\/First\s+(\d+)/.exec(o.dict) || [])[1] || 0), cnt = +((/\/N\s+(\d+)/.exec(o.dict) || [])[1] || 0);
    const nums = t.slice(0, first).trim().split(/\s+/).map(Number);
    for (let k = 0; k + 1 < nums.length && k / 2 < cnt; k += 2) { const from = first + nums[k + 1], to = k + 3 < nums.length ? first + nums[k + 3] : t.length; if (!where.has(nums[k])) inner.set(nums[k], t.slice(from, to)); }
  }
  const dictText = async v => { const o = await objAt(v); return o ? o.dict : ""; };
  /* a resource or font dictionary written in place or as a reference */
  const sub = async (txt, key) => {
    const at = txt.search(new RegExp("\\/" + key + "\\s*(?:<<|\\d+\\s+\\d+\\s+R)"));
    if (at < 0) return "";
    const rest = txt.slice(at + key.length + 1).replace(/^\s+/, ""), r = /^(\d+)\s+\d+\s+R/.exec(rest);
    if (r) return dictText(+r[1]);
    const i = txt.indexOf("<<", at); return i < 0 ? "" : dictAt(txt, i);
  };
  const fontCache = new Map();
  const fontOf = async num => {
    if (fontCache.has(num)) return fontCache.get(num);
    const d = await dictText(num), f = { twoByte: /\/Subtype\s*\/Type0/.test(d), cmap: null };
    fontCache.set(num, f);
    const tu = ref(d, "ToUnicode");
    if (tu !== null) { const o = await objAt(tu); if (o && o.stream) f.cmap = parseCMap(o.stream.toString("latin1")); }
    return f;
  };
  const fontsOf = async res => {
    const map = new Map(), fd = await sub(res, "Font"), p = /\/([^\s/<>[\]()]+)\s+(\d+)\s+\d+\s+R/g; let q;
    while ((q = p.exec(fd)) && map.size < 200) map.set(q[1], await fontOf(+q[2]));
    return map;
  };
  /* the pages in order (the page tree from the catalog), each page's content streams and fonts */
  const pages = [], seen = new Set();
  const walk = async (num, res, depth) => {
    if (num === null || seen.has(num) || depth > 40 || pages.length >= LIMITS.pdfPages) return;
    seen.add(num);
    const d = await dictText(num), own = /\/Resources/.test(d) ? await sub(d, "Resources") : res;
    if (/\/Type\s*\/Pages\b/.test(d)) { const k = /\/Kids\s*\[([^\]]{0,200000})\]/.exec(d); if (k) for (const r of k[1].match(/\d+\s+\d+\s+R/g) || []) await walk(+r.split(/\s+/)[0], own, depth + 1); return; }
    if (/\/Type\s*\/Page\b/.test(d)) {
      const c = /\/Contents\s*(\[[^\]]{0,20000}\]|\d+\s+\d+\s+R)/.exec(d);
      pages.push({ contents: c ? (c[1].match(/\d+\s+\d+\s+R/g) || []).map(r => +r.split(/\s+/)[0]) : [], res: own || "" });
    }
  };
  const roots = (s.match(/\/Root\s*\d+\s+\d+\s+R/g) || []).map(r => +r.match(/\d+/)[0]);
  const root = roots.length ? roots[roots.length - 1] : null;
  if (root !== null) { const cat = await dictText(root); await walk(ref(cat, "Pages"), "", 0); }
  const acc = { out: "", good: 0, bad: 0, y: null };
  for (const p of pages) {
    if (acc.out.length > LIMITS.rawChars) break;
    const fonts = await fontsOf(p.res);
    for (const c of p.contents) { const o = await objAt(c); if (o && o.stream) contentText(o.stream.toString("latin1"), fonts, acc); }
    acc.out += "\n";
  }
  /* no page tree to follow: every stream that shows text, in the file's order */
  if (!pages.length) for (const [num] of where) { if (acc.out.length > LIMITS.rawChars) break; const o = await objAt(num); if (o && o.stream && !/\/Subtype\s*\/Image|\/Length[123]\s|\/Type\s*\/(XRef|ObjStm|Metadata)/.test(o.dict)) { const t = o.stream.toString("latin1"); if (/\bBT\b/.test(t)) contentText(t, null, acc); } }
  const text = acc.out.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  return readable(text) && acc.good >= acc.bad ? { status: "read", raw: text } : { status: "unsupported", reason: "no_text" };
}
/* text a person could read: enough letters, mostly letters, digits, spaces and punctuation, and words with vowels */
function readable(t) {
  const sample = t.slice(0, 20000), letters = (sample.match(/\p{L}/gu) || []).length;
  if (letters < 20) return false;
  const good = (sample.match(/[\p{L}\p{N}\s.,;:!?'"()\-–—%&/@#+*=€$£¥…•·]/gu) || []).length;
  if (good / Math.max(1, Array.from(sample).length) < 0.75) return false;
  const latin = (sample.match(/[a-z]/gi) || []).length;
  if (latin > letters / 2) { const vowels = (sample.match(/[aeiouy]/gi) || []).length / latin; if (vowels < 0.2 || vowels > 0.7) return false; }
  return true;
}
/* bytes of a file: what it is from its first bytes, its name and its type */
async function fileText(buf, hint) {
  const ext = hint.ext || extOf(hint.name), type = String(hint.type || "").toLowerCase();
  if (buf.length >= 5 && buf.toString("latin1", 0, 5) === "%PDF-") return pdfText(buf);
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return officeText(buf);
  if (ext === "pdf" || ext === "docx" || ext === "pptx") return { status: "error", reason: "corrupt" };
  if (TEXT_EXT.has(ext) || /^text\/(plain|csv|markdown|x-markdown|tab-separated-values)\b/.test(type) || (!ext && /^text\//.test(type))) {
    const t = decodeText(buf); return t === null ? { status: "unsupported", reason: "type" } : { status: "read", raw: t };
  }
  return { status: "unsupported", reason: "type" };
}

/* ---------- fetching from Google: the SSRF boundary ---------- */
const drain = res => { try { if (res && res.body && typeof res.body.cancel === "function") res.body.cancel().catch(() => {}); } catch (e) { /* already read */ } };
/* the body, counted as it arrives; null beyond max (the download is stopped there) */
async function readCapped(res, max) {
  if (res.body && typeof res.body.getReader === "function") {
    const reader = res.body.getReader(), parts = []; let n = 0;
    for (;;) {
      const { done, value } = await reader.read(); if (done) break;
      n += value.byteLength;
      if (n > max) { reader.cancel().catch(() => {}); return null; }
      parts.push(Buffer.from(value.buffer, value.byteOffset, value.byteLength));
    }
    return Buffer.concat(parts, n);
  }
  if (typeof res.arrayBuffer === "function") { const b = Buffer.from(await res.arrayBuffer()); return b.length > max ? null : b; }
  return Buffer.alloc(0);
}
function dispositionName(h) {
  const s = String(h || "");
  let m = /filename\*\s*=\s*utf-8''([^;]{1,600})/i.exec(s);
  if (m) { try { return decodeURIComponent(m[1].trim().replace(/^"|"$/g, "")); } catch (e) { /* fall back to the plain name */ } }
  m = /filename\s*=\s*"([^"]{0,600})"/i.exec(s) || /filename\s*=\s*([^;]{1,600})/i.exec(s);
  return m ? m[1].trim() : "";
}
/* the export of one Google file: {status:"ok", body, type, name, etag, lastModified} | {status:"not_modified"} |
   {status, reason} — 10 s for the whole of it, redirects by hand, the size counted */
async function fetchGoogle(r, prev, o) {
  const doFetch = o.fetch, ctl = typeof AbortController === "function" ? new AbortController() : null;
  let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) { /* gone */ } resolve({ status: "error", reason: "timeout" }); }, o.timeoutMs); });
  const chain = (async () => {
    let url = exportUrl(r);
    for (let hop = 0; ; hop++) {
      const u = allowedHop(url); if (!u) return { status: "error", reason: "redirect_refused" };
      const headers = { accept: "text/plain, text/csv, application/pdf, application/octet-stream;q=0.9, */*;q=0.5", "user-agent": "ZenCrevia/1 (Smart Scoring reads a brief's document)" };
      if (hop === 0 && prev && prev.etag) headers["if-none-match"] = prev.etag;
      if (hop === 0 && prev && prev.lastModified) headers["if-modified-since"] = prev.lastModified;
      const res = await doFetch(u.href, { method: "GET", redirect: "manual", headers, credentials: "omit", signal: ctl ? ctl.signal : undefined });
      const st = +res.status || 0, get = k => (res.headers && typeof res.headers.get === "function" ? res.headers.get(k) : null);
      if (st >= 300 && st < 400 && st !== 304) {
        const loc = get("location"); drain(res);
        if (!loc) return { status: "error", reason: "redirect_refused" };
        let next; try { next = new URL(loc, u.href); } catch (e) { return { status: "error", reason: "redirect_refused" }; }
        if (isLogin(next)) return { status: "not_public", reason: "login" };
        if (!allowedHop(next.href)) return { status: "error", reason: "redirect_refused" };
        if (hop >= o.redirects) return { status: "error", reason: "too_many_redirects" };
        url = next.href; continue;
      }
      if (st === 304) { drain(res); return prev ? { status: "not_modified" } : { status: "error", reason: "http" }; }
      if (st === 401 || st === 403) { drain(res); return { status: "not_public", reason: "denied" }; }
      if (st === 404) { drain(res); return { status: "not_public", reason: "not_found" }; }
      if (st === 429) { drain(res); return { status: "error", reason: "rate_limited" }; }
      if (st !== 200) { drain(res); return { status: "error", reason: "http" }; }
      const type = String(get("content-type") || "").toLowerCase();
      if (/^text\/html|^application\/xhtml/.test(type)) { drain(res); return { status: "not_public", reason: "html" }; }
      if (/^(image|video|audio|font)\//.test(type)) { drain(res); return { status: "unsupported", reason: "type" }; }
      const len = +(get("content-length") || 0);
      if (len > o.fetchBytes) { drain(res); return { status: "too_large", reason: "over_5mb" }; }
      const body = await readCapped(res, o.fetchBytes);
      if (body === null) return { status: "too_large", reason: "over_5mb" };
      if (looksHtml(body)) return { status: "not_public", reason: "html" };
      return { status: "ok", body, type, name: dispositionName(get("content-disposition")), etag: get("etag") || null, lastModified: get("last-modified") || null };
    }
  })().catch(e => ({ status: "error", reason: ctl && ctl.signal.aborted ? "timeout" : "network" }));
  try { return await Promise.race([chain, deadline]); } finally { clearTimeout(timer); }
}

/* ---------- the reader: a 10-minute memory of each document, one fetch at a time per document ---------- */
function createReader(opts) {
  opts = opts || {};
  const o = Object.assign({}, LIMITS, opts.limits || {});
  o.fetch = (url, init) => (typeof opts.fetch === "function" ? opts.fetch : globalThis.fetch)(url, init);
  const clock = typeof opts.now === "function" ? opts.now : Date.now;
  const fileFor = typeof opts.fileFor === "function" ? opts.fileFor : filestore.fileFor;
  const cache = new Map(), pending = new Map();
  const remember = (key, v) => { cache.delete(key); cache.set(key, v); while (cache.size > o.cacheEntries) cache.delete(cache.keys().next().value); };
  async function google(r, prev) {
    const g = await fetchGoogle(r, prev, o);
    if (g.status !== "ok") return g;
    const name = g.name || "", title = cleanTitle(r.kind === "gdrive" ? name : name.replace(/\.(txt|csv)$/i, ""));
    let out;
    if (r.kind === "gdrive") out = await fileText(g.body, { name, type: g.type });
    else { const t = decodeText(g.body); out = t === null ? { status: "unsupported", reason: "type" } : { status: "read", raw: t }; }
    return Object.assign(out, { title, etag: g.etag, lastModified: g.lastModified });
  }
  async function stored(r) {
    const file = fileFor(r.name); if (!file) return { status: "error", reason: "missing" };
    let st; try { st = fs.statSync(file); } catch (e) { return { status: "error", reason: "missing" }; }
    if (st.size > o.fileBytes) return { status: "too_large", reason: "over_15mb" };
    const buf = TEXT_EXT.has(r.ext) ? (() => { const fd = fs.openSync(file, "r"); try { const b = Buffer.alloc(Math.min(st.size, LIMITS.rawChars * 4 + 8)); fs.readSync(fd, b, 0, b.length, 0); return b; } finally { fs.closeSync(fd); } })() : fs.readFileSync(file);
    return fileText(buf, { ext: r.ext });
  }
  async function readOne(r) {
    const key = r.kind === "file" ? "file:" + r.sha + "." + r.ext : r.kind + ":" + r.id;
    const hit = cache.get(key), age = hit ? clock() - hit.at : Infinity;
    if (hit && age < (hit.status === "read" ? o.ttlMs : o.failTtlMs)) return hit;
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      let res;
      try { res = r.kind === "file" ? await stored(r) : await google(r, hit && hit.status === "read" && (hit.etag || hit.lastModified) ? hit : null); }
      catch (e) { res = { status: "error", reason: "corrupt" }; }
      if (res.status === "not_modified") res = Object.assign({}, hit);
      if (typeof res.raw === "string" && res.raw.length > LIMITS.rawChars + 1) res.raw = res.raw.slice(0, LIMITS.rawChars + 1);
      res.at = clock(); remember(key, res);
      return res;
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  }
  /* each planned document "ready" is read; the others keep their status. The text is in raw, for fit() */
  async function read(planned) {
    const list = Array.isArray(planned) ? planned : [];
    return Promise.all(list.map(async r => {
      if (r.status !== "ready") return Object.assign({}, r);
      const g = await readOne(r);
      const out = Object.assign({}, r, { status: g.status, title: g.title || r.title });
      if (g.reason) out.reason = g.reason; else delete out.reason;
      if (g.status === "read") out.raw = g.raw || "";
      return out;
    }));
  }
  return { read, readOne, clear: () => cache.clear(), size: () => cache.size };
}

module.exports = {
  LIMITS, KIND_NAME, STATUSES, findRefs, plan, fit, outDoc, createReader,
  pure: { parseGoogleUrl, exportUrl, allowedHop, isLogin, cleanDoc, cleanTitle, decodeText, zipEntries, zipRead, xmlText, officeText, pdfText, parseCMap, fileText, readable, fetchGoogle, dispositionName }
};
