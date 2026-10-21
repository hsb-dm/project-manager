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
  return { entry, send, pick, cacheDir };
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

module.exports = { createStatic, sendJson, toJson, withParts, rawJson, JSON_ASYNC_FROM, FIRST_BR_QUALITY };
