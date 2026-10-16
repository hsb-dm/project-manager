/* KPIs and OKRs on the real server (Oct 2026, server/outcomes.js, docs/SMART-SCORING.md §11). Progress comes only from
   evidence or from a value entered by hand with a reason: with no evidence there is no progress; a task's lead-validated
   assets count once it is finished, once — a validation changed later changes what it adds, a validation withdrawn or
   the task reopened takes it back; a successful completion counts 1 (Declined does not); a metric that goes down is
   brought down by its evidence; a metric with nothing to measure against has no progress and says why; an objective
   is its key results weighted, a key result weighing 0 left out. KPI and OKR are switched separately: a write needs its
   own switch, what is there stays readable, and nothing is counted while a switch is off — it is all counted when it
   comes back on. Every write carries its version (stale → 409); every change is audited. Members read, managers
   (scoring_manage_outcomes) write; a task's editor links it, a manager confirms the link before it counts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-outcomes-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at, env) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Outc!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'outc-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'outc-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_SCORING: '' }, env || {}) });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 15000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Outc!Admin234567');
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const as = async id => { const r = await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); assert.ok(r.ok, await r.text()); return login(boot.people[id].email, 'Member!Pass2345'); };
  const s = { req, admin, as, boot, stop, me: Object.keys(boot.people).find(id => boot.people[id].perm === 'admin') }; at.servers.push(s); return s;
}
const ok = async r => { r = await r; const t = await r.text(); assert.ok(r.ok, r.status + ' ' + t); return t ? JSON.parse(t) : {}; };
const err = async (r, status, re) => { r = await r; const t = await r.text(); assert.equal(r.status, status, t); if (re) assert.match(JSON.parse(t).error, re); };
/* Smart Scoring on, with the KPI and OKR switches as asked */
async function switches(s, o) {
  const cur = (await ok(await s.req('GET', '/api/scoring/settings', undefined, s.admin))).settings, next = JSON.parse(JSON.stringify(cur));
  next.enabled = o.enabled !== false; next.modules.kpi.on = !!o.kpi; next.modules.okr.on = !!o.okr;
  return ok(await s.req('PUT', '/api/scoring/settings', { settings: next, configVersion: cur.configVersion }, s.admin));
}
const all = (s, who) => ok(s.req('GET', '/api/outcomes', undefined, who || s.admin));
const metric = async (s, id, who) => (await all(s, who)).metrics.find(m => m.id === id);
const create = async (s, body, who) => { const r = await ok(await s.req('POST', '/api/outcomes/metrics', body, who || s.admin)); return r.metrics.find(m => m.id === r.id); };
const move = (s, id, to) => ok(s.req('POST', '/api/tasks/' + id + '/move', { type: 'MOVE_TASK_STATUS', toStatusId: to }, s.admin));
async function edit(s, id, fn, who) { const d = await ok(await s.req('GET', '/api/tasks/' + id, undefined, who || s.admin)); fn(d); return ok(await s.req('PUT', '/api/tasks/' + id, d, who || s.admin)); }
async function project(s, name) { const list = await ok(await s.req('POST', '/api/projects', { name, status: 'active' }, s.admin)); return list.find(p => p.name === name).id; }
async function task(s, o) { return (await ok(await s.req('POST', '/api/tasks', Object.assign({ status: 'progress', prio: 'medium', assignee: s.me, assignees: [s.me], reviewer: s.me }, o), s.admin))).id; }

test('no evidence, no progress; validated assets counted once, changed with the validation, taken back when it is withdrawn or the task reopens; completions; manual values; versions', { timeout: 150000 }, async t => {
  const s = await start(place(t));
  await switches(s, { kpi: true, okr: true });
  const P = await project(s, 'Outcomes test');
  let k = await create(s, { kind: 'kpi', title: 'Approved assets this month', unit: 'assets', baseline: 0, target: 10, rule: { type: 'approved_assets', filter: { project: P } } });
  assert.equal(k.rev, 1); assert.equal(k.source, 'evidence');
  assert.deepEqual([k.evidence.count, k.actual, k.progress.value], [0, 0, 0], 'no evidence: no progress');
  assert.equal(k.progress.steps[0].key, 'Nothing has been counted yet.');

  /* a task in the project with 4 assets: counted only once it is validated by a lead and finished */
  const T1 = await task(s, { title: 'Feed set', proj: P, meta: { assetSplit: { [s.me]: 4 } } });
  assert.equal((await metric(s, k.id)).evidence.count, 0, 'not validated, not finished');
  await edit(s, T1, d => { d.meta.assetSplitOk = { split: d.meta.assetSplit }; });
  assert.equal((await metric(s, k.id)).actual, 0, 'validated but not finished');
  await move(s, T1, 'done');
  k = await metric(s, k.id);
  assert.deepEqual([k.evidence.count, k.evidence.total, k.actual, k.progress.value], [1, 4, 4, 0.4], 'validated and finished: 4 of 10');
  await edit(s, T1, d => { d.title = 'Feed set (final)'; });
  assert.equal((await metric(s, k.id)).actual, 4, 'counted once, however often the task is saved');

  /* a count changed after validation still adds what was validated; validated again, the new total */
  await edit(s, T1, d => { d.meta.assetSplit[s.me] = 6; });
  assert.equal((await metric(s, k.id)).actual, 4, 'changed since validation: the validated 4');
  await edit(s, T1, d => { d.meta.assetSplitOk = { again: true }; });
  assert.equal((await metric(s, k.id)).actual, 6, 'validated again: 6');
  /* withdrawn: taken back; validated again: back */
  await edit(s, T1, d => { delete d.meta.assetSplitOk; });
  k = await metric(s, k.id); assert.deepEqual([k.evidence.count, k.actual], [0, 0], 'withdrawn validation revokes it');
  await edit(s, T1, d => { d.meta.assetSplitOk = { split: d.meta.assetSplit }; });
  assert.equal((await metric(s, k.id)).actual, 6);
  /* reopened: taken back; finished again: back */
  await move(s, T1, 'progress');
  assert.equal((await metric(s, k.id)).actual, 0, 'a reopened task revokes its count');
  await move(s, T1, 'done');
  assert.equal((await metric(s, k.id)).actual, 6);
  /* a second task; one outside the project is not counted */
  const T2 = await task(s, { title: 'Banner', proj: P, meta: { assetSplit: { [s.me]: 3 } } });
  const T3 = await task(s, { title: 'Elsewhere', meta: { assetSplit: { [s.me]: 9 } } });
  for (const id of [T2, T3]) { await edit(s, id, d => { d.meta.assetSplitOk = { split: d.meta.assetSplit }; }); await move(s, id, 'done'); }
  k = await metric(s, k.id);
  assert.deepEqual([k.evidence.count, k.actual, k.progress.value], [2, 9, 0.9]);

  /* the evidence and the history behind it */
  const detail = await ok(await s.req('GET', '/api/outcomes/metrics/' + k.id, undefined, s.admin));
  assert.deepEqual(detail.evidence.filter(e => e.status === 'counted').map(e => [e.taskId, e.contribution]).sort(), [[T1, 6], [T2, 3]].sort());
  const actions = detail.audit.filter(a => a.taskId === T1).map(a => a.action);
  for (const a of ['evidence_counted', 'evidence_updated', 'evidence_revoked']) assert.ok(actions.includes(a), a + ' is in the history');
  assert.ok(detail.audit.some(a => a.action === 'evidence_revoked' && a.why === 'not_completed'), 'the reopen says why');
  assert.ok(detail.values.some(v => v.source === 'evidence' && v.value === 9), 'the actual is kept as its history');

  /* completions: 1 each, Declined is not a success */
  let c = await create(s, { kind: 'kpi', title: 'Tasks finished', baseline: 0, target: 4, rule: { type: 'tasks_completed', filter: { project: P } } });
  assert.deepEqual([c.evidence.count, c.actual, c.progress.value], [2, 2, 0.5], 'an existing metric counts what is already there');
  await move(s, T2, 'declined');
  c = await metric(s, c.id); assert.equal(c.actual, 1, 'declined is not a successful completion');
  assert.equal((await metric(s, k.id)).actual, 6, 'nor are its assets counted');
  /* a metric that goes down: each completion brings it towards its target */
  const burn = await create(s, { kind: 'kpi', title: 'Backlog left', direction: 'down', baseline: 10, target: 0, rule: { type: 'tasks_completed', filter: { project: P } } });
  assert.deepEqual([burn.actual, burn.progress.value], [9, 0.1]);

  /* versions: a save made on an older one is refused */
  const r1 = await ok(await s.req('PUT', '/api/outcomes/metrics/' + k.id, { target: 20, rev: k.rev }, s.admin));
  assert.equal(r1.metrics.find(m => m.id === k.id).progress.value, 0.3);
  await err(await s.req('PUT', '/api/outcomes/metrics/' + k.id, { target: 30, rev: k.rev }, s.admin), 409, /Someone else changed this KPI/);
  await err(await s.req('PUT', '/api/outcomes/metrics/' + k.id, { target: 30 }, s.admin), 400, /rev/);

  /* a value by hand: only on a manual metric, only with a reason, audited; it is the current reading */
  let m = await create(s, { kind: 'kpi', title: 'Client satisfaction', baseline: 7.2, target: 8.5, rule: { type: 'manual' } });
  assert.deepEqual([m.progress.value, m.progress.reason, m.source], [null, 'no_value', 'manual'], 'no value yet: no progress, and why');
  await err(await s.req('POST', '/api/outcomes/metrics/' + m.id + '/value', { value: 7.9 }, s.admin), 400, /reason/);
  await err(await s.req('POST', '/api/outcomes/metrics/' + m.id + '/value', { value: 'lots', reason: 'x' }, s.admin), 400, /number/);
  await err(await s.req('POST', '/api/outcomes/metrics/' + k.id + '/value', { value: 50, reason: 'more' }, s.admin), 409, /from evidence/);
  await ok(await s.req('POST', '/api/outcomes/metrics/' + m.id + '/value', { value: 7.9, reason: 'October survey' }, s.admin));
  m = await metric(s, m.id);
  assert.equal(m.actual, 7.9); assert.equal(Math.round(m.progress.value * 1000), 538); assert.equal(m.manual.reason, 'October survey'); assert.equal(m.manual.by, s.me);
  const mh = await ok(await s.req('GET', '/api/outcomes/metrics/' + m.id, undefined, s.admin));
  assert.ok(mh.audit.some(a => a.action === 'manual_value' && a.to === 7.9 && a.reason === 'October survey' && a.by === s.me), 'audited with the reason');
  /* decreasing by hand, clamped to 0–100%; a target equal to the baseline measures nothing */
  const down = await create(s, { kind: 'kpi', title: 'Revision rounds', direction: 'down', baseline: 3, target: 1, rule: { type: 'manual' } });
  for (const [v, p] of [[2, 0.5], [4, 0], [0.5, 1]]) { await ok(await s.req('POST', '/api/outcomes/metrics/' + down.id + '/value', { value: v, reason: 'monthly review' }, s.admin)); assert.equal((await metric(s, down.id)).progress.value, p, 'value ' + v); }
  const flat = await create(s, { kind: 'kpi', title: 'Flat', baseline: 5, target: 5, rule: { type: 'tasks_completed', filter: { project: P } } });
  assert.deepEqual([flat.progress.value, flat.progress.reason], [null, 'zero_range']);
  const noTarget = await create(s, { kind: 'kpi', title: 'No target', rule: { type: 'tasks_completed', filter: { project: P } } });
  assert.deepEqual([noTarget.progress.value, noTarget.progress.reason], [null, 'missing_data']);
  await err(await s.req('POST', '/api/outcomes/metrics', { kind: 'kpi', title: 'Bad period', period: { start: '2026-10-31', end: '2026-10-01' } }, s.admin), 400, /ends before/);
  await err(await s.req('POST', '/api/outcomes/metrics', { kind: 'kpi', title: '' }, s.admin), 400, /title/);

  /* a period: a task counts on the day it was finished */
  const past = await create(s, { kind: 'kpi', title: 'Last year', baseline: 0, target: 5, period: { start: '2025-01-01', end: '2025-12-31' }, rule: { type: 'tasks_completed', filter: { project: P } } });
  assert.equal(past.actual, 0, 'nothing finished then');
  const view = await ok(await s.req('GET', '/api/tasks/' + T1 + '/outcomes', undefined, s.admin));
  assert.ok(view.items.some(i => i.metric.id === k.id && i.counts && i.evidence.contribution === 6), 'the task shows what it adds');

  /* deleted: gone, the audit keeps it */
  await ok(await s.req('DELETE', '/api/outcomes/metrics/' + flat.id, undefined, s.admin));
  assert.equal(await metric(s, flat.id), undefined);
});

test('KPI and OKR are switched separately; an objective is its key results by weight; nothing counted while off, all of it when back on', { timeout: 120000 }, async t => {
  const s = await start(place(t));
  /* off: everything refused, nothing lost */
  await err(await s.req('POST', '/api/outcomes/metrics', { kind: 'kpi', title: 'X' }, s.admin), 409, /switched off for this workspace/);
  await switches(s, { kpi: true, okr: false });
  const P = await project(s, 'Switches');
  const kpi = await create(s, { kind: 'kpi', title: 'Finished', baseline: 0, target: 2, rule: { type: 'tasks_completed', filter: { project: P } } });
  await err(await s.req('POST', '/api/outcomes/objectives', { title: 'Q4' }, s.admin), 409, /OKRs are switched off/);
  /* OKR on, KPI off: the KPI stays readable but cannot change, and counts nothing */
  await switches(s, { kpi: false, okr: true });
  const st = await all(s);
  assert.deepEqual([st.on.kpi, st.on.okr], [false, true]);
  assert.ok(st.metrics.some(m => m.id === kpi.id), 'history stays readable');
  await err(await s.req('PUT', '/api/outcomes/metrics/' + kpi.id, { target: 5, rev: kpi.rev }, s.admin), 409, /KPIs are switched off/);
  await err(await s.req('POST', '/api/outcomes/metrics', { kind: 'kpi', title: 'Y' }, s.admin), 409, /KPIs are switched off/);
  const T = await task(s, { title: 'Finished while off', proj: P });
  await move(s, T, 'done');
  assert.equal((await metric(s, kpi.id)).actual, 0, 'nothing counted while the KPI switch is off');

  /* an objective with weighted key results */
  const o = await ok(await s.req('POST', '/api/outcomes/objectives', { title: 'Q4 launch', period: { start: '2026-10-01', end: '2026-12-31' } }, s.admin));
  const obj = o.id;
  await err(await s.req('POST', '/api/outcomes/metrics', { kind: 'kr', title: 'Orphan', rule: { type: 'manual' } }, s.admin), 400, /objective/);
  const kr = async (title, weight, value, extra) => { const m = await create(s, Object.assign({ kind: 'kr', objective: obj, title, weight, baseline: 0, target: 100, rule: { type: 'manual' } }, extra || {})); if (value != null) await ok(await s.req('POST', '/api/outcomes/metrics/' + m.id + '/value', { value, reason: 'measured' }, s.admin)); return m; };
  const objective = async () => (await all(s)).objectives.find(x => x.id === obj);
  assert.deepEqual([(await objective()).progress.value, (await objective()).progress.reason], [null, 'no_key_results']);
  await kr('Reach', 3, 50);
  await kr('Launch posts', 1, 100);
  assert.equal((await objective()).progress.value, 0.625, '(3 × 50% + 1 × 100%) ÷ 4');
  await kr('Nice to have', 0, 0);
  let ob = await objective();
  assert.equal(ob.progress.value, 0.625, 'a key result weighing 0 is not counted');
  assert.ok(ob.progress.steps.some(x => x.key === '1 key result weighs 0 and is not counted.'));
  await kr('Draft idea', 5, 0, { status: 'draft' });
  assert.equal((await objective()).progress.value, 0.625, 'a draft is not counted');
  await kr('Not measured yet', 2, null);
  ob = await objective();
  assert.equal(ob.progress.value, 0.625, 'a key result with no value yet is left out, and said so');
  assert.equal(ob.progress.ignored, 1);
  assert.equal(ob.keyResults.length, 5);
  /* an objective with key results goes only with them, when asked */
  await err(await s.req('DELETE', '/api/outcomes/objectives/' + obj, undefined, s.admin), 409, /key results/);

  /* the KPI back on: what happened while it was off is counted now */
  await switches(s, { kpi: true, okr: true });
  assert.equal((await metric(s, kpi.id)).actual, 1, 'counted when the switch came back on');
  await ok(await s.req('DELETE', '/api/outcomes/objectives/' + obj + '?cascade=1', undefined, s.admin));
  const after = await all(s);
  assert.equal(after.objectives.length, 0); assert.equal(after.metrics.filter(m => m.kind === 'kr').length, 0);
  /* the master switch off: everything refused again, still readable */
  await switches(s, { enabled: false, kpi: true, okr: true });
  await err(await s.req('PUT', '/api/outcomes/metrics/' + kpi.id, { target: 5, rev: (await metric(s, kpi.id)).rev }, s.admin), 409, /switched off for this workspace/);
  assert.equal((await all(s)).on.enabled, false);
});

test('who reads, who writes, who links and who confirms; the server switch', { timeout: 150000 }, async t => {
  const at = place(t), s = await start(at);
  await switches(s, { kpi: true, okr: true });
  const ids = Object.keys(s.boot.people), by = perm => ids.filter(id => s.boot.people[id].perm === perm && !s.boot.people[id].stakeholder);
  const [sarah, maya] = by('member'), nadia = ids.find(id => s.boot.people[id].stakeholder);
  assert.ok(sarah && maya && nadia);
  const m = await s.as(sarah), mm = await s.as(maya), st = await s.as(nadia);
  const P = await project(s, 'Links');
  /* members read; stakeholders do not; nobody without the permission writes */
  assert.ok((await all(s, m)).metrics);
  await err(await s.req('GET', '/api/outcomes', undefined, st), 403);
  await err(await s.req('POST', '/api/outcomes/metrics', { kind: 'kpi', title: 'Mine' }, m), 403);
  await err(await s.req('POST', '/api/outcomes/objectives', { title: 'Mine' }, m), 403);
  /* given the permission, they do */
  await ok(await s.req('PUT', '/api/members/' + maya + '/cap-grants', { caps: ['scoring_manage_outcomes'] }, s.admin));
  const kpi = await create(s, { kind: 'kpi', title: 'Linked work', baseline: 0, target: 3, rule: { type: 'tasks_completed', scope: 'linked' } }, mm);
  await err(await s.req('POST', '/api/outcomes/metrics/' + kpi.id + '/value', { value: 1, reason: 'x' }, m), 403);
  /* the assignee links their task: it waits for a manager and counts nothing yet */
  const T = (await ok(await s.req('POST', '/api/tasks', { title: 'Sarah\'s task', proj: P, status: 'progress', prio: 'medium', assignee: sarah, assignees: [sarah], reviewer: s.me }, s.admin))).id;
  await move(s, T, 'done');
  let v = await ok(await s.req('POST', '/api/tasks/' + T + '/outcomes', { metricId: kpi.id }, m));
  let item = v.items.find(i => i.metric.id === kpi.id);
  assert.deepEqual([item.link.confirmed, item.counts, item.why], [false, false, 'waiting_confirmation']);
  assert.equal((await metric(s, kpi.id)).actual, 0, 'an unconfirmed link counts nothing');
  await err(await s.req('POST', '/api/tasks/' + T + '/outcomes', { metricId: kpi.id }, m), 409, /already linked/);
  /* someone who cannot edit the task cannot link it; nor confirm without the permission */
  const other = by('member').find(id => ![sarah, maya].includes(id)), o = await s.as(other);
  await err(await s.req('POST', '/api/tasks/' + T + '/outcomes', { metricId: kpi.id }, o), 403);
  await err(await s.req('POST', '/api/tasks/' + T + '/outcomes/' + item.link.id + '/confirm', {}, m), 403);
  /* a manager confirms: it counts */
  v = await ok(await s.req('POST', '/api/tasks/' + T + '/outcomes/' + item.link.id + '/confirm', {}, mm));
  item = v.items.find(i => i.metric.id === kpi.id);
  assert.deepEqual([item.link.confirmed, item.counts], [true, true]);
  assert.equal((await metric(s, kpi.id)).actual, 1);
  /* a confirmed link is removed by a manager only; removed, its count goes */
  await err(await s.req('DELETE', '/api/tasks/' + T + '/outcomes/' + item.link.id, undefined, m), 403);
  await ok(await s.req('DELETE', '/api/tasks/' + T + '/outcomes/' + item.link.id, undefined, mm));
  assert.equal((await metric(s, kpi.id)).actual, 0);
  /* a manager's own link counts at once; the history says who */
  v = await ok(await s.req('POST', '/api/tasks/' + T + '/outcomes', { metricId: kpi.id }, mm));
  assert.equal(v.items.find(i => i.metric.id === kpi.id).counts, true);
  const h = await ok(await s.req('GET', '/api/outcomes/metrics/' + kpi.id, undefined, m));
  assert.ok(['task_linked', 'link_confirmed', 'task_unlinked', 'metric_created'].every(a => h.audit.some(x => x.action === a)), 'every step audited');
  assert.ok(h.audit.some(x => x.action === 'task_linked' && x.by === sarah) && h.audit.some(x => x.action === 'link_confirmed' && x.by === maya));
  await err(await s.req('GET', '/api/tasks/' + T + '/outcomes', undefined, st), 403);
  await s.stop();
  /* the feature off on the server: 409, the data kept */
  const off = await start(at, { COS_SCORING: '0' });
  await err(await off.req('GET', '/api/outcomes', undefined, off.admin), 409, /turned off on this server/);
});

/* a task's Smart Scoring view carries its KPI and key-result links while either switch is on (server.js extendView) */
test('a task\'s scoring view shows its outcome links while KPI or OKR is on, and nothing about them while both are off', { timeout: 120000 }, async t => {
  const s = await start(place(t));
  await switches(s, { kpi: true, okr: false });
  const id = await task(s, { title: 'Outcome view ' + Date.now() });
  const k = await create(s, { kind: 'kpi', title: 'Linked in the view', unit: 'tasks', baseline: 0, target: 4, rule: { type: 'tasks_completed', scope: 'linked' } });
  await ok(s.req('POST', '/api/tasks/' + id + '/outcomes', { metricId: k.id }, s.admin));
  let v = await ok(s.req('GET', '/api/tasks/' + id + '/scoring', undefined, s.admin));
  assert.ok(v.outcomes, 'the block is there');
  assert.deepEqual(v.outcomes.items.map(it => it.metric.id), [k.id], 'with the linked KPI');
  assert.equal(v.outcomes.on.kpi, true);
  await switches(s, { kpi: false, okr: false });
  v = await ok(s.req('GET', '/api/tasks/' + id + '/scoring', undefined, s.admin));
  assert.equal(v.outcomes, undefined, 'both off: no block');
});
