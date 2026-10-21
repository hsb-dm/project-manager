/* Backups off the server's main thread (Oct 2026, performance). A manual or scheduled backup held the server for its
   whole run — half a second at a 36 MB database — and spent about 30 ms of scrypt on every picture it mirrored. Now it
   runs in a worker thread, seals a megabyte at a time and derives its key once. The file format, the encryption, the
   sidecar and the answer are what they were: a backup made by the code before still restores (a fixture made with
   it, tests/backup-fixture-v1.js), and one made now restores — and opens with the code before, too. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const fixture = require('./backup-fixture-v1');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcv-worker-'));
process.env.COS_DATA_DIR = dir;
process.env.COS_BACKUP_KEY = fixture.key;
const uploads = require('../server/uploads.js');
test.after(() => fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }));
function sandbox(name) {
  process.env.COS_BACKUP_DIR = path.join(dir, name);
  delete require.cache[require.resolve('../server/backup.js')];
  return require('../server/backup.js');
}
/* decryptFile as it was before Oct 2026, word for word: what an older server does with a backup */
const MAGIC = Buffer.from('ZCV1');
function decryptBefore(source, target) {
  const raw = fs.readFileSync(source);
  if (!raw.subarray(0, 4).equals(MAGIC)) throw new Error('Backup format is not recognized');
  const salt = raw.subarray(4, 20), iv = raw.subarray(20, 32), tag = raw.subarray(32, 48), encrypted = raw.subarray(48);
  const key = crypto.scryptSync(process.env.COS_BACKUP_KEY, salt, 32), decipher = crypto.createDecipheriv('aes-256-gcm', key, iv); decipher.setAuthTag(tag);
  fs.writeFileSync(target, Buffer.concat([decipher.update(encrypted), decipher.final()]), { mode: 0o600 });
}
const stored = (sub, buf, ext) => { const sha = crypto.createHash('sha256').update(buf).digest('hex'), d = path.join(uploads.UPLOAD_DIR, ...sub, sha.slice(0, 2)); fs.mkdirSync(d, { recursive: true }); fs.writeFileSync(path.join(d, sha + '.' + ext), buf); return sha + '.' + ext; };
const note = file => { const d = new DatabaseSync(file, { readOnly: true }); try { return d.prepare('SELECT note FROM marker ORDER BY id DESC LIMIT 1').get().note; } finally { d.close(); } };
const leftovers = backupDir => { const out = []; const walk = d => { let names = []; try { names = fs.readdirSync(d); } catch { return; } names.forEach(n => { const p = path.join(d, n); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.(part|tmp|tmp\.db)$/.test(n)) out.push(n); }); }; walk(backupDir); return out; };

test('a backup made before this change still restores, with its pictures and documents', () => {
  const backups = sandbox('old');
  for (const [rel, b64] of Object.entries(fixture.files)) { const f = path.join(backups.BACKUP_DIR, ...rel.split('/')); fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, Buffer.from(b64, 'base64')); }
  const listed = backups.list();
  assert.equal(listed.length, 1); assert.equal(listed[0].name, fixture.name); assert.equal(listed[0].createdBy, 'zein');
  assert.equal(backups.verifyStored(fixture.name).status, 'verified');
  const live = path.join(dir, 'old-live.db');
  let db = new DatabaseSync(live); db.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, note TEXT)'); db.prepare('INSERT INTO marker (note) VALUES (?)').run('what is live now');
  let active = db;
  const r = backups.safeRestore(db, fixture.name, live, { userId: 'zein', closeDatabase: h => h.close(), reopenDatabase: () => (active = new DatabaseSync(live)) });
  assert.equal(r.ok, true); assert.ok(r.safetyBackup);
  assert.equal(active.prepare('SELECT note FROM marker').get().note, fixture.marker);
  active.close();
  /* the mirrored picture and document come back byte for byte */
  for (const [rel, want] of [['uploads/' + fixture.image.name + '.enc', fixture.image.base64], ['uploads/d/' + fixture.document.name + '.enc', fixture.document.base64]]) {
    const out = path.join(dir, 'old-restored-' + path.basename(rel, '.enc'));
    backups.decryptFile(path.join(backups.BACKUP_DIR, ...rel.split('/')), out);
    assert.equal(fs.readFileSync(out).toString('base64'), want, rel);
  }
});

test('a backup made now, in a worker: the same files and answer, one key for everything it seals, and it restores', async () => {
  const backups = sandbox('new');
  const pics = [0, 1, 2].map(i => stored([], crypto.randomBytes(2000 + i), 'png')), doc = stored(['docs'], Buffer.from('%PDF-1.4 kept here ' + Date.now()), 'pdf');
  const live = path.join(dir, 'new-live.db');
  const db = new DatabaseSync(live); db.exec('PRAGMA journal_mode = WAL; CREATE TABLE marker (id INTEGER PRIMARY KEY, note TEXT)'); db.prepare('INSERT INTO marker (note) VALUES (?)').run('made in a worker');
  const made = await backups.createInBackground(db, { kind: 'manual', userId: 'zein', reason: 'off the main thread' });
  const same = backups.create(db, { kind: 'manual', userId: 'zein', reason: 'on the main thread' });
  assert.deepEqual(Object.keys(made), Object.keys(same), 'the answer has the same shape as a backup made on the main thread');
  assert.equal(made.encrypted, true); assert.equal(made.kind, 'manual'); assert.equal(made.ok, true); assert.ok(made.tables >= 1); assert.match(made.checksum, /^[a-f0-9]{64}$/);
  const meta = backups.readMeta(made.name);
  assert.deepEqual(Object.keys(meta), ['name', 'kind', 'createdAt', 'createdBy', 'reason', 'checksum', 'integrity', 'tables', 'bytes', 'uploads']);
  assert.equal(meta.reason, 'off the main thread'); assert.equal(meta.bytes, fs.statSync(path.join(backups.BACKUP_DIR, made.name)).size);
  assert.deepEqual(meta.uploads, { copied: 3, total: 3, documents: { copied: 1, total: 1 } });
  assert.equal(backups.verifyStored(made.name).status, 'verified');
  assert.deepEqual((await backups.verifyManyInBackground([made.name, same.name, 'zencrevia-nope.db.enc'])).map(v => v.status), ['verified', 'verified', 'missing']);
  /* the format: ZCV1 · salt · iv · tag · ciphertext. One salt (so one scrypt) for the database and every file it mirrored, a fresh iv for each */
  const head = f => { const raw = fs.readFileSync(f); return { magic: raw.subarray(0, 4).toString(), salt: raw.subarray(4, 20).toString('hex'), iv: raw.subarray(20, 32).toString('hex') }; };
  const dbHead = head(path.join(backups.BACKUP_DIR, made.name));
  const mirrored = pics.map(n => path.join(backups.BACKUP_DIR, 'uploads', n + '.enc')).concat([path.join(backups.BACKUP_DIR, 'uploads', 'd', doc + '.enc')]).map(head);
  assert.equal(dbHead.magic, 'ZCV1');
  assert.ok(mirrored.every(h => h.magic === 'ZCV1' && h.salt === dbHead.salt), 'the key is derived once per backup');
  assert.equal(new Set(mirrored.map(h => h.iv).concat([dbHead.iv])).size, 5, 'each file has its own iv');
  /* the code before opens it, and so does this one */
  decryptBefore(path.join(backups.BACKUP_DIR, made.name), path.join(dir, 'new-by-old.db'));
  assert.equal(note(path.join(dir, 'new-by-old.db')), 'made in a worker');
  decryptBefore(path.join(backups.BACKUP_DIR, 'uploads', pics[0] + '.enc'), path.join(dir, 'pic-by-old'));
  assert.deepEqual(fs.readFileSync(path.join(dir, 'pic-by-old')), fs.readFileSync(path.join(uploads.UPLOAD_DIR, pics[0].slice(0, 2), pics[0])));
  db.prepare('UPDATE marker SET note=?').run('changed since');
  let active = db;
  const r = backups.safeRestore(db, made.name, live, { closeDatabase: h => h.close(), reopenDatabase: () => (active = new DatabaseSync(live)) });
  assert.equal(r.ok, true);
  assert.equal(active.prepare('SELECT note FROM marker').get().note, 'made in a worker');
  active.close();
  assert.deepEqual(leftovers(backups.BACKUP_DIR), [], 'nothing half-written is left behind');
  /* a stored file that changed is found out, in the worker as on the main thread */
  const f = path.join(backups.BACKUP_DIR, same.name), raw = fs.readFileSync(f); raw[raw.length - 1] ^= 0xff; fs.writeFileSync(f, raw);
  assert.equal((await backups.verifyManyInBackground([same.name]))[0].status, 'corrupt');
});

test('backups asked for together run one after the other; idle() is when they are done; a missing key is refused', async () => {
  const backups = sandbox('queue');
  const live = path.join(dir, 'queue-live.db'), db = new DatabaseSync(live); db.exec('CREATE TABLE marker (id INTEGER PRIMARY KEY, note TEXT)');
  const both = [backups.createInBackground(db, { kind: 'manual' }), backups.createInBackground(db, { kind: 'scheduled' })];
  let done = false; const idle = backups.idle().then(() => { done = true; });
  const out = await Promise.all(both); await idle;
  assert.ok(done); assert.notEqual(out[0].name, out[1].name);
  assert.ok(out[0].createdAt <= out[1].createdAt, 'in the order asked');
  assert.equal(backups.list().length, 2);
  process.env.COS_BACKUP_KEY = 'too-short';
  try { await assert.rejects(backups.createInBackground(db, {}), e => e.status === 400 && /at least 32 characters/.test(e.message)); }
  finally { process.env.COS_BACKUP_KEY = fixture.key; }
  db.close();
});

test('a safety copy taken while a backup runs in its worker: both mirror the same new files, and every one opens', { timeout: 120000 }, async () => {
  const backups = sandbox('overlap');
  const files = []; for (let i = 0; i < 24; i++) files.push(stored([], crypto.randomBytes(400000 + i), 'png'));
  const live = path.join(dir, 'overlap-live.db'), db = new DatabaseSync(live); db.exec('PRAGMA journal_mode = WAL; CREATE TABLE marker (id INTEGER PRIMARY KEY, note TEXT)');
  const running = backups.createInBackground(db, { kind: 'manual' });
  await new Promise(r => setTimeout(r, 40));
  const safety = backups.create(db, { kind: 'pre-import' });
  const made = await running;
  db.close();
  assert.equal(backups.verifyStored(safety.name).status, 'verified'); assert.equal(backups.verifyStored(made.name).status, 'verified');
  for (const n of files) { const out = path.join(dir, 'overlap-' + n); backups.decryptFile(path.join(backups.BACKUP_DIR, 'uploads', n + '.enc'), out); assert.deepEqual(fs.readFileSync(out), fs.readFileSync(path.join(uploads.UPLOAD_DIR, n.slice(0, 2), n))); }
  assert.deepEqual(leftovers(backups.BACKUP_DIR), []);
});

test('through the server: a backup answers as before, and a restore asked for meanwhile waits for it', { timeout: 60000 }, async t => {
  const { spawn } = require('node:child_process');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zcv-worker-srv-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: path.join(__dirname, '..'), env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_BACKUP_DIR: '', COS_ADMIN_PASSWORD: 'Worker!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'worker-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'worker-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = await req('POST', '/api/auth/login', { email: 'admin@zencrevia.demo', password: 'Worker!Admin23456' }); assert.equal(login.status, 200);
  const admin = login.headers.get('set-cookie').split(';')[0];
  let r = await req('POST', '/api/backups', { reason: 'first' }, admin); assert.equal(r.status, 200, await r.clone().text());
  const first = await r.json();
  assert.deepEqual(Object.keys(first), ['name', 'bytes', 'createdAt', 'encrypted', 'kind', 'checksum', 'ok', 'tables']);
  assert.equal(first.kind, 'manual'); assert.equal(first.encrypted, true);
  /* a second backup, and before it is done, a restore of the first */
  const second = req('POST', '/api/backups', { reason: 'second' }, admin);
  await new Promise(res => setTimeout(res, 15));
  const restore = req('POST', '/api/backups/' + encodeURIComponent(first.name) + '/restore', { confirm: first.name }, admin);
  const [a, b] = await Promise.all([second, restore]);
  assert.equal(a.status, 200, await a.clone().text());
  assert.equal(b.status, 200, await b.clone().text());
  const restored = await b.json(); assert.equal(restored.ok, true); assert.ok(restored.safetyBackup);
  const list = await (await req('GET', '/api/backups', undefined, admin)).json();
  assert.deepEqual(list.backups.map(x => x.integrityStatus).filter(s => s !== 'verified'), [], 'every backup is intact');
  assert.ok(list.backups.length >= 3, 'the first, the second and the safety copy');
  assert.equal((await req('GET', '/api/health')).status, 200);
});

test('the server goes on answering while a backup runs', { timeout: 120000 }, async () => {
  const backups = sandbox('busy');
  const live = path.join(dir, 'busy-live.db'), db = new DatabaseSync(live);
  db.exec('PRAGMA journal_mode = WAL; CREATE TABLE blobs (id INTEGER PRIMARY KEY, b BLOB); CREATE TABLE marker (id INTEGER PRIMARY KEY, note TEXT)');
  const ins = db.prepare('INSERT INTO blobs (b) VALUES (?)'); db.exec('BEGIN'); for (let i = 0; i < 40; i++) ins.run(crypto.randomBytes(1 << 20)); db.exec('COMMIT');
  /* the longest the event loop waits, while fn runs */
  async function longestWait(fn) {
    let worst = 0, last = performance.now();
    const timer = setInterval(() => { const t = performance.now(); worst = Math.max(worst, t - last - 5); last = t; }, 5);
    try { await fn(); await new Promise(r => setTimeout(r, 20)); } finally { clearInterval(timer); }
    return worst;
  }
  const onMain = await longestWait(async () => { await new Promise(r => setTimeout(r, 20)); backups.create(db, { kind: 'manual' }); });
  const inWorker = await longestWait(() => backups.createInBackground(db, { kind: 'manual' }));
  db.close();
  assert.ok(onMain > 80, 'the backup on the main thread holds it (' + Math.round(onMain) + ' ms)');
  assert.ok(inWorker < Math.max(50, onMain / 4), 'in the worker it does not: the longest wait was ' + Math.round(inWorker) + ' ms against ' + Math.round(onMain) + ' ms');
});
