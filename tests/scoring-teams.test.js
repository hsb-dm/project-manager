/* Smart Scoring on the Teams screen (Oct 2026, server/scoring-teams.js, src/scoring-teams.js, docs/SMART-SCORING.md
   §5.3), on the real server. GET /api/scoring/teams works out, over the last 4 weeks, for every team and for the people
   the asker may see: points done against points planned for each points module switched on (the tasks due in the
   period, Declined left out; done = completed in a completed stage; a task without a score told apart), and estimate
   accuracy over the tasks completed in the period with a locked estimate and time logged in the time log. Every
   member sees every team's bars; a person's own bars go to them, to the lead of their team and to the analytics
   holders — or to everyone when the admin chooses so in Settings → Smart Scoring; a stakeholder gets nothing (403).
   Every number here is worked out by hand from a small set of tasks made for the test on a clean workspace. Then: a
   module off leaves its bar out, Smart Scoring off answers 409, COS_SCORING=0 answers 409; the page's words all have
   their Indonesian; and the route stays fast on a few thousand tasks. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');

function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-scoring-teams-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at, env) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Teams!Admin2345', COS_ADMIN_EMAIL: 'admin@teams.test', COS_SECRET_KEY: 'scoring-teams-secret-key-longer-than-32!!', COS_BACKUP_KEY: 'scoring-teams-backup-key-longer-than-32!!', COS_SEED_DEMO: '0', COS_BACKUP_INTERVAL_HOURS: '0', COS_SCORING: '' }, env || {}) });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 15000); const look = () => { const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }; child.stdout.on('data', look); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@teams.test', 'Teams!Admin2345');
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const s = { req, admin, login, boot, stop, dir: at.dir, log: () => out }; at.servers.push(s); return s;
}
const body = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { raw: t }; } };
const ok = async (r, what) => { const b = await body(r); assert.equal(r.status, 200, (what || '') + ' ' + JSON.stringify(b).slice(0, 500)); return b; };
const refused = async (r, status, re, what) => { const b = await body(r); assert.equal(r.status, status, (what || '') + ' ' + JSON.stringify(b).slice(0, 400)); if (re) assert.match(b.error || '', re, what); return b; };
const day = n => { const d = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const none = { done: 0, planned: 0, pct: null, notScored: 0 };

function kit(s) {
  const k = {
    async settings() { return (await (await s.req('GET', '/api/scoring/settings', undefined, s.admin)).json()).settings; },
    async set(fn) { const cur = await k.settings(), next = JSON.parse(JSON.stringify(cur)); fn(next); const r = await s.req('PUT', '/api/scoring/settings', { settings: next, configVersion: cur.configVersion }, s.admin); assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).settings; },
    teams: who => s.req('GET', '/api/scoring/teams', undefined, who === undefined ? s.admin : who),
    async person(name, extra) {
      const email = name.toLowerCase().replace(/\W+/g, '.') + '@teams.test';
      const r = await ok(await s.req('POST', '/api/members', Object.assign({ name, email, perm: 'member', cap: 40 }, extra || {}), s.admin), 'add ' + name);
      await ok(await s.req('POST', '/api/members/' + r.id + '/password', { password: 'Member!Pass2345' }, s.admin), 'password');
      return { id: r.id, cookie: await s.login(email, 'Member!Pass2345') };
    },
    async team(id, name, lead) { await ok(await s.req('POST', '/api/teams', { id, name, color: 'blue', icon: 'palette', lead: lead || null, description: '' }, s.admin), 'team ' + name); },
    async join(who, teamId) { await ok(await s.req('POST', '/api/members/' + who + '/team', { teamId, isPrimary: true }, s.admin), 'join'); },
    async task(fields) { return ok(await s.req('POST', '/api/tasks', Object.assign({ status: 'todo', prio: 'medium', reviewer: s.boot.me.id, reviewers: [s.boot.me.id], effort: 0 }, fields), s.admin), 'create'); },
    async doc(id) { return (await s.req('GET', '/api/tasks/' + id, undefined, s.admin)).json(); },
    async estimate(id, h) { const d = await k.doc(id); d.effort = h; return ok(await s.req('PUT', '/api/tasks/' + id, d, s.admin), 'estimate'); },
    async score(id, module, value) { return ok(await s.req('PUT', '/api/tasks/' + id + '/scoring/' + module, { value, reason: 'Set for the test', rev: 0 }, s.admin), 'score ' + module); },
    async approve(id) { const v = await ok(await s.req('GET', '/api/tasks/' + id + '/scoring', undefined, s.admin)); return ok(await s.req('POST', '/api/tasks/' + id + '/scoring/hours/approve', { rev: v.rows.hours.rev }, s.admin), 'approve'); },
    async log(id, who, minutes) { return ok(await s.req('POST', '/api/tasks/' + id + '/time', { workDate: new Date().toISOString().slice(0, 10), minutes, kind: 'work' }, who), 'log time'); },
    async move(id, to) { return ok(await s.req('POST', '/api/tasks/' + id + '/move', { type: 'MOVE_TASK_STATUS', toStatusId: to }, s.admin), 'move'); },
    async grant(id, caps) { const r = await s.req('PUT', '/api/members/' + id + '/cap-grants', { caps }, s.admin); assert.ok(r.ok, await r.text()); }
  };
  return k;
}

test('switched off on the server: 409', { timeout: 60000 }, async t => {
  const s = await start(place(t), { COS_SCORING: '0' });
  await refused(await kit(s).teams(), 409, /turned off on this server/);
});

test('the bars of a small set of tasks, worked out by hand; who sees whose bars, in both settings; a module off; Smart Scoring off', { timeout: 240000 }, async t => {
  const s = await start(place(t)), k = kit(s), me = s.boot.me.id;
  await refused(await k.teams(null), 401, null, 'signed in only');
  await refused(await k.teams(), 409, /turned off in this workspace/, 'Smart Scoring is off by default');
  const L = await k.person('Lena Lead'), A = await k.person('Ari Member'), B = await k.person('Bima Member'), O = await k.person('Okta Other'), H = await k.person('Hana Holder'), S = await k.person('Sari Stakeholder', { stakeholder: true });
  await k.team('tcheck', 'Check team', L.id); await k.team('ucheck', 'Other team', null);
  for (const x of [L, A, B]) await k.join(x.id, 'tcheck');
  for (const x of [O, H]) await k.join(x.id, 'ucheck');
  await k.set(x => { x.enabled = true; x.modules.story.on = true; x.modules.weighted.on = true; x.modules.assets.on = true; x.hours.lockPolicy = 'approve'; });

  /* the tasks: k1–k4 and k6 the check team's, k5 the other team's */
  const make = (title, team, who, due, extra) => k.task(Object.assign({ title, team, assignee: who[0], assignees: who, dueDate: due }, extra || {}));
  const k1 = await make('Feed post launch', 'tcheck', [A.id, B.id], day(-3), { assetCount: 2, meta: { assetSplit: { [A.id]: 2 } } });
  const k2 = await make('Logo concept', 'tcheck', [A.id], day(-2), { assetCount: 1 });
  const k3 = await make('Logo concept again', 'tcheck', [B.id], day(-2), { assetCount: 3 });
  const k4 = await make('Copy caption', 'tcheck', [B.id], day(-1));
  const k5 = await make('Banner web', 'ucheck', [O.id], day(-5));
  const k6 = await make('Story set old', 'tcheck', [L.id], day(-40));
  for (const [x, m, v] of [[k1, 'story', 5], [k1, 'weighted', 4], [k2, 'story', 3], [k3, 'story', 8], [k3, 'weighted', 8], [k4, 'weighted', 6], [k5, 'story', 2], [k6, 'story', 13]]) await k.score(x.id, m, v);
  for (const [x, h] of [[k1, 4], [k4, 2], [k5, 2], [k6, 2]]) await k.estimate(x.id, h);
  for (const x of [k1, k5, k6]) await k.approve(x.id);   /* k4's estimate is never locked */
  await k.log(k1.id, A.cookie, 270); await k.log(k4.id, B.cookie, 60); await k.log(k5.id, O.cookie, 180); await k.log(k6.id, L.cookie, 120);
  for (const x of [k1, k4, k5, k6]) await k.move(x.id, 'done');
  await k.move(k3.id, 'declined');
  assert.equal((await k.doc(k1.id)).assetCount, 2, 'k1: two assets, typed for Ari');

  let r = await ok(await k.teams());
  assert.deepEqual([r.from, r.to, r.weeks, r.memberBars], [day(-28), day(0), 4, 'self_and_leads']);
  assert.deepEqual(r.modules, { story: true, weighted: true, assets: true, hours: true });
  const team = (x, id) => (x.teams.find(y => y.id === id) || {}).bars;
  /* the check team: k3 declined is never planned; k6 was due before the period; k4 has no story points, k2 none weighted
     and k4 no assets; k1 (4 h → 4.5 h) and k6 (2 h → 2 h) are within ±20 %, k4's estimate was never locked */
  const T = { story: { done: 5, planned: 8, pct: 63, notScored: 1 }, weighted: { done: 10, planned: 10, pct: 100, notScored: 1 }, assets: { done: 2, planned: 7, pct: 29, notScored: 1 }, accuracy: { tasks: 2, within: 2, share: 100 } };
  assert.deepEqual(team(r, 'tcheck'), T);
  /* the other team: k5's 2 story points done, nothing weighted or with assets, 2 h → 3 h not within */
  const U = { story: { done: 2, planned: 2, pct: 100, notScored: 0 }, weighted: { done: 0, planned: 0, pct: null, notScored: 1 }, assets: { done: 0, planned: 0, pct: null, notScored: 1 }, accuracy: { tasks: 1, within: 0, share: 0 } };
  assert.deepEqual(team(r, 'ucheck'), U);
  /* people: a shared task's points split in two; asset points as credited (k1's typed for Ari, k2's to its assignee) */
  const P = {
    [A.id]: { story: { done: 2.5, planned: 5.5, pct: 45, notScored: 0 }, weighted: { done: 2, planned: 2, pct: 100, notScored: 1 }, assets: { done: 2, planned: 7, pct: 29, notScored: 0 }, accuracy: { tasks: 1, within: 1, share: 100 } },
    [B.id]: { story: { done: 2.5, planned: 2.5, pct: 100, notScored: 1 }, weighted: { done: 8, planned: 8, pct: 100, notScored: 0 }, assets: { done: 0, planned: 0, pct: null, notScored: 1 }, accuracy: { tasks: 1, within: 1, share: 100 } },
    [L.id]: { story: none, weighted: none, assets: none, accuracy: { tasks: 1, within: 1, share: 100 } },
    [O.id]: { story: { done: 2, planned: 2, pct: 100, notScored: 0 }, weighted: { done: 0, planned: 0, pct: null, notScored: 1 }, assets: { done: 0, planned: 0, pct: null, notScored: 1 }, accuracy: { tasks: 1, within: 0, share: 0 } },
    [H.id]: { story: none, weighted: none, assets: none, accuracy: { tasks: 0, within: 0, share: null } } };
  const everyone = [me, L.id, A.id, B.id, O.id, H.id].sort();
  assert.deepEqual(Object.keys(r.people).sort(), everyone, 'the admin sees everyone but the stakeholder');
  for (const id of Object.keys(P)) assert.deepEqual(r.people[id].bars, P[id], 'the bars of ' + id);
  assert.deepEqual(r.people[me].bars.accuracy, { tasks: 0, within: 0, share: null }, 'nothing measured: no data, never 0 %');

  /* who sees whose bars (self_and_leads, the default) */
  const keys = async who => { const x = await ok(await k.teams(who)); assert.deepEqual(team(x, 'tcheck'), T, 'every member sees the team bars'); assert.deepEqual(team(x, 'ucheck'), U); return Object.keys(x.people).sort(); };
  assert.deepEqual(await keys(A.cookie), [A.id], 'a member: their own bars only');
  assert.deepEqual((await ok(await k.teams(A.cookie))).people[A.id].bars, P[A.id], 'the same numbers as the admin sees');
  assert.deepEqual(await keys(B.cookie), [B.id]);
  assert.deepEqual(await keys(O.cookie), [O.id], 'a member of the other team: their own');
  assert.deepEqual(await keys(L.cookie), [A.id, B.id, L.id].sort(), 'the team\'s lead: every member of their team, nobody of the other team');
  assert.deepEqual(await keys(H.cookie), [H.id], 'no analytics permission yet: their own');
  await k.grant(H.id, ['scoring_view_analytics']);
  assert.deepEqual(await keys(H.cookie), everyone, 'an analytics holder: everyone who is not a stakeholder');
  await refused(await k.teams(S.cookie), 403, /permission/, 'a stakeholder sees nothing');

  /* the admin lets everyone see everyone's bars: changed through the settings, audited like any other field */
  await k.set(x => { x.teams.memberBars = 'everyone'; });
  const audit = (await ok(await s.req('GET', '/api/scoring/settings', undefined, s.admin))).audit;
  assert.deepEqual(audit[0].diff, [{ path: 'teams.memberBars', from: 'self_and_leads', to: 'everyone' }], 'one change in the history');
  r = await ok(await k.teams(A.cookie));
  assert.equal(r.memberBars, 'everyone');
  assert.deepEqual(Object.keys(r.people).sort(), everyone, 'a member now sees a colleague\'s bars');
  assert.deepEqual(r.people[B.id].bars, P[B.id]);
  assert.deepEqual(await keys(O.cookie), everyone);
  assert.deepEqual(await keys(L.cookie), everyone); assert.deepEqual(await keys(H.cookie), everyone);
  await refused(await k.teams(S.cookie), 403, /permission/, 'a stakeholder still sees nothing');
  await k.set(x => { x.teams.memberBars = 'self_and_leads'; });
  assert.deepEqual(await keys(A.cookie), [A.id], 'back: their own only');
  assert.deepEqual(await keys(L.cookie), [A.id, B.id, L.id].sort());

  /* a module off: its bar is gone; Effort Hours off: no accuracy */
  await k.set(x => { x.modules.assets.on = false; x.modules.weighted.on = false; });
  r = await ok(await k.teams());
  assert.deepEqual(r.modules, { story: true, weighted: false, assets: false, hours: true });
  assert.deepEqual(Object.keys(team(r, 'tcheck')), ['story', 'accuracy']); assert.deepEqual(Object.keys(r.people[A.id].bars), ['story', 'accuracy']);
  await k.set(x => { x.modules.hours.on = false; });
  r = await ok(await k.teams());
  assert.deepEqual(Object.keys(team(r, 'tcheck')), ['story']); assert.deepEqual(team(r, 'tcheck').story, T.story);
  /* Smart Scoring off: 409 for everyone */
  await k.set(x => { x.enabled = false; });
  await refused(await k.teams(), 409, /turned off in this workspace/);
  await refused(await k.teams(A.cookie), 409, /turned off in this workspace/);
});

test('every word the Teams bars and their setting show has its Indonesian, with the same placeholders', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'scoring-teams.js'), 'utf8'), JS = src.slice(src.indexOf('<script>') + 8, src.indexOf('</script>'));
  const c = { UI_ID: {}, UI_LANG: 'en', console, API: { on: false }, I: { team: '' } }; c.tr = x => (c.UI_LANG === 'id' ? c.UI_ID[x] || x : x);
  vm.createContext(c); vm.runInContext(JS, c);
  const literals = new Set();
  for (const m of JS.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)) literals.add(JSON.parse('"' + m[1] + '"'));
  for (const m of JS.matchAll(/\b(?:tr|scrTbFill)\([^"()]*\?"((?:[^"\\]|\\.)*)":"((?:[^"\\]|\\.)*)"/g)) { literals.add(m[1]); literals.add(m[2]); }
  for (const m of JS.matchAll(/scrTbFill\("((?:[^"\\]|\\.)*)"/g)) literals.add(m[1]);
  for (const m of JS.matchAll(/\b(?:sp\(|fieldHtml\("[^"]*",)"((?:[^"\\]|\\.)*)"/g)) literals.add(m[1]);
  [c.SCR_TB_LABEL, c.SCR_TB_MODES, c.SCR_TB_WHY.team, c.SCR_TB_WHY.person].forEach(map => Object.values(map).forEach(v => literals.add(v)));
  assert.ok(literals.size > 25, 'the strings were found (' + literals.size + ')');
  const marks = x => (String(x).match(/\{\w+\}/g) || []).sort().join(' ');
  const missing = [...literals].filter(x => !(x in c.UI_ID));
  assert.deepEqual(missing, [], 'no Indonesian for: ' + missing.join(' | '));
  for (const x of literals) assert.equal(marks(c.UI_ID[x]), marks(x), 'the placeholders differ: ' + x);
  for (const x of literals) if (/[a-z]{4}/.test(x) && !/^(Smart Scoring|Story Points|Weighted Points|Effort Hours)$/.test(x)) assert.notEqual(c.UI_ID[x], x, 'not translated: ' + x);
});

/* Fast on a few thousand tasks: the route's queries, in this process, on a database made from db/schema.sql */
test('it stays fast on a few thousand tasks', { timeout: 60000 }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8'));
  const W = 'ws_perf', iso = ms => new Date(ms).toISOString(), now = Date.now();
  db.prepare("INSERT INTO workspaces (id, name) VALUES (?,?)").run(W, 'Perf');
  const st = db.prepare("INSERT INTO task_statuses (id, workspace_id, name, sort_order, is_completed) VALUES (?,?,?,?,?)");
  st.run('todo', W, 'To do', 1, 0); st.run('done', W, 'Done', 2, 1); st.run('declined', W, 'Declined', 3, 1);
  db.prepare("INSERT INTO roles (id, workspace_id, name, permissions) VALUES (?,?,?,?)").run('member', W, 'Member', '[]');
  const people = Array.from({ length: 40 }, (_, i) => 'u' + i), teams = ['ta', 'tb', 'tc', 'td', 'te'];
  const us = db.prepare("INSERT INTO users (id, email, name) VALUES (?,?,?)"), wm = db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role_id) VALUES (?,?,?,?)");
  people.forEach((id, i) => { us.run(id, id + '@perf.test', 'Person ' + i); wm.run('wm_' + id, W, id, 'member'); });
  teams.forEach((id, i) => db.prepare("INSERT INTO teams (id, workspace_id, name, team_lead_id, sort_order) VALUES (?,?,?,?,?)").run(id, W, id, people[i], i));
  people.forEach((id, i) => db.prepare("INSERT INTO team_memberships (id, team_id, user_id, is_primary) VALUES (?,?,?,1)").run('tm' + i, teams[i % teams.length], id));
  const N = 5000;
  const tk = db.prepare("INSERT INTO tasks (id, workspace_id, team_id, title, status_id, assignee_id, assignees, estimated_minutes, asset_count, due_date, completed_at, meta) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)");
  const sc = db.prepare("INSERT INTO task_scoring (task_id, module, workspace_id, final_value, source, status, locked_value) VALUES (?,?,?,?,?,?,?)");
  const te = db.prepare("INSERT INTO task_time_entries (id, workspace_id, task_id, user_id, work_date, minutes, kind, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)");
  const fv = db.prepare("INSERT INTO file_versions (id, task_id, version_number, uploaded_by, created_at) VALUES (?,?,?,?,?)");
  const titles = ['Feed post', 'Logo concept', 'Resize banner', 'Carousel promo', 'Story set', 'Video teaser'];
  db.exec('BEGIN');
  for (let i = 0; i < N; i++) {
    const id = 't' + i, a = people[i % people.length], b = people[(i + 7) % people.length], due = iso(now - (i % 120) * 86400000).slice(0, 10), done = i % 4 !== 0;
    tk.run(id, W, teams[i % teams.length], titles[i % titles.length] + ' ' + i, done ? 'done' : i % 9 === 0 ? 'declined' : 'todo', a, JSON.stringify(i % 3 ? [a] : [a, b]), 60 * (1 + i % 8), i % 7, due, done ? iso(now - (i % 120) * 86400000) : null, JSON.stringify({ assetSplit: i % 4 ? undefined : { [a]: i % 5 } }));
    sc.run(id, 'hours', W, 1 + i % 8, 'manual', ['approved', 'locked', 'draft'][i % 3], i % 3 < 2 ? 1 + i % 8 : null);
    sc.run(id, 'story', W, [1, 2, 3, 5, 8, 13][i % 6], 'math', 'draft', null);
    if (i % 2) sc.run(id, 'weighted', W, 1 + (i % 9), 'math', 'draft', null);
    for (let j = 0; j < 3; j++) te.run('e' + i + '_' + j, W, id, a, due, 30 + (i * 7 + j * 13) % 200, ['work', 'revision', 'blocked'][j], 'manual', iso(now));
    fv.run('v' + i, id, 1, a, iso(now));
  }
  db.exec('COMMIT');
  const S = require('../shared/scoring-settings.js');
  const settings = S.normalizeSettings({ enabled: true, modules: { hours: { on: true }, story: { on: true }, weighted: { on: true }, assets: { on: true } } });
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const routes = {}, route = (m, p, fn) => { routes[m + ' ' + p] = fn; };
  const scoring = { featureOn: () => true, settings: () => settings };
  const can = { scoringViewAnalytics: u => u.role === 'admin' };
  require('../server/scoring-teams.js')(db, W, { route, HttpError, forbid: (ok, what) => { if (!ok) throw new HttpError(403, what); }, can, scoring });
  const get = routes['GET /api/scoring/teams'];
  get({ id: 'u1', role: 'admin' }, {}, {});   /* warm up */
  const t0 = process.hrtime.bigint();
  const r = get({ id: 'u1', role: 'admin' }, {}, {});
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  assert.equal(r.teams.length, teams.length); assert.equal(Object.keys(r.people).length, people.length);
  const a = r.teams.find(x => x.id === 'ta').bars;
  assert.ok(a.story.planned > 0 && a.story.pct > 0 && a.story.pct < 100 && a.weighted.planned > 0 && a.assets.planned > 0 && a.accuracy.tasks > 10, JSON.stringify(a));
  r.teams.forEach(x => ['story', 'weighted', 'assets'].forEach(m => assert.ok(x.bars[m].done <= x.bars[m].planned && x.bars[m].pct >= 0 && x.bars[m].pct <= 100)));
  const own = get({ id: 'u9', role: 'member' }, {}, {});
  assert.deepEqual(Object.keys(own.people), ['u9'], 'a member: their own');
  const lead = get({ id: 'u1', role: 'member' }, {}, {});
  assert.deepEqual(Object.keys(lead.people).sort(), people.filter((id, i) => i % teams.length === 1).sort(), 'the lead of tb: its members');
  assert.ok(ms < 1500, 'a few thousand tasks took ' + Math.round(ms) + ' ms');
  console.log('# scoring teams: ' + N + ' tasks, ' + people.length + ' people in ' + Math.round(ms) + ' ms');
  db.close();
});
