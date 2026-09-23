/* v31 — fixes from the third audit, tested against a real production-mode server. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const vm = require('node:vm');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');
const ADMIN = { email: 'ops@zencrevia.test', password: 'Audit31!Admin2345' };

async function startServer(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-v31-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp,
      COS_ADMIN_PASSWORD: ADMIN.password, COS_ADMIN_EMAIL: ADMIN.email, COS_ADMIN_NAME: 'Audit Admin',
      COS_SECRET_KEY: 'v31-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'v31-backup-key-longer-than-32-characters!!',
      COS_ALLOW_REGISTRATION: '0', COS_BACKUP_INTERVAL_HOURS: '0', COS_SEED_DEMO: ''
    })
  });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start: ' + out)), 8000);
    child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(+m[1]); } });
    child.stderr.on('data', d => { out += d; });
    child.once('exit', c => { clearTimeout(timer); reject(new Error('exited ' + c + ': ' + out)); });
  });
  const base = 'http://127.0.0.1:' + port;
  const req = (method, p, body, cookie) => fetch(base + p, { method, headers: Object.assign({ 'content-type': 'application/json', origin: base }, cookie ? { cookie } : {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const login = async () => { const r = await req('POST', '/api/auth/login', ADMIN); assert.equal(r.status, 200); return r.headers.get('set-cookie').split(';')[0]; };
  return { req, login };
}

test('text limits stop one member from bloating everyone else\'s sign-in', { timeout: 20000 }, async t => {
  const s = await startServer(t);
  const admin = await s.login();
  const big = n => 'x'.repeat(n);
  assert.equal((await s.req('POST', '/api/tasks', { title: 'ok', status: 'backlog', description: big(20000) }, admin)).status, 200, 'at the limit is fine');
  let r = await s.req('POST', '/api/tasks', { title: 'too big', status: 'backlog', description: big(20001) }, admin);
  assert.equal(r.status, 413); assert.match((await r.json()).error, /description/);
  const task = await (await s.req('POST', '/api/tasks', { title: 'comments', status: 'backlog' }, admin)).json();
  task.comments = [{ id: 'c1', by: 'admin', createdAt: new Date().toISOString(), vis: 'team', text: big(10001), parent: null, attachments: [] }];
  assert.equal((await s.req('PUT', '/api/tasks/' + task.id, task, admin)).status, 413);
  task.comments[0].text = big(10000);
  assert.equal((await s.req('PUT', '/api/tasks/' + task.id, task, admin)).status, 200);
  assert.equal((await s.req('POST', '/api/knowledge', { title: 'page', folder: 'General', body: big(200001) }, admin)).status, 413);
  assert.equal((await s.req('POST', '/api/projects', { name: big(161) }, admin)).status, 413);
  assert.equal((await s.req('POST', '/api/teams', { name: big(81) }, admin)).status, 413);
});

test('sign-in time does not reveal whether an address has an account', { timeout: 30000 }, async t => {
  const s = await startServer(t);
  await s.req('POST', '/api/auth/login', { email: 'warm@up.io', password: 'x' });
  const time = async email => { const t0 = process.hrtime.bigint(); await (await s.req('POST', '/api/auth/login', { email, password: 'definitely-wrong-123' })).text(); return Number(process.hrtime.bigint() - t0) / 1e6; };
  const known = [], unknown = [];
  for (let i = 0; i < 4; i++) { known.push(await time(ADMIN.email)); unknown.push(await time('ghost' + i + '@zencrevia.test')); }
  const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
  // v30: ~80 ms vs ~2 ms. Both paths now run one scrypt; allow generous jitter.
  assert.ok(med(unknown) > med(known) * 0.5, `unknown ${med(unknown).toFixed(1)} ms vs known ${med(known).toFixed(1)} ms`);
});

test('CSV export neutralises spreadsheet formulas but keeps numbers', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'export.js'), 'utf8');
  const i = src.indexOf('function csvSafe('), j = src.indexOf('\n', src.indexOf('function csvRows(', i));
  const ctx = {}; vm.runInNewContext(src.slice(i, j) + '\nthis.csvSafe=csvSafe;this.csvRows=csvRows;', ctx);
  for (const evil of ['=HYPERLINK("http://x","click")', '+cmd|x', '-2+3+cmd', '@SUM(A1)', '\t=1']) assert.equal(ctx.csvSafe(evil)[0], "'", evil);
  for (const fine of ['Banner', '-12', '+3.5', '-7%', 12, '']) assert.equal(ctx.csvSafe(fine), String(fine));
  assert.equal(ctx.csvRows([['=1+1', 'a,b']]), "'=1+1,\"a,b\"");
});

test('server build never falls back to demo mode on a slow network', () => {
  const core = fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8');
  const boot = core.slice(core.indexOf('function boot(){'), core.indexOf('function afterLogin('));
  assert.match(boot, /served\?20000:4000/, 'served app waits 20 s, the standalone file 4 s');
  assert.match(boot, /if \(served&&!\(e&&e\.demo\)&&!API\.on\) return bootUnreachable\(e\)/, 'network failure shows the retry screen, not demo mode');
  assert.match(boot, /e\.demo=r\.status===404/, 'only a missing API (404 / not JSON) means demo');
});

/* v32 — task/entity write integrity (fourth audit). */
const os2 = require('node:os');
async function serverV32(t) {
  const temp = fs.mkdtempSync(path.join(os2.tmpdir(), 'zencrevia-v32-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'V32!Admin23456', COS_ADMIN_EMAIL: 'admin@v32.test', COS_SECRET_KEY: 'v32-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'v32-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((resolve, reject) => { const timer = setTimeout(() => reject(new Error('no start: ' + out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(timer); reject(new Error('exit ' + c + ': ' + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  return { req, login };
}

test('a member cannot overwrite, forge or self-approve another user\'s work', { timeout: 20000 }, async t => {
  const s = await serverV32(t);
  const admin = await s.login('admin@v32.test', 'V32!Admin23456');
  await s.req('POST', '/api/members/sarah/password', { password: 'Sarah!Pass23456' }, admin);
  const sarah = await s.login('sarah@zencrevia.demo', 'Sarah!Pass23456');
  const get = async id => (await s.req('GET', '/api/tasks/' + id, undefined, admin)).json();

  // pick a task sarah does not own
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, admin)).json();
  const other = boot.tasks.find(x => !x._slim && x.assignee && x.assignee !== 'sarah' && x.reviewer && x.reviewer !== 'sarah');
  assert.ok(other, 'a foreign task exists');

  // create with an existing id → 409, unchanged
  let r = await s.req('POST', '/api/tasks', { id: other.id, title: 'HIJACK', status: 'backlog' }, sarah);
  /* v39: T-<n> ids are assigned by the server; a colliding one becomes a NEW task with the next number */
  if (r.status === 200) assert.notEqual((await r.json()).id, other.id); else assert.equal(r.status, 409);
  assert.equal((await get(other.id)).title, other.title);

  // self-appoint as reviewer → 403
  const cur = await get(other.id);
  r = await s.req('PUT', '/api/tasks/' + other.id, Object.assign({}, cur, { reviewer: 'sarah', reviewers: ['sarah'] }), sarah);
  assert.equal(r.status, 403);
  assert.equal((await get(other.id)).reviewer, other.reviewer);

  // forge and rewrite comments as someone else
  const t2 = await get(other.id);
  const foreignComments = t2.comments.filter(c => c.by !== 'sarah');
  const bodyC = t2.comments.map(c => c.by !== 'sarah' ? Object.assign({}, c, { text: 'rewritten by sarah' }) : c).concat([{ id: 'forged', by: 'laura', createdAt: new Date().toISOString(), vis: 'team', text: 'Approved — Laura', parent: null, attachments: [] }]);
  r = await s.req('PUT', '/api/tasks/' + other.id, Object.assign({}, t2, { comments: bodyC }), sarah);
  const t3 = await get(other.id);
  assert.equal(t3.comments.filter(c => c.by !== 'sarah' && c.text === 'rewritten by sarah').length, 0, 'foreign comments not rewritten');
  const forged = t3.comments.find(c => c.id === 'forged');
  assert.ok(!forged || forged.by === 'sarah', 'a forged comment cannot claim another author');
  assert.equal(t3.comments.filter(c => c.by !== 'sarah').length, foreignComments.length, 'foreign comments preserved');

  // self-approve a version → 403 or decision not attributed to sarah
  const t4 = await get(other.id);
  if (t4.versions.length) {
    r = await s.req('PUT', '/api/tasks/' + other.id, Object.assign({}, t4, { versions: t4.versions.map(v => Object.assign({}, v, { state: 'approved', decidedBy: 'sarah' })) }), sarah);
    const t5 = await get(other.id);
    const wrongly = t5.versions.some((v, i) => v.state === 'approved' && t4.versions[i].state !== 'approved' && v.decidedBy === 'sarah');
    assert.ok(!wrongly, 'sarah cannot self-approve a version she may not review');
  }

  // a member can still edit and comment on their own task
  const mine = boot.tasks.find(x => !x._slim && x.assignee === 'sarah');
  if (mine) {
    const m = await get(mine.id);
    const r2 = await s.req('PUT', '/api/tasks/' + mine.id, Object.assign({}, m, { comments: (m.comments || []).concat([{ id: 'ok1', by: 'sarah', createdAt: new Date().toISOString(), vis: 'team', text: 'my note', parent: null, attachments: [] }]) }), sarah);
    assert.equal(r2.status, 200);
    assert.ok((await get(mine.id)).comments.some(c => c.id === 'ok1' && c.by === 'sarah'));
  }
});

test('create routes never overwrite an existing row by id', { timeout: 20000 }, async t => {
  const s = await serverV32(t);
  const admin = await s.login('admin@v32.test', 'V32!Admin23456');
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, admin)).json();
  const kn = (boot.knowledge || [])[0];
  if (kn) { const r = await s.req('POST', '/api/knowledge', { id: kn.id, title: 'HIJACK', folder: kn.folder, body: 'x' }, admin); assert.equal(r.status, 409); }
  const as = (boot.assets || [])[0];
  if (as) { const r = await s.req('POST', '/api/assets', { id: as.id, name: 'HIJACK', type: as.type }, admin); assert.equal(r.status, 409); }
  const pr = boot.projects[0];
  if (pr) { const r = await s.req('POST', '/api/projects', { id: pr.id, name: 'HIJACK' }, admin); assert.equal(r.status, 409); }
});
