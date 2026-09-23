/* v38 — fixes found on the first live deployment (clean production workspace, no demo). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t, extraEnv) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-v38-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'V38!Admin23456', COS_ADMIN_EMAIL: 'ops@hsb.co.id', COS_SECRET_KEY: 'v38-secret-key-long-enough-0123456789', COS_BACKUP_KEY: 'v38-backup-key-long-enough-9876543210', COS_SECURE_COOKIE: '0', APP_URL: 'http://127.0.0.1', COS_SEED_DEMO: '0' }, extraEnv || {}) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => rej(new Error('exit ' + c + ' ' + out))); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); return r.status === 200 ? r.headers.get('set-cookie').split(';')[0] : r.status; };
  const admin = await login('ops@hsb.co.id', 'V38!Admin23456'); assert.equal(typeof admin, 'string');
  return { base, req, login, admin, temp };
}
const project = async s => { const r = await s.req('POST', '/api/projects', { id: 'p_live', name: 'Live', owner: 'admin', status: 'active', team: [], teams: [], milestones: [] }, s.admin); assert.equal(r.status, 200, await r.clone().text()); };

test('a task whose reviewer does not exist (old demo default "laura") is created, not a 500', { timeout: 30000 }, async t => {
  const s = await start(t); await project(s);
  const r = await s.req('POST', '/api/tasks', { id: 'T-101', title: 'Banner', proj: 'p_live', status: 'backlog', assignee: 'admin', reviewer: 'laura', assignees: ['admin'], reviewers: ['laura'], versions: [], files: [], comments: [], activity: [] }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const tk = await r.json(); assert.equal(tk.reviewer, null); assert.deepEqual(tk.reviewers, []);
});

test('a removed member frees the email, loses sessions, and is not revived by re-adding', { timeout: 30000 }, async t => {
  const s = await start(t);
  let r = await s.req('POST', '/api/members', { id: 'rina', name: 'Rina Putri', email: 'rina@hsb.co.id', perm: 'member', ini: 'RP', teams: [] }, s.admin); assert.equal(r.status, 200);
  await s.req('POST', '/api/members/rina/password', { password: 'Rina!Passw0rd99' }, s.admin);
  const rina = await s.login('rina@hsb.co.id', 'Rina!Passw0rd99'); assert.equal(typeof rina, 'string');
  assert.equal((await s.req('DELETE', '/api/members/rina', undefined, s.admin)).status, 200);
  assert.equal((await s.req('GET', '/api/me', undefined, rina)).status, 401, 'old session is gone');
  r = await s.req('POST', '/api/members', { id: 'rina', name: 'Rina Putri', email: 'rina@hsb.co.id', perm: 'member', ini: 'RP', teams: [] }, s.admin);
  assert.equal(r.status, 200, await r.clone().text()); const again = await r.json();
  assert.notEqual(again.id, 'rina', 'a fresh account, not the old row');
  assert.equal(await s.login('rina@hsb.co.id', 'Rina!Passw0rd99'), 401, 'the old password does not come back');
});

test('AI is allowed by default, tests record a real result, provider errors are never 5xx', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  assert.equal(boot.ws.ai.processing.externalEnabled, true);
  let r = await s.req('POST', '/api/ai/test', { kind: 'chat' }, s.admin); const res = await r.json();
  assert.equal(res.ok, false); assert.match(res.error, /No chat API key/);
  const after = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  assert.equal(after.ws.ai.chat.lastCheck.ok, false, 'the failed check is stored and shown');
  /* saving providers without the permission fields keeps the permission (v37 turned it off) */
  const ws = after.ws; ws.ai = { chat: Object.assign({}, ws.ai.chat, { model: 'x' }) };
  assert.equal((await s.req('PUT', '/api/workspace', ws, s.admin)).status, 200);
  const again = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  assert.equal(again.ws.ai.processing.externalEnabled, true);
  assert.equal(again.ws.ai.chat.lastCheck, undefined, 'changing the model clears the old check');
  const src = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
  const fetchFn = src.slice(src.indexOf('const aiFetch'), src.indexOf('/* v38 image providers'));
  assert.doesNotMatch(fetchFn, /HttpError\(50\d/, 'Cloudflare replaces origin 502 bodies with its own HTML page');
});

test('live collections and demo cleanup never touch real work with demo-like ids', { timeout: 30000 }, async t => {
  const s = await start(t); await project(s);
  await s.req('POST', '/api/tasks', { id: 'T-101', title: 'Real work', proj: 'p_live', status: 'backlog', assignee: 'admin', versions: [], files: [], comments: [], activity: [] }, s.admin);
  const live = await (await s.req('GET', '/api/live/projects', undefined, s.admin)).json(); assert.equal(live.projects[0].id, 'p_live');
  const pre = await (await s.req('GET', '/api/admin/demo-data', undefined, s.admin)).json();
  assert.deepEqual([pre.people.length, pre.tasks, pre.projects], [0, 0, 0]);
  await s.req('POST', '/api/admin/demo-data/remove', {}, s.admin);
  assert.equal((await s.req('GET', '/api/tasks/T-101', undefined, s.admin)).status, 200);
});

test('registration can be switched on from Settings and the sign-in page lists real teams', { timeout: 30000 }, async t => {
  const s = await start(t);
  await s.req('POST', '/api/teams', { id: 'tm_design', name: 'Design HSB', color: 'blue' }, s.admin);
  const ws = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws;
  ws.allowRegistration = true; ws.joinCode = 'HSB2026';
  assert.equal((await s.req('PUT', '/api/workspace', ws, s.admin)).status, 200);
  const sess = await (await s.req('GET', '/api/auth/session')).json();
  assert.equal(sess.canRegister, true); assert.deepEqual(sess.teams.map(x => x.name), ['Design HSB']);
  const r = await s.req('POST', '/api/auth/register', { name: 'Budi', email: 'budi@hsb.co.id', password: 'Budi!Passw0rd99', joinCode: 'HSB2026', teamId: 'tm_design' });
  assert.equal(r.status, 200, await r.clone().text());
});

test('front end: v38 layer is built and keeps its promises', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  assert.ok(html.includes('function routeApply('), 'router');
  assert.doesNotMatch(fs.readFileSync(path.join(root, 'src/tasks.js'), 'utf8'), /"laura"/, 'no demo reviewer default');
  const v38 = fs.readFileSync(path.join(root, 'src/v38.js'), 'utf8');
  assert.match(v38, /var sw=function\(id,cur\)\{ var e=el\(id\); return e\?e\.classList\.contains\("on"\):!!cur; \}/, 'missing permission switches keep their value');
  assert.match(fs.readFileSync(path.join(root, 'src/core.js'), 'utf8'), /httpStatusMessage/, 'HTML error pages are never shown raw');
});

test('v38.1 clean URLs: app routes get the shell, files and API stay strict', { timeout: 30000 }, async t => {
  const s = await start(t);
  for (const p of ['/tasks', '/projects/p1', '/register', '/tasks/kanban?task=T-101', '/settings/ai']) {
    const r = await fetch(s.base + p); assert.equal(r.status, 200, p); assert.match(r.headers.get('content-type'), /text\/html/, p);
    assert.match(await r.text(), /function routeApply\(/, p);
  }
  assert.equal((await fetch(s.base + '/logo.png')).status, 404, 'a missing file is still a 404');
  assert.equal((await fetch(s.base + '/shared/nope.js')).status, 404);
  const api = await fetch(s.base + '/api/nope'); assert.equal(api.status, 404); assert.match(api.headers.get('content-type'), /json/, 'unknown API never returns the HTML shell');
  const src = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8');
  assert.doesNotMatch(src, /"\/#\/task\/"/, 'email links use /tasks?task=');
});
