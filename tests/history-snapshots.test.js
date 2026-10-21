/* The copies a task's history keeps (Oct 2026, performance). A write that adds to the history saved a full copy of
   the task even when nothing going back restores had changed — a new comment saved the task again, word for word,
   but for its updated time — and those copies were most of a large database. Now such a point keeps its own row
   (when, who) and leans on the copy before it, storing only what differs. Going back to any point shows and
   restores exactly what it did; only the last 300 points of each are kept, as before. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const snaps = require('../server/snapshots');
const root = path.join(__dirname, '..');

const task = (o) => Object.assign({ id: 'T-1', title: 'Hero banner', description: 'A long description '.repeat(40), proj: 'p1', alsoIn: [], team: null, status: 'todo', prio: 'medium', assignee: 'a', reviewer: 'b', assignees: ['a'], reviewers: ['b'], hidden: false, startDate: null, dueDate: '2026-11-01', effort: 2, assetCount: 1, labels: [], sort: 1000, parent: null, requestId: null, completedAt: null, createdAt: '2026-10-01T00:00:00.000Z', createdBy: 'a', updatedAt: '2026-10-01T00:00:00.000Z', tags: [], dependencies: [], brief: null, custom: {}, meta: {}, versions: [], files: [], progress: [], scoring: { hours: null, story: null, weighted: null } }, o || {});
let clock = Date.parse('2026-10-01T00:00:00.000Z');
const tick = () => new Date(clock += 1000).toISOString();
function put(db, doc, keep) { const id = 'snap_' + (clock + 1); snaps.put(db, { id, wsId: 'ws', type: 'task', entityId: doc.id, takenAt: tick(), actorId: 'a', doc }, keep || 300); return id; }
const read = (db, id) => snaps.docOf(db, db.prepare('SELECT * FROM entity_snapshots WHERE id=?').get(id));
const full = db => db.prepare('SELECT count(*) n FROM entity_snapshots WHERE same_as IS NULL').get().n;

test('a point whose restorable content did not change shares the copy before it, and reads back exactly', () => {
  const db = new DatabaseSync(':memory:'); snaps.ensure(db);
  const docs = [], ids = [];
  /* a save, then four comments (only the updated time moves), a reorder (only the order), then a new title */
  [task(), task({ updatedAt: tick() }), task({ updatedAt: tick() }), task({ updatedAt: tick() }), task({ updatedAt: tick() }), task({ sort: 1500, updatedAt: tick() }), task({ title: 'Hero banner — final', updatedAt: tick() })]
    .forEach(d => { docs.push(d); ids.push(put(db, d)); });
  assert.equal(db.prepare('SELECT count(*) n FROM entity_snapshots').get().n, 7, 'every point keeps a row of its own');
  assert.equal(full(db), 2, 'but only two hold a copy: the first, and the one after the title changed');
  ids.forEach((id, i) => assert.equal(JSON.stringify(read(db, id)), JSON.stringify(docs[i]), 'point ' + i + ' reads back as it was saved'));
  const bytes = db.prepare('SELECT sum(length(doc)) n FROM entity_snapshots WHERE same_as IS NOT NULL').get().n;
  assert.ok(bytes < 400, 'the shared points store only what differs: ' + bytes + ' bytes');
  /* a field the copy does not have is not the same as one that is empty: going back treats them differently */
  const gone = task({ updatedAt: tick() }); delete gone.brief;
  put(db, gone); assert.equal(full(db), 3);
});

test('keeping only the last points never leaves a kept point without its copy', () => {
  const db = new DatabaseSync(':memory:'); snaps.ensure(db);
  const docs = [], ids = [];
  for (let i = 0; i < 9; i++) { const d = task({ updatedAt: tick(), title: i < 6 ? 'Same' : 'Changed ' + i }); docs.push(d); ids.push(put(db, d, 4)); }
  const left = db.prepare('SELECT id FROM entity_snapshots ORDER BY taken_at').all().map(r => r.id);
  assert.deepEqual(left, ids.slice(-4), 'the last four, as before');
  left.forEach(id => assert.equal(JSON.stringify(read(db, id)), JSON.stringify(docs[ids.indexOf(id)])));
  /* six points shared one copy; once it fell out, the oldest kept one took it over */
  const db2 = new DatabaseSync(':memory:'); snaps.ensure(db2);
  const d2 = [], i2 = [];
  for (let i = 0; i < 8; i++) { const d = task({ updatedAt: tick(), sort: i }); d2.push(d); i2.push(put(db2, d, 3)); }
  const kept = db2.prepare('SELECT id, same_as FROM entity_snapshots ORDER BY taken_at').all();
  assert.deepEqual(kept.map(r => r.id), i2.slice(-3));
  assert.equal(kept[0].same_as, null, 'the oldest kept point holds the copy now');
  assert.ok(kept.slice(1).every(r => r.same_as === kept[0].id));
  kept.forEach(r => assert.equal(JSON.stringify(read(db2, r.id)), JSON.stringify(d2[i2.indexOf(r.id)])));
});

test('copies saved before this change still read back', () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE entity_snapshots (id TEXT PRIMARY KEY, workspace_id TEXT, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL, taken_at TEXT NOT NULL, actor_id TEXT, doc TEXT NOT NULL)");
  const old = task({ title: 'From before' });
  db.prepare('INSERT INTO entity_snapshots (id,workspace_id,entity_type,entity_id,taken_at,actor_id,doc) VALUES (?,?,?,?,?,?,?)').run('snap_old', 'ws', 'task', 'T-1', tick(), 'a', JSON.stringify(old));
  snaps.ensure(db);
  assert.equal(JSON.stringify(read(db, 'snap_old')), JSON.stringify(old));
  const next = task({ title: 'From before', updatedAt: tick() }); const id = put(db, next);
  assert.equal(JSON.stringify(read(db, id)), JSON.stringify(next), 'a row from before has no hash, so the next one is a full copy');
  assert.equal(full(db), 2);
});

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-snaps-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Snaps!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'snaps-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'snaps-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const r = await req('POST', '/api/auth/login', { email: 'admin@zencrevia.demo', password: 'Snaps!Admin23456' }); assert.equal(r.status, 200);
  const admin = r.headers.get('set-cookie').split(';')[0];
  const dbFile = path.join(temp, 'creative-os.db');
  const peek = (sql, ...p) => { const d = new DatabaseSync(dbFile, { readOnly: true }); try { return d.prepare(sql).all(...p); } finally { d.close(); } };
  return { req, admin, peek };
}

test('comments on a task do not save the task again; every point still shows and goes back as before', { timeout: 60000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const flow = boot.ws.workflow;
  let r = await s.req('POST', '/api/tasks', { title: 'Snapshot check', status: flow[0].id, prio: 'medium', description: 'Words '.repeat(200) }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const id = (await r.json()).id;
  const after = [];
  for (let i = 0; i < 5; i++) { r = await s.req('POST', '/api/tasks/' + id + '/comments', { text: 'Comment ' + i }, s.admin); assert.equal(r.status, 200, await r.clone().text()); after.push(await r.json()); }
  const rows = s.peek("SELECT id, same_as, length(doc) AS bytes FROM entity_snapshots WHERE entity_type='task' AND entity_id=? ORDER BY taken_at", id);
  assert.equal(rows.length, 6, 'created + five comments: a point each');
  assert.equal(rows.filter(x => !x.same_as).length, 1, 'one copy of the task, not six');
  assert.ok(rows.filter(x => x.same_as).every(x => x.bytes < 200), 'the comments keep only their updated time: ' + rows.map(x => x.bytes));
  /* each comment's point shows the task as it was right after that comment, and going back to it works */
  const doc = after[after.length - 1];
  const points = doc.activity.filter(a => a.k === 'comment' && a.a && a.a.snap);
  assert.equal(points.length, 5);
  for (let i = 0; i < 5; i++) {
    const p = points.find(a => a.a.snap === rows[i + 1].id);
    r = await s.req('GET', '/api/restore/task/' + id + '?activity=' + p.id, undefined, s.admin);
    assert.equal(r.status, 200, await r.clone().text());
    const preview = await r.json();
    const want = Object.assign({}, after[i]); delete want.comments; delete want.activity;
    assert.equal(preview.doc.updatedAt, after[i].updatedAt, 'the point right after comment ' + i);
    assert.deepEqual(Object.keys(preview.doc), Object.keys(want), 'the same fields, in the same order');
    assert.equal(preview.doc.title, 'Snapshot check'); assert.equal(preview.doc.description, want.description);
  }
  /* a change in what going back restores takes a copy of its own; going back to a comment's point puts the title back */
  const cur = await (await s.req('GET', '/api/tasks/' + id, undefined, s.admin)).json(); cur.title = 'Snapshot check — renamed';
  assert.equal((await s.req('PUT', '/api/tasks/' + id, cur, s.admin)).status, 200);
  assert.equal(s.peek("SELECT count(*) n FROM entity_snapshots WHERE entity_type='task' AND entity_id=? AND same_as IS NULL", id)[0].n, 2);
  r = await s.req('POST', '/api/restore/task/' + id, { activityId: points[2].id }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const back = await r.json();
  assert.equal(back.title, 'Snapshot check');
  assert.equal(back.comments.length, 5, 'comments stay');
  assert.ok(back.activity.some(a => a.k === 'restored' && a.a.at === (s.peek('SELECT taken_at FROM entity_snapshots WHERE id=?', points[2].a.snap)[0].taken_at)), 'the restore names the point it went back to');
});
