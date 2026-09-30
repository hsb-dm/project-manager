/* Server file storage (server/filestore.js) — the "This server" choice for uploads.
   What a mistake here would quietly break: the size limit, the refusal of a lying upload, serving
   a stored file as something that can run script in our origin, and backups that silently skip
   documents. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path"), crypto = require("node:crypto");
const { Readable } = require("node:stream");
const { DatabaseSync } = require("node:sqlite");

function sandbox(env) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zcv-fs-"));
  process.env.COS_DATA_DIR = dir;
  delete process.env.COS_FILE_MAX_BYTES;
  Object.assign(process.env, env || {});
  ["../server/filestore.js", "../server/uploads.js"].forEach(m => delete require.cache[require.resolve(m)]);
  const fsx = require("../server/filestore.js");
  const db = new DatabaseSync(path.join(dir, "t.db"));
  return { dir, fsx, db };
}
/* a request-shaped stream: the bytes, and a Content-Length that may or may not tell the truth */
function upload(bytes, declared) {
  const r = Readable.from([Buffer.from(bytes)]);
  r.headers = { "content-length": String(declared == null ? Buffer.byteLength(bytes) : declared) };
  return r;
}
/* a response-shaped sink that records what the server wrote */
function sink() {
  const out = { status: 0, headers: {}, body: Buffer.alloc(0), done: null };
  out.done = new Promise(resolve => {
    out.writeHead = (s, h) => { out.status = s; out.headers = Object.assign({}, h); };
    out.write = c => { out.body = Buffer.concat([out.body, Buffer.from(c)]); return true; };
    out.end = c => { if (c) out.write(c); resolve(out); };
    out.on = out.once = out.emit = () => out; out.removeListener = () => out;
  });
  return out;
}
async function serveAndRead(fsx, name, query, reqHeaders) {
  const res = sink(), req = { method: "GET", headers: reqHeaders || {} };
  /* fs.createReadStream(...).pipe(res) needs a writable; give it one that forwards to the sink */
  const { Writable } = require("node:stream");
  const w = new Writable({ write(c, e, cb) { res.write(c); cb(); }, final(cb) { res.end(); cb(); } });
  w.writeHead = res.writeHead; w.end = (...a) => { if (a[0] && typeof a[0] !== "function") res.write(a[0]); Writable.prototype.end.call(w); return w; };
  fsx.serve(req, w, name, query || {});
  return res.done;
}

test("a file is stored content-addressed and recorded", async () => {
  const { fsx, db } = sandbox();
  const out = await fsx.putStream(db, upload("%PDF-1.4 hello"), { name: "Brief Q4.pdf", userId: "u1" });
  const sha = crypto.createHash("sha256").update("%PDF-1.4 hello").digest("hex");
  assert.equal(out.url, "/files/d/" + sha + ".pdf");
  assert.equal(out.mime, "application/pdf");
  assert.ok(fs.existsSync(fsx.fileFor(sha + ".pdf")));
  assert.ok(fsx.isStoredUrl(db, out.url));
});

test("the same bytes twice make one file", async () => {
  const { fsx, db } = sandbox();
  const a = await fsx.putStream(db, upload("same"), { name: "a.txt" });
  const b = await fsx.putStream(db, upload("same"), { name: "b.txt" });
  assert.equal(a.url, b.url);
  const dir = path.dirname(fsx.fileFor(a.url.split("/").pop()));
  assert.equal(fs.readdirSync(dir).length, 1);
});

test("office files and other types are accepted, with their own extension", async () => {
  const { fsx, db } = sandbox();
  for (const [name, ext] of [["deck.pptx", "pptx"], ["budget.xlsx", "xlsx"], ["notes.docx", "docx"], ["Photo.JPEG", "jpg"], ["archive.zip", "zip"], ["mystery.xyz", "bin"], ["noext", "bin"]]) {
    const out = await fsx.putStream(db, upload("x-" + name), { name });
    assert.ok(out.url.endsWith("." + ext), name + " → ." + ext + " (got " + out.url + ")");
  }
});

test("the 5 MB limit is the default, and a larger file is refused before it is read", async () => {
  const { fsx, db } = sandbox();
  assert.equal(fsx.MAX_BYTES, 5 * 1024 * 1024);
  let read = false;
  const r = new Readable({ read() { read = true; this.push(null); } });
  r.headers = { "content-length": String(6 * 1024 * 1024) };
  await assert.rejects(() => fsx.putStream(db, r, { name: "big.pdf" }), e => e.status === 413 && /5 MB/.test(e.message) && /Google Drive/.test(e.message));
  assert.equal(read, false, "not one byte was consumed");
});

test("an upload that sends more than it declared is cut off", async () => {
  const { fsx, db } = sandbox();
  await assert.rejects(() => fsx.putStream(db, upload("0123456789", 4), { name: "a.pdf" }), e => e.status === 413);
  assert.ok(!fs.readdirSync(fsx.DOC_DIR).some(n => n.startsWith(".incoming")), "no temp file left behind");
});

test("an upload that stops early is refused and leaves nothing behind", async () => {
  const { fsx, db } = sandbox();
  await assert.rejects(() => fsx.putStream(db, upload("abc", 100), { name: "a.pdf" }), e => e.status === 400);
  assert.ok(!fs.readdirSync(fsx.DOC_DIR).some(n => n.startsWith(".incoming")));
  /* refused before anything was recorded — the table may not even exist yet */
  const hasTable = !!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='uploads'").get();
  assert.equal(hasTable ? db.prepare("SELECT count(*) n FROM uploads").get().n : 0, 0);
});

test("only URLs this server stored count as stored", async () => {
  const { fsx, db } = sandbox();
  const out = await fsx.putStream(db, upload("real"), { name: "a.pdf" });
  assert.ok(fsx.isStoredUrl(db, out.url));
  assert.ok(!fsx.isStoredUrl(db, "/files/d/" + "a".repeat(64) + ".pdf"), "a well-formed but unknown file");
  assert.ok(!fsx.isStoredUrl(db, "/files/" + out.url.split("/").pop()), "the image route is a different namespace");
  assert.ok(!fsx.isStoredUrl(db, "https://evil.example/files/d/x.pdf"));
  assert.ok(!fsx.isStoredUrl(db, "/files/d/../../etc/passwd"));
});

test("inert types display in place; everything else downloads", async () => {
  const { fsx, db } = sandbox();
  const cases = [["a.pdf", "inline"], ["a.png", "inline"], ["a.mp4", "inline"], ["a.svg", "attachment"], ["a.pptx", "attachment"], ["a.bin", "attachment"], ["a.txt", "attachment"]];
  for (const [n, want] of cases) {
    const out = await fsx.putStream(db, upload("body of " + n), { name: n });
    const res = await serveAndRead(fsx, out.url.split("/").pop(), { name: n });
    assert.equal(res.status, 200);
    assert.ok(res.headers["Content-Disposition"].startsWith(want), n + " is " + want + " (" + res.headers["Content-Disposition"] + ")");
    assert.equal(res.headers["X-Content-Type-Options"], "nosniff");
    if (want === "attachment") assert.equal(res.headers["Content-Type"], "application/octet-stream", n + " is never sent with a renderable type");
  }
});

test("SVG, which can carry script, is never rendered in our origin", async () => {
  const { fsx, db } = sandbox();
  const out = await fsx.putStream(db, upload('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), { name: "logo.svg" });
  const res = await serveAndRead(fsx, out.url.split("/").pop(), {});
  assert.match(res.headers["Content-Disposition"], /^attachment/);
  assert.equal(res.headers["Content-Type"], "application/octet-stream");
  assert.match(res.headers["Content-Security-Policy"], /sandbox/);
});

test("download=1 turns even a PDF into a download with its own name", async () => {
  const { fsx, db } = sandbox();
  const out = await fsx.putStream(db, upload("%PDF"), { name: "x.pdf" });
  const res = await serveAndRead(fsx, out.url.split("/").pop(), { download: "1", name: "Brief Kampanye Q4.pdf" });
  assert.match(res.headers["Content-Disposition"], /^attachment; filename="Brief Kampanye Q4\.pdf"; filename\*=UTF-8''Brief%20Kampanye%20Q4\.pdf$/);
});

test("a download name cannot break out of its header", () => {
  const { fsx } = sandbox();
  const h = fsx.disposition("attachment", 'evil"\r\nSet-Cookie: x=1.pdf', "pdf");
  assert.ok(!/[\r\n]/.test(h), "no line breaks survive");
  assert.equal((h.match(/"/g) || []).length, 2, "exactly the two quotes that delimit the name");
});

test("video can seek: a byte range comes back as 206", async () => {
  const { fsx, db } = sandbox();
  const out = await fsx.putStream(db, upload("0123456789"), { name: "clip.mp4" });
  const name = out.url.split("/").pop();
  const part = await serveAndRead(fsx, name, {}, { range: "bytes=2-5" });
  assert.equal(part.status, 206);
  assert.equal(part.headers["Content-Range"], "bytes 2-5/10");
  assert.equal(part.body.toString(), "2345");
  const tail = await serveAndRead(fsx, name, {}, { range: "bytes=-3" });
  assert.equal(tail.body.toString(), "789");
  const bad = await serveAndRead(fsx, name, {}, { range: "bytes=50-60" });
  assert.equal(bad.status, 416);
});

test("backups include documents, which the image mirror would have skipped", async () => {
  const { dir, fsx, db } = sandbox();
  const out = await fsx.putStream(db, upload("keep me"), { name: "contract.pdf" });
  const backups = path.join(dir, "backups");
  const enc = (src, dst) => fs.copyFileSync(src, dst);
  /* the existing image mirror, on its own, finds nothing to back up */
  assert.equal(require("../server/uploads.js").mirror(backups, enc).total, 0);
  const first = fsx.mirror(backups, enc);
  assert.deepEqual(first, { copied: 1, total: 1 });
  assert.ok(fs.existsSync(path.join(backups, "uploads", "d", out.url.split("/").pop() + ".enc")));
  assert.deepEqual(fsx.mirror(backups, enc), { copied: 0, total: 1 }, "incremental: nothing copied twice");
});

test("a file missing on disk is restored from the backup on first request", async () => {
  const { dir, fsx, db } = sandbox();
  const out = await fsx.putStream(db, upload("restore me"), { name: "r.pdf" });
  const name = out.url.split("/").pop(), backups = path.join(dir, "backups");
  fsx.mirror(backups, (s, d) => fs.copyFileSync(s, d));
  fs.unlinkSync(fsx.fileFor(name));
  const res = sink(), { Writable } = require("node:stream");
  const w = new Writable({ write(c, e, cb) { res.write(c); cb(); }, final(cb) { res.end(); cb(); } });
  w.writeHead = res.writeHead;
  fsx.serve({ method: "GET", headers: {} }, w, name, {}, backups, (s, d) => fs.copyFileSync(s, d));
  const got = await res.done;
  assert.equal(got.status, 200);
  assert.equal(got.body.toString(), "restore me");
});

test("the server wires the store in: raw body, validation, serving and backups", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
  assert.ok(src.includes('"/api/files/upload"'), "the upload path skips the JSON body reader");
  assert.ok(src.includes("filestore.isStoredUrl(db, f.url)"), "task file links may point at stored files");
  assert.ok(src.includes("filestore.isStoredUrl(db, v.driveUrl)"), "and so may version links");
  assert.ok(src.includes("filestore.serve("), "stored files are served");
  const backup = fs.readFileSync(path.join(__dirname, "..", "server", "backup.js"), "utf8");
  assert.ok(backup.includes('require("./filestore").mirror('), "backups mirror documents");
});

/* An undocumented knob is one nobody can find: COS_DRIVE_MAX_BYTES existed in the code for a day
   without appearing in .env.example. Every COS_* the server reads has to be listed there. */
test("every COS_* setting the server reads is documented in .env.example", () => {
  const dir = path.join(__dirname, "..", "server");
  const found = new Set();
  for (const f of fs.readdirSync(dir).filter(n => n.endsWith(".js"))) {
    const src = fs.readFileSync(path.join(dir, f), "utf8");
    (src.match(/process\.env\.COS_[A-Z0-9_]+/g) || []).forEach(m => found.add(m.replace("process.env.", "")));
  }
  const example = fs.readFileSync(path.join(__dirname, "..", ".env.example"), "utf8");
  /* set only by the test harness and the demo seeder, never by a deployment */
  const internal = new Set(["COS_SEED_DEMO", "COS_ALLOW_MISSING_ORIGIN", "COS_DB_PATH"]);
  const missing = [...found].filter(k => !internal.has(k) && !example.includes(k)).sort();
  assert.deepEqual(missing, [], "add these to .env.example: " + missing.join(", "));
});
