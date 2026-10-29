/* Personal checks on the server (Oct 2026, server/task-checks.js): the tick a person puts on a task for themselves
   ("Mark as checked", the "N checked" chip, Clear checks) is kept per person, so it follows them to their other tabs
   and devices. A person reads and writes only their own; a deleted task's check goes with it; the ticks a browser kept
   before (localStorage) are sent up as "check" and merged into the server's set, never written over; a change is told
   to that person's own tabs and devices only, naming the tab that made it; and none of it touches the task. The page's
   side: e2e/task-checks.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-tchecks-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Checks!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'checks-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'checks-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log', APP_URL: 'https://zen.hsb-test.dev' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c, h) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}, h || {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c, h) => { const r = await req(m, p, b, c, h); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: r.status, body, text }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Checks!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = (await json('GET', '/api/bootstrap', undefined, admin)).body;
  const stream = cookie => { const events = []; const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); res.on('data', d => d.split('\n').filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} })); }); r.on('error', () => {}); t.after(() => r.destroy()); return events; };
  return { temp, req, json, admin, as, boot, stream };
}
const people = (s, n) => Object.keys(s.boot.people).filter(id => id !== 'admin' && s.boot.people[id].active !== false).slice(0, n);
const tasks = (s, n) => s.boot.tasks.slice(0, n).map(t => t.id);
/* the set, in id order (ticks made in one request share their time) */
const mine = async (s, c) => { const r = await s.json('GET', '/api/task-checks', undefined, c); assert.equal(r.status, 200, r.text); return r.body.ids.slice().sort(); };
const same = (actual, expected, msg) => assert.deepEqual(actual, expected.slice().sort(), msg);
const send = async (s, c, body, h) => { const r = await s.json('POST', '/api/task-checks', body, c, h); assert.equal(r.status, 200, r.text); return r.body.ids.slice().sort(); };

test('a person reads and writes only their own checks', { timeout: 40000 }, async t => {
  const s = await start(t); const [m] = people(s, 1); const mc = await s.as(m); const [t1, t2, t3] = tasks(s, 3);
  same(await mine(s, s.admin), [], 'nobody has a check to begin with');
  same(await send(s, s.admin, { check: [t1, t2] }), [t1, t2]);
  same(await mine(s, mc), [], "the admin's checks are the admin's");
  same(await send(s, mc, { check: [t2, t3] }), [t2, t3]);
  same(await mine(s, s.admin), [t1, t2], 'and the member\'s are the member\'s');
  /* nothing names another person: not a field in the body, not the query */
  same(await send(s, mc, { uncheck: [t1, t2], user: 'admin', userId: 'admin', user_id: 'admin' }), [t3]);
  same(await mine(s, s.admin), [t1, t2], "unchecking the same tasks leaves the admin's alone");
  same((await s.json('GET', '/api/task-checks?user=admin&userId=admin', undefined, mc)).body.ids, [t3]);
  same(await send(s, mc, { clear: true }), []);
  same(await mine(s, s.admin), [t1, t2], "the member's Clear checks clears only theirs");
  /* signed out: nothing at all */
  assert.equal((await s.json('GET', '/api/task-checks')).status, 401);
  assert.equal((await s.json('POST', '/api/task-checks', { check: [t1] })).status, 401);
});

test('check and uncheck a list, clear all, in one request', { timeout: 40000 }, async t => {
  const s = await start(t); const [t1, t2, t3, t4] = tasks(s, 4);
  same(await send(s, s.admin, { check: [t1, t2, t3] }), [t1, t2, t3]);
  same(await send(s, s.admin, { check: [t2, t2, t1] }), [t1, t2, t3], 'a task checked again stays once, in its place');
  same(await send(s, s.admin, { uncheck: [t1, t3] }), [t2], 'a list cleared');
  same(await send(s, s.admin, { clear: true, check: [t4] }), [t4], 'clear first, then what was checked after it');
  same(await send(s, s.admin, { check: [t1], uncheck: [t4] }), [t1]);
  same(await send(s, s.admin, { clear: true }), [], 'Clear checks: all of them');
  same(await send(s, s.admin, {}), [], 'nothing asked, nothing changed');
  /* what is not a task id is left out; what is not a list is refused */
  same(await send(s, s.admin, { check: ['<img src=x>', 5, null, '', 'a/b', { id: t1 }, t2] }), [t2]);
  assert.equal((await s.json('POST', '/api/task-checks', { check: t1 }, s.admin)).status, 400);
  assert.equal((await s.json('POST', '/api/task-checks', { uncheck: 'all' }, s.admin)).status, 400);
  assert.equal((await s.json('POST', '/api/task-checks', { check: Array.from({ length: 20001 }, (x, i) => 'T-' + i) }, s.admin)).status, 413);
  same(await mine(s, s.admin), [t2], 'a refused request changed nothing');
});

test("a deleted task's check goes with it, and a task that is not there is never checked", { timeout: 40000 }, async t => {
  const s = await start(t); const [m] = people(s, 1); const mc = await s.as(m); const [t1] = tasks(s, 1);
  const made = await s.json('POST', '/api/tasks', { title: 'Checked then deleted', status: s.boot.ws.workflow[0].id, prio: 'medium' }, s.admin);
  assert.equal(made.status, 200, made.text); const tid = made.body.id; assert.ok(tid);
  same(await send(s, s.admin, { check: [t1, tid] }), [t1, tid]);
  same(await send(s, mc, { check: [tid] }), [tid]);
  assert.equal((await s.json('DELETE', '/api/tasks/' + tid, undefined, s.admin)).status, 200);
  same(await mine(s, s.admin), [t1], 'gone from the one who deleted it');
  same(await mine(s, mc), [], 'and from everyone else who had checked it');
  const { DatabaseSync } = require('node:sqlite');
  const db = new DatabaseSync(path.join(s.temp, 'creative-os.db'));
  try { assert.equal(db.prepare('SELECT count(*) AS n FROM task_checks WHERE task_id=?').get(tid).n, 0, 'its rows went with it (ON DELETE CASCADE)'); } finally { db.close(); }
  same(await send(s, s.admin, { check: [tid, 'NOPE-404'] }), [t1], 'a task that is not there is not checked');
});

test("a browser's own ticks are merged into the server's set, never written over", { timeout: 40000 }, async t => {
  const s = await start(t); const [t1, t2, t3, t4] = tasks(s, 4);
  /* the laptop moved its ticks up first, and ticked one more since */
  same(await send(s, s.admin, { check: [t3] }), [t3]); await wait(5);
  same(await send(s, s.admin, { check: [t1] }), [t1, t3]); await wait(5);
  /* the phone had its own ticks in its localStorage, one of them on a task deleted since */
  same(await send(s, s.admin, { check: [t1, t4, 'GONE-77'] }), [t1, t3, t4], "both browsers' ticks");
  assert.deepEqual((await s.json('GET', '/api/task-checks', undefined, s.admin)).body.ids, [t3, t1, t4], 'the oldest tick first; one ticked again keeps its time');
  /* sent again (a tab that moved them up as well): the same set */
  same(await send(s, s.admin, { check: [t1, t4, 'GONE-77'] }), [t1, t3, t4]);
  same(await send(s, s.admin, { check: [t2] }), [t1, t2, t3, t4]);
  same(await mine(s, s.admin), [t1, t2, t3, t4]);
});

test("a change is told to that person's own tabs and devices only, with the tab that made it", { timeout: 40000 }, async t => {
  const s = await start(t); const [m] = people(s, 1); const mc = await s.as(m); const [t1, t2] = tasks(s, 2);
  const laptop = s.stream(s.admin), phone = s.stream(s.admin), colleague = s.stream(mc); await wait(400);
  const checks = list => list.filter(e => e.type === 'checks_changed');
  await send(s, s.admin, { check: [t1] }, { 'x-zc-tab': 'tab4laptop01' });
  await wait(300);
  assert.deepEqual(checks(laptop), [{ type: 'checks_changed', by: 'admin', tab: 'tab4laptop01' }], 'the tab that made it is named, so it can skip its own echo');
  assert.deepEqual(checks(phone), [{ type: 'checks_changed', by: 'admin', tab: 'tab4laptop01' }], 'the other device hears it too');
  assert.deepEqual(checks(colleague), [], 'a colleague hears nothing of it');
  /* a header that is not what a page makes is left out */
  for (const bad of ['BAD TAB!', 'short', 'x'.repeat(33), 'tab4laptop01\r\nx: y', 'ABCDEFGH12']) await send(s, s.admin, { check: [t2] }, { 'x-zc-tab': bad.replace(/[\r\n]/g, '') }).then(() => send(s, s.admin, { uncheck: [t2] }));
  await wait(300);
  assert.ok(checks(phone).slice(1).every(e => !('tab' in e)), 'no tab from a malformed header: ' + JSON.stringify(checks(phone)));
  assert.equal(checks(phone).length, 11);
  /* nothing changed, nothing told; and no task is said to have changed */
  await send(s, s.admin, { check: [t1] }, { 'x-zc-tab': 'tab4laptop01' }); await send(s, s.admin, { uncheck: ['NOPE-1'] });
  await wait(300);
  assert.equal(checks(phone).length, 11, 'a request that changed nothing is not told');
  assert.deepEqual(laptop.concat(phone, colleague).filter(e => e.type === 'task_changed' || e.type === 'ws_changed'), [], 'a check is no change to a task or the workspace');
});

test('a check touches nothing of the task: not its time, its history or the activity', { timeout: 40000 }, async t => {
  const s = await start(t); const [t1] = tasks(s, 1);
  const before = (await s.json('GET', '/api/tasks/' + t1, undefined, s.admin)).body;
  const acts = JSON.stringify((await s.json('GET', '/api/bootstrap', undefined, s.admin)).body.activity);
  await wait(20);
  await send(s, s.admin, { check: [t1] }); await send(s, s.admin, { uncheck: [t1] }); await send(s, s.admin, { check: [t1] });
  const after = (await s.json('GET', '/api/tasks/' + t1, undefined, s.admin)).body;
  assert.ok(before.updatedAt); assert.deepEqual(after, before, 'the task reads exactly as it did');
  assert.equal(JSON.stringify((await s.json('GET', '/api/bootstrap', undefined, s.admin)).body.activity), acts, 'the activity has nothing new');
});

test('a check is no change to the workspace data (the task list stays cached), and the page says its failure in Indonesian', () => {
  const src = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
  const bump = src.split('\n').find(l => l.includes('DATA_VERSION++') && l.includes('.test(url.pathname)'));
  assert.ok(bump && bump.includes('|cloud|task-checks)'), 'POST /api/task-checks does not bump DATA_VERSION: ' + bump);
  assert.match(src, /require\("\.\/task-checks"\)\(db, WS_ID, \{/);
  const dict = require('../build.js').served().dict.dict;
  assert.equal(dict["Your checks aren't saved yet — trying again"], 'Centang-mu belum tersimpan — mencoba lagi');
});
