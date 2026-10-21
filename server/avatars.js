/* Profile photos are files, not data URLs inside every people payload (performance, Oct 2026).

   Before: users.avatar_data held each photo as a base64 data URL (about 32 KB for the 256×256 JPEG the
   crop dialog makes), and every answer with people in it carried all of them: /api/bootstrap,
   /api/live/people, /api/live/teams and every member save, again in every open tab after each live
   "people changed". A dozen photos were ~470 KB raw and ~355 KB gzipped, 42% of the bootstrap.
   Now: the bytes go into the content-addressed image store (server/uploads.js) and users.avatar_data
   holds "/files/<sha256>.<ext>", about 75 characters. The browser fetches each photo once and keeps it.

   - Who may see a photo is unchanged: /files/ needs a signed-in session of this workspace, the same
     people who got the bytes inside the people payloads; never an anonymous request.
   - The member routes take what the page sends, a data URL — PNG, JPEG or WebP and at most 300,000
     characters, the limits PUT /api/members/:id has always had — store it and keep its URL. The photo a
     person already has is kept as it is, in either form; our own stored image URL is accepted back (a
     save sends the person as it was read); anything else is refused.
   - Rows written by older versions are moved on start (migrate), and again after a restore brings back
     an older database. Until a row is moved it keeps its data URL, and the page draws both forms, so a
     half-moved database still works. Moving is idempotent: the same bytes are the same file.
   - Backups need nothing new: the photos live in uploads/, which every backup mirrors (uploads.mirror),
     and a photo missing on disk comes back from that mirror on first request (uploads.serve). */
/* looked up on use, so whoever reloads ./uploads (the tests do, per data folder) gets the one in use */
const up = () => require("./uploads");

const MAX_CHARS = 300000;
const TYPE_RE = /^data:image\/(png|jpeg|webp);base64,/;
const err = (status, message) => { const e = new Error(message); e.status = status; return e; };

function isStored(db, url) {
  const m = up().URL_RE.exec(String(url || "")); if (!m) return false;
  try { return !!db.prepare("SELECT 1 FROM uploads WHERE id=?").get(m[1] + "." + m[2]); } catch { return false; }
}
/* a data URL the page sent → the stored file's URL, with the limits of the member routes */
function fromDataUrl(db, v, userId) {
  if (v.length > MAX_CHARS) throw err(413, "Profile photo too large");
  if (!TYPE_RE.test(v)) throw err(400, "Photo must be PNG/JPEG/WebP");
  try { up().ensureTable(db); return up().put(db, v, userId); }
  catch (e) { throw e.status === 413 ? err(413, "Profile photo too large") : err(400, "Photo must be PNG/JPEG/WebP"); }
}
/* What a member save stores for the photo. undefined/null: unchanged; "": no photo. */
function accept(db, value, current, userId) {
  if (value === undefined || value === null) return value;
  const v = String(value); if (!v) return "";
  if (current && v === current) {
    /* unchanged: a photo an older version stored inline moves to a file now, and one that cannot
       (an older, looser limit) stays as it is rather than blocking the person's other changes */
    if (/^data:/i.test(v)) { try { return fromDataUrl(db, v, userId); } catch { return v; } }
    return v;
  }
  if (/^data:/i.test(v)) return fromDataUrl(db, v, userId);
  if (isStored(db, v)) return v;
  throw err(400, "Photo must be PNG/JPEG/WebP");
}
/* For writers that checked the value already (seed, import): an inline picture becomes a file; if it
   cannot, it is kept as it was. */
function toFile(db, value, userId) {
  const v = String(value || "");
  if (!/^data:image\//i.test(v)) return value;
  try { up().ensureTable(db); return up().put(db, v, userId || null); } catch { return value; }
}
/* Every start: rows that still hold a data URL become files. Safe to run any number of times. */
function migrate(db) {
  up().ensureTable(db);
  const rows = db.prepare("SELECT id, avatar_data FROM users WHERE avatar_data LIKE 'data:%'").all();
  if (!rows.length) return null;
  const stats = { moved: 0, kept: 0, bytesMoved: 0 };
  db.exec("BEGIN");
  try {
    for (const r of rows) {
      let url; try { url = up().put(db, r.avatar_data, null); } catch (e) { stats.kept++; continue; }
      db.prepare("UPDATE users SET avatar_data=? WHERE id=? AND avatar_data=?").run(url, r.id, r.avatar_data);
      stats.moved++; stats.bytesMoved += r.avatar_data.length;
    }
    db.exec("COMMIT");
  } catch (e) { db.exec("ROLLBACK"); throw e; }
  return stats;
}
module.exports = { accept, toFile, migrate, isStored, MAX_CHARS };
