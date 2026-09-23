/* v39 — images live on disk, not inside the database (docs/ARCHITECTURE-REVIEW-v38.md, P1).

   Before: every version preview, file preview and comment image was a base64 data URL stored in
   SQLite, sent with every task edit and every sign-in, and copied into every backup.
   Now: the bytes are written once to COS_DATA_DIR/uploads/ab/<sha256>.<ext> (content-addressed,
   immutable, de-duplicated) and the database stores "/files/<sha256>.<ext>".

   - The browser can keep sending data URLs: the server turns them into files on write
     (externalizeTask / externalize). Nothing sends the same image twice after that.
   - GET /files/<name> needs a signed-in session; responses are cached forever (the name is the hash).
   - Backups: the database backup stays one file; uploads are mirrored incrementally, encrypted, to
     BACKUP_DIR/uploads/. If a file is missing on disk (e.g. after moving servers) it is restored
     from that mirror on first request.
   - Files are never deleted by normal use, so restoring an older database always finds its images. */
const fs = require("fs"), path = require("path"), crypto = require("crypto");
const DATA_DIR = process.env.COS_DATA_DIR || path.join(__dirname, "..", "data");
const UPLOAD_DIR = path.join(DATA_DIR, "uploads");
const MAX_BYTES = 3_000_000;
const TYPES = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif" };
const MIME = { png: "image/png", jpg: "image/jpeg", webp: "image/webp", gif: "image/gif" };
const NAME_RE = /^([a-f0-9]{64})\.(png|jpg|webp|gif)$/;
const URL_RE = /^\/files\/([a-f0-9]{64})\.(png|jpg|webp|gif)$/;

function fileFor(name) { const m = NAME_RE.exec(name); if (!m) return null; return path.join(UPLOAD_DIR, m[1].slice(0, 2), name); }
function ensureTable(db) {
  db.exec("CREATE TABLE IF NOT EXISTS uploads (id TEXT PRIMARY KEY, mime TEXT NOT NULL, bytes INTEGER NOT NULL, created_by TEXT, created_at TEXT NOT NULL)");
  db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");
}
/* dataUrl → "/files/<sha>.<ext>". Throws {status} errors the server turns into 400/413. */
function put(db, dataUrl, userId) {
  const m = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(dataUrl || ""));
  if (!m) { const e = new Error("Image must be PNG, JPEG, WebP or GIF"); e.status = 400; throw e; }
  const mime = m[1].toLowerCase(), buf = Buffer.from(m[2], "base64");
  if (!buf.length) { const e = new Error("Image is empty"); e.status = 400; throw e; }
  if (buf.length > MAX_BYTES) { const e = new Error("Image is too large (max 3 MB)"); e.status = 413; throw e; }
  const sha = crypto.createHash("sha256").update(buf).digest("hex"), name = sha + "." + TYPES[mime], file = fileFor(name);
  if (!fs.existsSync(file)) {
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    const tmp = file + ".tmp-" + process.pid; fs.writeFileSync(tmp, buf, { mode: 0o600 }); fs.renameSync(tmp, file);
  }
  db.prepare("INSERT OR IGNORE INTO uploads (id,mime,bytes,created_by,created_at) VALUES (?,?,?,?,?)").run(name, mime, buf.length, userId || null, new Date().toISOString());
  return "/files/" + name;
}
function isFileUrl(v) { return URL_RE.test(String(v || "")); }
/* a value the browser sent for an image field: data URL → stored file; our own /files URL → kept
   if it exists; anything else is refused (no hot-linking arbitrary paths into the database). */
function externalize(db, value, userId, field) {
  const v = String(value || ""); if (!v) return value;
  if (/^data:/i.test(v)) return put(db, v, userId);
  const m = URL_RE.exec(v);
  if (m && db.prepare("SELECT 1 FROM uploads WHERE id=?").get(m[1] + "." + m[2])) return v;
  const e = new Error((field || "Image") + " must be an uploaded image"); e.status = 400; throw e;
}
function externalizeTask(db, doc, userId) {
  (doc.files || []).forEach(f => { if (f && f.preview) f.preview = externalize(db, f.preview, userId, "File preview"); });
  (doc.versions || []).forEach(v => { if (v && v.img) v.img = externalize(db, v.img, userId, "Version preview"); });
  (doc.comments || []).forEach(c => (c && c.attachments || []).forEach(a => { if (a && a.preview) a.preview = externalize(db, a.preview, userId, "Comment preview"); }));
  return doc;
}

/* ---------- serving ---------- */
function serve(req, res, name, backupDir, decryptFile) {
  const file = fileFor(name);
  if (!file) { res.writeHead(404, { "Content-Type": "text/plain" }); return res.end("Not found"); }
  if (!fs.existsSync(file) && backupDir && decryptFile) {
    const enc = path.join(backupDir, "uploads", name + ".enc");
    if (fs.existsSync(enc)) { try { fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 }); decryptFile(enc, file); } catch (e) { console.error("[uploads] restore from backup failed:", e.message); } }
  }
  if (!fs.existsSync(file)) { res.writeHead(404, { "Content-Type": "text/plain", "Cache-Control": "no-store" }); return res.end("Not found"); }
  const etag = '"' + name.slice(0, 64) + '"';
  const headers = { "Content-Type": MIME[name.split(".").pop()], "Cache-Control": "private, max-age=31536000, immutable", "ETag": etag, "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; sandbox" };
  if (req.headers["if-none-match"] === etag) { res.writeHead(304, headers); return res.end(); }
  const st = fs.statSync(file); headers["Content-Length"] = st.size;
  res.writeHead(200, headers);
  if (req.method === "HEAD") return res.end();
  fs.createReadStream(file).pipe(res);
}

/* ---------- backups: incremental encrypted mirror ---------- */
function mirror(backupDir, encryptFile) {
  if (!fs.existsSync(UPLOAD_DIR)) return { copied: 0, total: 0 };
  const out = path.join(backupDir, "uploads"); fs.mkdirSync(out, { recursive: true, mode: 0o700 });
  let copied = 0, total = 0;
  for (const sub of fs.readdirSync(UPLOAD_DIR)) {
    const dir = path.join(UPLOAD_DIR, sub); if (!fs.statSync(dir).isDirectory()) continue;
    for (const name of fs.readdirSync(dir)) { if (!NAME_RE.test(name)) continue; total++;
      const target = path.join(out, name + ".enc"); if (fs.existsSync(target)) continue;
      encryptFile(path.join(dir, name), target); copied++; }
  }
  return { copied, total };
}

/* ---------- one-time migration of existing base64 images ---------- */
function migrate(db) {
  ensureTable(db);
  const done = db.prepare("SELECT value FROM app_meta WHERE key='uploads_migrated'").get();
  if (done) return null;
  const stats = { versions: 0, files: 0, comments: 0, assets: 0, bytesMoved: 0 };
  const conv = v => { const url = put(db, v, null); stats.bytesMoved += String(v).length; return url; };
  db.exec("BEGIN");
  try {
    db.prepare("SELECT id, preview_data FROM file_versions WHERE preview_data LIKE 'data:image/%'").all().forEach(r => { try { db.prepare("UPDATE file_versions SET preview_data=? WHERE id=?").run(conv(r.preview_data), r.id); stats.versions++; } catch (e) { console.warn("[uploads] version", r.id, e.message); } });
    db.prepare("SELECT id, preview_data FROM files WHERE preview_data LIKE 'data:image/%'").all().forEach(r => { try { db.prepare("UPDATE files SET preview_data=? WHERE id=?").run(conv(r.preview_data), r.id); stats.files++; } catch (e) { console.warn("[uploads] file", r.id, e.message); } });
    db.prepare("SELECT id, attachments FROM comments WHERE attachments LIKE '%data:image/%'").all().forEach(r => { let list; try { list = JSON.parse(r.attachments || "[]"); } catch { return; } let changed = false;
      list.forEach(a => { if (a && /^data:image\//.test(a.preview || "")) { try { a.preview = conv(a.preview); changed = true; } catch (e) { console.warn("[uploads] comment", r.id, e.message); } } });
      if (changed) { db.prepare("UPDATE comments SET attachments=? WHERE id=?").run(JSON.stringify(list), r.id); stats.comments++; } });
    db.prepare("SELECT id, preview_data FROM assets WHERE preview_data LIKE 'data:image/%'").all().forEach(r => { try { db.prepare("UPDATE assets SET preview_data=? WHERE id=?").run(conv(r.preview_data), r.id); stats.assets++; } catch (e) { console.warn("[uploads] asset", r.id, e.message); } });
    db.prepare("INSERT INTO app_meta (key, value) VALUES ('uploads_migrated', ?)").run(JSON.stringify(Object.assign({ at: new Date().toISOString() }, stats)));
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  /* give the space back once; later writes never put images in the database again */
  if (stats.bytesMoved > 1_000_000) { try { db.exec("VACUUM"); } catch (e) { console.warn("[uploads] VACUUM skipped:", e.message); } }
  return stats;
}
module.exports = { UPLOAD_DIR, put, externalize, externalizeTask, isFileUrl, serve, mirror, migrate, ensureTable, fileFor, URL_RE };
