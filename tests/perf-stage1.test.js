/* Performance, stage 1 on the server (Oct 2026). The app does and sends the same; only faster:
   - the columns other rows point at are indexed (db/schema.sql, which runs at every open), so a cascade or a lookup
     searches instead of reading the whole table; SQLite keeps a 64 MB page cache and planner statistics (server/db.js);
   - Smart Scoring's settings are parsed once per stored text and shared, frozen (server/scoring.js); the timers' sweeps
     of Smart Scoring and of KPIs/OKRs work in batches with the server free to answer in between;
   - the page and large JSON replies are compressed on libuv's thread pool, never on the server's thread (server/delivery.js);
     the page's smallest copy is kept for the next start; the start-up data is sent as brotli when the browser takes it,
     its shared task list written as JSON once per change — the same bytes once decoded. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), zlib = require('node:zlib');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-perf1-'));
process.env.COS_DB_PATH = path.join(tmp, 'perf.db');
const dbm = require('../server/db');
process.on('exit', () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* in use */ } });
const wait = ms => new Promise(r => setTimeout(r, ms));

/* ---------- 1. indexes ---------- */
const INDEXES = {
  idx_comments_parent: ['comments', ['parent_id']],
  idx_approvals_version: ['approvals', ['version_id']],
  idx_revision_requests_version: ['revision_requests', ['version_id']],
  idx_tasks_parent: ['tasks', ['parent_task_id']],
  idx_team_memberships_user: ['team_memberships', ['user_id']],
  idx_scoring_audit_ws_task: ['scoring_audit', ['workspace_id', 'task_id', 'created_at']]
};
const plan = (db, sql, ...params) => db.prepare('EXPLAIN QUERY PLAN ' + sql).all(...params).map(r => r.detail).join(' | ');
/* a task's history in its Scoring & Intelligence panel, as server/scoring.js view() reads it */
const TASK_AUDIT_SQL = "SELECT * FROM scoring_audit WHERE workspace_id=? AND task_id=? AND (coalesce(module,'') <> 'efficiency' OR ?) ORDER BY created_at DESC, rowid DESC LIMIT ?";

test('the columns other rows point at are indexed, in a new database and in one made before the indexes (at open)', () => {
  let db = dbm.open();
  /* a database from before: without them */
  for (const name of Object.keys(INDEXES)) db.exec('DROP INDEX IF EXISTS ' + name);
  db.close();
  db = dbm.open();
  try {
    for (const [name, [table, cols]] of Object.entries(INDEXES)) {
      const row = db.prepare("SELECT tbl_name FROM sqlite_master WHERE type='index' AND name=?").get(name);
      assert.ok(row, name + ' is there after open');
      assert.equal(row.tbl_name, table);
      assert.deepEqual(db.prepare('PRAGMA index_info(' + name + ')').all().map(r => r.name), cols, name + ' columns');
    }
    /* the planner uses them: what a cascade or a lookup on each column does */
    assert.match(plan(db, 'SELECT 1 FROM comments WHERE parent_id=?', 'c1'), /idx_comments_parent/, 'a comment removed: its replies');
    assert.match(plan(db, 'SELECT 1 FROM approvals WHERE version_id=?', 'v1'), /idx_approvals_version/, 'a version removed: its approvals');
    assert.match(plan(db, 'SELECT 1 FROM revision_requests WHERE version_id=?', 'v1'), /idx_revision_requests_version/, 'a version removed: its revision requests');
    assert.match(plan(db, 'SELECT 1 FROM tasks WHERE parent_task_id=?', 'T-1'), /idx_tasks_parent/, 'a task removed: its subtasks');
    assert.match(plan(db, 'SELECT team_id, is_primary FROM team_memberships WHERE user_id=? ORDER BY is_primary DESC', 'u1'), /idx_team_memberships_user/, "a person's teams");
    assert.match(plan(db, TASK_AUDIT_SQL, 'ws', 'T-1', 1, 50), /idx_scoring_audit_ws_task/, "a task's scoring history");
    /* also once the planner has statistics (PRAGMA optimize at open), with a workspace of many tasks' history */
    const ins = db.prepare("INSERT INTO scoring_audit (id,workspace_id,task_id,module,action,created_at) VALUES (?,?,?,?,?,?)");
    db.exec('BEGIN'); for (let i = 0; i < 3000; i++) ins.run('a' + i, 'ws', 'T-' + (i % 300), 'hours', 'changed', new Date(1.7e12 + i * 1000).toISOString()); db.exec('COMMIT');
    db.exec('ANALYZE');
    assert.match(plan(db, TASK_AUDIT_SQL, 'ws', 'T-7', 1, 50), /idx_scoring_audit_ws_task/, "a task's scoring history, with statistics");
    db.exec('DELETE FROM scoring_audit');
  } finally { db.close(); }
});

/* ---------- 2. SQLite settings ---------- */
test('SQLite: a 64 MB page cache; WAL and FULL sync as before; the planner statistics made at open', () => {
  let db = dbm.open();
  try {
    assert.equal(db.prepare('PRAGMA cache_size').get().cache_size, -65536, '64 MB (SQLite: 2 MB)');
    assert.equal(db.prepare('PRAGMA journal_mode').get().journal_mode, 'wal');
    assert.equal(db.prepare('PRAGMA synchronous').get().synchronous, 2, 'FULL, unchanged');
    assert.equal(db.prepare('PRAGMA foreign_keys').get().foreign_keys, 1);
    const ins = db.prepare("INSERT INTO scoring_audit (id,workspace_id,task_id,module,action,created_at) VALUES (?,?,?,?,?,?)");
    for (let i = 0; i < 40; i++) ins.run('s' + i, 'ws', 'T-' + (i % 4), 'hours', 'changed', new Date(1.7e12 + i).toISOString());
    try { db.exec('DROP TABLE sqlite_stat1'); } catch (e) { /* none yet */ }
  } finally { db.close(); }
  db = dbm.open();
  try {
    const stats = db.prepare("SELECT idx FROM sqlite_stat1 WHERE tbl='scoring_audit'").all().map(r => r.idx);
    assert.ok(stats.includes('idx_scoring_audit_ws_task'), 'PRAGMA optimize at open analysed the table: ' + stats.join(', '));
    db.exec('DELETE FROM scoring_audit');
  } finally { db.close(); }
});

/* ---------- 3. Smart Scoring's settings ---------- */
const { setup, WS } = require('./scoring-ai-harness');
const sz = require('../server/serialize');
const model = require('../shared/scoring-settings');

test("Smart Scoring's settings: normalized once per stored text and shared, frozen; a change is seen at once", async () => {
  const k = setup();
  const orig = model.normalizeSettings; let n = 0;
  model.normalizeSettings = function () { n++; return orig.apply(this, arguments); };
  try {
    const a = k.settings(); n = 0;
    for (let i = 0; i < 50; i++) assert.equal(k.settings(), a, 'the same object every time');
    assert.equal(n, 0, 'not parsed and normalized again while the stored text is the same');
    for (const o of [a, a.hours, a.hours.bounds, a.modules, a.modules.hours, a.kinds, a.kinds[0], a.bonus, a.overrides]) assert.ok(Object.isFrozen(o), 'frozen all the way down');
    assert.throws(() => { 'use strict'; a.enabled = !a.enabled; }, TypeError, 'nobody can change the shared copy');
    assert.throws(() => { 'use strict'; a.kinds.push({ id: 'x' }); }, TypeError);
    /* PUT /api/scoring/settings: the next read has the new settings */
    await k.on();
    const b = k.settings();
    assert.notEqual(b, a); assert.equal(b.enabled, true); assert.equal(b.configVersion, a.configVersion + 1); assert.equal(b.modules.story.on, true);
    /* written by anything else (a restore, an import): the stored text decides */
    const raw = JSON.parse(k.db.prepare('SELECT scoring_settings FROM workspaces WHERE id=?').get(WS).scoring_settings);
    raw.modules.story.on = false;
    k.db.prepare('UPDATE workspaces SET scoring_settings=? WHERE id=?').run(JSON.stringify(raw), WS);
    assert.equal(k.settings().modules.story.on, false);
    raw.modules.story.on = true;
    k.db.prepare('UPDATE workspaces SET scoring_settings=? WHERE id=?').run(JSON.stringify(raw), WS);
    /* a task's save asks for the settings many times: normalized once at most */
    const id = k.task({ title: 'Feed post Ramadan', effort: 3 });
    n = 0; k.edit(id, { effort: 4 }); k.edit(id, { effort: 5 });
    assert.ok(n <= 1, 'normalized ' + n + ' times for two saves');
    assert.equal(k.row(id, 'hours').final_value, 5, 'and the save did what it does');
    /* the scores' answers and the settings' answer are unchanged */
    const view = await k.view(id);
    assert.equal(view.on.enabled, true); assert.equal(view.rows.hours.value, 5);
    const got = await k.call('GET', '/api/scoring/settings', k.admin);
    assert.deepEqual(JSON.parse(JSON.stringify(got.settings)), orig(k.db.prepare('SELECT scoring_settings FROM workspaces WHERE id=?').get(WS).scoring_settings));
  } finally { model.normalizeSettings = orig; }
});

/* ---------- the sweeps ---------- */
const scoringRows = db => db.prepare("SELECT task_id, module, final_value, source, status, rev FROM task_scoring ORDER BY task_id, module").all().map(r => JSON.stringify(r));
async function manyTasks(k, n, fields) { const ids = []; for (let i = 0; i < n; i++) ids.push(k.task(Object.assign({ title: 'Story set ' + i, effort: 1 + (i % 6) }, fields || {}))); return ids; }

test("the timers' Smart Scoring sweep works in batches of 50, the server free in between, and does what the sweep does", async () => {
  const run = async batched => {
    const k = setup(); await k.on();
    await manyTasks(k, 130);
    k.db.prepare("DELETE FROM app_meta WHERE key='scoring_sweep_at'").run();
    const order = [];
    if (!batched) return { k, n: k.scoring.sweep(), order };
    const done = new Promise(r => k.scoring.sweepInBatches(n => { order.push('done'); r(n); }));
    let ticks = 0; const tick = () => { ticks++; order.push('other'); if (!order.includes('done')) setImmediate(tick); };
    setImmediate(tick);
    const n = await done;
    return { k, n, order, ticks };
  };
  const a = await run(false), b = await run(true);
  assert.ok(b.order.indexOf('other') >= 0 && b.order.indexOf('other') < b.order.indexOf('done'), 'something else ran before the sweep was done: ' + b.order.join(','));
  assert.ok(b.n >= 130, 'every task with an estimate got its Effort Hours row (' + b.n + ')');
  assert.equal(b.n, a.n, 'as many changes as the sweep in one go');
  assert.deepEqual(scoringRows(b.k.db), scoringRows(a.k.db), 'the same rows');
  /* one at a time: a second call while one runs does nothing */
  const k = b.k; let second = null;
  await manyTasks(k, 60); k.db.prepare("DELETE FROM app_meta WHERE key='scoring_sweep_at'").run();
  const first = new Promise(r => k.scoring.sweepInBatches(r));
  k.scoring.sweepInBatches(n => { second = n; });
  assert.equal(second, 0, 'the second call returns at once');
  assert.ok((await first) >= 60);
});

function withOutcomes(k) {
  const route = (m, p, h) => { k.routes[m + ' ' + p] = h; };
  class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
  const forbid = (ok, what) => { if (!ok) throw new HttpError(403, "You don't have permission to " + what); };
  const { tx, uid, now } = require('../server/db');
  const { can } = require('../server/permissions');
  k.bumped = 0;
  k.outcomes = require('../server/outcomes')(k.db, WS, { route, HttpError, forbid, can, uid, now, tx, act: () => {}, scoring: k.scoring, readTask: id => sz.readTask(k.db, id), bumpData: () => { k.bumped++; } });
  return k;
}
const counted = (db, metric) => db.prepare("SELECT count(*) n FROM task_outcome_links WHERE metric_id=? AND status='counted'").get(metric).n;
const history = (db, metric) => db.prepare("SELECT value FROM outcome_values WHERE metric_id=? AND source='evidence' ORDER BY created_at, rowid").all(metric).map(r => r.value);

test("the timers' KPI/OKR sweep works in steps of 50 changed tasks, the server free in between; one history point per change", async () => {
  const run = async mode => {
    const k = withOutcomes(setup()); await k.on(s => { s.modules.kpi.on = true; });
    const made = await k.call('POST', '/api/outcomes/metrics', k.admin, {}, { kind: 'kpi', title: 'Finished work', unit: 'tasks', target: 1000, rule: { type: 'tasks_completed' } });
    const metric = made.id;
    k.outcomes.sweep(null);   /* the cursor: what changes from now on is what the next sweep looks at */
    const before = { counted: counted(k.db, metric), history: history(k.db, metric).length };
    await wait(5);
    await manyTasks(k, 120, { status: 'done', completedAt: new Date().toISOString() });
    const order = [];
    if (mode === 'whole') { k.outcomes.sweep(null); return { k, metric, before, order }; }
    const done = new Promise(r => k.outcomes.sweepInSteps(n => { order.push('done'); r(n); }));
    if (mode === 'read meanwhile') { order.push('read'); k.outcomes.sweep(null); }
    const tick = () => { order.push('other'); if (!order.includes('done')) setImmediate(tick); };
    setImmediate(tick);
    await done;
    return { k, metric, before, order };
  };
  const whole = await run('whole'), steps = await run('steps'), read = await run('read meanwhile');
  assert.equal(counted(whole.k.db, whole.metric) - whole.before.counted, 120, 'the sweep counted the 120 finished tasks');
  assert.equal(counted(steps.k.db, steps.metric), counted(whole.k.db, whole.metric), 'the sweep in steps counted the same');
  assert.ok(steps.order.indexOf('other') >= 0 && steps.order.indexOf('other') < steps.order.indexOf('done'), 'something else ran before it was done: ' + steps.order.join(','));
  assert.deepEqual(history(steps.k.db, steps.metric), history(whole.k.db, whole.metric), 'one point in the metric history, as the whole sweep adds');
  assert.ok(steps.k.bumped > 0, "the task list's cache is told");
  /* a read's catch-up in the middle: it counts the rest at once; the steps that follow add nothing twice */
  assert.equal(counted(read.k.db, read.metric), counted(whole.k.db, whole.metric));
  assert.deepEqual(history(read.k.db, read.metric), history(whole.k.db, whole.metric), 'no second history point for the same count');
  /* and the cursor moved on: the next sweep has nothing to do */
  assert.equal(steps.k.outcomes.sweep(null), 0);
});

/* ---------- 4. static files, compressed in the background ---------- */
const delivery = require('../server/delivery');
const page = fs.readFileSync(path.join(root, 'public', 'index.html'));
function fakeReq(o) { return { method: (o && o.method) || 'GET', headers: Object.assign({}, (o && o.headers) || {}) }; }
function fetchStatic(st, file, o) {
  return new Promise(resolve => {
    const res = { status: 0, headers: null, writeHead(s, h) { this.status = s; this.headers = h; }, end(body) { resolve({ status: this.status, headers: this.headers, body: body || null }); } };
    st.send(fakeReq(o), res, file, { 'Cache-Control': 'no-cache' });
  });
}
const NOT_THE_PAGE = zlib.brotliCompressSync(Buffer.from('<html>not the page</html>'));   /* made before any test watches zlib */
const decode = r => (r.headers['Content-Encoding'] === 'br' ? zlib.brotliDecompressSync(r.body) : r.headers['Content-Encoding'] === 'gzip' ? zlib.gunzipSync(r.body) : r.body);
/* fails the test if anything compresses on this thread meanwhile */
function noSyncZlib(t) {
  const names = ['gzipSync', 'brotliCompressSync', 'deflateSync'], saved = {}, calls = [];
  names.forEach(n => { saved[n] = zlib[n]; zlib[n] = function () { calls.push(n); return saved[n].apply(this, arguments); }; });
  t.after(() => names.forEach(n => { zlib[n] = saved[n]; }));
  return calls;
}

test('static files: compressed in the background, never on the server thread; a request waits for the first copy; ETag and 304 as before', async t => {
  const calls = noSyncZlib(t);
  const dir = fs.mkdtempSync(path.join(tmp, 'static-'));
  const small = path.join(dir, 'app.js'), big = path.join(dir, 'index.html');
  fs.writeFileSync(small, page.subarray(0, 60 * 1024)); fs.writeFileSync(big, page.subarray(0, 600 * 1024));
  const st = delivery.createStatic({ mime: { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8' }, compressible: new Set(['.js', '.html']), bestFrom: 256 * 1024, cacheDir: path.join(dir, 'page-cache') });
  const firstOf = {};
  for (const file of [small, big]) {
    const raw = fs.readFileSync(file);
    const e = st.entry(file);
    assert.equal(e.br, null, 'nothing compressed yet, right after it is read');
    const r = await fetchStatic(st, file, { headers: { 'accept-encoding': 'gzip, deflate, br' } });
    firstOf[file] = { quality: st.entry(file).brQuality, length: r.body.length };
    assert.equal(r.status, 200); assert.equal(r.headers['Content-Encoding'], 'br', 'the request waited for the first brotli copy');
    assert.equal(r.headers['Content-Length'], r.body.length); assert.ok(decode(r).equals(raw), 'and it is the file');
    assert.equal(r.headers.ETag, '"' + require('node:crypto').createHash('sha1').update(raw).digest('base64url') + '"', 'the ETag is the SHA-1 of the file, as before');
    assert.equal((await fetchStatic(st, file, { headers: { 'if-none-match': r.headers.ETag } })).status, 304);
    const gz = await fetchStatic(st, file, { headers: { 'accept-encoding': 'gzip' } });
    assert.equal(gz.headers['Content-Encoding'], 'gzip'); assert.ok(decode(gz).equals(raw));
    const plain = await fetchStatic(st, file, {});
    assert.equal(plain.headers['Content-Encoding'], undefined); assert.ok(plain.body.equals(raw));
    const head = await fetchStatic(st, file, { method: 'HEAD', headers: { 'accept-encoding': 'br' } });
    assert.equal(head.body, null); assert.equal(head.headers['Content-Length'], st.entry(file).br.length);
  }
  assert.equal(firstOf[small].quality, 9, 'a small file: quality 9, once');
  /* the large file: quality 5 first, then quality 11, smaller, kept on disk */
  const e = st.entry(big);
  assert.equal(firstOf[big].quality, delivery.FIRST_BR_QUALITY);
  const firstLen = firstOf[big].length;
  await e.best;
  assert.equal(e.brQuality, 11); assert.ok(e.br.length < firstLen, 'quality 11 is smaller (' + e.br.length + ' < ' + firstLen + ')');
  const best = await fetchStatic(st, big, { headers: { 'accept-encoding': 'br' } });
  assert.equal(best.body.length, e.br.length); assert.ok(decode(best).equals(fs.readFileSync(big)));
  const hex = require('node:crypto').createHash('sha1').update(fs.readFileSync(big)).digest('hex');
  assert.deepEqual(fs.readdirSync(path.join(dir, 'page-cache')).sort(), ['index.html.' + hex + '.br', 'index.html.' + hex + '.gz']);
  assert.deepEqual(calls, [], 'no synchronous compression');
});

test('a browser that takes brotli is never sent gzip because the gzip copy was ready first', async () => {
  const dir = fs.mkdtempSync(path.join(tmp, 'order-')), big = path.join(dir, 'index.html');
  fs.writeFileSync(big, page.subarray(0, 700 * 1024));
  const st = delivery.createStatic({ mime: { '.html': 'text/html; charset=utf-8' }, compressible: new Set(['.html']), bestFrom: 256 * 1024 });
  const e = st.entry(big), asked = [];
  /* a request at every turn of the event loop until the first copies are there */
  await new Promise(resolve => { const ask = () => { asked.push(fetchStatic(st, big, { headers: { 'accept-encoding': 'gzip, deflate, br' } })); if (e.firstDone) resolve(); else setImmediate(ask); }; ask(); });
  const got = await Promise.all(asked);
  assert.ok(got.length > 3, got.length + ' requests');
  assert.deepEqual([...new Set(got.map(r => r.headers['Content-Encoding']))], ['br'], 'brotli every time');
  await e.best;
});

test('the page kept compressed on disk: a restart sends the smallest copy at once; a damaged copy is never sent; other versions are removed', async t => {
  const calls = noSyncZlib(t);
  const dir = fs.mkdtempSync(path.join(tmp, 'restart-')), cacheDir = path.join(dir, 'page-cache'), big = path.join(dir, 'index.html');
  const opts = { mime: { '.html': 'text/html; charset=utf-8' }, compressible: new Set(['.html']), bestFrom: 256 * 1024, cacheDir };
  fs.writeFileSync(big, page.subarray(0, 500 * 1024));
  const a = delivery.createStatic(opts), ea = a.entry(big); await ea.best;
  /* "restart": a new server on the same data folder */
  const b = delivery.createStatic(opts);
  const r = await fetchStatic(b, big, { headers: { 'accept-encoding': 'br, gzip' } });
  assert.equal(r.headers['Content-Encoding'], 'br'); assert.equal(r.body.length, ea.br.length, 'the quality-11 copy from the first request');
  assert.ok(decode(r).equals(fs.readFileSync(big)));
  const eb = b.entry(big); assert.equal(eb.fromDisk, true); assert.equal(eb.brQuality, 11);
  await eb.best;
  /* a copy damaged on disk is not sent: the file is compressed again */
  const hex = require('node:crypto').createHash('sha1').update(fs.readFileSync(big)).digest('hex');
  const brFile = path.join(cacheDir, 'index.html.' + hex + '.br');
  const good = fs.readFileSync(brFile);
  fs.writeFileSync(brFile, NOT_THE_PAGE);
  const c = delivery.createStatic(opts);
  const rc = await fetchStatic(c, big, { headers: { 'accept-encoding': 'br' } });
  assert.ok(decode(rc).equals(fs.readFileSync(big)), 'the page, not what the damaged copy holds');
  assert.equal(c.entry(big).fromDisk, false);
  await c.entry(big).best;
  assert.ok(fs.readFileSync(brFile).equals(good), 'the copy on disk is made again');
  /* a new version of the page: its own copies; the old version's are removed */
  fs.writeFileSync(big, page.subarray(0, 520 * 1024));
  const hex2 = require('node:crypto').createHash('sha1').update(fs.readFileSync(big)).digest('hex');
  const e2 = c.entry(big); await e2.best;
  assert.deepEqual(fs.readdirSync(cacheDir).sort(), ['index.html.' + hex2 + '.br', 'index.html.' + hex2 + '.gz']);
  assert.deepEqual(calls, [], 'nothing compressed on this thread');
});

/* ---------- 5. JSON ---------- */
test('JSON with parts written already is the same text as JSON.stringify of the whole', () => {
  const odd = String.fromCharCode(0xdc, 0x201c, 0x2028, 0x201d, 0xd83d, 0xde00, 0xd800);   /* letters, quotes, a line separator, an emoji, a lone surrogate */
  const tasks = [{ id: 'T-1', title: odd + ' quotes ' + odd + ' and \\ slashes', n: 1.5, d: new Date(0), nested: { a: [1, null, { b: undefined }] } }, { id: 'T-2', title: '' }];
  const fn = () => 1, sym = Symbol('s');
  const whole = { me: { id: 'admin' }, 2: 'two', ws: { name: 'W' }, tasks, taskWindow: { hotDays: 45 }, skipped: undefined, f: fn, s: sym, 1: 'one', when: new Date(86400000), n: null, empty: [], str: 'x' };
  const parts = delivery.withParts(Object.assign({}, whole, { tasks: delivery.rawJson(JSON.stringify(tasks)) }));
  assert.equal(delivery.toJson(parts), JSON.stringify(whole));
  assert.equal(delivery.toJson(whole), JSON.stringify(whole), 'an object without parts: JSON.stringify');
  assert.equal(delivery.toJson([1, 'a']), JSON.stringify([1, 'a']));
});

/* a production server with the demo workspace and tests/perf-probe.js loaded */
async function start(dir, extra) {
  const child = spawn(process.execPath, ['--no-warnings', '--require', path.join(__dirname, 'perf-probe.js'), 'server/server.js'], {
    cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: dir, COS_DB_PATH: '', COS_ADMIN_PASSWORD: 'Perf1!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'perf1-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'perf1-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_SCORING: '' }, extra || {})
  });
  let out = '', err = '';
  child.stderr.on('data', d => { err += d; });
  const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out + err)), 20000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out + err)); }); });
  const base = 'http://127.0.0.1:' + port;
  /* raw node:http, so the encoded body and its headers are seen as sent */
  const get = (p, headers, method, body) => new Promise((resolve, reject) => {
    const data = body === undefined ? null : Buffer.from(JSON.stringify(body));
    const r = require('node:http').request(base + p, { method: method || 'GET', headers: Object.assign({ origin: base }, data ? { 'content-type': 'application/json', 'content-length': data.length } : {}, headers || {}) }, m => { const c = []; m.on('data', d => c.push(d)); m.on('end', () => { const b = Buffer.concat(c); resolve({ status: m.statusCode, headers: m.headers, body: b, decoded: m.headers['content-encoding'] === 'br' ? zlib.brotliDecompressSync(b) : m.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(b) : b }); }); });
    r.on('error', reject); if (data) r.write(data); r.end();
  });
  const login = async (email, password) => { const r = await get('/api/auth/login', {}, 'POST', { email, password }); assert.equal(r.status, 200, r.decoded.toString()); return String([].concat(r.headers['set-cookie'])[0]).split(';')[0]; };
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  return { base, get, login, stop, stderr: () => err, sync: () => err.split('\n').filter(l => /^PROBE sync-zlib/.test(l)), ends: p => err.split('\n').filter(l => l.startsWith('PROBE end ' + p + ' ')).map(l => +l.split(' ').pop()) };
}

test('the server: the page and the start-up data are compressed off its thread; brotli for the start-up data, the same JSON once decoded; the task list written once per change, a stakeholder still sees their own', { timeout: 120000 }, async t => {
  const dir = fs.mkdtempSync(path.join(tmp, 'server-'));
  const s = await start(dir); t.after(s.stop);
  const p = await s.get('/', { 'accept-encoding': 'gzip, deflate, br' });
  assert.equal(p.status, 200); assert.equal(p.headers['content-encoding'], 'br'); assert.ok(p.decoded.equals(page), 'the page');
  const admin = await s.login('admin@zencrevia.demo', 'Perf1!Admin23456');
  const boot = enc => s.get('/api/bootstrap', Object.assign({ cookie: admin }, enc === undefined ? {} : { 'accept-encoding': enc }));
  const first = await boot('gzip, deflate, br');
  assert.equal(first.headers['content-encoding'], 'br', 'brotli when the browser takes it');
  assert.ok(first.headers['x-zc-build'], 'the page version, as before');
  const json = JSON.parse(first.decoded.toString('utf8'));
  assert.ok(json.tasks.length > 20 && json.taskWindow && json.people && json.ws, 'the whole start-up data');
  assert.ok(first.decoded.length > 64 * 1024, 'large enough to be compressed in the background (' + first.decoded.length + ' bytes)');
  const br = await boot('gzip, deflate, br'), gz = await boot('gzip'), plain = await boot('');
  assert.equal(gz.headers['content-encoding'], 'gzip'); assert.equal(plain.headers['content-encoding'], undefined);
  assert.ok(br.decoded.equals(first.decoded) && gz.decoded.equals(first.decoded) && plain.decoded.equals(first.decoded), 'byte for byte the same JSON, however it is sent');
  assert.equal(br.decoded.toString('utf8'), JSON.stringify(JSON.parse(br.decoded.toString('utf8'))), 'and it is what JSON.stringify writes');
  /* the shared task list is not written again while nothing changed */
  const tasksLen = JSON.stringify(json.tasks).length, written = s.ends('/api/bootstrap');
  assert.ok(written.length >= 4);
  written.slice(1).forEach(w => assert.ok(w < first.decoded.length - tasksLen / 2, 'a warm start-up wrote ' + w + ' characters of JSON for a reply of ' + first.decoded.length + ' (its task list: ' + tasksLen + ')'));
  /* a change is in the next one */
  const T = json.tasks.find(x => !x._slim && x.status === 'progress');
  const cur = JSON.parse((await s.get('/api/tasks/' + T.id, { cookie: admin })).decoded.toString());
  cur.title = cur.title + ' (renamed)'; cur._rev = cur.updatedAt; cur._changed = ['title']; delete cur.scoring;
  assert.equal((await s.get('/api/tasks/' + T.id, { cookie: admin }, 'PUT', cur)).status, 200);
  const after = JSON.parse((await boot('br')).decoded.toString());
  assert.equal(after.tasks.find(x => x.id === T.id).title, cur.title, 'the renamed task, after the write');
  /* a stakeholder: their own list (the comments meant for them), never the shared one; the shared one untouched */
  const withInternal = after.tasks.find(x => !x._slim && (x.comments || []).some(c => c.vis !== 'client'));
  assert.ok(withInternal, 'a task with an internal comment in the demo');
  assert.equal((await s.get('/api/members/nadia/password', { cookie: admin }, 'POST', { password: 'Stake!Holder2345' })).status, 200);
  const nadia = await s.login('nadia@zencrevia.demo', 'Stake!Holder2345');
  const hers = JSON.parse((await s.get('/api/bootstrap', { cookie: nadia, 'accept-encoding': 'br' })).decoded.toString());
  const mine = hers.tasks.find(x => x.id === withInternal.id);
  assert.ok(mine && (mine.comments || []).every(c => c.vis === 'client'), 'only the comments meant for a stakeholder');
  const again = JSON.parse((await boot('br')).decoded.toString());
  assert.deepEqual(again.tasks.find(x => x.id === withInternal.id).comments, withInternal.comments, "the admin's list keeps every comment");
  /* nothing large was compressed on the server's thread: not the page, not a reply */
  assert.deepEqual(s.sync(), [], 'no synchronous compression of 64 KB or more');
});

test('the server keeps the smallest copy of the page: after a restart it is sent from the first request', { timeout: 120000 }, async t => {
  const dir = fs.mkdtempSync(path.join(tmp, 'keep-'));
  let s = await start(dir);
  try {
    const first = await s.get('/', { 'accept-encoding': 'br' });
    let wire = first.body.length;
    for (let i = 0; i < 240 && wire >= first.body.length; i++) { await wait(250); wire = (await s.get('/', { 'accept-encoding': 'br' })).body.length; }
    assert.ok(wire < first.body.length, 'quality 11 replaced the first copy (' + wire + ' < ' + first.body.length + ')');
    const hex = require('node:crypto').createHash('sha1').update(page).digest('hex');
    for (let i = 0; i < 40 && !fs.existsSync(path.join(dir, 'page-cache', 'index.html.' + hex + '.gz')); i++) await wait(100);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'page-cache')).sort(), ['index.html.' + hex + '.br', 'index.html.' + hex + '.gz'], 'kept in the data folder, named by the page');
    await s.stop();
    s = await start(dir);
    const r = await s.get('/', { 'accept-encoding': 'gzip, deflate, br' });
    assert.equal(r.headers['content-encoding'], 'br'); assert.equal(r.body.length, wire, 'the smallest copy at once');
    assert.ok(r.decoded.equals(page));
    assert.deepEqual(s.sync(), []);
  } finally { await s.stop(); }
});
