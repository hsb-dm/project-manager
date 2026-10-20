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

   The part the brief points to (Oct 2026). Owner: "kasih konteks AI kalau attach dokumen kadang yang dibikin bukan
   keseluruhan dokumen melainkan spesific page/slide sesuai linknya". A document can carry the part that is the work:
   from its link (Slides #slide=id.<objectId> or slide=<n>, Sheets gid=<n> and range=<A1>, Docs #heading=h.<id>, a
   Drive file #page=<n>) — the link's own part first, as the owner said — else from words on the link's line within 60
   characters ("slide 5", "slides 3–8", "slide 3, 5", "page 2", "pages 2-4", "p. 3", "hal. 3", "halaman 2–4", "tab
   Budget", "sheet Budget"), and for an attached file from such words on a line that names it; at most 20 pages or
   slides, none over 999. The slides or pages a person sets on the task (meta.aiDocParts) win over both. One deck often
   holds many briefs, so only the part is sent, with what belongs to it (relevant(): what continues it, its section
   heading, up to two general slides) — never the rest. It is read on its own where it can be: a Sheets tab exported by
   its gid (and range), a PDF's pages, a .pptx's slides in the presentation's own order, Google Slides exported as .pptx
   (up to 50 MB and 25 s; an object id found on its slide by the shapes Google names "Google Shape;<n>;<slide id>"), a
   Docs heading through the HTML export (taken only as Google's download and with the very heading id in an h1–h6, so no
   sign-in page passes). Where it cannot be, nothing of the document is sent but its title and a line saying so
   ("resolved": false) — never the whole of it instead. The part is in the ref (…#slide=5), so a different slide is
   another document and asks again; a document with no part reads, hashes and prompts exactly as before. */
const zlib = require("zlib"), util = require("util"), crypto = require("crypto"), fs = require("fs");
const filestore = require("./filestore");
const inflateRaw = util.promisify(zlib.inflateRaw), inflate = util.promisify(zlib.inflate);

const LIMITS = Object.freeze({
  docs: 5, found: 20, links: 60,
  budgets: Object.freeze([5000, 15000, 30000]), budget: 15000,
  fetchBytes: 5 * 1024 * 1024, fileBytes: 15 * 1024 * 1024, timeoutMs: 10000, redirects: 5,
  /* Google Slides as PowerPoint, only for a slide pointed to: whole decks with their pictures are large */
  pptxBytes: 50 * 1024 * 1024, pptxTimeoutMs: 25000,
  /* a general slide sent with a part: at most this many characters */
  extraChars: 1500,
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
/* the address fetched: built from the id, never the one typed. v, for a part: {html} a Doc as HTML (its headings),
   {pptx} Slides as PowerPoint (its slides apart), {gid, range} one tab of a Sheet — each value checked again here */
function exportUrl(r, v) {
  const id = encodeURIComponent(r.id);
  v = isObj(v) ? v : {};
  if (r.kind === "gdoc") return "https://docs.google.com/document/d/" + id + (v.html ? "/export?format=html" : "/export?format=txt");
  if (r.kind === "gslides") return "https://docs.google.com/presentation/d/" + id + (v.pptx ? "/export/pptx" : "/export/txt");
  if (r.kind === "gsheet") return "https://docs.google.com/spreadsheets/d/" + id + "/export?format=csv" + (typeof v.gid === "string" && /^\d{1,10}$/.test(v.gid) ? "&gid=" + v.gid : "") + (typeof v.range === "string" && A1.test(v.range) ? "&range=" + encodeURIComponent(v.range) : "");
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

/* ---------- the part of a document the brief points to (no fetching here) ----------
   Internally a part is {kind, nums?, objectId?, gid?, range?, name?, heading?, src: "link"|"words", key, label,
   resolved, of?, why?, headingText?}; outPart() gives the contract {kind, label, from?, to?, list?, of?, resolved}.
   key is set once, from what the brief says (it is in the ref); label follows what a read pinned down. */
const PART = Object.freeze({ items: 20, top: 999, near: 60, scan: 100, names: 10, mentions: 40 });
const PART_KINDS = ["slide", "page", "sheet", "range", "heading"];
const A1 = /^(?:[A-Z]{1,3}\d{1,7}|[A-Z]{1,3}|\d{1,7})(?::(?:[A-Z]{1,3}\d{1,7}|[A-Z]{1,3}|\d{1,7}))?$/;
const HEADING_ID = /^h\.[A-Za-z0-9_-]{1,64}$/;
const NAME_CH = /[\p{L}\p{N}_]/u;
const DASH = cc(0x2013);
const run = n => n.length > 1 && n[n.length - 1] - n[0] === n.length - 1;
const numsText = n => (run(n) ? n[0] + DASH + n[n.length - 1] : n.join(", "));
function partLabel(p) {
  if (p.kind === "slide" || p.kind === "page") return p.nums && p.nums.length ? p.kind + (p.nums.length > 1 ? "s " : " ") + numsText(p.nums) : p.objectId ? "slide id." + p.objectId.slice(0, 40) : p.kind;
  if (p.kind === "sheet") return p.name ? "tab \"" + p.name + "\"" : "tab gid " + p.gid;
  if (p.kind === "range") return p.range;
  return p.headingText ? "heading \"" + p.headingText + "\"" : "heading " + p.heading;
}
function partKey(p) {
  if (p.kind === "slide" || p.kind === "page") return p.kind + "=" + (p.nums && p.nums.length ? (run(p.nums) ? p.nums[0] + "-" + p.nums[p.nums.length - 1] : p.nums.join(",")) : "id." + p.objectId);
  if (p.kind === "sheet" && p.name) return "sheet=" + encodeURIComponent(p.name);
  if (p.kind === "sheet" || p.kind === "range") return (p.gid != null ? "gid=" + p.gid : "") + (p.range ? (p.gid != null ? "&" : "") + "range=" + p.range : "");
  return "heading=" + p.heading;
}
const mkPart = p => { p.resolved = false; p.key = partKey(p); p.label = partLabel(p); return p; };
/* pinned down by a read: of (how many slides or pages there are), and for a slide found by its id, its number */
function resolvePart(p, extra) { const q = Object.assign({}, p, extra || {}, { resolved: true }); delete q.why; q.label = partLabel(q); return q; }
/* not pinned down: why — id (not matched to a number), range (not in the document), size (too large to read apart),
   format (pages or slides cannot be told apart in this kind of document), tab (that tab could not be read), name (a tab
   is not read by its name), heading (that heading could not be found) */
function unresolvePart(p, why, extra) { const q = Object.assign({}, p, extra || {}, { resolved: false, why }); q.label = partLabel(q); return q; }
/* the reason a document whose part was not pinned down gives (Doc.reason) */
const PART_REASON = Object.freeze({ id: "part_not_found", range: "part_not_found", heading: "part_not_found", tab: "part_not_found", size: "part_too_large", timeout: "part_timeout", format: "part_unreadable", name: "part_unreadable" });
const partSig = p => [p.key, p.resolved === true, p.nums || null, p.of == null ? null : p.of, p.why || null];
/* the contract: built from an inner part or taken back from a run's record of one */
function outPart(p) {
  if (!isObj(p) || PART_KINDS.indexOf(p.kind) < 0) return null;
  let nums = Array.isArray(p.nums) ? p.nums : Array.isArray(p.list) ? p.list : null;
  if (!nums && Number.isInteger(p.from)) { const to = Number.isInteger(p.to) && p.to >= p.from && p.to - p.from < PART.items ? p.to : p.from; nums = []; for (let n = p.from; n <= to; n++) nums.push(n); }
  nums = nums ? Array.from(new Set(nums.filter(n => Number.isInteger(n) && n >= 1 && n <= PART.top))).sort((a, b) => a - b).slice(0, PART.items) : [];
  const o = { kind: p.kind, label: String(p.label || p.kind).slice(0, 80) };
  if (nums.length) { if (nums.length === 1 || run(nums)) { o.from = nums[0]; o.to = nums[nums.length - 1]; } else o.list = nums; }
  if (Number.isInteger(p.of) && p.of >= 0) o.of = p.of;
  o.resolved = p.resolved === true;
  /* sent with it: what continues it, its section heading, the general slides or pages */
  const also = Array.isArray(p.also) ? p.also.filter(x => isObj(x) && ["continues", "heading", "general"].indexOf(x.role) >= 0 && Number.isInteger(x.n) && x.n >= 1).slice(0, 8).map(x => ({ role: x.role, n: x.n })) : [];
  if (also.length && o.resolved) o.also = also;
  return o;
}
/* the part the link itself carries: from its fragment, else its query; well-formed values only */
function linkPart(s, kind) {
  let u; try { u = new URL(String(s).trim()); } catch (e) { return null; }
  const frag = new URLSearchParams(u.hash.slice(1, 600)), q = u.searchParams;
  const get = k => { const a = frag.get(k); return a ? a : q.get(k) || ""; };
  let m;
  if (kind === "gslides") {
    const v = get("slide");
    if ((m = /^id\.([A-Za-z0-9_-]{1,100})$/.exec(v))) return mkPart({ kind: "slide", objectId: m[1], src: "link" });
    return /^\d{1,3}$/.test(v) && +v >= 1 ? mkPart({ kind: "slide", nums: [+v], src: "link" }) : null;
  }
  if (kind === "gsheet") {
    const g = get("gid"), r = get("range").toUpperCase(), gid = /^\d{1,10}$/.test(g) ? String(+g) : null, range = r.length <= 24 && A1.test(r) ? r : null;
    return gid !== null || range ? mkPart({ kind: range ? "range" : "sheet", gid, range, src: "link" }) : null;
  }
  if (kind === "gdoc") { const h = get("heading"); return HEADING_ID.test(h) ? mkPart({ kind: "heading", heading: h, src: "link" }) : null; }
  if (kind === "gdrive") { const p = get("page"); return /^\d{1,3}$/.test(p) && +p >= 1 ? mkPart({ kind: "page", nums: [+p], src: "link" }) : null; }
  return null;
}
/* the words a brief uses for a part, in English and Indonesian. Every pattern is bounded and runs on a few characters
   at a time, so a hostile brief cannot make it spin. */
const PART_WORD = /slides|slide|pages|page|halaman|hal\.|hlm\.|pp\.|p\.|tab|sheet/giu;
const RANGE_SEP = /^[ \t]{0,2}(?:-|–|—|to|sampai|hingga|s\/d|s\.d\.?)[ \t]{0,2}/i;
const LIST_SEP = /^[ \t]{0,2}(?:,|&|\+|and|dan|serta)[ \t]{0,2}/i;
const NOT_A_PART = /^[ \t]{0,3}(?:errors?|eror|galat|not[ \t]{1,2}found|tidak[ \t]{1,2}ditemukan)(?![\p{L}\p{N}])/iu;
const TAB_STOP = new Set("a an the of in on at for with and or to is it this that these those here there below above next new same other link links ini itu dari di ke yang untuk dan atau sini situ berikut baru sebelah lain sama".split(" "));
/* a page or slide number, 1 to 999: not part of a longer number, a word, a decimal, a time or a fraction */
function numAt(w, k) {
  const m = /^\d{1,3}(?!\d)/.exec(w.slice(k, k + 4)); if (!m) return null;
  const e = k + m[0].length, c = w[e] || "";
  if ((NAME_CH.test(c) && !/\d/.test(c)) || c === "%" || (/[.:/]/.test(c) && /\d/.test(w[e + 1] || ""))) return null;
  const n = +m[0]; return n >= 1 && n <= PART.top ? { n, end: e } : null;
}
/* "5", "3–8", "3, 5", "3 dan 5", "ke-5", "no. 5": at most 20 numbers, a range in order */
function numList(w, j) {
  let k = j + ((/^[ \t]{0,3}(?:(?:ke|no|nr|nomor)[.\- ]{0,2}|#[ \t]?)?/i.exec(w.slice(j, j + 12)) || [""])[0].length);
  const nums = new Set(); let end = -1;
  for (let item = 0; item < PART.items; item++) {
    if (item > 0) { const ls = LIST_SEP.exec(w.slice(end, end + 10)); if (!ls || !numAt(w, end + ls[0].length)) break; k = end + ls[0].length; }
    const a = numAt(w, k); if (!a) return null;
    let hi = a.n, e = a.end;
    const rs = RANGE_SEP.exec(w.slice(e, e + 12));
    if (rs) { const b = numAt(w, e + rs[0].length); if (b) { hi = b.n; e = b.end; } else if (/\d/.test(w[e + rs[0].length] || "")) return null; }
    if (hi < a.n || hi - a.n + 1 > PART.items) return null;
    for (let x = a.n; x <= hi; x++) nums.add(x);
    if (nums.size > PART.items) return null;
    end = e;
  }
  if (end < 0 || NOT_A_PART.test(w.slice(end, end + 30))) return null;
  return { end, v: { nums: Array.from(nums).sort((x, y) => x - y) } };
}
/* "tab Budget", "sheet "Budget 2025"": a quoted name, or one word that starts with a capital or has a digit in it */
function tabName(w, j) {
  const sp = /^(?:[ \t]{1,3}|[ \t]{0,2}:[ \t]{0,2})/.exec(w.slice(j, j + 6)); if (!sp || !sp[0]) return null;
  const k = j + sp[0].length, q = /^(?:"([^"\n<>]{1,40})"|“([^”\n<>]{1,40})”|'([^'\n<>]{1,40})'|‘([^’\n<>]{1,40})’)/.exec(w.slice(k, k + 44));
  let name, end;
  if (q) { name = q[1] || q[2] || q[3] || q[4]; end = k + q[0].length; }
  else {
    const b = /^[\p{L}\p{N}][\p{L}\p{N}_-]{0,39}/u.exec(w.slice(k, k + 41)); if (!b) return null;
    end = k + b[0].length; name = b[0];
    if (NAME_CH.test(w[end] || "") || !(/^\p{Lu}/u.test(name) || /[\d_]/.test(name)) || TAB_STOP.has(name.toLowerCase()) || /^(?:https?|www)$/i.test(name)) return null;
  }
  name = cleanTitle(name).replace(/["“”‘’']/g, "").trim().slice(0, 40);
  return name ? { end, v: { name } } : null;
}
/* every mention in w (offset: where w starts in its text): {at, end, type: "slide"|"page"|"tab", nums | name} */
function mentionsIn(w, offset) {
  const out = []; let m;
  PART_WORD.lastIndex = 0;
  while ((m = PART_WORD.exec(w)) && out.length < PART.mentions) {
    const i = m.index, word = m[0].toLowerCase(), j = i + word.length;
    if ((i > 0 && NAME_CH.test(w[i - 1])) || (!word.endsWith(".") && NAME_CH.test(w[j] || ""))) continue;
    const type = word === "tab" || word === "sheet" ? "tab" : word.startsWith("sl") ? "slide" : "page";
    const r = type === "tab" ? tabName(w, j) : numList(w, j);
    if (r) { out.push(Object.assign({ at: (offset || 0) + i, end: (offset || 0) + r.end, type }, r.v)); PART_WORD.lastIndex = r.end; }
  }
  return out;
}
/* which words a document can take: a deck or a PDF slides and pages alike (slide 5 of a PDF deck is its page 5), a
   Sheet a tab. A Doc, a Word file or a text file none: their text has no pages to tell apart, and a part that cannot be
   read on its own sends nothing, so such words would only hide the document (a Doc's own heading link still counts). */
const ACCEPTS = Object.freeze({ gslides: ["slide", "page"], gdrive: ["slide", "page"], gsheet: ["tab"], pdf: ["slide", "page"], pptx: ["slide", "page"] });
const accepts = k => (Object.prototype.hasOwnProperty.call(ACCEPTS, k) ? ACCEPTS[k] : null);
/* the words around each anchor (a Google link, or where an attached file is named): each mention goes to the nearest
   anchor that takes it, within 60 characters on the same line (a tie: the one after the words); an anchor takes the
   type of its nearest mention and every number of that type given to it. Sets anchor.words. */
function wordParts(s, anchors, masks) {
  const found = new Map();
  anchors.forEach(a => {
    if (!a.accepts.length) return;
    let from = Math.max(0, a.at - PART.scan), to = Math.min(s.length, a.end + PART.scan);
    const nb = s.slice(from, a.at).lastIndexOf("\n"); if (nb >= 0) from += nb + 1;
    const na = s.slice(a.end, to).indexOf("\n"); if (na >= 0) to = a.end + na;
    let w = s.slice(from, to);
    masks.forEach(([x, y]) => { if (y <= from || x >= to) return; const p = Math.max(x, from) - from, q = Math.min(y, to) - from; w = w.slice(0, p) + " ".repeat(q - p) + w.slice(q); });
    mentionsIn(w, from).forEach(mt => { const was = found.get(mt.at); if (!was || was.end < mt.end) found.set(mt.at, mt); });
  });
  const given = new Map();
  found.forEach(mt => {
    let best = -1, gap0 = Infinity;
    anchors.forEach((a, i) => {
      if (a.accepts.indexOf(mt.type) < 0) return;
      const before = mt.end <= a.at, gap = before ? a.at - mt.end : mt.at >= a.end ? mt.at - a.end : -1;
      if (gap < 0 || gap > PART.near || (gap && s.slice(before ? mt.end : a.end, before ? a.at : mt.at).indexOf("\n") >= 0)) return;
      if (gap < gap0 || (gap === gap0 && before)) { best = i; gap0 = gap; }
    });
    if (best >= 0) { if (!given.has(best)) given.set(best, []); given.get(best).push(Object.assign({ gap: gap0 }, mt)); }
  });
  given.forEach((list, i) => {
    list.sort((x, y) => x.gap - y.gap);
    const t = list[0].type;
    if (t === "tab") { anchors[i].words = mkPart({ kind: "sheet", name: list[0].name, src: "words" }); return; }
    const all = new Set(); list.filter(x => x.type === t).forEach(x => x.nums.forEach(n => all.add(n)));
    const nums = all.size <= PART.items ? Array.from(all).sort((x, y) => x - y) : list[0].nums;
    anchors[i].words = mkPart({ kind: t, nums, src: "words" });
  });
}
/* where an attached file is named in a text: its whole name, or its name without the extension when that is at least 6
   characters; as a word, outside any link; at most 10 times a name */
function nameHits(s, names, masks) {
  const hits = [];
  names.forEach(nm => {
    let re; try { re = new RegExp(nm.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "giu"); } catch (e) { return; }
    let m, n = 0;
    while ((m = re.exec(s)) && n++ < PART.names) {
      const x = m.index, y = x + m[0].length;
      if ((x > 0 && NAME_CH.test(s[x - 1])) || NAME_CH.test(s[y] || "")) continue;
      if (masks.some(([a, b]) => x < b && y > a) || hits.some(([a, b]) => x < b && y > a)) continue;
      hits.push([x, y]);
    }
  });
  return hits;
}
/* the slides or pages a person set on the task (meta.aiDocParts = {"<the document's ref, without a part>": "12-13"}):
   numbers, commas and ranges, at most 20, none over 999; at most 5 documents. It wins over the link and the words. */
const PARTS_REF = /^(?:https:\/\/docs\.google\.com\/presentation\/d\/[A-Za-z0-9_-]{10,128}|https:\/\/drive\.google\.com\/file\/d\/[A-Za-z0-9_-]{10,128}|file:[A-Za-z0-9_.:-]{1,64})$/;
function parseNums(v) {
  if (typeof v !== "string" && typeof v !== "number") return null;
  const s = String(v).replace(/[–—]/g, "-").replace(/\s+/g, "");
  if (!s || s.length > 80 || !/^[\d,-]+$/.test(s)) return null;
  const out = new Set();
  for (const item of s.split(",")) {
    if (!item) continue;
    const m = /^(\d{1,3})(?:-(\d{1,3}))?$/.exec(item); if (!m) return null;
    const a = +m[1], b = m[2] ? +m[2] : a;
    if (a < 1 || b < a || b - a + 1 > PART.items) return null;
    for (let x = a; x <= b; x++) out.add(x);
    if (out.size > PART.items) return null;
  }
  return out.size ? Array.from(out).sort((x, y) => x - y) : null;
}
/* "3,5,7-9": the numbers written back, a run of them as a range */
function numsSpec(nums) {
  const out = [];
  for (let i = 0; i < nums.length; i++) { let j = i; while (j + 1 < nums.length && nums[j + 1] === nums[j] + 1) j++; out.push(j > i ? nums[i] + "-" + nums[j] : String(nums[i])); i = j; }
  return out.join(",");
}
/* meta.aiDocParts as kept: valid refs and numbers only, at most 5; null when nothing is left */
function cleanDocParts(v) {
  if (!isObj(v)) return null;
  const out = {}; let n = 0, looked = 0;
  for (const k in v) {
    if (!Object.prototype.hasOwnProperty.call(v, k)) continue;
    if (n >= LIMITS.docs || looked++ >= 50) break;
    const nums = PARTS_REF.test(k) ? parseNums(v[k]) : null;
    if (nums) { out[k] = numsSpec(nums); n++; }
  }
  return n ? out : null;
}
/* a document whose slides or pages can be set: a deck or a PDF (Google Slides, a Drive file, an attached .pptx or .pdf) */
const takesNums = r => !r.unsupported && (r.kind === "gslides" || r.kind === "gdrive" || (r.kind === "file" && (r.ext === "pdf" || r.ext === "pptx")));
function fileNames(name) {
  const nm = String(name || "").replace(/\s+/g, " ").trim(), out = [], len = v => Array.from(v).length;
  if (len(nm) < 3 || len(nm) > 120) return out;
  out.push(nm);
  const base = nm.replace(/\.[a-z0-9]{1,10}$/i, "").trim(); if (base !== nm && len(base) >= 6) out.push(base);
  return out;
}

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
/* in the order of the brief's fields, the description, then the attachments; each document once — a document with a
   part once per part, and then not again as a whole (only its part is read); at most 20 listed.
   files: [{id, name, type, source, url}]; isStored(url): the file is one this server stored; parts: the task's
   meta.aiDocParts — the slides or pages a person set, over the link's and the words' */
function findRefs(o) {
  o = o || {};
  const out = [], seen = new Set(), add = r => { if (out.length >= LIMITS.found || seen.has(r.key)) return; seen.add(r.key); out.push(r); };
  const set = cleanDocParts(o.parts) || {};
  const manual = (r, p) => {
    const nums = Object.prototype.hasOwnProperty.call(set, r.ref) && takesNums(r) ? parseNums(set[r.ref]) : null;
    return nums ? mkPart({ kind: p && p.kind === "slide" ? "slide" : p && p.kind === "page" ? "page" : r.kind === "gslides" || r.ext === "pptx" ? "slide" : "page", nums, src: "manual" }) : p;
  };
  const withPart = (r, p) => { p = manual(r, p); return p ? Object.assign({}, r, { ref: r.ref + "#" + p.key, key: r.key + "#" + p.key, part: p }) : r; };
  /* the attachments first described: where they are named in the texts, words around the name may give their part */
  const files = [];
  (Array.isArray(o.files) ? o.files : []).forEach(f => {
    if (!isObj(f)) return;
    const name = String(f.name || ""), ext = extOf(name), url = String(f.url || "");
    if (f.type === "image" || f.type === "video" || f.type === "audio" || NOT_DOC_EXT.has(ext)) return;
    const g = parseGoogleUrl(url);
    if (g) {
      const unsupported = g.kind === "gdrive" && OTHER_DOC_EXT.has(ext);
      files.push({ ref: { ref: g.ref, key: g.id, kind: g.kind, id: g.id, title: cleanTitle(name), unsupported }, link: linkPart(url, g.kind), names: fileNames(name), accepts: unsupported ? [] : g.kind === "gdrive" ? accepts(ext) || (READ_EXT.has(ext) ? [] : ACCEPTS.gdrive) : accepts(g.kind) || [] });
      return;
    }
    const m = filestore.URL_RE.exec(url);
    if (!m || f.source !== "server" || (typeof o.isStored === "function" && !o.isStored(url))) return;
    const fext = m[2] !== "bin" ? m[2] : ext;
    if (!READ_EXT.has(fext) && !OTHER_DOC_EXT.has(fext)) return;
    files.push({ ref: { ref: "file:" + String(f.id || m[1]).slice(0, 64), key: "sha:" + m[1], kind: "file", sha: m[1], name: m[1] + "." + m[2], ext: fext, title: cleanTitle(name), unsupported: !READ_EXT.has(fext) }, link: null, names: fileNames(name), accepts: accepts(fext) || [] });
  });
  const fileParts = files.map(() => []);
  let looked = 0;
  (Array.isArray(o.texts) ? o.texts : []).forEach(t => {
    const s = typeof t === "string" ? t : Array.isArray(t) ? t.filter(x => typeof x === "string").join(" ") : "";
    const re = /https:\/\/[^\s<>"'`()[\]{}|\\^]{1,2048}/gi, links = []; let m;
    while ((m = re.exec(s)) && looked < LIMITS.links) {
      looked++;
      const url = m[0].replace(/[.,;:!?*_~]+$/, "");
      links.push({ at: m.index, end: m.index + url.length, len: m[0].length, url, g: parseGoogleUrl(url) });
    }
    const masks = links.map(l => [l.at, l.at + l.len]);
    const anchors = links.filter(l => l.g).map(l => ({ at: l.at, end: l.end, accepts: accepts(l.g.kind) || [], link: l }));
    files.forEach((f, fi) => { if (f.accepts.length && !f.link) nameHits(s, f.names, masks).forEach(([x, y]) => anchors.push({ at: x, end: y, accepts: f.accepts, file: fi })); });
    anchors.forEach(a => { if (a.file !== undefined) masks.push([a.at, a.end]); });
    if (anchors.some(a => a.accepts.length)) wordParts(s, anchors, masks);
    anchors.forEach(a => {
      if (a.file !== undefined) { if (a.words && !fileParts[a.file].some(p => p.key === a.words.key)) fileParts[a.file].push(a.words); return; }
      const g = a.link.g;
      add(withPart({ ref: g.ref, key: g.id, kind: g.kind, id: g.id, title: cleanTitle(linkTitle(s, a.link.at, a.link.len)) }, linkPart(a.link.url, g.kind) || a.words || null));
    });
  });
  files.forEach((f, fi) => {
    if (f.link) add(withPart(f.ref, f.link));
    else if (fileParts[fi].length) fileParts[fi].forEach(p => add(withPart(f.ref, p)));
    else add(withPart(f.ref, null));
  });
  const pointed = new Set(out.filter(r => r.part).map(r => r.key.split("#")[0]));
  return out.filter(r => r.part || !pointed.has(r.key));
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
   what a short document does not use goes to the others; a document cut says so. A document whose part was pinned down
   sends that part (shared with the documents that have no part, whole), then — from what is left, in this order across
   the documents — what continues it, its section heading, its general slides (each at most 1 500 characters); never the
   rest of it. A part that was not pinned down sends nothing. Returns each with text (and along: [{role, n, text}] for a
   part, part.also the slides or pages sent with it), chars, cut, reason and the hash of what is sent. */
const ROLES = ["continues", "heading", "general"];
function fit(docs, budget) {
  const total = LIMITS.budgets.indexOf(budget) >= 0 ? budget : LIMITS.budget;
  const list = (Array.isArray(docs) ? docs : []).map(d => Object.assign({}, d));
  const trim = (chars, take) => (take < chars.length ? chars.slice(0, Math.max(0, take - 1)).join("").trim() + "…" : chars.join(""));
  const read = list.map((d, i) => ({ d, i })).filter(x => x.d.status === "read").map(x => {
    const p = isObj(x.d.part) ? x.d.part : null, pinned = !!p && p.resolved === true && typeof x.d.partRaw === "string";
    const c = cleanDoc(p ? (pinned ? x.d.partRaw : "") : x.d.raw);
    const along = pinned && Array.isArray(x.d.extras) ? x.d.extras.filter(e => isObj(e) && ROLES.indexOf(e.role) >= 0).map((e, k) => {
      const t = Array.from(cleanDoc(e.raw).text);
      return { role: e.role, n: e.n, i: x.i * 10 + k, chars: e.role === "general" && t.length > LIMITS.extraChars ? Array.from(trim(t, LIMITS.extraChars)) : t };
    }) : [];
    return Object.assign(x, { chars: Array.from(c.text), pre: c.cut, along });
  });
  const share = (items, left) => {
    items.slice().sort((a, b) => a.chars.length - b.chars.length || a.i - b.i).forEach((x, k, all) => {
      const each = Math.floor(left / (all.length - k)), take = Math.min(x.chars.length, each);
      x.take = take; left -= take;
    });
    return left;
  };
  let left = share(read, total);
  const along = [].concat(...read.map(x => x.along));
  ROLES.forEach(role => { left = share(along.filter(e => e.role === role), left); });
  read.forEach(x => {
    const d = x.d, cut = x.pre || x.take < x.chars.length, text = trim(x.chars, x.take);
    d.text = text; d.chars = Array.from(text).length;
    if (x.along.length) {
      d.along = x.along.map(e => ({ role: e.role, n: e.n, text: e.take < 1 ? "" : trim(e.chars, e.take) })).filter(e => e.text);
      d.along.forEach(e => { d.chars += Array.from(e.text).length; });
      d.part = Object.assign({}, d.part, { also: d.along.map(e => ({ role: e.role, n: e.n })) });
    } else delete d.along;
    /* with no part, the hash of the text sent as it always was */
    d.hash = isObj(d.part) ? sha(JSON.stringify([text, (d.along || []).map(e => [e.role, e.n, e.text]), partSig(d.part)])) : sha(text);
    if (cut) { d.cut = true; d.reason = "budget"; } else if (d.reason === "budget" || !isObj(d.part) || d.part.resolved !== false) { delete d.cut; delete d.reason; }
    delete d.raw; delete d.partRaw; delete d.extras;
  });
  list.forEach(d => { delete d.raw; delete d.partRaw; delete d.extras; });
  return list;
}
/* what a person and a run see of a document: never its text */
function outDoc(d) {
  const o = { ref: d.ref, kind: d.kind, title: d.title || fallbackTitle(d), status: STATUSES.indexOf(d.status) >= 0 ? d.status : "error" };
  if (typeof d.chars === "number" && (o.status === "read")) o.chars = d.chars;
  if (d.cut) o.cut = true;
  if (d.reason) o.reason = String(d.reason).slice(0, 40);
  const p = outPart(d.part); if (p) o.part = p;
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
/* a deck's slides in the presentation's own order (ppt/presentation.xml's sldIdLst through its rels), each numbered by
   its place; without those, by the files' numbers as before */
async function slideOrder(buf, entries, budget) {
  const byName = new Map(entries.map(e => [e.name, e]));
  const byFile = entries.map(e => [e, /^ppt\/slides\/slide(\d{1,4})\.xml$/.exec(e.name)]).filter(x => x[1]).sort((a, b) => +a[1][1] - +b[1][1]).slice(0, LIMITS.slides).map(([e, m]) => ({ e, n: +m[1] }));
  const pres = byName.get("ppt/presentation.xml"), rels = byName.get("ppt/_rels/presentation.xml.rels");
  if (!pres || !rels) return byFile;
  const order = [];
  try {
    const px = (await zipRead(buf, pres, budget)).toString("utf8"), rx = (await zipRead(buf, rels, budget)).toString("utf8");
    const target = new Map(), rre = /<Relationship\b[^<>]{0,2000}>/g; let m;
    while ((m = rre.exec(rx)) && target.size < LIMITS.zipEntries) { const id = /\sId\s*=\s*"([^"]{1,64})"/.exec(m[0]), t = /\sTarget\s*=\s*"([^"]{1,300})"/.exec(m[0]); if (id && t) target.set(id[1], t[1]); }
    const a = px.search(/<(?:[A-Za-z][\w.-]{0,20}:)?sldIdLst[\s>]/); if (a < 0) return byFile;
    const b = px.slice(a).search(/<\/(?:[A-Za-z][\w.-]{0,20}:)?sldIdLst\s*>/), seg = px.slice(a, b < 0 ? px.length : a + b);
    const sre = /<(?:[A-Za-z][\w.-]{0,20}:)?sldId\b[^<>]{0,500}>/g;
    while ((m = sre.exec(seg)) && order.length < LIMITS.slides) {
      const r = /\s[A-Za-z][\w.-]{0,20}:id\s*=\s*"([^"]{1,64})"/.exec(m[0]), t = r ? target.get(r[1]) : null; if (!t) continue;
      const path = t.replace(/^\//, "").replace(/^\.\//, ""), name = path.startsWith("ppt/") ? path : "ppt/" + path, e = byName.get(name);
      if (e && /^ppt\/slides\/slide\d{1,4}\.xml$/.test(name) && !order.some(x => x.e === e)) order.push({ e, n: order.length + 1 });
    }
  } catch (e) { if (e && e.zip === "zip_limits") throw e; return byFile; }
  return order.length ? order : byFile;
}
/* the slide's own id in Google Slides' PowerPoint export: its shapes are named "Google Shape;<n>;<slide id>" (checked
   on a real export: every shape of a slide ends with that slide's id, some shapes are only "Shape <n>"); the most
   common one on the slide, null when none is */
const GOOGLE_SHAPE = /\sname="Google Shape;\d{1,9};([A-Za-z0-9_-]{1,100})(?::notes)?"/g;
function googleIds(xml) {
  const count = new Map(); let m, n = 0;
  GOOGLE_SHAPE.lastIndex = 0;
  while ((m = GOOGLE_SHAPE.exec(xml)) && n++ < 2000) count.set(m[1], (count.get(m[1]) || 0) + 1);
  let best = null, top = 0; count.forEach((c, id) => { if (c > top) { best = id; top = c; } });
  return best;
}
/* a slide's title: the text of its title placeholder, else its first line */
function slideTitle(xml, text) {
  const re = /<([A-Za-z][\w.-]{0,20}):sp[\s>]/g; let m, n = 0;
  while ((m = re.exec(xml)) && n++ < 300) {
    const end = xml.indexOf("</" + m[1] + ":sp>", m.index); if (end < 0) break;
    const seg = xml.slice(m.index, end);
    if (/<[A-Za-z][\w.-]{0,20}:ph\b[^<>]{0,300}\stype="(?:title|ctrTitle)"/.test(seg)) return xmlText(seg, "a").replace(/\s+/g, " ").trim().slice(0, 200);
    re.lastIndex = end;
  }
  return firstLine(text);
}
const firstLine = t => (String(t || "").split("\n").map(x => x.trim()).find(Boolean) || "").slice(0, 200);

/* ---------- what else of a deck or a PDF goes with the part pointed to ----------
   One deck often holds many briefs: only the part pointed to is sent, with what belongs to it — (a) up to 2 slides
   after it that continue it (no title, its own title, or a title saying it continues: "lanjutan", "cont.", "(2)"…;
   the first other title stops it), (b) the slide just before it when that is a title alone (≤ 60 characters: the
   campaign or the section), (c) up to 2 general slides, the earliest (overview, background, brand guidelines, timeline,
   latar belakang, panduan, catatan umum…), each cut to 1 500 characters. Everything else of the document is left out. */
const CONT_MARK = /\(\s{0,2}(?:lanjutan|lanj\.?|sambungan|cont(?:'d|\.|inued)?|[2-9]|ii|iii)\s{0,2}\)|(?:^|[^a-z])(?:lanjutan|sambungan|continued|cont'd|cont\.?)(?![a-z])|(?:^|[^0-9])[2-9]\s{0,2}\/\s{0,2}[2-9](?![0-9])|(?:^|[^a-z])(?:part|bagian)\s{1,2}[2-9](?![0-9])/i;
const GENERAL = ["do's & don'ts", "do's and don'ts", "dos & don'ts", "dos and don'ts", "do & don't", "do and don't", "do & dont", "brand guidelines", "brand guideline", "key messages", "key message", "target audience", "tone of voice",
  "catatan umum", "latar belakang", "pesan utama", "informasi umum", "info umum", "gambaran umum", "ketentuan umum", "overview", "background", "objectives", "objective", "guidelines", "guideline", "mandatories", "mandatory",
  "timeline", "deadlines", "deadline", "general", "umum", "tujuan", "panduan", "ketentuan", "tone", "audience"];
const GENERAL_WITH = new Set("& and dan of the a for untuk all semua brand merek campaign kampanye project proyek notes note catatan elements elemen info informasi voice komunikasi communication key utama pesan".split(" "));
const FORMAT_WORD = /(?:^|[^a-z])(?:feeds?|posts?|story|stories|carousel|karosel|reels?|kv|key visual|banner|poster|video|konten|tiktok|motion)(?![a-z])/i;
const normTitle = t => String(t || "").toLowerCase().replace(CONT_MARK, " ").replace(/[^\p{L}\p{N}]+/gu, " ").trim().slice(0, 200);
/* a general slide's title: a general phrase, with at most one other word beside the joining ones, and no kind of work */
function isGeneral(title) {
  let t = String(title || "").toLowerCase().replace(/[’`]/g, "'").replace(/\s+/g, " ").trim().slice(0, 120), hit = false;
  if (!t || FORMAT_WORD.test(t)) return false;
  GENERAL.forEach(g => {
    for (let i = t.indexOf(g), n = 0; i >= 0 && n < 5; i = t.indexOf(g, i + 1), n++) {
      if (/[\p{L}\p{N}]/u.test(t[i - 1] || "") || /[\p{L}\p{N}]/u.test(t[i + g.length] || "")) continue;
      t = t.slice(0, i) + " " + t.slice(i + g.length); hit = true; break;
    }
  });
  return hit && t.split(/[^\p{L}\p{N}'&]+/u).filter(w => w && !GENERAL_WITH.has(w) && !/^\d{1,4}$/.test(w)).length <= 1;
}
/* units: [{n, title, text}] in order; nums: the part's numbers (all of them in units) → [{role, n}] */
function relevant(units, nums) {
  const pointed = new Set(nums), at = n => units.findIndex(u => u.n === n), first = at(nums[0]), last = at(nums[nums.length - 1]);
  const titles = new Set(units.filter(u => pointed.has(u.n)).map(u => normTitle(u.title)).filter(Boolean)), out = [], taken = n => pointed.has(n) || out.some(x => x.n === n);
  for (let i = last + 1, k = 0; i < units.length && k < 2; i++) {
    const u = units[i]; if (pointed.has(u.n)) continue;
    const t = String(u.title || "").trim();
    if (!t || CONT_MARK.test(t) || titles.has(normTitle(t))) { out.push({ role: "continues", n: u.n }); k++; } else break;
  }
  const h = units[first - 1];
  if (h && !taken(h.n)) { const len = Array.from(String(h.text || "").replace(/\s+/g, " ").trim()).length; if (len >= 1 && len <= 60) out.push({ role: "heading", n: h.n }); }
  for (let i = 0, k = 0; i < units.length && k < 2; i++) { const u = units[i]; if (!taken(u.n) && isGeneral(u.title)) { out.push({ role: "general", n: u.n }); k++; } }
  return out;
}
/* the reading of a part from its units: the part's own text ("Slide 5: …"), what goes with it, or — the part not in the
   document — nothing at all */
function partReading(units, want, unit) {
  const of = units.length, nums = want.nums;
  if (!nums || !nums.length || !nums.every(k => units.some(u => u.n === k))) return { status: "read", raw: "", part: unresolvePart(want, nums && nums.length ? "range" : "id", { of }) };
  const label = n => (unit === "slide" ? "Slide " : "Page ") + n + ": ", none = "(no text on this " + unit + ")";
  const partRaw = units.filter(u => nums.indexOf(u.n) >= 0).map(u => label(u.n) + (u.text || none)).join("\n");
  const extras = relevant(units, nums).map(x => { const u = units.find(v => v.n === x.n); return { role: x.role, n: x.n, raw: u.text || none }; });
  return { status: "read", raw: "", partRaw, extras, part: resolvePart(want, { nums, of }) };
}
async function officeText(buf, part) {
  let entries;
  try { entries = zipEntries(buf); } catch (e) { return zipStatus(e); }
  const budget = { left: LIMITS.zipTotalBytes };
  try {
    const doc = entries.find(e => e.name === "word/document.xml");
    if (doc) return { status: "read", raw: xmlText((await zipRead(buf, doc, budget)).toString("utf8"), "w") };
    const slides = await slideOrder(buf, entries, budget);
    if (!slides.length) return { status: "unsupported", reason: "type" };
    const want = isObj(part) && (part.kind === "slide" || part.kind === "page") ? part : null;
    let raw = "";
    if (!want) {
      for (const { e, n } of slides) {
        const t = xmlText((await zipRead(buf, e, budget)).toString("utf8"), "a").trim();
        if (t) raw += "Slide " + n + ": " + t + "\n";
        if (raw.length > LIMITS.rawChars) break;
      }
      return { status: "read", raw };
    }
    /* a part: every slide is read (its text and title; only the slides' own XML, never a picture), so that its number —
       or its Google id — can be found, the deck counted and what goes with the part picked */
    const units = [];
    for (const { e, n } of slides) {
      const xml = (await zipRead(buf, e, budget)).toString("utf8"), text = xmlText(xml, "a").trim();
      units.push({ n, text, title: slideTitle(xml, text), id: want.objectId ? googleIds(xml) : null });
    }
    let nums = want.nums && want.nums.length ? want.nums : null;
    if (!nums && want.objectId) { const at = units.filter(u => u.id === want.objectId); if (at.length === 1) nums = [at[0].n]; }
    return partReading(units, nums ? Object.assign({}, want, { nums }) : want, "slide");
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
async function pdfText(buf, part) {
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
  const strip = t => t.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
  /* a part: every page apart (its text and its first line as a title), within the inflate limit; then the pages pointed
     to and what goes with them (partReading) — never the rest */
  if (isObj(part) && (part.kind === "slide" || part.kind === "page") && pages.length) {
    const units = [], tally = { good: 0, bad: 0 };
    for (let i = 0; i < pages.length; i++) {
      const a = { out: "", good: 0, bad: 0, y: null }, p = pages[i], fonts = await fontsOf(p.res);
      for (const c of p.contents) { const o = await objAt(c); if (o && o.stream) contentText(o.stream.toString("latin1"), fonts, a); }
      const text = strip(a.out).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").trim();
      units.push({ n: i + 1, text, title: firstLine(text) }); tally.good += a.good; tally.bad += a.bad;
    }
    if (!readable(units.map(u => u.text).join("\n")) || tally.good < tally.bad) return { status: "unsupported", reason: "no_text" };
    return partReading(units, part, "page");
  }
  const acc = { out: "", good: 0, bad: 0, y: null };
  for (const p of pages) {
    if (acc.out.length > LIMITS.rawChars) break;
    const fonts = await fontsOf(p.res);
    for (const c of p.contents) { const o = await objAt(c); if (o && o.stream) contentText(o.stream.toString("latin1"), fonts, acc); }
    acc.out += "\n";
  }
  /* no page tree to follow: every stream that shows text, in the file's order */
  if (!pages.length) for (const [num] of where) { if (acc.out.length > LIMITS.rawChars) break; const o = await objAt(num); if (o && o.stream && !/\/Subtype\s*\/Image|\/Length[123]\s|\/Type\s*\/(XRef|ObjStm|Metadata)/.test(o.dict)) { const t = o.stream.toString("latin1"); if (/\bBT\b/.test(t)) contentText(t, null, acc); } }
  const text = strip(acc.out);
  if (!(readable(text) && acc.good >= acc.bad)) return { status: "unsupported", reason: "no_text" };
  /* a part asked for where no page can be told apart: nothing of the document is sent */
  return isObj(part) ? { status: "read", raw: "", part: unresolvePart(part, "format") } : { status: "read", raw: text };
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
async function fileText(buf, hint, part) {
  const ext = hint.ext || extOf(hint.name), type = String(hint.type || "").toLowerCase();
  if (buf.length >= 5 && buf.toString("latin1", 0, 5) === "%PDF-") return pdfText(buf, part);
  if (buf.length >= 4 && buf.readUInt32LE(0) === 0x04034b50) return officeText(buf, part);
  if (ext === "pdf" || ext === "docx" || ext === "pptx") return { status: "error", reason: "corrupt" };
  if (TEXT_EXT.has(ext) || /^text\/(plain|csv|markdown|x-markdown|tab-separated-values)\b/.test(type) || (!ext && /^text\//.test(type))) {
    const t = decodeText(buf); return t === null ? { status: "unsupported", reason: "type" } : { status: "read", raw: t };
  }
  return { status: "unsupported", reason: "type" };
}

/* ---------- a Google Docs export as HTML: its text, and the section under one heading ----------
   One pass over the tags, each looked for once (a "<" with no ">" after it ends the reading), so hostile markup
   cannot make it spin. */
const BLOCK_TAGS = new Set(["p", "div", "br", "li", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "table", "ul", "ol", "hr", "blockquote", "pre", "section", "article", "header", "footer"]);
const SKIP_TAGS = new Set(["style", "script", "head", "title"]);
const HTML_NAMED = { nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", hellip: "…", ndash: "–", mdash: "—", bull: "•", middot: "·" };
const htmlDecode = s => decodeEntities(s.replace(/&(nbsp|rsquo|lsquo|rdquo|ldquo|hellip|ndash|mdash|bull|middot);/gi, (m, e) => HTML_NAMED[e.toLowerCase()]));
function htmlText(h) {
  let out = "", i = 0, gt = -1;
  while (i < h.length && out.length <= LIMITS.rawChars) {
    const lt = h.indexOf("<", i);
    if (lt < 0) { out += htmlDecode(h.slice(i).replace(/[\r\n\t]+/g, " ")); break; }
    if (lt > i) out += htmlDecode(h.slice(i, lt).replace(/[\r\n\t]+/g, " "));
    if (gt <= lt) gt = h.indexOf(">", lt);
    if (gt < 0) break;
    if (gt - lt > 4000) { i = lt + 1; continue; }
    const tag = h.slice(lt + 1, gt), m = /^(\/?)([a-zA-Z][a-zA-Z0-9]{0,15})/.exec(tag), name = m ? m[2].toLowerCase() : "";
    i = gt + 1;
    if (m && !m[1] && SKIP_TAGS.has(name) && !/\/\s*$/.test(tag)) {
      const close = new RegExp("<\\/" + name + "\\s*>", "ig"); close.lastIndex = i;
      const c = close.exec(h); if (!c) break;
      i = c.index + c[0].length; continue;
    }
    if (BLOCK_TAGS.has(name)) out += "\n"; else if (name === "td" || name === "th") out += " ";
  }
  return out;
}
/* the section under the heading whose id is hid ("h.…", as Google writes it on the heading or on an anchor inside it):
   from that heading to the next one of its level or above; null when no h1–h6 holds that id */
function htmlSection(h, hid) {
  if (typeof h !== "string" || !HEADING_ID.test(String(hid))) return null;
  let at = -1;
  ["id=\"", "id='", "name=\"", "name='"].forEach(a => { const k = h.indexOf(a + hid + a[a.length - 1]); if (k >= 0 && (at < 0 || k < at)) at = k; });
  if (at < 0) return null;
  const from = Math.max(0, at - 3000), back = h.slice(from, at), re = /<h([1-6])(?=[\s>])/gi;
  let m, open = -1, level = 0;
  while ((m = re.exec(back))) { open = from + m.index; level = +m[1]; }
  if (open < 0 || new RegExp("<\\/h" + level + "\\s*>", "i").test(h.slice(open, at))) return null;
  const close = new RegExp("<\\/h" + level + "\\s*>", "ig"); close.lastIndex = at;
  const c = close.exec(h); if (!c) return null;
  const headEnd = c.index + c[0].length, next = /<h([1-6])(?=[\s>])/gi; next.lastIndex = headEnd;
  let end = h.length;
  while ((m = next.exec(h))) if (+m[1] <= level) { end = m.index; break; }
  const body = h.search(/<body[\s>]/i), start = body < 0 ? 0 : body;
  const title = Array.from(cleanTitle(htmlText(h.slice(open, headEnd)))).slice(0, 60).join("").trim();
  return { title, part: htmlText(h.slice(open, end)), rest: htmlText(h.slice(start, open)) + "\n" + htmlText(h.slice(end)) };
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
/* the export of one Google file: {status:"ok", body, type, html?, name, etag, lastModified} | {status:"not_modified"} |
   {status, reason} — 10 s for the whole of it, redirects by hand, the size counted. v: the export for a part
   (exportUrl); with v.html a web page is taken only when Google sends it as a download (Content-Disposition attachment
   with a .html name) — a sign-in page never is — and the caller still takes it only with the heading it looks for */
async function fetchGoogle(r, prev, o, v) {
  const doFetch = o.fetch, ctl = typeof AbortController === "function" ? new AbortController() : null;
  let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(() => { try { ctl && ctl.abort(); } catch (e) { /* gone */ } resolve({ status: "error", reason: "timeout" }); }, o.timeoutMs); });
  const chain = (async () => {
    let url = exportUrl(r, v);
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
      const type = String(get("content-type") || "").toLowerCase(), disp = String(get("content-disposition") || "");
      const html = /^text\/html|^application\/xhtml/.test(type);
      if (html && !(isObj(v) && v.html && /^\s*attachment\b/i.test(disp) && /\.html?$/i.test(dispositionName(disp)))) { drain(res); return { status: "not_public", reason: "html" }; }
      if (/^(image|video|audio|font)\//.test(type)) { drain(res); return { status: "unsupported", reason: "type" }; }
      const len = +(get("content-length") || 0);
      if (len > o.fetchBytes) { drain(res); return { status: "too_large", reason: "over_5mb" }; }
      const body = await readCapped(res, o.fetchBytes);
      if (body === null) return { status: "too_large", reason: "over_5mb" };
      if (!html && looksHtml(body)) return { status: "not_public", reason: "html" };
      return Object.assign({ status: "ok", body, type, name: dispositionName(disp), etag: get("etag") || null, lastModified: get("last-modified") || null }, html ? { html: true } : {});
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
  const named = (name, ext) => cleanTitle(String(name || "").replace(ext, ""));
  async function google(r, prev) {
    const p = r.part;
    if (isObj(p) && r.kind === "gslides" && (p.kind === "slide" || p.kind === "page")) return slidesPart(r, prev);
    if (isObj(p) && r.kind === "gsheet" && (p.gid != null || p.range)) return sheetPart(r, prev);
    /* a tab named in the brief's words: Google exports a tab by its gid only, so it cannot be read on its own */
    if (isObj(p) && r.kind === "gsheet" && p.name) return notPinned(r, "name");
    if (isObj(p) && r.kind === "gdoc" && p.kind === "heading") return headingPart(r, prev);
    const g = await fetchGoogle(r, prev, o);
    if (g.status !== "ok") return g;
    const name = g.name || "", title = cleanTitle(r.kind === "gdrive" ? name : name.replace(/\.(txt|csv)$/i, ""));
    let out;
    if (r.kind === "gdrive") out = await fileText(g.body, { name, type: g.type }, p);
    else { const t = decodeText(g.body); out = t === null ? { status: "unsupported", reason: "type" } : { status: "read", raw: t }; }
    return Object.assign(out, { title, etag: g.etag, lastModified: g.lastModified });
  }
  /* a part that cannot be read on its own: nothing of the document is read (never the whole of it instead) */
  const notPinned = (r, why) => ({ status: "read", raw: "", part: unresolvePart(r.part, why) });
  /* Slides with a slide pointed to: its PowerPoint export (the text export runs the slides together), fetched whole —
     up to 50 MB and 25 seconds, the deck's pictures never unpacked — and kept only as the text read from it */
  async function slidesPart(r, prev) {
    const g = await fetchGoogle(r, prev, Object.assign({}, o, { fetchBytes: o.pptxBytes, timeoutMs: o.pptxTimeoutMs }), { pptx: true });
    if (g.status === "not_modified") return g;
    if (g.status === "too_large") return notPinned(r, "size");
    if (g.status === "error" && g.reason === "timeout") return notPinned(r, "timeout");
    if (g.status !== "ok") return g;
    const out = await officeText(g.body, r.part);
    if (out.status !== "read") return notPinned(r, out.status === "too_large" ? "size" : "format");
    return Object.assign(out, { title: named(g.name, /\.pptx$/i) }, out.part && out.part.resolved ? { etag: g.etag, lastModified: g.lastModified } : {});
  }
  /* a Sheet with a tab pointed to: that tab (and range) as CSV; when Google will not give it, nothing */
  async function sheetPart(r, prev) {
    const p = r.part, g = await fetchGoogle(r, prev, o, { gid: p.gid, range: p.range });
    if (g.status === "not_modified") return g;
    if (g.status === "ok") {
      const t = decodeText(g.body);
      return t === null ? { status: "unsupported", reason: "type" } : { status: "read", raw: "", partRaw: t, part: resolvePart(p), title: named(g.name, /\.csv$/i), etag: g.etag, lastModified: g.lastModified };
    }
    return (g.status === "error" && g.reason === "http") || (g.status === "not_public" && g.reason === "not_found") ? notPinned(r, "tab") : g;
  }
  /* a Doc with a heading pointed to: the HTML export, taken only as Google's download and only with that very heading
     in an h1–h6 (a sign-in page never passes); the section under it alone */
  async function headingPart(r, prev) {
    const p = r.part, g = await fetchGoogle(r, prev, o, { html: true });
    if (g.status === "not_modified") return g;
    if (g.status === "ok" && g.html) {
      const sec = htmlSection(g.body.toString("utf8"), p.heading);
      return sec ? { status: "read", raw: "", partRaw: sec.part, part: resolvePart(p, sec.title ? { headingText: sec.title } : {}), title: named(g.name, /\.html?$/i), etag: g.etag, lastModified: g.lastModified } : notPinned(r, "heading");
    }
    if (g.status === "ok") return notPinned(r, "format");
    /* a web page, not Google's download: a sign-in page, unless the text export shows the Doc is public after all */
    if (g.status === "not_public" && g.reason === "html") { const t = await fetchGoogle(r, null, o); return t.status === "ok" ? notPinned(r, "format") : t; }
    return g;
  }
  async function stored(r) {
    const file = fileFor(r.name); if (!file) return { status: "error", reason: "missing" };
    let st; try { st = fs.statSync(file); } catch (e) { return { status: "error", reason: "missing" }; }
    if (st.size > o.fileBytes) return { status: "too_large", reason: "over_15mb" };
    const buf = TEXT_EXT.has(r.ext) ? (() => { const fd = fs.openSync(file, "r"); try { const b = Buffer.alloc(Math.min(st.size, LIMITS.rawChars * 4 + 8)); fs.readSync(fd, b, 0, b.length, 0); return b; } finally { fs.closeSync(fd); } })() : fs.readFileSync(file);
    return fileText(buf, { ext: r.ext }, r.part);
  }
  async function readOne(r) {
    /* a document with a part is kept apart from the same document whole (what is read differs) */
    const key = (r.kind === "file" ? "file:" + r.sha + "." + r.ext : r.kind + ":" + r.id) + (isObj(r.part) ? "#" + r.part.key : "");
    /* only text read (a part pinned down, or a document with none) is kept 10 minutes; a part that could not be, as a
       failure, a minute */
    const good = h => h.status === "read" && !(isObj(h.part) && h.part.resolved === false);
    const hit = cache.get(key), age = hit ? clock() - hit.at : Infinity;
    if (hit && age < (good(hit) ? o.ttlMs : o.failTtlMs)) return hit;
    if (pending.has(key)) return pending.get(key);
    const job = (async () => {
      let res;
      try { res = r.kind === "file" ? await stored(r) : await google(r, hit && good(hit) && (hit.etag || hit.lastModified) ? hit : null); }
      catch (e) { res = { status: "error", reason: "corrupt" }; }
      if (res.status === "not_modified") res = Object.assign({}, hit);
      /* read although a part was pointed to that this kind of document cannot give apart (or a tab by its name): the
         part is not pinned down and nothing of the document is sent */
      if (isObj(r.part) && res.status === "read" && !res.part) res = { status: "read", raw: "", part: unresolvePart(r.part, r.part.kind === "sheet" && r.part.name ? "name" : "format"), title: res.title };
      if (isObj(res.part) && res.part.resolved === false && res.status === "read") { res.raw = ""; delete res.partRaw; delete res.extras; res.reason = PART_REASON[res.part.why] || "part_not_found"; }
      ["raw", "partRaw"].forEach(k => { if (typeof res[k] === "string" && res[k].length > LIMITS.rawChars + 1) res[k] = res[k].slice(0, LIMITS.rawChars + 1); });
      if (Array.isArray(res.extras)) res.extras.forEach(x => { if (x.raw.length > LIMITS.rawChars + 1) x.raw = x.raw.slice(0, LIMITS.rawChars + 1); });
      res.at = clock(); remember(key, res);
      return res;
    })();
    pending.set(key, job);
    try { return await job; } finally { pending.delete(key); }
  }
  /* each planned document "ready" is read; the others keep their status. The text is in raw (and the part pointed to
     in partRaw), for fit() */
  async function read(planned) {
    const list = Array.isArray(planned) ? planned : [];
    return Promise.all(list.map(async r => {
      if (r.status !== "ready") return Object.assign({}, r);
      const g = await readOne(r);
      const out = Object.assign({}, r, { status: g.status, title: g.title || r.title });
      if (g.reason) out.reason = g.reason; else delete out.reason;
      if (g.part) out.part = g.part;
      if (g.status === "read") { out.raw = g.raw || ""; if (typeof g.partRaw === "string") out.partRaw = g.partRaw; if (Array.isArray(g.extras)) out.extras = g.extras.map(x => Object.assign({}, x)); }
      return out;
    }));
  }
  return { read, readOne, clear: () => cache.clear(), size: () => cache.size };
}

module.exports = {
  LIMITS, PART, KIND_NAME, STATUSES, findRefs, plan, fit, outDoc, outPart, cleanDocParts, createReader,
  pure: { parseGoogleUrl, exportUrl, allowedHop, isLogin, cleanDoc, cleanTitle, decodeText, zipEntries, zipRead, xmlText, officeText, pdfText, parseCMap, fileText, readable, fetchGoogle, dispositionName,
    linkPart, mentionsIn, partLabel, resolvePart, unresolvePart, htmlText, htmlSection, googleIds, slideTitle, isGeneral, relevant, parseNums, numsSpec }
};
