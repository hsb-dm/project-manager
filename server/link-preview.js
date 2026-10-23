/* A LINK'S PICTURE, SHOWN BEFORE ITS VIEWER (Oct 2026): a Figma file, a YouTube, Vimeo or Loom video.

   Figma's embed (src/version-preview.js) loads Figma's whole viewer: several MB of code, WebGL and the file's own
   data, for a whole file tens of MB. A video's player is the same story, smaller: YouTube's is about a megabyte of
   script before the first frame. A version or a file that is such a link took seconds to show anything. Now the task
   shows the link's thumbnail at once, and the provider's viewer only when someone asks for it ("Open interactive",
   "Play").

   Which links, their key or id, and the oEmbed address each is asked at come from server/oembed-links.js, which the
   link names of /api/links/title (server/messages.js) use too; its link check is shared/link-providers.js, the one the
   page makes to decide which link shows its picture first. So a link the page draws as a picture is the link asked
   about here, and the name and the picture of a link are asked about the same link. The table below (PROVIDERS) adds
   what is only this route's: the hosts a request may go to, how long an answer is kept, what "not yours to see" is,
   and the shape the page draws the picture in. What each provider answers, checked against real public links (23 Oct
   2026):
   - Figma, https://www.figma.com/api/oembed?url=… —
       {"version":"1.0","type":"rich","title":"Twenty","key":"xt8O…","url":"https://www.figma.com/design/xt8O…?",
        "provider_name":"Figma","cache_age":3600,"width":800,"height":450,"html":"<iframe … embed.figma.com …>",
        "folder_name":"…","thumbnail_url":"https://api-cdn.figma.com/resize/thumbnails/<uuid>?expiration=<in 3 days>
        &signature=…&height=448&bucket=figma-alpha","thumbnail_width":800,"thumbnail_height":448}
     and for a private or unknown file 404 {"error":true,"status":404,"message":"Not found."}. The thumbnail is the
     file's own (a link with node-id gets the same one), a WebP of about 20 KB at an address signed for days.
   - YouTube, https://www.youtube.com/oembed?format=json&url=https://www.youtube.com/watch?v=<id> —
       {"title":"…","author_name":"…","author_url":"…","type":"video","height":113,"width":200,"version":"1.0",
        "provider_name":"YouTube","provider_url":"https://www.youtube.com/","thumbnail_height":360,
        "thumbnail_width":480,"thumbnail_url":"https://i.ytimg.com/vi/<id>/hqdefault.jpg","html":"<iframe …>"}
     width and height are the player's shape (200 × 113, 16:9; a 4:3 video 200 × 150); the thumbnail is 480 × 360 with
     the picture letterboxed in it (a JPEG of about 20 KB). A Short asked as /shorts/<id> answers 113 × 200 and
     thumbnail …/hq2.jpg; asked as watch?v= the same video answers 200 × 113. A private video is 403 "Forbidden", one
     whose owner turned embedding off 401 "Unauthorized", an id that is no video 400 "Bad Request". No duration.
   - Vimeo, https://vimeo.com/api/oembed.json?url=https://vimeo.com/<id>[/<hash>]&width=1280 —
       {"type":"video","version":"1.0","provider_name":"Vimeo","title":"Big Buck Bunny","author_name":"Blender",
        "html":"<iframe src=\"https://player.vimeo.com/video/1084537?app_id=122963\" …>","width":1280,"height":720,
        "duration":597,"thumbnail_url":"https://i.vimeocdn.com/video/<n>-<hex>-d_960?region=us",
        "thumbnail_width":960,"thumbnail_height":540,"video_id":1084537,"uri":"/videos/1084537",…}
     (without width=1280 the thumbnail is 295 × 166). An unknown or private video, and an unlisted one asked without
     its hash, is 404 "404 Not Found" (text/html); an unlisted one limited to other sites answers 200 with only
     {"type","version","provider_name","html","width","height","domain_status_code":403,"video_id","uri"}: no title
     and no thumbnail, shown as private.
   - Loom, https://www.loom.com/v1/oembed?url=https://www.loom.com/share/<id> —
       {"type":"video","version":"1.0","html":"<iframe src=\"https://www.loom.com/embed/<id>\" …>","height":960,
        "width":1280,"provider_name":"Loom","thumbnail_height":960,"thumbnail_width":1280,
        "thumbnail_url":"https://cdn.loom.com/sessions/thumbnails/<id>-00001.jpg","duration":21,"title":"…",
        "description":"…"}
     (a 4:3 recording here; ?sid= on the link changes nothing). An unknown or private video is 404 "Not Found"
     (text/plain). Loom's CDN sends the JPEG as application/octet-stream, so for Loom the bytes alone decide.
   Each picture is downloaded here and kept with the other uploaded images (server/uploads.js, /files/<sha256>.<ext>:
   behind the session, kept for ever by the browser). The page never loads anything from the providers' CDNs, and
   the CSP's img-src is what it was.

   This is not a fetch-anything endpoint. It fetches only:
   - the oEmbed address, built from a checked link's id (https, the provider's own hosts, no user name, no port, an id
     of the provider's form: Figma's key of letters and digits, YouTube's 11 characters, Vimeo's number and hex hash,
     Loom's 32 hex digits) — never the link as it was written;
   - the thumbnail_url that reply names, when it is https on the provider's own picture hosts (figma.com and its
     subdomains; i.ytimg.com, i1–i9.ytimg.com; i.vimeocdn.com; cdn.loom.com), without a user name or a port. Any other
     address in the reply is never asked for;
   - redirects followed by hand, at most 3, each to an address the same rule allows;
   - 256 KB for the oEmbed reply and 5 MB for the picture, counted as they arrive; 10 seconds for each;
   - a picture only: PNG, JPEG, WebP or GIF by its first bytes, and called a picture (Loom: or octet-stream).
   The network itself is server/messages.js's guarded fetch (guardedFetch): the name is resolved and checked at
   connect time, so no address can lead to the server's own network. Tests give it a stand-in (deps.fetch), and so do
   the browser tests (COS_LINK_FETCH_STUB, a module under e2e/ only).

   How long a picture is kept. Figma: 6 hours. Figma itself says its answer may be kept an hour (cache_age 3600), and
   a design under review changes during the day; the picture is only the cover, and the interactive viewer is always
   the file as it is now. 6 hours keeps the cover at most a morning or an afternoon behind, while Figma is asked about
   a file at most 4 times a day however many people open it. A video: 7 days, as a video's thumbnail rarely changes
   once it is published. "Refresh preview" asks again at once (not more than once a minute per link). Past its time
   the old picture is still shown at once and a new one is fetched behind it, for the next time. Private (not found,
   or no thumbnail) is asked again after an hour, as someone may share it; a failure (a timeout, the provider down)
   after 10 minutes, keeping the old picture meanwhile.

   Signed-in members only (the route is not in server.js OPEN). 60 asks a minute per person; each provider is asked at
   most 30 times a minute for the workspace and 12 for one person, and one link is fetched once however many ask at
   once. */
"use strict";
const path = require("path");
const uploads = require("./uploads");
/* which links, their key or id, and the oEmbed address of their picture (built from that key or id alone) */
const links = require("./oembed-links");
const { parseLink, parseFigmaLink, nameFromLink } = links;

const LIMITS = Object.freeze({
  timeoutMs: 10000, jsonBytes: 256 * 1024, thumbBytes: 5 * 1024 * 1024, redirects: 3, refreshGapMs: 60e3,
  callsPerMinute: 60, fetchesPerMinute: 30, userFetchesPerMinute: 12
});
const UA = "ZenCrevia-LinkPreview/1.0";
const MIN = 60e3, HOUR = 60 * MIN, DAY = 24 * HOUR;
/* Each provider, for this route: the hosts a request may go to (its oEmbed; its pictures), how long an answer is kept
   (ok, private, failed), the statuses that mean "not yours to see", the shape the page draws the picture in (Figma's
   thumbnail; a video's player, oEmbed's width and height) and whether a picture called application/octet-stream is
   taken (Loom's CDN calls its JPEGs that: the bytes decide). An address as a number never ends in figma.com. */
const PROVIDERS = {
  figma: { oembedHost: h => h === "www.figma.com", thumbHost: h => h === "figma.com" || (h.length <= 253 && /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+figma\.com$/.test(h)),
    okMs: 6 * HOUR, privateMs: HOUR, errorMs: 10 * MIN, denied: [401, 403, 404], shape: "thumb", anyType: false },
  youtube: { oembedHost: h => h === "www.youtube.com", thumbHost: h => /^i[0-9]?\.ytimg\.com$/.test(h),
    okMs: 7 * DAY, privateMs: HOUR, errorMs: 10 * MIN, denied: [400, 401, 403, 404], shape: "player", anyType: false },
  vimeo: { oembedHost: h => h === "vimeo.com", thumbHost: h => h === "i.vimeocdn.com",
    okMs: 7 * DAY, privateMs: HOUR, errorMs: 10 * MIN, denied: [401, 403, 404], shape: "player", anyType: false },
  loom: { oembedHost: h => h === "www.loom.com", thumbHost: h => h === "cdn.loom.com",
    okMs: 7 * DAY, privateMs: HOUR, errorMs: 10 * MIN, denied: [401, 403, 404], shape: "player", anyType: true }
};
for (const id of Object.keys(PROVIDERS)) { PROVIDERS[id].id = id; PROVIDERS[id].oembed = p => links.pictureOembedUrl(Object.assign({}, p, { provider: id })); }
const providerOf = prov => (typeof prov === "string" ? PROVIDERS[prov] : prov) || PROVIDERS.figma;

/* the provider's oEmbed for a checked link's picture (a Figma one when it names no provider, as parseFigmaLink gives) */
function oembedUrl(p) { return providerOf(p.provider).oembed(p); }
/* Where a request (or a redirect) may go: https, no user name, no port; the oEmbed on the provider's own host, the
   picture on its picture hosts. */
function allowedHop(href, which, prov) {
  const pv = providerOf(prov);
  let u; try { u = new URL(String(href || "")); } catch (e) { return null; }
  if (u.protocol !== "https:" || u.username || u.password || u.port) return null;
  const h = u.hostname.toLowerCase();
  if (which === "oembed") return pv.oembedHost(h) ? u : null;
  if (which === "thumb") return pv.thumbHost(h) ? u : null;
  return null;
}
const cleanTitle = raw => { const t = String(raw || "").replace(/<[^>]*>/g, " ").replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim(); return /^(figma|youtube|vimeo|loom|untitled|log ?in|sign ?in)$/i.test(t) ? "" : t.slice(0, 160); };
const dim = v => { const n = Math.round(+v); return n >= 1 && n <= 10000 ? n : null; };
const seconds = v => { const n = Math.round(+v); return n >= 1 && n <= 7 * 86400 ? n : null; };
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
/* One address, guarded: {status:"ok", body, type} | {status:"denied"} (the provider's "not yours to see": 401, 403,
   404, and for YouTube 400) | {status:"error", reason}. */
async function fetchGuarded(doFetch, url, which, o, accept, max, prov) {
  const pv = providerOf(prov);
  const ctl = new AbortController(); let timer;
  const deadline = new Promise(resolve => { timer = setTimeout(() => { try { ctl.abort(); } catch (e) { /* gone */ } resolve({ status: "error", reason: "timeout" }); }, o.timeoutMs); });
  const chain = (async () => {
    let next = url;
    for (let hop = 0; ; hop++) {
      const u = allowedHop(next, which, pv); if (!u) return { status: "error", reason: "refused" };
      const res = await doFetch(u.href, { method: "GET", redirect: "manual", credentials: "omit", headers: { accept, "user-agent": UA }, signal: ctl.signal });
      const st = +(res && res.status) || 0, get = k => (res.headers && typeof res.headers.get === "function" ? res.headers.get(k) : null);
      if (st >= 300 && st < 400) {
        const loc = get("location"); drain(res);
        let to = null; try { to = loc ? new URL(loc, u.href).href : null; } catch (e) { to = null; }
        if (!to || !allowedHop(to, which, pv)) return { status: "error", reason: "redirect_refused" };
        if (hop >= o.redirects) return { status: "error", reason: "too_many_redirects" };
        next = to; continue;
      }
      if (pv.denied.indexOf(st) >= 0) { drain(res); return { status: "denied" }; }
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
/* What the provider says about a link, and its picture: {status:"ok", title, buf, width, height, duration} |
   {status:"private", title} | {status:"error", reason, title}. width and height are the shape the page draws the
   picture in: Figma's thumbnail; a video's player (oEmbed width and height), whatever shape its thumbnail is. */
async function lookUp(doFetch, prov, p, o) {
  const pv = providerOf(prov);
  const oe = await fetchGuarded(doFetch, pv.oembed(p), "oembed", o, "application/json", o.jsonBytes, pv);
  if (oe.status === "denied") return { status: "private", title: "" };
  if (oe.status !== "ok") return { status: "error", reason: oe.reason, title: "" };
  let j = null; try { j = JSON.parse(oe.body.toString("utf8")); } catch (e) { j = null; }
  if (!j || typeof j !== "object" || Array.isArray(j)) return { status: "error", reason: "format", title: "" };
  if (j.error) return +j.status === 404 || +j.status === 403 ? { status: "private", title: "" } : { status: "error", reason: "format", title: "" };
  const title = cleanTitle(j.title), thumb = typeof j.thumbnail_url === "string" ? j.thumbnail_url : "";
  /* no thumbnail: Figma's private file, Vimeo's video limited to other sites (domain_status_code 403) */
  if (!thumb) return { status: "private", title };
  if (!allowedHop(thumb, "thumb", pv)) return { status: "error", reason: "thumb_refused", title };
  const th = await fetchGuarded(doFetch, thumb, "thumb", o, "image/webp,image/png,image/jpeg,image/gif;q=0.9", o.thumbBytes, pv);
  if (th.status !== "ok") return { status: "error", reason: th.status === "denied" ? "thumb_gone" : th.reason, title };
  const kind = uploads.imageKind(th.body);
  const called = /^image\/(png|jpeg|webp|gif)\b/.test(th.type) || (pv.anyType && /^(application\/octet-stream\b|$)/.test(th.type));
  if (!kind || !called) return { status: "error", reason: "not_image", title };
  const player = pv.shape === "player";
  return { status: "ok", title, buf: th.body, width: dim(player ? j.width : j.thumbnail_width), height: dim(player ? j.height : j.thumbnail_height), duration: seconds(j.duration) };
}
const lookFigma = (doFetch, p, o) => lookUp(doFetch, PROVIDERS.figma, p, o);

function create(db, opts) {
  opts = opts || {};
  const o = Object.assign({}, LIMITS, opts.limits || {});
  if (typeof opts.fetch !== "function") throw new Error("link-preview needs a fetch");
  const doFetch = opts.fetch, clock = typeof opts.now === "function" ? opts.now : Date.now;
  const store = typeof opts.store === "function" ? opts.store : buf => uploads.putGenerated(db, buf, null);
  db.exec("CREATE TABLE IF NOT EXISTS link_previews (provider TEXT NOT NULL, file_key TEXT NOT NULL, title TEXT DEFAULT '', thumb TEXT, width INTEGER, height INTEGER, status TEXT NOT NULL, reason TEXT, fetched_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(provider, file_key))");
  /* a video's length, in seconds (Vimeo and Loom say it): a column the first Figma-only table did not have */
  if (!db.prepare("PRAGMA table_info(link_previews)").all().some(c => c.name === "duration")) db.exec("ALTER TABLE link_previews ADD COLUMN duration INTEGER");
  const read = (key, provider) => db.prepare("SELECT * FROM link_previews WHERE provider=? AND file_key=?").get(provider || "figma", key) || null;
  const write = (provider, key, r) => db.prepare("INSERT INTO link_previews(provider,file_key,title,thumb,width,height,duration,status,reason,fetched_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(provider,file_key) DO UPDATE SET title=excluded.title,thumb=excluded.thumb,width=excluded.width,height=excluded.height,duration=excluded.duration,status=excluded.status,reason=excluded.reason,fetched_at=excluded.fetched_at,expires_at=excluded.expires_at")
    .run(provider, key, r.title || "", r.thumb || null, r.width || null, r.height || null, r.duration || null, r.status, r.reason || null, r.fetched_at, r.expires_at);
  /* the per-minute counts: asks per person, and fetches from each provider for the workspace and per person */
  const win = { minute: -1, calls: new Map(), fetches: new Map(), userFetches: new Map() };
  const tick = () => { const m = Math.floor(clock() / 60000); if (m !== win.minute) { win.minute = m; win.calls.clear(); win.fetches.clear(); win.userFetches.clear(); } };
  const mayFetch = (provider, userId) => { tick(); return (win.fetches.get(provider) || 0) < o.fetchesPerMinute && (win.userFetches.get(provider + "|" + userId) || 0) < o.userFetchesPerMinute; };
  const counted = (provider, userId) => { win.fetches.set(provider, (win.fetches.get(provider) || 0) + 1); win.userFetches.set(provider + "|" + userId, (win.userFetches.get(provider + "|" + userId) || 0) + 1); };
  /* one fetch per link at a time; a Figma file's slot is its bare key, as it always was */
  const inflight = new Map();
  const slot = p => (p.provider === "figma" ? p.key : p.provider + ":" + p.key);
  const refreshNow = (p, userId) => {
    const s = slot(p), pv = PROVIDERS[p.provider];
    if (inflight.has(s)) return inflight.get(s);
    counted(p.provider, userId);
    const job = (async () => {
      const got = await lookUp(doFetch, pv, p, o), at = clock(), prev = read(p.key, p.provider);
      if (got.status === "ok") {
        let thumb = null; try { thumb = store(got.buf); } catch (e) { thumb = null; }
        if (thumb) { write(p.provider, p.key, { title: got.title, thumb, width: got.width, height: got.height, duration: got.duration, status: "ok", fetched_at: at, expires_at: at + pv.okMs }); return read(p.key, p.provider); }
        got.status = "error"; got.reason = "store";
      }
      if (got.status === "private") { write(p.provider, p.key, { title: got.title, status: "private", fetched_at: at, expires_at: at + pv.privateMs }); return read(p.key, p.provider); }
      /* a failure keeps a picture already there, and is asked again in 10 minutes */
      if (prev && prev.status === "ok") { write(p.provider, p.key, Object.assign({}, prev, { reason: got.reason, expires_at: at + pv.errorMs })); return read(p.key, p.provider); }
      write(p.provider, p.key, { title: got.title || (prev && prev.title) || "", status: "error", reason: got.reason, fetched_at: at, expires_at: at + pv.errorMs });
      return read(p.key, p.provider);
    })().finally(() => inflight.delete(s));
    inflight.set(s, job); return job;
  };
  const out = (p, row) => {
    const ok = !!row && row.status === "ok";
    const r = {
      provider: p.provider, key: p.key, title: (row && row.title) || p.name || "",
      thumb: ok ? row.thumb : null, width: ok ? row.width || null : null, height: ok ? row.height || null : null
    };
    if (p.provider === "figma") r.nodeId = p.nodeId;
    r.private = !!row && row.status === "private"; r.unavailable = !row || row.status === "error";
    r.fetchedAt = row ? new Date(row.fetched_at).toISOString() : null;
    if (ok && row.duration) r.duration = row.duration;
    return r;
  };
  const fail = (status, msg) => { const e = new Error(msg); e.status = status; return e; };
  /* GET /api/link-preview?url=…[&refresh=1] */
  async function get(userId, url, refresh) {
    if (!userId) throw fail(401, "Please sign in");
    tick();
    const n = (win.calls.get(userId) || 0) + 1; win.calls.set(userId, n);
    if (n > o.callsPerMinute) throw fail(429, "Too many preview requests. Wait a minute.");
    const p = parseLink(url);
    if (!p) throw fail(400, "Only a Figma file or a YouTube, Vimeo or Loom video has a preview here.");
    const row = read(p.key, p.provider), now = clock(), s = slot(p);
    if (row && refresh && now - row.fetched_at < o.refreshGapMs) return out(p, row);
    if (row && !refresh && row.expires_at > now) return out(p, row);
    /* past its time, a picture is shown at once and a new one fetched behind it, for the next time */
    const stale = !!row && !refresh && row.status === "ok";
    if (inflight.has(s)) return out(p, stale ? row : await inflight.get(s));
    if (!mayFetch(p.provider, userId)) return out(p, row);
    if (stale) { refreshNow(p, userId).catch(() => {}); return out(p, row); }
    return out(p, await refreshNow(p, userId));
  }
  return { get, parse: parseLink, read, inflight };
}

/* The browser tests' stand-in for the providers (e2e/serve.js): a module under e2e/ that exports fetch(url, init).
   Anything else named here is ignored, so this cannot load code from anywhere on a real server. */
function stubFrom(file, root) {
  if (!file) return null;
  const dir = path.join(root, "e2e") + path.sep, full = path.resolve(root, String(file));
  if (!full.startsWith(dir) || !/\.js$/.test(full)) { console.warn("[link-preview] COS_LINK_FETCH_STUB ignored: only a module under e2e/ is used"); return null; }
  const m = require(full), f = m && typeof m.fetch === "function" ? m.fetch : typeof m === "function" ? m : null;
  if (f) console.log("[link-preview] link previews are answered by " + path.relative(root, full) + " (browser tests)");
  return f;
}

/* server.js: the route */
function register(db, deps) {
  const svc = create(db, { fetch: deps.fetch, limits: deps.limits, now: deps.now, store: deps.store });
  deps.route("GET", "/api/link-preview", (u, p, q) => svc.get(u && u.id, q.url, q.refresh === "1"));
  return svc;
}

module.exports = { register, create, stubFrom, LIMITS, PROVIDERS, pure: { parseLink, parseFigmaLink, oembedUrl, allowedHop, nameFromLink, cleanTitle, fetchGuarded, lookUp, lookFigma } };
