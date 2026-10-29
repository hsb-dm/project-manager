/* Live updates name the tab they came from (Oct 2026). The page sends its id (src/core.js ZC_TAB) as X-ZC-Tab with
   every request; each live event the request causes carries it as `tab`, so only that tab skips the echo of its own
   save, and the same person's other tabs and devices take it (they used to drop anything "by" that person). Anything
   but 8 to 32 lowercase letters and digits in the header is ignored. The tab goes only to the streams of whoever made
   the change, so a colleague never learns it (and could not send it as theirs to have their changes skipped there);
   the page also skips only events "by" its own person. Someone's own preferences go to their own streams only, as
   kind "prefs". */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const vm = require('node:vm');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const wait = ms => new Promise(r => setTimeout(r, ms));

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-livetab-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'LiveTab!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'livetab-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'livetab-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log', COS_MSG_RATE_MAX: '500' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c, tab) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}, tab !== undefined ? { 'x-zc-tab': tab } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c, tab) => { const r = await req(m, p, b, c, tab); const text = await r.text(); let body = null; try { body = JSON.parse(text); } catch {} return { status: r.status, body, text }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'LiveTab!Admin23456');
  const boot = (await json('GET', '/api/bootstrap', undefined, admin)).body;
  const member = Object.keys(boot.people).find(id => id !== 'admin' && boot.people[id].active !== false && !boot.people[id].stakeholder && boot.people[id].perm === 'member');
  await req('POST', '/api/members/' + member + '/password', { password: 'Member!Pass2345' }, admin);
  const mc = await login(member + '@zencrevia.demo', 'Member!Pass2345');
  /* one open page: what its stream has received */
  const stream = cookie => { const events = []; const r = http.get({ host: '127.0.0.1', port, path: '/api/messages/stream', headers: { cookie, origin: base } }, res => { res.setEncoding('utf8'); let buf = ''; res.on('data', d => { buf += d; const lines = buf.split('\n'); buf = lines.pop(); lines.filter(l => l.startsWith('data: ')).forEach(l => { try { events.push(JSON.parse(l.slice(6))); } catch {} }); }); }); r.on('error', () => {}); t.after(() => r.destroy()); return events; };
  return { req, json, admin, mc, member, boot, stream };
}
/* the events of a type (and kind) that arrived after a mark */
const since = (evs, mark, type, kind) => evs.slice(mark).filter(e => e.type === type && (kind === undefined || e.kind === kind));
async function settled(evs, mark, type, kind, n) { for (let i = 0; i < 40; i++) { if (since(evs, mark, type, kind).length >= (n || 1)) break; await wait(50); } return since(evs, mark, type, kind); }

test('each live event says which tab caused it; a malformed tab, or none, is left off', { timeout: 60000 }, async t => {
  const s = await start(t);
  const tabA = await s.stream(s.admin), tabB = s.stream(s.admin), colleague = s.stream(s.mc); await wait(500);
  const A = 'tab0a1b2c3d4e5f6';
  /* a task */
  let mark = tabB.length;
  let r = await s.json('POST', '/api/tasks', { title: 'Live tab task', status: s.boot.ws.workflow[0].id, prio: 'medium', assignee: 'admin', assignees: ['admin'] }, s.admin, A);
  assert.equal(r.status, 200, r.text); const taskId = r.body.id;
  let got = await settled(tabB, mark, 'task_changed');
  assert.equal(got.length, 1); assert.equal(got[0].id, taskId); assert.equal(got[0].tab, A, 'the other tab hears which tab saved it'); assert.equal(got[0].by, 'admin');
  assert.equal((await settled(tabA, mark, 'task_changed'))[0].tab, A, 'the saving tab too, so it can tell it is its own');
  const theirs = (await settled(colleague, 0, 'task_changed')).filter(e => e.id === taskId);
  assert.equal(theirs.length, 1, 'a colleague hears of it'); assert.equal(theirs[0].by, 'admin'); assert.ok(!('tab' in theirs[0]), 'but never learns the tab');
  /* a project, a role, a team: ws_changed */
  for (const [m, p, b, kind] of [['POST', '/api/projects', { name: 'Live tab project', status: 'active', owner: 'admin', teams: [] }, 'projects'], ['POST', '/api/roles', { name: 'Live tab role', permissions: [] }, 'roles'], ['POST', '/api/teams', { name: 'Live tab team' }, 'teams']]) {
    mark = tabB.length; r = await s.json(m, p, b, s.admin, A); assert.equal(r.status, 200, kind + ': ' + r.text);
    got = await settled(tabB, mark, 'ws_changed', kind); assert.equal(got.length, 1, kind); assert.equal(got[0].tab, A, kind + ' carries the tab'); assert.equal(got[0].by, 'admin');
    got = await settled(colleague, 0, 'ws_changed', kind); assert.ok(got.length >= 1, kind + ': a colleague hears of it'); assert.ok(got.every(e => !('tab' in e)), kind + ': without the tab');
  }
  /* malformed, too short, too long, upper case, two values: ignored; no header: none */
  for (const bad of ['BAD-TAB!', 'abc', 'a'.repeat(33), 'TAB0A1B2C3D4', 'tab0a1b2c3d4, tab9z8y7x6w5v4', '../../x', '']) {
    mark = tabB.length;
    r = await s.json('PUT', '/api/tasks/' + taskId, Object.assign((await s.json('GET', '/api/tasks/' + taskId, undefined, s.admin)).body, { title: 'Renamed ' + bad.length }), s.admin, bad);
    assert.equal(r.status, 200, r.text);
    got = await settled(tabB, mark, 'task_changed'); assert.equal(got.length, 1, JSON.stringify(bad)); assert.ok(!('tab' in got[0]), 'ignored: ' + JSON.stringify(bad));
  }
  mark = tabB.length;
  r = await s.json('PUT', '/api/tasks/' + taskId, Object.assign((await s.json('GET', '/api/tasks/' + taskId, undefined, s.admin)).body, { title: 'No header' }), s.admin);
  got = await settled(tabB, mark, 'task_changed'); assert.equal(got.length, 1); assert.ok(!('tab' in got[0]), 'no header, no tab');
  /* the longest and shortest ids taken */
  for (const ok of ['a1b2c3d4', 'z'.repeat(32)]) {
    mark = tabB.length; await s.json('POST', '/api/roles', { name: 'Role ' + ok.length, permissions: [] }, s.admin, ok);
    assert.equal((await settled(tabB, mark, 'ws_changed', 'roles'))[0].tab, ok);
  }
});

test('one\'s own preferences reach one\'s own tabs only, with the tab; a profile, a status and a project comment carry it too', { timeout: 60000 }, async t => {
  const s = await start(t);
  const tabB = s.stream(s.mc), adminTab = s.stream(s.admin); await wait(500);
  const M = 'tabmember000001';
  const me = (await s.json('GET', '/api/bootstrap', undefined, s.mc)).body.people[s.member];
  /* a preference (prefsOnly): kind "prefs", to this member alone */
  let mark = tabB.length, adminMark = adminTab.length;
  let r = await s.json('PUT', '/api/members/' + s.member + '?prefsOnly=1', Object.assign({}, me, { id: s.member, prefs: Object.assign({}, me.prefs, { appearance: 'dark', language: 'id' }) }), s.mc, M);
  assert.equal(r.status, 200, r.text);
  let got = await settled(tabB, mark, 'ws_changed', 'prefs');
  assert.equal(got.length, 1, 'the member\'s other tab hears of it'); assert.equal(got[0].tab, M); assert.equal(got[0].by, s.member);
  await wait(300);
  assert.equal(adminTab.slice(adminMark).filter(e => e.type === 'ws_changed' && (e.kind === 'prefs' || e.kind === 'people')).length, 0, 'nobody else hears of one\'s preferences');
  assert.equal(r.body[s.member].prefs.appearance, 'dark', 'kept');
  /* a status: everyone, with the tab */
  mark = tabB.length; adminMark = adminTab.length;
  r = await s.json('PUT', '/api/members/' + s.member + '?prefsOnly=1', Object.assign({}, me, { id: s.member, prefs: Object.assign({}, me.prefs, { availability: { state: 'focus', emoji: '🎯', text: '' } }) }), s.mc, M);
  assert.equal(r.status, 200, r.text);
  got = await settled(tabB, mark, 'person_status'); assert.equal(got.length, 1); assert.equal(got[0].tab, M, 'a status names the tab to the member\'s own pages'); assert.equal(got[0].id, s.member);
  got = await settled(adminTab, adminMark, 'person_status'); assert.equal(got.length, 1, 'everyone hears of a status'); assert.ok(!('tab' in got[0]), 'without the tab');
  /* a profile (not prefsOnly): everyone hears "people", the member's own pages with the tab */
  mark = tabB.length; adminMark = adminTab.length;
  r = await s.json('PUT', '/api/members/' + s.member, Object.assign({}, me, { id: s.member, role: 'Live tab designer' }), s.mc, M);
  assert.equal(r.status, 200, r.text);
  got = await settled(tabB, mark, 'ws_changed', 'people'); assert.equal(got.length, 1); assert.equal(got[0].tab, M);
  got = await settled(adminTab, adminMark, 'ws_changed', 'people'); assert.equal(got.length, 1); assert.ok(!('tab' in got[0]), 'a colleague: without the tab');
  /* a project's discussion */
  const pr = s.boot.projects.find(p => p.status !== 'archived');
  mark = adminTab.length;
  r = await s.json('POST', '/api/projects/' + encodeURIComponent(pr.id) + '/comments', { id: 'pclt1', text: 'Live tab comment' }, s.admin, 'tabadmin00000001');
  assert.equal(r.status, 200, r.text);
  got = await settled(adminTab, mark, 'project_comments'); assert.equal(got.length, 1); assert.equal(got[0].tab, 'tabadmin00000001'); assert.equal(got[0].comment, 'pclt1');
  got = await settled(tabB, 0, 'project_comments'); assert.equal(got.length, 1, 'a colleague hears of the comment'); assert.ok(!('tab' in got[0]), 'without the tab');
  mark = adminTab.length;
  r = await s.json('PUT', '/api/projects/' + encodeURIComponent(pr.id) + '/comments/pclt1', { text: 'Live tab comment, changed' }, s.admin, 'tabadmin00000002');
  assert.equal((await settled(adminTab, mark, 'project_comments'))[0].tab, 'tabadmin00000002', 'a change');
  mark = adminTab.length;
  r = await s.json('DELETE', '/api/projects/' + encodeURIComponent(pr.id) + '/comments/pclt1', undefined, s.admin);
  got = await settled(adminTab, mark, 'project_comments'); assert.equal(got.length, 1); assert.ok(!('tab' in got[0]), 'a removal with no tab header names none');
});

/* ---------- the page's side (src/v38.js #18), in a page of its own ---------- */
const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const between = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, a + ' … ' + b); return src.slice(i, j); };
const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(r => setImmediate(r)); };
function page(prefs) {
  const listeners = [], timers = [], replies = [], counts = { theme: 0, refresh: 0, saves: 0 }, store = {};
  const Base = function () {}; Base.prototype.addEventListener = (t, f) => listeners.push(f);
  const ctx = { console, Promise, JSON, Object, Array, String, Date, Math,
    window: { EventSource: Base, ZC_TAB: 'tabthis00000001' }, API: { on: true }, ME: 'me', AN: null, UI_LANG: 'en',
    PEOPLE: { me: { name: 'Me', role: 'Lead', prefs: Object.assign({ _loaded: true }, prefs) }, sam: { name: 'Sam', prefs: {} } }, WS: {},
    localStorage: { setItem(k, v) { store[k] = String(v); }, getItem(k) { return store[k] || null; } },
    document: { hidden: false, activeElement: null, getElementById: () => null, addEventListener() {}, documentElement: {} },
    setTimeout: (f, ms) => { if (ms === 400) { timers.push(f); return 1; } return setTimeout(f, ms); },
    clone: o => JSON.parse(JSON.stringify(o)), applyTheme() { counts.theme++; }, applyShell() {}, requestRefresh() { counts.refresh++; },
    myPrefs() { return ctx.PEOPLE.me.prefs; }, hNotif: x => x, syncNotifDot() {}, renderNav() {},
    saveMyPrefs() { counts.saves++; return new Promise(r => { ctx.__saved = r; }); },
    apiFetch(method, p) { return new Promise((res, rej) => replies.push({ method, path: p, res, rej })); } };
  vm.createContext(ctx);
  vm.runInContext(read('core.js').match(/function liveFromThisTab\(ev\)\{[^\n]*\}/)[0], ctx);
  vm.runInContext(between(read('v38.js'), '/* ---------- #18 live updates', '/* ---------- #19 '), ctx);
  new ctx.window.EventSource('/api/messages/stream');
  const send = ev => listeners.forEach(f => f({ data: JSON.stringify(Object.assign({ type: 'ws_changed' }, ev)) }));
  return { ctx, send, timers, replies, counts, store };
}
const server = (dark, extra) => ({ people: { me: { name: 'Me', role: 'Lead', prefs: Object.assign({ appearance: dark ? 'dark' : 'light' }, extra || {}) }, sam: { name: 'Sam', prefs: {} } } });

test('the page takes its own preferences from another tab of its own, keeps them for a colleague\'s change or while saving its own, and skips only its own tab, and only its own person\'s', async () => {
  /* this tab's own echo: nothing is fetched */
  let p = page({ appearance: 'light' });
  p.send({ kind: 'prefs', by: 'me', tab: 'tabthis00000001' }); p.send({ kind: 'projects', by: 'me', tab: 'tabthis00000001' });
  assert.equal(p.timers.length, 0, 'its own tab: skipped');
  /* the same person's other tab: taken, and the look put back on */
  p.send({ kind: 'prefs', by: 'me', tab: 'tabother0000001' }); p.timers.shift()(); await settle();
  let r = p.replies.shift(); assert.equal(r.path, '/api/live/people', 'preferences come with the people');
  r.res(server(true, { language: 'en' })); await settle();
  assert.equal(p.ctx.PEOPLE.me.prefs.appearance, 'dark', 'taken'); assert.equal(p.ctx.PEOPLE.me.prefs._loaded, true);
  assert.equal(p.counts.theme, 1, 'the look put on'); assert.equal(p.counts.refresh, 1, 'drawn once');
  assert.equal(JSON.parse(p.store['cos.prefs.me']).appearance, 'dark', 'kept in this browser'); assert.equal(p.store['cos.appearance.me'], 'dark');
  assert.equal(p.counts.saves, 0, 'not saved back');
  /* the same again: nothing changed, nothing drawn */
  p.send({ kind: 'prefs', by: 'me', tab: 'tabother0000001' }); p.timers.shift()(); await settle();
  p.replies.shift().res(server(true, { language: 'en' })); await settle();
  assert.equal(p.counts.refresh, 1, 'unchanged: not drawn again'); assert.equal(p.counts.theme, 1);
  /* a colleague's change to the people keeps this tab's own preferences */
  p = page({ appearance: 'light' });
  p.send({ kind: 'people', by: 'sam', tab: 'tabsam000000001' }); p.timers.shift()(); await settle();
  p.replies.shift().res(server(true)); await settle();
  assert.equal(p.ctx.PEOPLE.me.prefs.appearance, 'light', 'a colleague\'s save does not bring back what the server had of mine');
  /* this tab saving its own while the fetch was on its way: its own kept */
  p = page({ appearance: 'light' });
  p.send({ kind: 'prefs', by: 'me', tab: 'tabother0000001' }); p.timers.shift()(); await settle();
  r = p.replies.shift(); p.ctx.PEOPLE.me.prefs.appearance = 'light'; p.ctx.saveMyPrefs(); r.res(server(true)); await settle();
  assert.equal(p.ctx.PEOPLE.me.prefs.appearance, 'light', 'a save of this tab\'s, after the fetch began, is not undone');
  p.ctx.__saved(); await settle();
  /* this tab's id on a change by someone else (who learnt it somehow): taken, never skipped as an echo */
  p = page({ appearance: 'light' });
  p.send({ kind: 'projects', by: 'sam', tab: 'tabthis00000001' }); assert.equal(p.timers.length, 1, 'by someone else: not this tab\'s echo');
  assert.equal(p.ctx.liveFromThisTab({ type: 'task_changed', tab: 'tabthis00000001', by: 'sam' }), false);
  assert.equal(p.ctx.liveFromThisTab({ type: 'task_changed', tab: 'tabthis00000001', by: 'me' }), true);
  assert.equal(p.ctx.liveFromThisTab({ type: 'task_changed', tab: 'tabthis00000001' }), true, 'with nobody named, the tab alone');
  assert.equal(p.ctx.liveFromThisTab({ type: 'task_changed', tab: 'tabother0000001', by: 'me' }), false);
  /* no tab at all (a request without the header, a job): taken by everyone */
  p = page({ appearance: 'light' });
  p.send({ kind: 'people', by: 'me' }); assert.equal(p.timers.length, 1, 'no tab: not this tab\'s');
});
