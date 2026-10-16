/* Smart Scoring's analytics (Oct 2026, server/scoring-analytics.js, docs/SMART-SCORING.md §5.3), on the real server.
   GET /api/scoring/analytics works out, for the tasks completed in a period (in a completed stage; declined and open
   work never), throughput, the estimate against the time log's Actual — locked estimates against logged time apart from
   the unverified ones, and why —, estimation accuracy only over tasks with both numbers, velocity in the primary
   capacity metric, where the scores came from and how often they were changed by hand, first-pass approval and the
   review cycle, approved base points and bonus apart (waiting awards apart again), output points for assets produced as
   GET /api/scoring/assets credits them, and KPI progress. Whoever holds scoring_view_analytics sees the team, anyone
   else only their own figures, a stakeholder nothing; a module switched off leaves its section out (readable with
   history=1 to the team's analytics holders); COS_SCORING=0 answers 409. Every number here is worked out by hand from a
   small set of tasks made for the test. The last test holds it fast on a few thousand tasks. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');

function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-scoring-analytics-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at, env) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Analytics!Admin2345', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'scoring-analytics-secret-key-longer-than-32!!', COS_BACKUP_KEY: 'scoring-analytics-backup-key-longer-than-32!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_SCORING: '' }, env || {}) });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 15000); const look = () => { const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }; child.stdout.on('data', look); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Analytics!Admin2345');
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const cookies = {};
  const as = async id => { if (cookies[id]) return cookies[id]; const r = await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); assert.ok(r.ok, await r.text()); return (cookies[id] = await login(boot.people[id].email, 'Member!Pass2345')); };
  const s = { req, admin, as, boot, stop, dir: at.dir, log: () => out }; at.servers.push(s); return s;
}
const body = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { raw: t }; } };
const ok = async (r, what) => { const b = await body(r); assert.equal(r.status, 200, (what || '') + ' ' + JSON.stringify(b).slice(0, 500)); return b; };
const refused = async (r, status, re, what) => { const b = await body(r); assert.equal(r.status, status, (what || '') + ' ' + JSON.stringify(b).slice(0, 400)); if (re) assert.match(b.error || '', re, what); return b; };
const dbAt = dir => new DatabaseSync(path.join(dir, 'creative-os.db'));
const near = (a, b, what) => assert.ok(Math.abs(a - b) < 1e-3, (what || '') + ': ' + a + ' is not ' + b);

function kit(s) {
  const k = {
    async settings() { return (await (await s.req('GET', '/api/scoring/settings', undefined, s.admin)).json()).settings; },
    async set(fn) { const cur = await k.settings(), next = JSON.parse(JSON.stringify(cur)); fn(next); const r = await s.req('PUT', '/api/scoring/settings', { settings: next, configVersion: cur.configVersion }, s.admin); assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).settings; },
    an: (who, q) => s.req('GET', '/api/scoring/analytics' + (q ? '?' + new URLSearchParams(q) : ''), undefined, who === undefined ? s.admin : who),
    async task(fields) { return ok(await s.req('POST', '/api/tasks', Object.assign({ status: 'todo', prio: 'medium', team: 'design', reviewer: 'admin', reviewers: ['admin'], effort: 0 }, fields), s.admin), 'create'); },
    async doc(id, who) { return (await s.req('GET', '/api/tasks/' + id, undefined, who || s.admin)).json(); },
    async save(id, fn, who) { const d = await k.doc(id, who); d.meta = d.meta || {}; fn(d); return ok(await s.req('PUT', '/api/tasks/' + id, d, who || s.admin), 'save'); },
    async approve(id) { const v = await ok(await s.req('GET', '/api/tasks/' + id + '/scoring', undefined, s.admin)); return ok(await s.req('POST', '/api/tasks/' + id + '/scoring/hours/approve', { rev: v.rows.hours.rev }, s.admin), 'approve'); },
    async log(id, who, minutes, kind) { return ok(await s.req('POST', '/api/tasks/' + id + '/time', { workDate: new Date().toISOString().slice(0, 10), minutes, kind: kind || 'work' }, who), 'log time'); },
    async move(id, to) { return ok(await s.req('POST', '/api/tasks/' + id + '/move', { type: 'MOVE_TASK_STATUS', toStatusId: to }, s.admin), 'move'); },
    async grant(id, caps) { const r = await s.req('PUT', '/api/members/' + id + '/cap-grants', { caps }, s.admin); assert.ok(r.ok, await r.text()); }
  };
  return k;
}
const thisMonday = () => { const d = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7); return d.toISOString().slice(0, 10); };

test('switched off, on the server or in the workspace, it answers 409; a stakeholder 403; a member only their own; odd queries 400', { timeout: 120000 }, async t => {
  const at = place(t);
  const off = await start(at, { COS_SCORING: '0' });
  await refused(await kit(off).an(off.admin), 409, /turned off on this server/);
  await off.stop();
  const s = await start(at), k = kit(s);
  await refused(await k.an(null), 401, null, 'signed in only');
  await refused(await k.an(), 409, /switched off for this workspace/);
  /* switched off, the history stays readable to the team's analytics holders */
  let r = await ok(await k.an(s.admin, { history: '1' }));
  assert.equal(r.on.enabled, false); assert.equal(r.history, true); assert.equal(r.estimates.off, true); assert.equal(r.points.off, true);
  const ids = Object.keys(s.boot.people), stakeholder = ids.find(id => s.boot.people[id].stakeholder);
  assert.ok(stakeholder, 'the demo has a stakeholder');
  const sarah = await s.as('sarah'), st = await s.as(stakeholder);
  await refused(await k.an(sarah, { history: '1' }), 409, /switched off for this workspace/, 'a member has no history view');
  await k.set(x => { x.enabled = true; });
  await refused(await k.an(st), 403, /permission/);
  r = await ok(await k.an(sarah));
  assert.equal(r.scope, 'own'); assert.equal(r.filters.person, 'sarah'); assert.equal('people' in r, false, 'no one else\'s figures');
  await refused(await k.an(sarah, { person: 'rizky' }), 403, /other people/);
  assert.equal((await ok(await k.an(sarah, { person: 'sarah' }))).scope, 'own');
  r = await ok(await k.an());
  assert.equal(r.scope, 'team'); assert.ok(Array.isArray(r.people)); assert.equal(r.filters.person, null);
  assert.deepEqual(r.people.map(p => p.name), r.people.map(p => p.name).slice().sort((a, b) => a.localeCompare(b)), 'people in name order');
  assert.ok(!r.stages.includes('declined'));
  /* given the permission, a member sees the team */
  await k.grant('maya', ['scoring_view_analytics']);
  assert.equal((await ok(await k.an(await s.as('maya')))).scope, 'team');
  for (const q of [{ from: '2026-13-01' }, { to: 'yesterday' }, { from: '2026-10-10', to: '2026-10-01' }, { team: 'bad id!' }, { status: 'whatever' }, { weeks: '0' }, { weeks: '200' }, { from: '2023-01-01', to: '2026-01-01' }])
    await refused(await k.an(s.admin, q), 400, null, JSON.stringify(q));
  /* the period: weeks from a Monday up to `to` */
  r = await ok(await k.an(s.admin, { weeks: '3', to: '2026-10-15' }));
  assert.deepEqual([r.from, r.to, r.weeks], ['2026-09-28', '2026-10-15', ['2026-09-28', '2026-10-05', '2026-10-12']]);
  r = await ok(await k.an(s.admin, { from: '2026-10-01', to: '2026-10-15' }));
  assert.deepEqual(r.weeks, ['2026-09-28', '2026-10-05', '2026-10-12']);
});

test('the figures of a small set of tasks, worked out by hand: estimates against logged time, accuracy, velocity, sources, review, points, assets, a KPI; filters and switches', { timeout: 240000 }, async t => {
  const s = await start(place(t)), k = kit(s);
  await k.set(x => { x.enabled = true; x.hours.lockPolicy = 'approve'; x.modules.assets.on = true; x.modules.kpi.on = true; });
  const sarah = await s.as('sarah'), rizky = await s.as('rizky'), maya = await s.as('maya');
  const proj = (await ok(await s.req('POST', '/api/projects', { name: 'Analytics check', owner: 'admin', status: 'active' }, s.admin))).find(p => p.name === 'Analytics check').id;
  const make = (title, assignees, extra) => k.task(Object.assign({ title, proj, assignee: assignees[0], assignees }, extra || {}));
  /* each estimate typed after the task is made, as a person types it (so it is "manual", not from before) */
  const estimate = (id, h) => k.save(id, d => { d.effort = h; });
  const A = await make('Feed post launch', ['sarah'], { assetCount: 5 });
  const B = await make('Logo concept', ['sarah', 'rizky'], { meta: { assetSplit: { rizky: 1 } } });
  const C = await make('Carousel promo', ['rizky']);
  const D = await make('Story set', ['rizky']);
  const E = await make('Copy caption', ['sarah']);
  const F = await make('Poster event', ['sarah']);
  const G = await make('Banner web', ['rizky']);
  const H = await make('Video teaser', ['sarah']);
  for (const [x, h] of [[A, 6], [B, 4], [C, 2], [D, 3], [F, 2], [G, 5], [H, 8]]) await estimate(x.id, h);
  for (const x of [A, B, F, H]) await k.approve(x.id);
  /* the time logged by the people assigned */
  await k.log(A.id, sarah, 300); await k.log(A.id, sarah, 60, 'blocked');
  await k.log(B.id, sarah, 240); await k.log(B.id, rizky, 120, 'revision');
  await k.log(C.id, rizky, 90);
  await k.log(D.id, rizky, 180);
  await k.log(E.id, sarah, 30);
  await k.log(G.id, rizky, 60);
  for (const x of [A, B, C, D, E, F]) await k.move(x.id, 'done');
  await k.move(G.id, 'declined'); await k.move(H.id, 'progress');
  /* D's estimate is one from before Smart Scoring (as the backfill keeps it); the reviews, and the awards the bonus phase
     will write, are put in the database with known times */
  const today = new Date().toISOString().slice(0, 10), at = (days, hh) => { const d = new Date(today + 'T' + hh + ':00:00.000Z'); d.setUTCDate(d.getUTCDate() - days); return d.toISOString(); };
  const db = dbAt(s.dir);
  try {
    db.prepare("UPDATE task_scoring SET status='unverified', source='legacy' WHERE task_id=? AND module='hours'").run(D.id);
    const ver = db.prepare("INSERT INTO file_versions (id,task_id,version_number,note,uploaded_by,approval_status,created_at) VALUES (?,?,?,?,?,?,?)");
    const apr = db.prepare("INSERT INTO approvals (id,task_id,version_id,decided_by,decision,created_at) VALUES (?,?,?,?,?,?)");
    const rev = db.prepare("INSERT INTO revision_requests (id,task_id,version_id,requested_by,reason,created_at) VALUES (?,?,?,?,?,?)");
    ver.run('v_a1', A.id, 1, '', 'sarah', 'approved', at(2, '10')); apr.run('ap_a1', A.id, 'v_a1', 'admin', 'approved', at(1, '10'));   /* first pass, 24 h */
    ver.run('v_b1', B.id, 1, '', 'rizky', 'revision', at(3, '10')); rev.run('rr_b1', B.id, 'v_b1', 'admin', 'Off brief', at(3, '16'));
    ver.run('v_b2', B.id, 2, '', 'rizky', 'approved', at(2, '10')); apr.run('ap_b2', B.id, 'v_b2', 'admin', 'approved', at(2, '22'));   /* two rounds, 36 h */
    const ws = db.prepare("SELECT workspace_id AS w FROM tasks WHERE id=?").get(A.id).w;
    const aw = db.prepare("INSERT INTO task_efficiency_awards (id, workspace_id, task_id, user_id, share, base_points, bonus_points, awarded_points, status, quality_score, created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)");
    aw.run('aw_a', ws, A.id, 'sarah', 1, 5, 0.45, 5.45, 'approved', 4, at(0, '09'));
    aw.run('aw_b1', ws, B.id, 'sarah', 0.5, 1.5, 0, 1.5, 'approved', null, at(0, '09'));
    aw.run('aw_b2', ws, B.id, 'rizky', 0.5, 1.5, 0.1, 1.6, 'pending_review', null, at(0, '09'));
    aw.run('aw_c', ws, C.id, 'rizky', 1, 2, 0.2, 2.2, 'rejected', null, at(0, '09'));
    aw.run('aw_g', ws, G.id, 'rizky', 1, 5, 1, 6, 'approved', null, at(0, '09'));   /* declined: never counted */
    aw.run('aw_h', ws, H.id, 'sarah', 1, 8, 1, 9, 'provisional', null, at(0, '09'));   /* still open: never counted */
  } finally { db.close(); }
  /* a KPI counting the project's completed tasks */
  await ok(await s.req('POST', '/api/outcomes/metrics', { kind: 'kpi', title: 'Tasks delivered', baseline: 0, target: 10, rule: { type: 'tasks_completed', filter: { project: proj } } }, s.admin), 'kpi');

  const q = { project: proj, weeks: '2' }, week = thisMonday();
  let r = await ok(await k.an(s.admin, q));
  assert.equal(r.weeks.length, 2); assert.equal(r.weeks[1], week);
  /* throughput: A–F (G declined, H open) — and the empty week is 0 tasks, not "no data" */
  assert.deepEqual(r.throughput, { tasks: 6, byWeek: [0, 6] });
  /* estimates: A (6 h locked, 5 h logged) and B (4 h, 4 h work + 2 h revision) verified; C (never locked) and D (from
     before) unverified; E not estimated; F no time logged; A's hour waiting kept apart */
  const e = r.estimates;
  assert.deepEqual([e.verified.tasks, e.verified.estimateHours, e.verified.actualHours, e.verified.approved], [2, 10, 11, 2]);
  assert.deepEqual([e.unverified.tasks, e.unverified.estimateHours, e.unverified.actualHours], [2, 5, 4.5]);
  assert.deepEqual(e.unverified.why, { scope_changed: 0, estimate_from_before: 1, estimate_not_locked: 1, time_from_before: 0, actual_typed: 0 });
  assert.deepEqual([e.notEstimated, e.noTimeLogged, e.blockedHours, e.timeLog], [1, 1, 1, true]);
  /* accuracy: |5−6|/6 = 0.1667 (within ±20 %), |6−4|/4 = 0.5 (took longer): median 0.3333, half within */
  assert.deepEqual(e.verified.accuracy, { tasks: 2, medianError: 0.3333, within: 1, over: 1, under: 0, withinShare: 0.5 });
  /* C |1.5−2|/2 = 0.25 (took less), D 0: median 0.125 */
  assert.deepEqual(e.unverified.accuracy, { tasks: 2, medianError: 0.125, within: 1, over: 0, under: 1, withinShare: 0.5 });
  assert.equal(e.verified.byWeek[0], null, 'an empty week has no data, not 0 %'); assert.equal(e.verified.byWeek[1].accuracy.withinShare, 0.5);
  /* velocity in hours (the primary metric): A 6 + B 4 + C 2 + D 3 + F 2; E has no estimate */
  assert.deepEqual(r.velocity, { module: 'hours', unit: 'h', total: 17, scored: 5, unscored: 1, shared: false, byWeek: [null, { value: 17, tasks: 5 }] });
  /* sources: the five estimates typed (D's since marked from before); each typed once */
  assert.deepEqual(Object.keys(r.sources), ['hours'], 'only the modules switched on');
  assert.deepEqual(r.sources.hours, { math: 0, ai: 0, manual: 4, legacy: 1, notScored: 1, aiSuggested: 0, manualChanges: 5, changedTasks: 5, tasks: 6 });
  /* review: A first pass (24 h), B after a revision (2 rounds, 36 h) */
  assert.deepEqual([r.review.reviewed, r.review.firstPass, r.review.firstPassShare, r.review.approved, r.review.rounds, r.review.medianCycleHours, r.review.tasks], [2, 1, 0.5, 2, 1.5, 30, 6]);
  assert.equal(r.review.byWeek[0], null);
  /* the bonus is off: no points section */
  assert.equal('points' in r, false);
  /* assets: A's five feed posts, uploaded by Sarah (5 × 1), B's logo typed for Rizky (1 × 5) — as GET /api/scoring/assets */
  assert.deepEqual([r.assets.assets, r.assets.points, r.assets.tasks, r.assets.validatedPoints], [6, 10, 2, 0]);
  assert.deepEqual(r.assets.byWeek, [null, { assets: 6, points: 10 }]);
  const pts = await ok(await s.req('GET', '/api/scoring/assets?' + new URLSearchParams({ project: proj, from: r.from, to: r.to }), undefined, s.admin));
  assert.equal(r.assets.points, pts.total.points); assert.equal(r.assets.assets, pts.total.assets); assert.equal(r.assets.tasks, pts.total.tasks);
  /* the KPI: 6 of 10 */
  const kpi = r.outcomes.kpis.find(m => m.title === 'Tasks delivered');
  assert.deepEqual([kpi.actual, kpi.progress.value, kpi.progress.reason], [6, 0.6, null]);
  assert.equal('objectives' in r.outcomes, false, 'OKR is off');
  /* people, in name order, each with their own figures side by side */
  const people = r.people.filter(p => ['sarah', 'rizky'].includes(p.userId));
  assert.deepEqual(r.people.map(p => p.userId).filter(id => ['sarah', 'rizky'].includes(id)), ['sarah', 'rizky'].sort((a, b) => s.boot.people[a].name.localeCompare(s.boot.people[b].name)));
  const P = id => people.find(p => p.userId === id);
  assert.deepEqual(P('sarah'), { userId: 'sarah', name: s.boot.people.sarah.name, tasks: 4, loggedHours: 9.5, velocity: 10, assetPoints: 5 });
  assert.deepEqual(P('rizky'), { userId: 'rizky', name: s.boot.people.rizky.name, tasks: 3, loggedHours: 6.5, velocity: 7, assetPoints: 5 });

  /* a member: their own tasks only (A, B, E, F), a shared task's hours counted half */
  r = await ok(await k.an(sarah, q));
  assert.equal(r.scope, 'own'); assert.equal(r.throughput.tasks, 4);
  assert.deepEqual([r.estimates.verified.tasks, r.estimates.unverified.tasks, r.estimates.notEstimated, r.estimates.noTimeLogged], [2, 0, 1, 1]);
  assert.deepEqual([r.velocity.total, r.velocity.shared], [10, true]);
  assert.deepEqual([r.assets.points, r.assets.assets], [5, 5]);
  assert.equal(r.outcomes.kpis.length >= 1, true, 'KPIs are the workspace\'s, readable by everyone on the team');
  r = await ok(await k.an(maya, q));
  assert.equal(r.throughput.tasks, 0);
  assert.deepEqual(r.estimates.verified.accuracy, { tasks: 0, medianError: null, within: 0, over: 0, under: 0, withinShare: null }, 'nothing to measure: no percentage');
  assert.equal(r.review.firstPassShare, null); assert.equal(r.velocity.total, 0); assert.deepEqual(r.velocity.byWeek, [null, null]);
  /* the team's holder asks for one person */
  r = await ok(await k.an(s.admin, Object.assign({ person: 'rizky' }, q)));
  assert.deepEqual([r.scope, r.filters.person, r.throughput.tasks, r.people.map(p => p.userId)], ['team', 'rizky', 3, ['rizky']]);
  assert.deepEqual([r.velocity.total, r.assets.points], [7, 5]);
  /* filters: the estimate's status, the team */
  const count = async extra => (await ok(await k.an(s.admin, Object.assign({}, q, extra)))).throughput.tasks;
  assert.deepEqual([await count({ status: 'approved' }), await count({ status: 'locked' }), await count({ status: 'not_locked' }), await count({ status: 'unverified' }), await count({ status: 'any' })], [3, 3, 3, 1, 6]);
  assert.equal(await count({ team: 'design' }), 6);
  const other = (s.boot.teams || []).find(x => x.id !== 'design'); if (other) assert.equal(await count({ team: other.id }), 0);
  /* a period that ended before the work: nothing, and no percentages */
  r = await ok(await k.an(s.admin, { project: proj, from: '2026-01-05', to: '2026-01-18' }));
  assert.deepEqual([r.throughput.tasks, r.estimates.verified.accuracy.withinShare, r.review.firstPassShare], [0, null, null]);

  /* the efficiency bonus switched on (as the bonus phase will let an admin do): approved base and bonus apart, waiting
     apart again, the distribution over awards, the reviewers' quality */
  const db2 = dbAt(s.dir);
  try {
    const row = db2.prepare("SELECT id, scoring_settings AS v FROM workspaces").all().find(x => x.v && JSON.parse(x.v).enabled);
    const v = JSON.parse(row.v); v.bonus.on = true; db2.prepare("UPDATE workspaces SET scoring_settings=? WHERE id=?").run(JSON.stringify(v), row.id);
  } finally { db2.close(); }
  r = await ok(await k.an(s.admin, q));
  assert.equal(r.on.bonus, true);
  assert.deepEqual(r.points.approved, { base: 6.5, bonus: 0.45, awards: 2, bonusShare: 0.0647 });
  assert.deepEqual(r.points.pending, { base: 1.5, bonus: 0.1, awards: 1 });
  assert.deepEqual(r.points.other, { rejected: 1, revoked: 0, ineligible: 0 });
  assert.deepEqual(r.points.distribution.map(x => x.awards), [1, 0, 1, 0, 0, 0], 'A at 9 %, B with no bonus');
  assert.deepEqual(r.points.quality, { scored: 1, average: 4 });
  assert.deepEqual(r.points.byWeek, [null, { base: 6.5, bonus: 0.45, awards: 2 }]);
  assert.deepEqual([P2(r, 'sarah'), P2(r, 'rizky')], [[6.5, 0.45, 0], [0, 0, 1.6]]);
  r = await ok(await k.an(sarah, q));
  assert.deepEqual([r.points.approved.base, r.points.approved.bonus, r.points.pending.awards], [6.5, 0.45, 0], 'their own awards only');
  r = await ok(await k.an(rizky, q));
  assert.deepEqual([r.points.approved.awards, r.points.pending.base, r.points.pending.bonus, r.points.other.rejected], [0, 1.5, 0.1, 1]);

  /* a module off: its section is gone; the team's holder still reads its history */
  await k.set(x => { x.modules.assets.on = false; x.modules.kpi.on = false; x.modules.story.on = true; x.primaryCapacity = 'story_points'; });
  r = await ok(await k.an(s.admin, q));
  assert.equal('assets' in r, false); assert.equal('outcomes' in r, false);
  assert.deepEqual(Object.keys(r.sources), ['hours', 'story']); assert.equal(r.sources.story.notScored, 6);
  assert.deepEqual([r.velocity.module, r.velocity.unit, r.velocity.total, r.velocity.unscored], ['story', 'story_points', 0, 6]);
  r = await ok(await k.an(s.admin, Object.assign({ history: '1' }, q)));
  assert.deepEqual([r.assets.off, r.assets.points, r.outcomes.off.kpi, r.outcomes.kpis.length >= 1], [true, 10, true, true]);
  r = await ok(await k.an(sarah, Object.assign({ history: '1' }, q)));
  assert.equal('assets' in r, false, 'a member does not read a switched-off module');
  await k.set(x => { x.modules.hours.on = false; x.modules.story.on = false; });
  r = await ok(await k.an(s.admin, q));
  assert.deepEqual([('estimates' in r), ('velocity' in r), ('sources' in r)], [false, false, false]);
  assert.equal(r.throughput.tasks, 6, 'throughput and review are always there');
  r = await ok(await k.an(s.admin, Object.assign({ history: '1' }, q)));
  assert.deepEqual([r.estimates.off, r.estimates.verified.tasks, r.velocity.off, r.sources.hours.off], [true, 2, true, true]);
});
function P2(r, id) { const p = r.people.find(x => x.userId === id); return [p.basePoints, p.bonusPoints, p.pendingPoints]; }

/* Fast on a few thousand tasks: the route's queries, in this process, on a database made from db/schema.sql */
test('it stays fast on a few thousand tasks', { timeout: 60000 }, () => {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8'));
  const W = 'ws_perf', now = Date.now(), iso = ms => new Date(ms).toISOString();
  db.prepare("INSERT INTO workspaces (id, name) VALUES (?,?)").run(W, 'Perf');
  const st = db.prepare("INSERT INTO task_statuses (id, workspace_id, name, sort_order, is_completed) VALUES (?,?,?,?,?)");
  st.run('todo', W, 'To do', 1, 0); st.run('done', W, 'Done', 2, 1); st.run('declined', W, 'Declined', 3, 1);
  db.prepare("INSERT INTO roles (id, workspace_id, name, permissions) VALUES (?,?,?,?)").run('member', W, 'Member', '[]');
  const people = Array.from({ length: 30 }, (_, i) => 'u' + i);
  const us = db.prepare("INSERT INTO users (id, email, name) VALUES (?,?,?)"), wm = db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role_id) VALUES (?,?,?,?)");
  people.forEach((id, i) => { us.run(id, id + '@perf.test', 'Person ' + String(i).padStart(2, '0')); wm.run('wm_' + id, W, id, 'member'); });
  const N = 4000;
  const tk = db.prepare("INSERT INTO tasks (id, workspace_id, title, status_id, assignee_id, assignees, estimated_minutes, asset_count, completed_at, meta) VALUES (?,?,?,?,?,?,?,?,?,?)");
  const sc = db.prepare("INSERT INTO task_scoring (task_id, module, workspace_id, final_value, source, status, locked_value) VALUES (?,?,?,?,?,?,?)");
  const te = db.prepare("INSERT INTO task_time_entries (id, workspace_id, task_id, user_id, work_date, minutes, kind, source, created_at) VALUES (?,?,?,?,?,?,?,?,?)");
  const fv = db.prepare("INSERT INTO file_versions (id, task_id, version_number, uploaded_by, created_at) VALUES (?,?,?,?,?)");
  const ap = db.prepare("INSERT INTO approvals (id, task_id, version_id, decision, created_at) VALUES (?,?,?,?,?)");
  const rr = db.prepare("INSERT INTO revision_requests (id, task_id, version_id, reason, created_at) VALUES (?,?,?,?,?)");
  const aw = db.prepare("INSERT INTO task_efficiency_awards (id, workspace_id, task_id, user_id, base_points, bonus_points, awarded_points, status, created_at) VALUES (?,?,?,?,?,?,?,?,?)");
  const au = db.prepare("INSERT INTO scoring_audit (id, workspace_id, task_id, module, action, actor_id, new_value, created_at) VALUES (?,?,?,?,?,?,?,?)");
  const titles = ['Feed post', 'Logo concept', 'Resize banner', 'Carousel promo', 'Story set', 'Video teaser'];
  db.exec('BEGIN');
  for (let i = 0; i < N; i++) {
    const id = 't' + i, a = people[i % people.length], b = people[(i + 7) % people.length], done = iso(now - (i % 360) * 86400000);
    tk.run(id, W, titles[i % titles.length] + ' ' + i, i % 10 === 0 ? 'todo' : 'done', a, JSON.stringify(i % 3 ? [a] : [a, b]), 60 * (1 + i % 8), i % 5, i % 10 === 0 ? null : done, JSON.stringify({ assetSplit: i % 4 ? undefined : { [a]: i % 5 }, brief: 'x'.repeat(200) }));
    sc.run(id, 'hours', W, 1 + i % 8, ['math', 'manual', 'legacy', 'ai'][i % 4], ['approved', 'locked', 'draft', 'unverified'][i % 4], i % 4 < 2 ? 1 + i % 8 : null);
    sc.run(id, 'story', W, [1, 2, 3, 5, 8, 13][i % 6], 'math', 'draft', null);
    for (let j = 0; j < 3; j++) te.run('e' + i + '_' + j, W, id, a, done.slice(0, 10), 30 + (i * 7 + j * 13) % 200, ['work', 'revision', 'blocked'][j], 'manual', done);
    fv.run('v' + i, id, 1, a, iso(now - (i % 360) * 86400000 - 7200000));
    if (i % 2) ap.run('a' + i, id, 'v' + i, 'approved', done); else rr.run('r' + i, id, 'v' + i, 'Again', done);
    aw.run('w' + i, W, id, a, 1 + i % 8, (i % 8) * 0.05, 1 + i % 8 + (i % 8) * 0.05, ['approved', 'pending_review', 'provisional', 'rejected'][i % 4], done);
    au.run('s' + i, W, id, 'hours', 'changed', a, JSON.stringify({ value: 2, source: 'manual' }), done);
  }
  db.exec('COMMIT');
  const S = require('../shared/scoring-settings.js');
  const settings = S.normalizeSettings({ enabled: true, modules: { hours: { on: true }, story: { on: true }, assets: { on: true }, kpi: { on: true } }, primaryCapacity: 'story_points' });
  settings.bonus.on = true;
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const routes = {}, route = (m, p, fn) => { routes[m + ' ' + p] = fn; };
  const scoring = { featureOn: () => true, settings: () => settings, isOn: () => true, moduleOn: id => !!(settings.modules[id] && settings.modules[id].on) };
  const can = { scoringViewAnalytics: u => u.role === 'admin' };
  const mod = require('../server/scoring-analytics.js')(db, W, { route, HttpError, forbid: (ok, what) => { if (!ok) throw new HttpError(403, what); }, can, scoring, outcomes: { state: () => ({ objectives: [], metrics: [] }) } });
  assert.equal(typeof mod.compute, 'function');
  const get = routes['GET /api/scoring/analytics'];
  get({ id: 'u1', role: 'admin' }, {}, { weeks: '4' });   /* warm up */
  const t0 = process.hrtime.bigint();
  const r = get({ id: 'u1', role: 'admin' }, {}, { weeks: '52' });
  const ms = Number(process.hrtime.bigint() - t0) / 1e6;
  const done = Array.from({ length: N }, (_, i) => i).filter(i => i % 10 !== 0 && (i % 360) < 52 * 7 - 7).length;
  assert.ok(r.throughput.tasks >= done, 'every task of the year: ' + r.throughput.tasks + ' of at least ' + done);
  assert.ok(r.people.length > 20 && r.people.length <= people.length, r.people.length + ' people');
  assert.deepEqual(r.people.map(p => p.name), r.people.map(p => p.name).slice().sort((a, b) => a.localeCompare(b)), 'in name order');
  assert.ok(r.estimates.verified.tasks > 1000 && r.points.approved.awards > 500 && r.assets.tasks > 1000 && r.review.reviewed === r.throughput.tasks);
  const own = get({ id: 'u3', role: 'member' }, {}, { weeks: '52' });
  assert.ok(own.throughput.tasks > 0 && own.throughput.tasks < r.throughput.tasks);
  assert.ok(ms < 2500, 'a year of ' + r.throughput.tasks + ' tasks took ' + Math.round(ms) + ' ms');
  console.log('# scoring analytics: a year of ' + r.throughput.tasks + ' tasks in ' + Math.round(ms) + ' ms');
  db.close();
});
