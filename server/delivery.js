"use strict";
/* ============================================================
   COMPRESSED DELIVERY (Oct 2026, performance) — the page and other static files, and large JSON replies, compressed
   on libuv's thread pool (zlib's asynchronous calls), never on the server's one thread inside a request.

   Static files (createStatic). A file is read and its ETag (a SHA-1 of its bytes) made when it is first asked for or
   has changed (its mtime or size): a few milliseconds for the 3.6 MB page. Its compressed copies are made in the
   background, brotli and gzip together; a request that comes before they are there waits for them (at most
   firstWaitMs, the server answering others meanwhile), then sends what there is — the uncompressed file if nothing.
   A file over bestFrom bytes (the page) is first compressed at brotli quality 5 (some 75 ms of the pool for the page,
   where quality 9 took a quarter of a second of the server itself), then again at quality 11 (some 6 s; about 8% less
   than quality 9). The quality-11 copy and the gzip one are kept in cacheDir, named by the file's SHA-1, so a restart
   with the same page sends the smallest copy from the first request; a copy read back is used only when it
   decompresses to the very bytes of the file, and copies of other versions of the file are removed.
   Every copy has the file's ETag, as before: a browser with any of them gets 304.

   JSON (sendJson). A body over JSON_ASYNC_FROM bytes is compressed in the background — brotli quality 4 when the
   browser takes it (smaller and faster than gzip: the 4 MB start-up data of a 1,500-task workspace, 599 KB in 22 ms
   against 841 KB in 49 ms at gzip 6), else gzip 6. A smaller body is gzipped at once, as it always was (well under a
   millisecond). What the browser decodes is the same bytes either way.
   toJson / withParts / rawJson: an object whose top-level values may be JSON already written (the start-up data's
   task list, the same for everyone until a write): the same text JSON.stringify would give, without writing that
   part again.
   ============================================================ */
const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const crypto = require("crypto");

const BR_QUALITY = zlib.constants.BROTLI_PARAM_QUALITY, BR_SIZE_HINT = zlib.constants.BROTLI_PARAM_SIZE_HINT;
const brotli = (buf, quality) => new Promise((resolve, reject) => zlib.brotliCompress(buf, { params: { [BR_QUALITY]: quality, [BR_SIZE_HINT]: buf.length } }, (e, out) => (e ? reject(e) : resolve(out))));
const gzip = (buf, level) => new Promise((resolve, reject) => zlib.gzip(buf, { level }, (e, out) => (e ? reject(e) : resolve(out))));
const unbrotli = buf => new Promise((resolve, reject) => zlib.brotliDecompress(buf, (e, out) => (e ? reject(e) : resolve(out))));
const gunzip = buf => new Promise((resolve, reject) => zlib.gunzip(buf, (e, out) => (e ? reject(e) : resolve(out))));

const FIRST_BR_QUALITY = 5;     /* the first brotli copy of a large file, until the quality-11 one is there */
const SMALL_BR_QUALITY = 9;     /* a file under bestFrom: compressed once, as before */
const GZIP_LEVEL = 9;
const accepts = req => { const ae = String((req && req.headers && req.headers["accept-encoding"]) || ""); return { br: /\bbr\b/.test(ae), gzip: /\bgzip\b/.test(ae) }; };

function createStatic(o) {
  o = o || {};
  const mime = o.mime || {}, compressible = o.compressible || new Set(), cacheDir = o.cacheDir || null;
  const bestFrom = o.bestFrom || 256 * 1024, firstWaitMs = o.firstWaitMs || 3000;
  const log = o.log || ((msg) => console.warn(msg));
  const cache = new Map();

  /* the copies kept on disk for one version of one file */
  const safe = s => String(s).replace(/[^\w.-]+/g, "_");
  const diskOf = (file, hex) => { const base = safe(path.basename(file)) + "."; return { base, br: path.join(cacheDir, base + hex + ".br"), gzip: path.join(cacheDir, base + hex + ".gz") }; };
  async function readDisk(d, raw) {
    const [br, gz] = await Promise.all([fs.promises.readFile(d.br), fs.promises.readFile(d.gzip)]);
    const [a, b] = await Promise.all([unbrotli(br), gunzip(gz)]);
    return a.equals(raw) && b.equals(raw) ? { br, gzip: gz } : null;
  }
  async function writeDisk(d, br, gz) {
    await fs.promises.mkdir(cacheDir, { recursive: true, mode: 0o700 });
    const tmp = "." + process.pid + "-" + crypto.randomBytes(4).toString("hex") + ".tmp";
    await fs.promises.writeFile(d.br + tmp, br, { mode: 0o600 }); await fs.promises.rename(d.br + tmp, d.br);
    await fs.promises.writeFile(d.gzip + tmp, gz, { mode: 0o600 }); await fs.promises.rename(d.gzip + tmp, d.gzip);
    /* other versions of this file (and anything half-written) go */
    const keep = new Set([path.basename(d.br), path.basename(d.gzip)]);
    for (const name of await fs.promises.readdir(cacheDir)) {
      if (name.startsWith(d.base) && !keep.has(name) && /\.(br|gz)(\.[\w.-]+\.tmp)?$/.test(name)) await fs.promises.rm(path.join(cacheDir, name), { force: true }).catch(() => {});
    }
  }

  function compressInBackground(file, e, hex) {
    const big = e.raw.length > bestFrom, disk = big && cacheDir ? diskOf(file, hex) : null;
    const current = () => cache.get(file) === e;
    e.first = (async () => {
      if (disk) {
        const kept = await readDisk(disk, e.raw).catch(() => null);
        if (kept) { e.br = kept.br; e.gzip = kept.gzip; e.brQuality = 11; e.fromDisk = true; return; }
      }
      const [br, gz] = await Promise.all([brotli(e.raw, big ? FIRST_BR_QUALITY : SMALL_BR_QUALITY).catch(() => null), gzip(e.raw, GZIP_LEVEL).catch(() => null)]);
      /* both at once, so a browser that takes brotli is never sent gzip only because gzip was done first */
      if (br) { e.br = br; e.brQuality = big ? FIRST_BR_QUALITY : SMALL_BR_QUALITY; }
      if (gz) e.gzip = gz;
    })().catch(() => {}).then(() => { e.firstDone = true; });
    e.best = e.first.then(async () => {
      if (!big || e.brQuality >= 11 || !current()) return;
      const best = await brotli(e.raw, 11).catch(() => null);
      if (!best) return;
      if (!e.br || best.length < e.br.length) { e.br = best; e.brQuality = 11; }
      if (disk && e.gzip && current()) await writeDisk(disk, e.br, e.gzip).catch(err => log("[static] could not keep the compressed " + path.basename(file) + ": " + err.message));
    }).catch(() => {}).then(() => { e.bestDone = true; });
  }

  /* the file as it is now: its bytes, type and ETag at once; the compressed copies as soon as they are made */
  function entry(file) {
    const st = fs.statSync(file), key = st.mtimeMs + ":" + st.size, hit = cache.get(file);
    if (hit && hit.key === key) return hit;
    const raw = fs.readFileSync(file), ext = path.extname(file), sha = crypto.createHash("sha1").update(raw).digest();
    const e = { key, raw, type: mime[ext] || "application/octet-stream", etag: '"' + sha.toString("base64url") + '"', br: null, gzip: null, brQuality: 0, first: null, best: null, firstDone: true, bestDone: true, fromDisk: false };
    cache.set(file, e);
    if (compressible.has(ext) && raw.length > 1024) { e.firstDone = false; e.bestDone = false; compressInBackground(file, e, sha.toString("hex")); }
    return e;
  }
  /* the encoding to send now: brotli, else gzip, when the browser takes it and the copy is there */
  function pick(req, e) { const a = accepts(req); return a.br && e.br ? "br" : a.gzip && e.gzip ? "gzip" : null; }
  /* GET or HEAD of a file, with the headers the caller chose (an object, or fn(entry) → one); 304 when the browser has it */
  function send(req, res, file, extra) {
    const e = entry(file);
    const headers = Object.assign({ "Content-Type": e.type, "ETag": e.etag, "Vary": "Accept-Encoding" }, (typeof extra === "function" ? extra(e) : extra) || {});
    if (req.headers["if-none-match"] === e.etag) { res.writeHead(304, headers); return res.end(); }
    const write = () => {
      const enc = pick(req, e), body = enc ? e[enc] : e.raw;
      if (enc) headers["Content-Encoding"] = enc;
      headers["Content-Length"] = body.length;
      res.writeHead(200, headers); res.end(req.method === "HEAD" ? undefined : body);
    };
    const a = accepts(req);
    if (pick(req, e) || e.firstDone || !(a.br || a.gzip)) return write();
    let sent = false; const go = () => { if (sent) return; sent = true; clearTimeout(timer); try { write(); } catch (err) { /* the browser went away */ } };
    const timer = setTimeout(go, firstWaitMs); if (timer.unref) timer.unref();
    e.first.then(go, go);
  }
  /* the copies of files no longer served (gone(file) says which): out of memory and out of cacheDir (Oct 2026: the
     page's code is in files named after their content, a new name at every build) */
  async function forget(gone) {
    for (const f of [...cache.keys()]) if (gone(f)) cache.delete(f);
    if (!cacheDir) return;
    let names = []; try { names = await fs.promises.readdir(cacheDir); } catch (e) { return; }
    for (const n of names) { const m = /^(.+)\.[0-9a-f]{40}\.(br|gz)$/.exec(n); if (m && gone(m[1])) await fs.promises.rm(path.join(cacheDir, n), { force: true }).catch(() => {}); }
  }
  return { entry, send, pick, forget, cacheDir };
}

/* ---------- the files of earlier builds (Oct 2026, performance stage 3) ----------
   The page's code, style sheet and Indonesian dictionary are files named after their content
   (public/assets/app.<hash>.js, build.js), and each build replaces them. A tab opened before an update keeps running
   the page it loaded, and that page still asks for its own files: the dictionary when someone there chooses
   Indonesian, the script or the style sheet when the browser has dropped them from its cache, or the whole page
   brought back by Back or a restored session. So every page the server serves is noted (note(page), when it
   changes): the files it names, and those its script and style sheet name, are copied to keepDir in the data folder,
   which no update touches, for the last `keep` builds (keepDir/builds.json), and find(name) gives the copy of a
   file public/assets/ no longer has. Copies of builds older than that go, and so do their compressed copies
   (forget). Only content-named files are kept: name.<10 hex>.ext. */
const KEPT_NAME = /^[\w-]+\.[0-9a-f]{10}\.[a-z0-9]{2,5}$/;
function createAssetKeeper(o) {
  const dir = o.publicAssets, keepDir = o.keepDir, keep = Math.max(1, o.keep || 5), statics = o.statics || null;
  const log = o.log || ((msg) => console.warn(msg));
  const manifest = path.join(keepDir, "builds.json");
  let queue = Promise.resolve(), lastId = null;
  const named = text => { const out = new Set(); for (const m of String(text).matchAll(/\/assets\/([\w.-]+)/g)) if (KEPT_NAME.test(m[1])) out.add(m[1]); return out; };
  async function readManifest() { try { const j = JSON.parse(await fs.promises.readFile(manifest, "utf8")); return Array.isArray(j) ? j.filter(b => b && typeof b.id === "string" && Array.isArray(b.files)) : []; } catch (e) { return []; } }
  async function run(page) {
    const html = page.toString("utf8"), id = ((/<meta name="zc-build" content="([\w-]{1,40})">/.exec(html.slice(0, 4096)) || [])[1]) || crypto.createHash("sha1").update(page).digest("hex").slice(0, 12);
    if (id === lastId) return;
    const files = named(html);
    for (const f of [...files]) if (/\.(js|css)$/.test(f)) { try { named(await fs.promises.readFile(path.join(dir, f), "utf8")).forEach(x => files.add(x)); } catch (e) { /* not there: named only */ } }
    await fs.promises.mkdir(keepDir, { recursive: true, mode: 0o700 });
    for (const f of files) {
      const to = path.join(keepDir, f);
      if (fs.existsSync(to)) continue;
      const tmp = to + "." + process.pid + "-" + crypto.randomBytes(4).toString("hex") + ".tmp";
      try { await fs.promises.copyFile(path.join(dir, f), tmp); await fs.promises.rename(tmp, to); } catch (e) { await fs.promises.rm(tmp, { force: true }).catch(() => {}); }
    }
    const builds = (await readManifest()).filter(b => b.id !== id);
    builds.unshift({ id, at: new Date().toISOString(), files: [...files].sort() });
    builds.length = Math.min(builds.length, keep);
    const tmp = manifest + "." + process.pid + ".tmp";
    await fs.promises.writeFile(tmp, JSON.stringify(builds, null, 1), { mode: 0o600 }); await fs.promises.rename(tmp, manifest);
    /* what no kept build names goes, here and among the compressed copies */
    const live = new Set(); builds.forEach(b => b.files.forEach(f => live.add(f)));
    for (const n of await fs.promises.readdir(keepDir)) if (KEPT_NAME.test(n) && !live.has(n)) await fs.promises.rm(path.join(keepDir, n), { force: true }).catch(() => {});
    if (statics) await statics.forget(file => { const b = path.basename(file); return KEPT_NAME.test(b) && !live.has(b) && !fs.existsSync(path.join(dir, b)); });
    lastId = id;
  }
  /* the page as served now: noted in the background, one at a time */
  function note(page) { queue = queue.then(() => run(page)).catch(err => log("[static] could not keep the files of this build: " + err.message)); return queue; }
  /* the kept copy of a file public/assets/ does not have, or null */
  function find(name) { if (!KEPT_NAME.test(String(name || ""))) return null; const p = path.join(keepDir, name); try { return fs.statSync(p).isFile() ? p : null; } catch (e) { return null; } }
  return { note, find, keepDir, idle: () => queue };
}

/* ---------- JSON ---------- */
const JSON_ASYNC_FROM = 64 * 1024;
const JSON_BR_QUALITY = 4;
const JSON_GZIP_LEVEL = 6;
/* status, an object (or JSON text), the headers so far — compressed when the browser takes it */
function sendJson(req, res, status, obj, headers) {
  const body = Buffer.isBuffer(obj) ? obj : Buffer.from(toJson(obj));
  const a = accepts(req);
  const finish = (buf, enc) => {
    if (enc) headers["Content-Encoding"] = enc;
    headers["Content-Length"] = buf.length;
    res.writeHead(status, headers); res.end(buf);
  };
  if (body.length <= 2048 || !(a.br || a.gzip)) return finish(body, null);
  if (body.length < JSON_ASYNC_FROM) return a.gzip ? finish(zlib.gzipSync(body, { level: JSON_GZIP_LEVEL }), "gzip") : finish(body, null);
  const enc = a.br ? "br" : "gzip";
  const job = enc === "br" ? brotli(body, JSON_BR_QUALITY) : gzip(body, JSON_GZIP_LEVEL);
  job.then(buf => finish(buf, enc), () => finish(body, null)).catch(() => { /* the browser went away */ });
}

/* top-level values written as JSON already */
const PARTS = Symbol("json parts");
class RawJson { constructor(json) { this.json = String(json); } }
const rawJson = json => new RawJson(json);
function withParts(obj) { Object.defineProperty(obj, PARTS, { value: true }); return obj; }
function toJson(obj) {
  if (!obj || typeof obj !== "object" || !obj[PARTS]) return JSON.stringify(obj);
  let out = "{", n = 0;
  for (const k of Object.keys(obj)) {
    const v = obj[k], s = v instanceof RawJson ? v.json : JSON.stringify(v);
    if (s === undefined) continue;   /* as JSON.stringify leaves out undefined, a function or a symbol */
    out += (n++ ? "," : "") + JSON.stringify(k) + ":" + s;
  }
  return out + "}";
}

module.exports = { createStatic, createAssetKeeper, sendJson, toJson, withParts, rawJson, JSON_ASYNC_FROM, FIRST_BR_QUALITY };
