/* A FIGMA FILE'S PICTURE, SHOWN BEFORE ITS VIEWER (Oct 2026).

   Figma's embed (src/version-preview.js) loads Figma's whole viewer: several MB of code, WebGL and the file's own
   data, for a whole file tens of MB. A version or a file that is a Figma link took seconds to show anything. Now the
   task shows the file's thumbnail at once, and Figma's viewer only when someone asks for it ("Open interactive").

   Where the picture comes from: Figma's oEmbed, https://www.figma.com/api/oembed?url=…, the address Figma publishes
   for this and the one /api/links/title reads names from (server/messages.js). Checked against a real public file
   (23 Oct 2026), it answers
     {"version":"1.0","type":"rich","title":"Twenty","key":"xt8O…","url":"https://www.figma.com/design/xt8O…?",
      "provider_name":"Figma","cache_age":3600,"width":800,"height":450,"html":"<iframe … embed.figma.com …>",
      "folder_name":"…","thumbnail_url":"https://api-cdn.figma.com/resize/thumbnails/<uuid>?expiration=<in 3 days>
      &signature=…&height=448&bucket=figma-alpha","thumbnail_width":800,"thumbnail_height":448}
   and for a private or unknown file 404 {"error":true,"status":404,"message":"Not found."}. The thumbnail is the
   file's own: a link with node-id gets the same one. It is a WebP of about 20 KB at an address that is signed and
   expires within days, so it is downloaded here and kept with the other uploaded images (server/uploads.js,
   /files/<sha256>.webp: behind the session, kept for ever by the browser). The page never loads anything from
   Figma's CDN, and the CSP's img-src is what it was.

   This is not a fetch-anything endpoint. It fetches only:
   - the oEmbed address, built here from a figma.com file link's kind and key (https, figma.com or www.figma.com, no
     user name, no port, a key of letters and digits) — never the link as it was written;
   - the thumbnail_url that reply names, when it is https on figma.com or one of its subdomains, without a user name
     or a port. Any other address in the reply is never asked for;
   - redirects followed by hand, at most 3, each to an address the same rule allows;
   - 256 KB for the oEmbed reply and 5 MB for the picture, counted as they arrive; 10 seconds for each;
   - a picture only: PNG, JPEG, WebP or GIF by its first bytes, whatever the reply calls it.
   The network itself is server/messages.js's guarded fetch (guardedFetch): the name is resolved and checked at
   connect time, so no address can lead to the server's own network. Tests give it a stand-in (deps.fetch), and so do
   the browser tests (COS_LINK_FETCH_STUB, a module under e2e/ only).

   How long a picture is kept: 6 hours. Figma itself says its answer may be kept an hour (cache_age 3600), and a
   design under review changes during the day; the picture is only the cover, and the interactive viewer is always
   the file as it is now. 6 hours keeps the cover at most a morning or an afternoon behind, while Figma is asked about
   a file at most 4 times a day however many people open it; "Refresh preview" asks again at once (not more than once a
   minute per file). After the 6 hours the old picture is still shown at once and a new one is fetched behind it, for
   the next time. A private file (not found, or no thumbnail) is asked again after an hour, as someone may share it;
   a failure (a timeout, Figma down) after 10 minutes, keeping the old picture meanwhile.

   Signed-in members only (the route is not in server.js OPEN). 60 asks a minute per person; Figma is asked at most
   30 times a minute for the workspace and 12 for one person, and one file is fetched once however many ask at once. */
"use strict";
const path = require("path");
const uploads = require("./uploads");

const LIMITS = Object.freeze({
  timeoutMs: 10000, jsonBytes: 256 * 1024, thumbBytes: 5 * 1024 * 1024, redirects: 3,
  okMs: 6 * 3600e3, privateMs: 3600e3, errorMs: 10 * 60e3, refreshGapMs: 60e3,
  callsPerMinute: 60, fetchesPerMinute: 30, userFetchesPerMinute: 12
});
const UA = "ZenCrevia-LinkPreview/1.0";
const KIND = /^\/(file|design|proto|board|slides|make|deck)\/([A-Za-z0-9]{2,128})(?=\/|$)(?:\/([^/]*))?/;
const NODE = /^[A-Za-z0-9:;_-]{1,64}$/;

/* the words of a link's name part: figma.com/design/KEY/Hero-Banner-Q4 -> "Hero Banner Q4" */
function nameFromLink(seg) {
  let s = String(seg || ""); try { s = decodeURIComponent(s); } catch (e) { /* as written */ }
  s = s.replace(/[\u0000-\u001f\u007f<>]/g, "").replace(/[-_]+/g, " ").replace(/\s+/g, " ").trim();
  return s.length > 120 ? s.slice(0, 119) + "…" : s;
}
/* A Figma file link, checked: {kind, key, nodeId, name} or null. Only https on figma.com / www.figma.com, no user
   name, no port, a file, design, prototype, board, slides, make or deck address with a key of letters and digits. */
function parseFigmaLink(raw) {
  const text = String(raw || "").trim(); if (!text || text.length > 2000) return null;
  let u; try { u = new URL(text); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase(); if (h !== "figma.com" && h !== "www.figma.com") return null;
  const m = KIND.exec(u.pathname); if (!m) return null;
  const node = u.searchParams.get("node-id");
  return { kind: m[1], key: m[2], nodeId: node && NODE.test(node) ? node : null, name: nameFromLink(m[3]) };
}
/* Figma's oEmbed for a file, built from its kind and key alone: the thumbnail is the file's, whatever frame the link
   opens on, and nothing else the link carried (its query, its fragment, its name) goes to Figma. www.figma.com it
   must be: Figma answers a figma.com address with "expected the url host to be a figma host". */
function oembedUrl(p) { return "https://www.figma.com/api/oembed?url=" + encodeURIComponent("https://www.figma.com/" + p.kind + "/" + p.key); }
/* Where a request (or a redirect) may go: https, no user name, no port; the oEmbed on www.figma.com, the picture on
   figma.com or a subdomain of it. An address as a number never ends in figma.com. */
function allowedHop(href, which) {
  let u; try { u = new URL(String(href || "")); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase();
  if (which === "oembed") return h === "www.figma.com" ? u : null;
  if (which === "thumb") return h === "figma.com" || (h.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+figma\.com$/.test(h)) ? u : null;
  return null;
}
const cleanTitle = raw => { const t = String(raw || "").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim(); return /^(figma|untitled|log ?in|sign ?in)$/i.test(t) ? "" : t.slice(0, 160); };
const dim = v => { const n = Math.round(+v); return n >= 1 && n <= 10000 ? n : null; };
function drain(res) { try { if (res && res.body && typeof res.body.cancel === "function") res.body.cancel().catch(() => {}); } catch (e) { /* gone */ } }
/* the body, up to max bytes as it arrives; null past it */
async function readCapped(res, max) {
  if (!res.body || typeof res.body.getReader !== "function") { const b = Buffer.from(await res.arrayBuffer()); return b.length > max ? null : b; }
  const reader = res.body.getReader(), chunks = []; let size = 0;
  for (;;) {
    const { done, value } = await reader.read(); if (done) break;
    size += value.byteLength; if (size > max) { reader.cancel().catch(() => {}); return null; }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks);
}
/* One address, guarded: {status:"ok", body, type} | {status:"denied"} (401/403/404) | {status:"error", reason}. */
async function fetchGuarded(doFetch, url, which, o, accept, max) {
  const ctl = new AbortController(); let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(() => { try { ctl.abort(); } catch (e) { /* gone */ } resolve({ status: "error", reason: "timeout" }); }, o.timeoutMs); });
  const chain = (async () => {
    let next = url;
    for (let hop = 0; ; hop++) {
      const u = allowedHop(next, which); if (!u) return { status: "error", reason: "refused" };
      const res = await doFetch(u.href, { method: "GET", redirect: "manual", credentials: "omit", headers: { accept, "user-agent": UA }, signal: ctl.signal });
      const st = +(res && res.status) || 0, get = k => (res.headers && typeof res.headers.get === "function" ? res.headers.get(k) : null);
      if (st >= 300 && st < 400) {
        const loc = get("location"); drain(res);
        let to = null; try { to = loc ? new URL(loc, u.href).href : null; } catch (e) { to = null; }
        if (!to || !allowedHop(to, which)) return { status: "error", reason: "redirect_refused" };
        if (hop >= o.redirects) return { status: "error", reason: "too_many_redirects" };
        next = to; continue;
      }
      if (st === 401 || st === 403 || st === 404) { drain(res); return { status: "denied" }; }
      if (st === 429) { drain(res); return { status: "error", reason: "rate_limited" }; }
      if (st !== 200) { drain(res); return { status: "error", reason: "http" }; }
      const len = +(get("content-length") || 0);
      if (len > max) { drain(res); return { status: "error", reason: "too_large" }; }
      const body = await readCapped(res, max);
      if (!body) return { status: "error", reason: "too_large" };
      return { status: "ok", body, type: String(get("content-type") || "").toLowerCase() };
    }
  })().catch(() => ({ status: "error", reason: ctl.signal.aborted ? "timeout" : "network" }));
  try { return await Promise.race([chain, deadline]); } finally { clearTimeout(timer); }
}
/* What Figma says about a file, and its picture: {status:"ok", title, buf, width, height} | {status:"private", title}
   | {status:"error", reason, title}. */
async function lookFigma(doFetch, p, o) {
  const oe = await fetchGuarded(doFetch, oembedUrl(p), "oembed", o, "application/json", o.jsonBytes);
  if (oe.status === "denied") return { status: "private", title: "" };
  if (oe.status !== "ok") return { status: "error", reason: oe.reason, title: "" };
  let j = null; try { j = JSON.parse(oe.body.toString("utf8")); } catch (e) { j = null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { status: "error", reason: "format", title: "" };
  if (j.error) return +j.status === 404 || +j.status === 403 ? { status: "private", title: "" } : { status: "error", reason: "format", title: "" };
  const title = cleanTitle(j.title), thumb = typeof j.thumbnail_url === "string" ? j.thumbnail_url : "";
  if (!thumb) return { status: "private", title };
  if (!allowedHop(thumb, "thumb")) return { status: "error", reason: "thumb_refused", title };
  const th = await fetchGuarded(doFetch, thumb, "thumb", o, "image/webp,image/png,image/jpeg,image/gif;q=0.9", o.thumbBytes);
  if (th.status !== "ok") return { status: "error", reason: th.status === "denied" ? "thumb_gone" : th.reason, title };
  const kind = uploads.imageKind(th.body);
  if (!kind || !/^image\/(png|jpeg|webp|gif)\b/.test(th.type)) return { status: "error", reason: "not_image", title };
  return { status: "ok", title, buf: th.body, width: dim(j.thumbnail_width), height: dim(j.thumbnail_height) };
}

function create(db, opts) {
  opts = opts || {};
  const o = Object.assign({}, LIMITS, opts.limits || {});
  if (typeof opts.fetch !== "function") throw new Error("link-preview needs a fetch");
  const doFetch = opts.fetch, clock = typeof opts.now === "function" ? opts.now : Date.now;
  const store = typeof opts.store === "function" ? opts.store : buf => uploads.putGenerated(db, buf, null);
  db.exec("CREATE TABLE IF NOT EXISTS link_previews (provider TEXT NOT NULL, file_key TEXT NOT NULL, title TEXT DEFAULT '', thumb TEXT, width INTEGER, height INTEGER, status TEXT NOT NULL, reason TEXT, fetched_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(provider, file_key))");
  const read = key => db.prepare("SELECT * FROM link_previews WHERE provider='figma' AND file_key=?").get(key) || null;
  const write = (key, r) => db.prepare("INSERT INTO link_previews(provider,file_key,title,thumb,width,height,status,reason,fetched_at,expires_at) VALUES('figma',?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,file_key) DO UPDATE SET title=excluded.title,thumb=excluded.thumb,width=excluded.width,height=excluded.height,status=excluded.status,reason=excluded.reason,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at")
    .run(key, r.title || "", r.thumb || null, r.width || null, r.height || null, r.status, r.reason || null, r.fetched_at, r.expires_at);
  /* the per-minute counts: asks per person, and fetches from Figma for the workspace and per person */
  const win = { minute: -1, calls: new Map(), fetches: 0, userFetches: new Map() };
  const tick = () => { const m = Math.floor(clock() / 60000); if (m !== win.minute) { win.minute = m; win.calls.clear(); win.fetches = 0; win.userFetches.clear(); } };
  const mayFetch = userId => { tick(); return win.fetches < o.fetchesPerMinute && (win.userFetches.get(userId) || 0) < o.userFetchesPerMinute; };
  const counted = userId => { win.fetches++; win.userFetches.set(userId, (win.userFetches.get(userId) || 0) + 1); };
  const inflight = new Map();
  /* fetch and keep; one fetch per file however many ask at once */
  const refreshNow = (p, userId) => {
    if (inflight.has(p.key)) return inflight.get(p.key);
    counted(userId);
    const job = (async () => {
      const got = await lookFigma(doFetch, p, o), at = clock(), prev = read(p.key);
      if (got.status === "ok") {
        let thumb = null; try { thumb = store(got.buf); } catch (e) { thumb = null; }
        if (thumb) { write(p.key, { title: got.title, thumb, width: got.width, height: got.height, status: "ok", fetched_at: at, expires_at: at + o.okMs }); return read(p.key); }
        got.status = "error"; got.reason = "store";
      }
      if (got.status === "private") { write(p.key, { title: got.title, status: "private", fetched_at: at, expires_at: at + o.privateMs }); return read(p.key); }
      /* a failure keeps a picture already there, and is asked again in 10 minutes */
      if (prev && prev.status === "ok") { write(p.key, Object.assign({}, prev, { reason: got.reason, expires_at: at + o.errorMs })); return read(p.key); }
      write(p.key, { title: got.title || (prev && prev.title) || "", status: "error", reason: got.reason, fetched_at: at, expires_at: at + o.errorMs });
      return read(p.key);
    })().finally(() => inflight.delete(p.key));
    inflight.set(p.key, job); return job;
  };
  const out = (p, row) => ({
    provider: "figma", key: p.key, title: (row && row.title) || p.name || "",
    thumb: row && row.status === "ok" ? row.thumb : null, width: row && row.status === "ok" ? row.width || null : null, height: row && row.status === "ok" ? row.height || null : null,
    nodeId: p.nodeId, private: !!row && row.status === "private", unavailable: !row || row.status === "error",
    fetchedAt: row ? new Date(row.fetched_at).toISOString() : null
  });
  const fail = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
  /* GET /api/link-preview?url=…[&refresh=1] */
  async function get(userId, url, refresh) {
    if (!userId) throw fail(401, "Please sign in");
    tick();
    const n = (win.calls.get(userId) || 0) + 1; win.calls.set(userId, n);
    if (n > o.callsPerMinute) throw fail(429, "Too many preview requests. Wait a minute.");
    const p = parseFigmaLink(url);
    if (!p) throw fail(400, "Only a Figma file link has a preview here.");
    const row = read(p.key), now = clock();
    if (row && refresh && now - row.fetched_at < o.refreshGapMs) return out(p, row);
    if (row && !refresh && row.expires_at > now) return out(p, row);
    /* past its 6 hours, a picture is shown at once and a new one fetched behind it, for the next time */
    const stale = !!row && !refresh && row.status === "ok";
    if (inflight.has(p.key)) return out(p, stale ? row : await inflight.get(p.key));
    if (!mayFetch(userId)) return out(p, row);
    if (stale) { refreshNow(p, userId).catch(() => {}); return out(p, row); }
    return out(p, await refreshNow(p, userId));
  }
  return { get, parse: parseFigmaLink, read, inflight };
}

/* The browser tests' stand-in for Figma (e2e/serve.js): a module under e2e/ that exports fetch(url, init). Anything
   else named here is ignored, so this cannot load code from anywhere on a real server. */
function stubFrom(file, root) {
  if (!file) return null;
  const dir = path.join(root, "e2e") + path.sep, full = path.resolve(root, String(file));
  if (!full.startsWith(dir) || !/\.js$/.test(full)) { console.warn("[link-preview] COS_LINK_FETCH_STUB ignored: only a module under e2e/ is used"); return null; }
  const m = require(full), f = m && typeof m.fetch === "function" ? m.fetch : typeof m === "function" ? m : null;
  if (f) console.log("[link-preview] Figma is answered by " + path.relative(root, full) + " (browser tests)");
  return f;
}

/* server.js: the route */
function register(db, deps) {
  const svc = create(db, { fetch: deps.fetch, limits: deps.limits, now: deps.now, store: deps.store });
  deps.route("GET", "/api/link-preview", (u, p, q) => svc.get(u && u.id, q.url, q.refresh === "1"));
  return svc;
}

module.exports = { register, create, stubFrom, LIMITS, pure: { parseFigmaLink, oembedUrl, allowedHop, nameFromLink, cleanTitle, fetchGuarded, lookFigma } };
