/* Server storage for any file — the "This server" choice in Settings → Integrations → Storage.

   server/uploads.js already keeps images on disk, but only images, only up to 3 MB, and only as
   data URLs carried inside JSON. That is fine for previews and useless as somewhere to keep a PDF,
   a video or a PSD — which is exactly what a team needs when Google Drive cannot be used.

   This store sits beside it rather than inside it, so the image store's strict naming stays strict:
     - bytes arrive as a raw stream (RAW_BODY in server.js keeps readBody away) and are hashed while
       they are written, so nothing gathers in memory;
     - files are content-addressed: COS_DATA_DIR/uploads/docs/ab/<sha256>.<ext>, served at
       /files/d/<sha256>.<ext>, de-duplicated and immutable;
     - they are mirrored into the encrypted backup like images are. The image mirror only matches
       image names, so without this a restore would have silently lost every document;
     - serving never trusts the uploader's content type. Anything that could run script in this
       origin (HTML, SVG, unknown types) is sent as a download, never rendered. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const { Transform } = require("stream"), { pipeline } = require("stream/promises");
const { UPLOAD_DIR } = require("./uploads");

const DOC_DIR = path.join(UPLOAD_DIR, "docs");
/* 5 MB per file, as the workspace owner asked: enough for PDFs, decks and spreadsheets, and a
   ceiling on how fast a busy team can fill the disk. COS_FILE_MAX_BYTES raises it for a deployment
   with room to spare; large video belongs in Google Drive. */
const MAX_BYTES = Math.max(1_000_000, +(process.env.COS_FILE_MAX_BYTES || 5_242_880));
/* Extension → content type. Only these travel with a real type; everything else is "bin". */
const TYPES = {
  png: "image/png", jpg: "image/jpeg", gif: "image/gif", webp: "image/webp",
  pdf: "application/pdf",
  mp4: "video/mp4", m4v: "video/mp4", mov: "video/quicktime", webm: "video/webm",
  mp3: "audio/mpeg", wav: "audio/wav", m4a: "audio/mp4",
  psd: "image/vnd.adobe.photoshop", ai: "application/postscript", eps: "application/postscript",
  indd: "application/octet-stream", sketch: "application/octet-stream", fig: "application/octet-stream",
  aep: "application/octet-stream", prproj: "application/octet-stream",
  svg: "image/svg+xml", tif: "image/tiff", tiff: "image/tiff", heic: "image/heic",
  zip: "application/zip", rar: "application/vnd.rar", "7z": "application/x-7z-compressed",
  pdfx: "application/pdf",
  doc: "application/msword", docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint", pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  key: "application/octet-stream", txt: "text/plain; charset=utf-8", csv: "text/csv; charset=utf-8",
  bin: "application/octet-stream"
};
/* The only types a browser may render in place. None of them can run script in this origin:
   images and media are inert, and PDFs open in the browser's own isolated viewer. SVG is an image
   but can carry script, so it is deliberately not here. */
const INLINE = new Set(["png", "jpg", "gif", "webp", "pdf", "mp4", "m4v", "mov", "webm", "mp3", "wav", "m4a"]);
const NAME_RE = /^([a-f0-9]{64})\.([a-z0-9]{1,6})$/;
const URL_RE = /^\/files\/d\/([a-f0-9]{64})\.([a-z0-9]{1,6})$/;

const err = (status, message) => { const e = new Error(message); e.status = status; return e; };
function extFor(filename) {
  let ext = String(path.extname(String(filename || "")).slice(1) || "").toLowerCase();
  if (ext === "jpeg") ext = "jpg";
  return Object.prototype.hasOwnProperty.call(TYPES, ext) ? ext : "bin";
}
function fileFor(name) { const m = NAME_RE.exec(String(name || "")); return m && TYPES[m[2]] ? path.join(DOC_DIR, m[1].slice(0, 2), name) : null; }
function ensureTable(db) { db.exec("CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes INTEGER NOT NULL, created_by TEXT, created_at TEXT NOT NULL)"); }
/* Our own URL, and only if this server actually stored it: the same "no hot-linking arbitrary
   paths into the database" rule the image store applies. */
function isStoredUrl(db, url) {
  const m = URL_RE.exec(String(url || "")); if (!m) return false;
  try { ensureTable(db); return !!db.prepare("SELECT 1 FROM uploads WHERE id=?").get("d/" + m[1] + "." + m[2]); } catch { return false; }
}
const human = n => n >= 1048576 ? (n / 1048576).toFixed(1) + " MB" : Math.max(1, Math.round(n / 1024)) + " KB";

async function putStream(db, req, opts) {
  opts = opts || {};
  const declared = +(req.headers["content-length"] || 0);
  if (!declared) throw err(411, "The upload needs a Content-Length.");
  if (declared > MAX_BYTES) throw err(413, "That file is larger than the " + Math.round(MAX_BYTES / 1048576) + " MB limit for server storage. Use Google Drive for larger files.");
  const ext = extFor(opts.name);
  fs.mkdirSync(DOC_DIR, { recursive: true, mode: 0o700 });
  const tmp = path.join(DOC_DIR, ".incoming-" + process.pid + "-" + crypto.randomBytes(8).toString("hex"));
  const hash = crypto.createHash("sha256");
  let seen = 0;
  const meter = new Transform({ transform(chunk, enc, cb) {
    seen += chunk.length;
    /* the header can lie; stop at the limit rather than trusting it */
    if (seen > MAX_BYTES || seen > declared) return cb(err(413, "The upload is larger than it said it was."));
    hash.update(chunk); cb(null, chunk);
  } });
  try {
    await pipeline(req, meter, fs.createWriteStream(tmp, { mode: 0o600 }));
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch {}
    throw e.status ? e : err(400, "The upload was interrupted.");
  }
  if (seen !== declared) { try { fs.unlinkSync(tmp); } catch {} throw err(400, "The upload was interrupted before it finished."); }
  const sha = hash.digest("hex"), name = sha + "." + ext, file = fileFor(name);
  if (fs.existsSync(file)) { try { fs.unlinkSync(tmp); } catch {} }
  else { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); fs.renameSync(tmp, file); }
  ensureTable(db);
  db.prepare("INSERT OR IGNORE INTO uploads (id,mime,bytes,created_by,created_at) VALUES (?,?,?,?,?)").run("d/" + name, TYPES[ext], seen, opts.userId || null, new Date().toISOString());
  return { url: "/files/d/" + name, ext, mime: TYPES[ext], bytes: seen, size: human(seen) };
}

/* A download name comes from the page, so it is reduced to something that cannot break out of the
   header: an ASCII fallback plus the RFC 5987 form for anything else. */
function disposition(kind, filename, ext) {
  let n = String(filename || "file").replace(/[\r\n"\\/]+/g, "_").trim().slice(0, 180) || "file";
  if (!/\.[a-z0-9]{1,6}$/i.test(n) && ext && ext !== "bin") n += "." + ext;
  const ascii = n.replace(/[^\x20-\x7e]/g, "_").replace(/[;%]/g, "_");
  return kind + '; filename="' + ascii + '"; filename*=UTF-8\'\'' + encodeURIComponent(n);
}
function serve(req, res, name, query, backupDir, decryptFile) {
  const file = fileFor(name);
  if (!file) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
  if (!fs.existsSync(file) && backupDir && decryptFile) {
    const enc = path.join(backupDir, "uploads", "d", name + ".enc");
    if (fs.existsSync(enc)) { try { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); decryptFile(enc, file); } catch (e) { console.error("[filestore] restore from backup failed:", e.message); } }
  }
  if (!fs.existsSync(file)) { res.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "no-store" }); return res.end("Not found"); }
  const ext = name.split(".").pop(), size = fs.statSync(file).size;
  const inline = INLINE.has(ext) && String((query || {}).download || "") !== "1";
  const headers = {
    "Content-Type": inline ? TYPES[ext] : "application/octet-stream",
    "Content-Disposition": disposition(inline ? "inline" : "attachment", (query || {}).name, ext),
    "Cache-Control": "private, max-age=31536000, immutable",
    "ETag": '"' + name.slice(0, 64) + '"',
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    /* sandbox would also block Chrome's PDF viewer, so PDFs get the strict policy without it */
    "Content-Security-Policy": ext === "pdf" ? "default-src 'none'; object-src 'none'; frame-ancestors 'self'" : "default-src 'none'; sandbox"
  };
  if (req.headers["if-none-match"] === headers.ETag) { res.writeHead(304, headers); return res.end(); }
  /* Video review needs seeking, and seeking needs byte ranges. One range is all browsers ask for. */
  const range = /^bytes=(\d*)-(\d*)$/.exec(String(req.headers.range || ""));
  if (range && (range[1] || range[2])) {
    let start = range[1] ? +range[1] : Math.max(0, size - +range[2]);
    let end = range[1] && range[2] ? Math.min(+range[2], size - 1) : size - 1;
    if (start >= size || start > end) { res.writeHead(416, { "Content-Range": "bytes */" + size }); return res.end(); }
    res.writeHead(206, Object.assign({}, headers, { "Content-Range": "bytes " + start + "-" + end + "/" + size, "Content-Length": end - start + 1 }));
    if (req.method === "HEAD") return res.end();
    return fs.createReadStream(file, { start, end }).pipe(res);
  }
  res.writeHead(200, Object.assign({}, headers, { "Content-Length": size }));
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

/* Documents are immutable too, so the same incremental encrypted mirror works:
   BACKUP_DIR/uploads/d/<name>.enc. */
function mirror(backupDir, encryptFile) {
  if (!fs.existsSync(DOC_DIR)) return { copied: 0, total: 0 };
  const out = path.join(backupDir, "uploads", "d"); fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  let copied = 0, total = 0;
  for (const sub of fs.readdirSync(DOC_DIR)) {
    const dir = path.join(DOC_DIR, sub);
    if (sub.startsWith(".") || !fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!fileFor(name)) continue; total++;
      const target = path.join(out, name + ".enc"); if (fs.existsSync(target)) continue;
      encryptFile(path.join(dir, name), target); copied++;
    }
  }
  return { copied, total };
}
module.exports = { DOC_DIR, MAX_BYTES, TYPES, INLINE, URL_RE, extFor, fileFor, isStoredUrl, putStream, serve, mirror, disposition };
