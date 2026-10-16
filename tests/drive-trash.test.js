/* Google Drive deletion sync (server/drive-trash.js), against a fake Google Drive.
   Only a file ZenCrevia uploaded is eligible; one still used anywhere is refused; deleting moves the same Drive file
   (by its id) to the Trash with files.update {trashed:true} — never files.delete; a lost answer, a 403, a 404, a 429,
   a revoked grant and an Undo each end the way the spec says. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const dt = require('../server/drive-trash');
const WS = 'ws1', ME = { id: 'admin' }, ID = '1AbCdEfGhIjKlMnOpQrStUvWxYz_ab-cd', ID2 = '1ZyXwVuTsRqPoNmLkJiHgFeDcBa_zz-yy';

function fresh() {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(__dirname, '..', 'db', 'schema.sql'), 'utf8'));
  db.exec("PRAGMA foreign_keys=OFF");   /* only the rows each test needs */
  dt.ensure.ready = null; dt.ensure(db);
  db.prepare("INSERT INTO tasks (id, workspace_id, title, status_id) VALUES ('T-1', ?, 'Banner', 'todo')").run(WS);
  dt.record(db, WS, { driveId: ID, name: 'campaign-hero.png', mime: 'image/png', size: '1.2 MB', url: 'https://drive.google.com/file/d/' + ID + '/view' }, 'admin', 'team@example.com');
  dt.record(db, WS, { driveId: ID2, name: 'old.png' }, 'admin', 'someone-else@example.com');
  return db;
}
/* a fake Drive: answers by method, and keeps what was asked */
function drive(answers) {
  const calls = [];
  const fetch = async (url, o) => { calls.push({ url, method: o.method, body: o.body ? JSON.parse(o.body) : null });
    const a = answers[o.method] || { status: 200, json: {} }; const x = typeof a === 'function' ? a(calls) : a;
    return { ok: x.status >= 200 && x.status < 300, status: x.status, json: async () => x.json || {} }; };
  return { calls, deps: { fetch, token: async () => 'tok', drive: () => ({ shared: true, sharedAccount: 'team@example.com' }), dropToken: () => { calls.push({ dropped: true }); } } };
}
const status = (db, id) => dt.get(db, WS, id || ID).status;

test('a file used anywhere is refused, with where; removing it there lets it go', () => {
  const db = fresh();
  db.prepare("INSERT INTO files (id, workspace_id, task_id, filename, storage_provider, external_url, drive_id) VALUES ('f1', ?, 'T-1', 'x', 'gdrive', ?, ?)").run(WS, 'https://drive.google.com/file/d/' + ID + '/view', ID);
  db.prepare("INSERT INTO comments (id, workspace_id, task_id, body, attachments) VALUES ('c1', ?, 'T-1', 'see', ?)").run(WS, JSON.stringify([{ driveId: ID }]));
  const used = dt.references(db, WS, ID);
  assert.deepEqual(used.map(r => r.where).sort(), ['Comment', 'Task file']);
  assert.throws(() => dt.requestDelete(db, WS, ID, ME, { shared: true, sharedAccount: 'team@example.com' }), e => e.status === 409 && e.code === 'FILE_IN_USE');
  assert.equal(status(db), 'active', 'nothing happened');
  db.prepare("DELETE FROM files").run(); db.prepare("DELETE FROM comments").run();
  assert.equal(dt.references(db, WS, ID).length, 0);
  /* sync off: deleted in ZenCrevia only */
  assert.equal(dt.requestDelete(db, WS, ID, ME, { shared: true, sharedAccount: 'team@example.com' }).status, 'deleted_local');
  assert.equal(dt.requestDelete(db, WS, ID, ME, { shared: true }).status, 'deleted_local', 'asked twice: one deletion');
  assert.equal(dt.restore(db, WS, ID).status, 'active', 'Undo');
  assert.throws(() => dt.requestDelete(db, WS, 'not-ours-1234567890', ME, {}), e => e.status === 404, 'a link someone pasted is not ours');
});

test('sync on: the same Drive file is moved to the Trash, by its id, and never deleted for good', async () => {
  const db = fresh(); dt.saveSettings(db, WS, { deletionSync: true }, 'admin');
  assert.equal(dt.requestDelete(db, WS, ID, ME, { shared: true, sharedAccount: 'team@example.com' }).status, 'trash_pending', 'pending — not done before Drive says so');
  const d = drive({ GET: { status: 200, json: { id: ID, trashed: false, capabilities: { canTrash: true } } }, PATCH: { status: 200, json: { id: ID, trashed: true } } });
  await dt.tick(db, WS, d.deps);
  assert.equal(status(db), 'trashed'); assert.ok(dt.get(db, WS, ID).trashed_at);
  const patch = d.calls.find(c => c.method === 'PATCH');
  assert.ok(patch.url.indexOf('/drive/v3/files/' + encodeURIComponent(ID) + '?') > 0, 'by the recorded id');
  assert.deepEqual(patch.body, { trashed: true });
  assert.ok(d.calls.every(c => c.method !== 'DELETE'), 'files.delete is never used');
  /* another Google account's upload stays in Drive */
  assert.equal(dt.requestDelete(db, WS, ID2, ME, { shared: true, sharedAccount: 'team@example.com' }).status, 'deleted_local');
  assert.match(dt.get(db, WS, ID2).last_error, /another Google account/);
});

test('every way Drive can answer', async () => {
  const run = async (answers, setup) => { const db = fresh(); dt.saveSettings(db, WS, { deletionSync: true }, 'admin'); dt.requestDelete(db, WS, ID, ME, { shared: true, sharedAccount: 'team@example.com' }); if (setup) setup(db); const d = drive(answers); await dt.tick(db, WS, d.deps); return { db, d, row: dt.get(db, WS, ID) }; };
  /* the answer to an earlier try was lost: Drive already has it in the Trash */
  let r = await run({ GET: { status: 200, json: { trashed: true } } });
  assert.equal(r.row.status, 'trashed'); assert.ok(!r.d.calls.some(c => c.method === 'PATCH'), 'not asked again');
  /* refused: failed for good, no retry */
  r = await run({ GET: { status: 200, json: { trashed: false, capabilities: { canTrash: true } } }, PATCH: { status: 403 } });
  assert.equal(r.row.status, 'trash_failed'); assert.match(r.row.last_error, /refused \(403\)/); assert.equal(r.row.next_attempt_at, null);
  r = await run({ GET: { status: 200, json: { trashed: false, capabilities: { canTrash: false } } } });
  assert.equal(r.row.status, 'trash_failed'); assert.ok(!r.d.calls.some(c => c.method === 'PATCH'));
  /* gone from Drive */
  r = await run({ GET: { status: 404 } });
  assert.equal(r.row.status, 'provider_missing');
  /* busy: later, with backoff */
  r = await run({ GET: { status: 429 } });
  assert.equal(r.row.status, 'trash_pending'); assert.equal(r.row.attempts, 1); assert.ok(new Date(r.row.next_attempt_at) > new Date(), 'a later try');
  r = await run({ GET: { status: 503 } }, db => db.prepare("UPDATE drive_uploads SET attempts=?").run(dt.MAX_ATTEMPTS - 1));
  assert.equal(r.row.status, 'trash_failed', 'after the last try'); assert.match(r.row.last_error, /tried 8 times/);
  /* an expired token: dropped, so the next try gets a new one */
  r = await run({ GET: { status: 401 } });
  assert.equal(r.row.status, 'trash_pending'); assert.ok(r.d.calls.some(c => c.dropped));
  /* the grant revoked: an admin must reconnect */
  { const db = fresh(); dt.saveSettings(db, WS, { deletionSync: true }, 'admin'); dt.requestDelete(db, WS, ID, ME, { shared: true, sharedAccount: 'team@example.com' });
    const d = drive({}); d.deps.token = async () => { const e = new Error('revoked'); e.status = 409; throw e; };
    await dt.tick(db, WS, d.deps); const row = dt.get(db, WS, ID);
    assert.equal(row.status, 'trash_failed'); assert.match(row.last_error, /reconnect/); assert.equal(d.calls.length, 0);
    assert.equal(dt.retry(db, WS, ID).status, 'trash_pending', 'Retry'); }
  /* disconnected after it was queued */
  { const db = fresh(); dt.saveSettings(db, WS, { deletionSync: true }, 'admin'); dt.requestDelete(db, WS, ID, ME, { shared: true, sharedAccount: 'team@example.com' });
    const d = drive({}); d.deps.drive = () => ({ shared: false });
    await dt.tick(db, WS, d.deps); assert.equal(status(db), 'trash_failed'); assert.equal(d.calls.length, 0); }
});

test('used again, or kept with Undo, before Drive was reached: never trashed', async () => {
  /* attached again after the delete */
  let db = fresh(); dt.saveSettings(db, WS, { deletionSync: true }, 'admin'); dt.requestDelete(db, WS, ID, ME, { shared: true, sharedAccount: 'team@example.com' });
  db.prepare("INSERT INTO tasks (id, workspace_id, title, status_id, description) VALUES ('T-2', ?, 'Other', 'todo', ?)").run(WS, 'see https://drive.google.com/file/d/' + ID + '/view');
  let d = drive({}); await dt.tick(db, WS, d.deps);
  assert.equal(status(db), 'active'); assert.equal(d.calls.length, 0, 'Drive never asked');
  /* Undo while Drive was being asked: the answer is not written over it */
  db = fresh(); dt.saveSettings(db, WS, { deletionSync: true }, 'admin'); dt.requestDelete(db, WS, ID, ME, { shared: true, sharedAccount: 'team@example.com' });
  d = drive({ GET: () => { dt.restore(db, WS, ID); return { status: 200, json: { trashed: false, capabilities: { canTrash: true } } }; }, PATCH: { status: 200, json: { trashed: true } } });
  await dt.tick(db, WS, d.deps);
  assert.equal(status(db), 'active', 'the newer choice stands');
  assert.equal(dt.summary(db, WS).active, 2);
});

test('the upload route records every upload as ZenCrevia\'s — the only files deletion sync may touch', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'server.js'), 'utf8');
  const upload = src.slice(src.indexOf('route("POST", "/api/cloud/gdrive/upload"'), src.indexOf('route("POST", "/api/cloud/gdrive/upload"') + 900);
  assert.match(upload, /driveTrash\.record\(db, WS_ID, out, u\.id, gdrive\.status\(db, WS_ID\)\.sharedAccount\)/);
  /* and Drive is only ever asked to move a file to the Trash */
  const mod = fs.readFileSync(path.join(__dirname, '..', 'server', 'drive-trash.js'), 'utf8');
  assert.ok(!/"DELETE"|method:\s*'DELETE'|files\.delete\(/.test(mod.replace(/never files\.delete|never deletes|never deleted/g, '')), 'no permanent delete anywhere');
});
