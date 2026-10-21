/* Profile photos are stored files, not data URLs inside every people payload (server/avatars.js).
   The promises: the people payloads carry a short /files/ URL; the photo is seen by whoever is signed in
   to the workspace and by nobody else; the member routes keep their limits; photos an older version
   stored inline move to files on start, once, and a row that has not moved still reads; backups carry
   the files. The browser side: e2e/avatar-files.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const RED = fs.readFileSync(path.join(root, 'e2e/fixtures/red.png'));
const WIDE = fs.readFileSync(path.join(root, 'e2e/fixtures/wide.png'));
const PNG = 'data:image/png;base64,' + RED.toString('base64');
const PNG2 = 'data:image/png;base64,' + WIDE.toString('base64');
const FILE_RE = /^\/files\/[a-f0-9]{64}\.png$/;

/* every server started is stopped when the test ends, whatever happened; the folder goes unless keepData */
async function start(t, temp, keepData) {
  temp = temp || fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-avatars-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Avatar!Admin23456', COS_ADMIN_EMAIL: 'ops@hsb.co.id', COS_SECRET_KEY: 'avatar-secret-key-long-enough-0123456789', COS_BACKUP_KEY: 'avatar-backup-key-long-enough-9876543210', COS_SECURE_COOKIE: '0', APP_URL: 'http://127.0.0.1', COS_SEED_DEMO: '0', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log' }) });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + ' ' + out)); }); });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  t.after(async () => { await stop(); if (!keepData) { try { fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); } catch {} } });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const text = await r.text(); let body = null; try { body = text ? JSON.parse(text) : null; } catch { body = text; } return { status: r.status, body }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('ops@hsb.co.id', 'Avatar!Admin23456');
  return { base, req, json, login, admin, temp, stop, out: () => out };
}
const dbAt = temp => { const { DatabaseSync } = require('node:sqlite'); return new DatabaseSync(path.join(temp, 'creative-os.db')); };
const fileOnDisk = (temp, url) => { const name = url.slice('/files/'.length); return path.join(temp, 'uploads', name.slice(0, 2), name); };

test('a photo is a stored file: short URLs in every people payload, the same people may see it, the same limits', { timeout: 60000 }, async t => {
  const s = await start(t);
  const boot0 = (await s.json('GET', '/api/bootstrap', undefined, s.admin)).body;
  const me = boot0.me.id;
  /* a colleague who can sign in */
  const made = await s.json('POST', '/api/members', { name: 'Mira Photo', email: 'mira@hsb.co.id', perm: 'member', cap: 40 }, s.admin);
  assert.equal(made.status, 200, JSON.stringify(made.body)); const mira = made.body.id;
  assert.equal((await s.json('POST', '/api/members/' + mira + '/password', { password: 'Mira!Photo-2026x' }, s.admin)).status, 200);
  const miraC = await s.login('mira@hsb.co.id', 'Mira!Photo-2026x');

  /* what the page sends today, a data URL: stored as a file, the payload carries its URL */
  let r = await s.json('PUT', '/api/members/' + me, Object.assign({}, boot0.people[me], { avatar: PNG }), s.admin);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const url = r.body[me].avatar;
  assert.match(url, FILE_RE, 'the answer to the save carries the URL, not the bytes');
  assert.ok(fs.existsSync(fileOnDisk(s.temp, url)), 'the file is on disk');
  assert.deepEqual(fs.readFileSync(fileOnDisk(s.temp, url)), RED, 'byte for byte the picture that was sent');
  { const db = dbAt(s.temp); assert.equal(db.prepare('SELECT avatar_data FROM users WHERE id=?').get(me).avatar_data, url, 'the column holds the URL'); db.close(); }
  for (const [p, pick] of [['/api/bootstrap', b => b.people], ['/api/live/people', b => b.people], ['/api/live/teams', b => b.people]]) {
    const b = (await s.json('GET', p, undefined, s.admin)).body;
    assert.equal(pick(b)[me].avatar, url, p + ' carries the URL');
    assert.ok(!JSON.stringify(pick(b)).includes('base64'), p + ' carries no picture bytes');
  }
  assert.ok(JSON.stringify((await s.json('GET', '/api/live/people', undefined, s.admin)).body).length < 4000, 'two people with a photo stay small');

  /* who may see it: everyone signed in to the workspace, nobody without a session */
  const img = await fetch(s.base + url, { headers: { cookie: s.admin } });
  assert.equal(img.status, 200); assert.equal(img.headers.get('content-type'), 'image/png');
  assert.match(img.headers.get('cache-control'), /private, max-age=31536000, immutable/);
  assert.deepEqual(Buffer.from(await img.arrayBuffer()), RED);
  assert.equal((await fetch(s.base + url, { headers: { cookie: miraC } })).status, 200, 'a colleague sees it');
  assert.equal((await fetch(s.base + url)).status, 401, 'an anonymous request does not');
  assert.equal((await fetch(s.base + url, { headers: { cookie: 'cos_session=' + 'f'.repeat(64) } })).status, 401, 'nor a made-up session');

  /* a save sends the person back as it was read: the URL is kept */
  const read = (await s.json('GET', '/api/live/people', undefined, s.admin)).body.people[me];
  r = await s.json('PUT', '/api/members/' + me + '?prefsOnly=1', Object.assign({}, read, { prefs: Object.assign({}, read.prefs, { tick: 1 }) }), s.admin);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body[me].avatar, url);
  /* a save without the photo keeps it too */
  r = await s.json('PUT', '/api/members/' + me, { name: read.name, role: 'Lead' }, s.admin);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body[me].avatar, url);

  /* the limits: PNG, JPEG or WebP, up to 300,000 characters; a path that is not one of our files is refused */
  const put = (who, avatar, c) => s.json('PUT', '/api/members/' + who, Object.assign({}, read, { avatar }), c || s.admin);
  assert.equal((await put(me, 'data:image/png;base64,' + 'A'.repeat(300000))).status, 413);
  assert.equal((await put(me, 'data:image/gif;base64,' + RED.toString('base64'))).status, 400);
  assert.equal((await put(me, 'data:text/html;base64,PHNjcmlwdD4=')).status, 400);
  assert.equal((await put(me, '/files/' + 'a'.repeat(64) + '.png')).status, 400, 'not a file this server stored');
  assert.equal((await put(me, '/files/d/' + 'a'.repeat(64) + '.pdf')).status, 400);
  assert.equal((await put(me, 'https://example.com/me.png')).status, 400);
  assert.equal((await s.json('GET', '/api/live/people', undefined, s.admin)).body.people[me].avatar, url, 'a refused photo changes nothing');

  /* the access rules are as before: only an admin changes someone else's photo; anyone their own */
  const miraRead = (await s.json('GET', '/api/live/people', undefined, miraC)).body.people;
  assert.equal((await s.json('PUT', '/api/members/' + me, Object.assign({}, miraRead[me], { avatar: PNG2 }), miraC)).status, 403);
  r = await s.json('PUT', '/api/members/' + mira, Object.assign({}, miraRead[mira], { avatar: PNG2 }), miraC);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body[mira].avatar, FILE_RE); assert.notEqual(r.body[mira].avatar, url);
  /* the same picture twice is one file */
  r = await s.json('PUT', '/api/members/' + mira, Object.assign({}, r.body[mira], { avatar: PNG }), miraC);
  assert.equal(r.body[mira].avatar, url, 'same bytes, same file');

  /* removing a photo */
  r = await s.json('PUT', '/api/members/' + mira, Object.assign({}, r.body[mira], { avatar: '' }), miraC);
  assert.equal(r.status, 200); assert.equal(r.body[mira].avatar, null);

  /* a new member given a photo: the same limits, kept as a file */
  r = await s.json('POST', '/api/members', { name: 'Nia New', email: 'nia@hsb.co.id', perm: 'member', avatar: PNG2 }, s.admin);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.match(r.body.people[r.body.id].avatar, FILE_RE);
  assert.equal((await s.json('POST', '/api/members', { name: 'Big Pic', email: 'big@hsb.co.id', perm: 'member', avatar: 'data:image/png;base64,' + 'A'.repeat(300000) }, s.admin)).status, 413);

  /* backups carry the photo files; one lost from disk comes back from the backup */
  r = await s.json('POST', '/api/backups', {}, s.admin); assert.equal(r.status, 200, JSON.stringify(r.body));
  const name = url.slice('/files/'.length);
  assert.ok(fs.existsSync(path.join(s.temp, 'backups', 'uploads', name + '.enc')), 'the photo is in the backup mirror');
  fs.rmSync(fileOnDisk(s.temp, url));
  const back = await fetch(s.base + url, { headers: { cookie: s.admin } });
  assert.equal(back.status, 200); assert.deepEqual(Buffer.from(await back.arrayBuffer()), RED);
});

test('photos an older version stored inline move to files on start, once; a row not moved still reads', { timeout: 60000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-avatarsm-'));
  let s = await start(t, temp, true);
  const me = (await s.json('GET', '/api/bootstrap', undefined, s.admin)).body.me.id;
  const other = (await s.json('POST', '/api/members', { name: 'Old Photo', email: 'old@hsb.co.id', perm: 'member' }, s.admin)).body.id;
  const third = (await s.json('POST', '/api/members', { name: 'Odd Photo', email: 'odd@hsb.co.id', perm: 'member' }, s.admin)).body.id;
  await s.stop();
  /* what an older version left in the column: data URLs, one of them not a picture we can store */
  const BAD = 'data:image/png;base64,***not base64***';
  let db = dbAt(temp);
  db.prepare('UPDATE users SET avatar_data=? WHERE id=?').run(PNG, me);
  db.prepare('UPDATE users SET avatar_data=? WHERE id=?').run(PNG2, other);
  db.prepare('UPDATE users SET avatar_data=? WHERE id=?').run(BAD, third);
  db.close();

  s = await start(t, temp, true);
  assert.match(s.out(), /\[avatars\] moved profile photos out of the database: \{"moved":2,"kept":1/);
  let people = (await s.json('GET', '/api/bootstrap', undefined, s.admin)).body.people;
  assert.match(people[me].avatar, FILE_RE); assert.match(people[other].avatar, FILE_RE);
  assert.equal(people[third].avatar, BAD, 'a row that could not move keeps what it had, and still reads');
  assert.deepEqual(fs.readFileSync(fileOnDisk(temp, people[me].avatar)), RED);
  assert.deepEqual(fs.readFileSync(fileOnDisk(temp, people[other].avatar)), WIDE);
  /* that person can still save their other details */
  const r = await s.json('PUT', '/api/members/' + third, Object.assign({}, people[third], { role: 'Editor' }), s.admin);
  assert.equal(r.status, 200, JSON.stringify(r.body)); assert.equal(r.body[third].avatar, BAD);
  const firstUrls = [people[me].avatar, people[other].avatar];
  await s.stop();
  db = dbAt(temp); const uploadsBefore = db.prepare('SELECT count(*) n FROM uploads').get().n; db.close();

  /* a second start finds nothing more to move and changes nothing */
  s = await start(t, temp);
  assert.doesNotMatch(s.out(), /moved profile photos/);
  people = (await s.json('GET', '/api/bootstrap', undefined, s.admin)).body.people;
  assert.deepEqual([people[me].avatar, people[other].avatar], firstUrls);
  db = dbAt(temp); assert.equal(db.prepare('SELECT count(*) n FROM uploads').get().n, uploadsBefore); db.close();
});

test('restoring a backup taken before photos were files moves them too, without a restart', { timeout: 60000 }, async t => {
  const s = await start(t);
  const id = (await s.json('POST', '/api/members', { name: 'Back Up', email: 'backup@hsb.co.id', perm: 'member' }, s.admin)).body.id;
  /* a row as an older version wrote it; until it moves, it reads as it is */
  let db = dbAt(s.temp); db.prepare('UPDATE users SET avatar_data=? WHERE id=?').run(PNG, id); db.close();
  assert.equal((await s.json('GET', '/api/live/people', undefined, s.admin)).body.people[id].avatar, PNG, 'a row not moved yet still reads');
  const bk = (await s.json('POST', '/api/backups', {}, s.admin)).body;
  assert.ok(bk && bk.name, JSON.stringify(bk));
  const r = await s.json('POST', '/api/backups/' + encodeURIComponent(bk.name) + '/restore', { confirm: bk.name }, s.admin);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const after = (await s.json('GET', '/api/live/people', undefined, s.admin)).body.people[id].avatar;
  assert.match(after, FILE_RE, 'moved when the restored database was opened');
  assert.deepEqual(fs.readFileSync(fileOnDisk(s.temp, after)), RED);
});

test('a photo arriving by an import or the seed is stored as a file too', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zcv-avatar-'));
  process.env.COS_DATA_DIR = dir; process.env.COS_DB_PATH = path.join(dir, 't.db');
  ['../server/db.js', '../server/serialize.js', '../server/uploads.js', '../server/avatars.js'].forEach(m => delete require.cache[require.resolve(m)]);
  const db = require('../server/db.js').open(), sz = require('../server/serialize.js'), avatars = require('../server/avatars.js');
  try {
    db.prepare("INSERT INTO workspaces (id,name) VALUES ('ws','Here')").run();
    db.prepare("INSERT INTO roles (id,workspace_id,name,is_system) VALUES ('member','ws','Member',1)").run();
    sz.writePerson(db, 'ws', 'u1', { name: 'Imported', ini: 'IM', email: 'imp@here.test', perm: 'member', avatar: PNG, teams: [] });
    const url = sz.readPeople(db, 'ws').u1.avatar;
    assert.match(url, FILE_RE);
    assert.deepEqual(fs.readFileSync(path.join(dir, 'uploads', url.slice(7, 9), url.slice(7))), RED);
    /* a URL that is not a picture is left as it was given; nothing breaks */
    assert.equal(avatars.toFile(db, '/files/x'), '/files/x');
    /* moving is idempotent: nothing left to move */
    assert.equal(avatars.migrate(db), null);
    db.prepare("UPDATE users SET avatar_data=? WHERE id='u1'").run(PNG);
    assert.deepEqual(avatars.migrate(db), { moved: 1, kept: 0, bytesMoved: PNG.length });
    assert.equal(sz.readPeople(db, 'ws').u1.avatar, url, 'the same bytes are the same file');
    assert.equal(avatars.migrate(db), null);
  } finally { db.close(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }
});
