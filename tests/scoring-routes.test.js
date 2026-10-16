/* A task's Smart Scoring on the real server (Oct 2026, server/scoring.js, docs/SMART-SCORING.md §5.2). Who sees a task's
   scores and who changes them — per role and per extra permission; an assignee never locks or approves their own
   estimate, an admin included while assigned, unless the workspace allows it, and nobody does while acting as someone
   else. Calculate gives the engine's numbers for real tasks, from the title's kind of work, the asset count and the
   open dependencies, and suggests the Scope rating from the asset count. A locked estimate cannot be changed through the
   task's own save, the grid's merge, a history restore or an old slim copy; work starting first freezes it as an
   unapproved baseline; a scope change asks for a new baseline and a re-baseline keeps the old one in the audit. While
   Smart Scoring logs time the Actual stays the time log's. Stale revisions answer 409; a module or Smart Scoring off
   refuses changes and still shows the history; COS_SCORING=0 answers 409. The backfill runs once, on the demo seed, in
   this workspace only; the hooks other modules register run after every task write, and one that throws does not stop
   a save; deleting a task leaves "removed with task" in the audit; the sweep at start catches up. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const S = require('../shared/scoring-engine.js');
const D = S.defaults();
const root = path.join(__dirname, '..');

function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-scoring-routes-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at, env, preload) {
  const args = ['--no-warnings'].concat(preload ? ['-r', preload] : [], ['server/server.js']);
  const child = spawn(process.execPath, args, { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Score!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'score-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'score-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_SCORING: '', COS_ALLOW_IMPERSONATION: '1' }, env || {}) });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 15000); const look = () => { const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }; child.stdout.on('data', look); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c, h) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}, h || {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Score!Admin234567');
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const cookies = {};
  const as = async id => { if (cookies[id]) return cookies[id]; const r = await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); assert.ok(r.ok, await r.text()); return (cookies[id] = await login(boot.people[id].email, 'Member!Pass2345')); };
  const s = { req, admin, as, boot, stop, dir: at.dir, log: () => out }; at.servers.push(s); return s;
}
const json = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { raw: t }; } };
const dbAt = dir => new DatabaseSync(path.join(dir, 'creative-os.db'));
const wait = ms => new Promise(r => setTimeout(r, ms));
const ok = async (r, what) => { const b = await json(r); assert.equal(r.status, 200, (what || '') + ' ' + JSON.stringify(b).slice(0, 400)); return b; };
const refused = async (r, status, re, what) => { const b = await json(r); assert.equal(r.status, status, (what || '') + ' ' + JSON.stringify(b).slice(0, 400)); if (re) assert.match(b.error || '', re, what); return b; };

/* what every test does with the server */
function kit(s) {
  const k = {
    async settings() { return (await (await s.req('GET', '/api/scoring/settings', undefined, s.admin)).json()).settings; },
    async set(fn) { const cur = await k.settings(), next = JSON.parse(JSON.stringify(cur)); fn(next); const r = await s.req('PUT', '/api/scoring/settings', { settings: next, configVersion: cur.configVersion }, s.admin); assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).settings; },
    on: fn => k.set(x => { x.enabled = true; if (fn) fn(x); }),
    off: () => k.set(x => { x.enabled = false; }),
    async task(fields, who) { return ok(await s.req('POST', '/api/tasks', Object.assign({ title: 'Feed post Ramadan', status: 'todo', prio: 'medium', assignee: 'sarah', assignees: ['sarah'], team: 'design', assetCount: 5, effort: 0 }, fields || {}), who || s.admin), 'create'); },
    async doc(id, who) { return (await s.req('GET', '/api/tasks/' + id, undefined, who || s.admin)).json(); },
    async view(id, who, h) { return ok(await s.req('GET', '/api/tasks/' + id + '/scoring', undefined, who || s.admin, h), 'view'); },
    calc: (id, body, who) => s.req('POST', '/api/tasks/' + id + '/scoring/calculate', body, who || s.admin),
    put: (id, m, body, who) => s.req('PUT', '/api/tasks/' + id + '/scoring/' + m, body, who || s.admin),
    approve: (id, m, body, who, h) => s.req('POST', '/api/tasks/' + id + '/scoring/' + m + '/approve', body || {}, who || s.admin, h),
    rebaseline: (id, m, body, who) => s.req('POST', '/api/tasks/' + id + '/scoring/' + m + '/rebaseline', body || {}, who || s.admin),
    async save(id, who, fn) { const d = await k.doc(id, who); d.meta = d.meta || {}; fn(d); return s.req('PUT', '/api/tasks/' + id, d, who || s.admin); },
    move: (id, to, who) => s.req('POST', '/api/tasks/' + id + '/move', { type: 'MOVE_TASK_STATUS', toStatusId: to }, who || s.admin),
    async grant(id, caps) { const r = await s.req('PUT', '/api/members/' + id + '/cap-grants', { caps }, s.admin); assert.ok(r.ok, await r.text()); },
    async role(id, add) { const r = (await (await s.req('GET', '/api/roles', undefined, s.admin)).json()).roles.find(x => x.id === id); const res = await s.req('PUT', '/api/roles/' + id, Object.assign({}, r, { permissions: r.permissions.concat(add) }), s.admin); assert.ok(res.ok, await res.text()); }
  };
  return k;
}

test('who sees a task\'s scores and who changes them: per role and per extra permission; assignees, admins included, never approve their own; nobody approves while acting as someone else', { timeout: 180000 }, async t => {
  const s = await start(place(t)), k = kit(s);
  const sarah = await s.as('sarah'), maya = await s.as('maya'), rizky = await s.as('rizky'), andi = await s.as('andi'), nadia = await s.as('nadia');
  const T = await k.task();
  assert.deepEqual(T.scoring, { hours: null, story: null, weighted: null }, 'the task document carries the summaries, empty at first');

  /* read: everyone on the team; a stakeholder neither reads them nor finds them on the task */
  let v = await k.view(T.id, sarah);
  assert.deepEqual(v.rows, { hours: null, story: null, weighted: null });
  assert.equal(v.on.enabled, false);
  assert.equal(v.can.calculate, true); assert.equal(v.can.propose, true); assert.equal(v.can.edit, false); assert.equal(v.can.approve, false);
  assert.equal(v.can.approveBlocked, 'permission'); assert.equal(v.can.assignee, true); assert.equal(v.can.logTime, true);
  assert.equal(v.context.kind, 'feed'); assert.equal(v.context.assetCount, 5); assert.deepEqual(v.context.scope, { value: 3, source: 'assets', assetCount: 5, assumed: false });
  assert.equal('efficiency' in v, false, 'no bonus for someone not credited, not approving finished work, without analytics');
  v = await k.view(T.id, maya);
  assert.equal(v.can.calculate, false, 'a member not on the task'); assert.equal(v.can.propose, false);
  await refused(await s.req('GET', '/api/tasks/' + T.id + '/scoring', undefined, nadia), 403, /permission/, 'a stakeholder');
  assert.equal('scoring' in (await k.doc(T.id, nadia)), false, 'a stakeholder\'s copy of the task goes without the summary');
  assert.ok('scoring' in (await k.doc(T.id, sarah)));
  { const ef = (await k.view(T.id)).efficiency;   /* server/scoring-awards.js fills the block in (docs/SMART-SCORING.md §13) */
    assert.deepEqual(ef.awards, [], 'an admin sees the (empty) awards'); assert.equal(ef.status, null); assert.equal(ef.on, false); }

  /* Smart Scoring off: changes refused, reading fine */
  await refused(await k.calc(T.id, { module: 'hours' }, sarah), 409, /turned off in this workspace/);
  await k.on();

  /* calculate: the engine's hours for a feed post with five deliverables, and the task's estimate follows */
  const c = await ok(await k.calc(T.id, { module: 'hours' }, sarah), 'calculate');
  const expected = S.hours(D.hours, { kind: 'feed', units: 5, openDeps: 0 });
  assert.equal(expected.value, 6, 'a feed post, five deliverables, complexity 3: 6 h');
  assert.equal(c.result.value, 6); assert.equal(c.result.final, 6); assert.equal(c.result.finalSet, true);
  assert.deepEqual(c.result.inputs, { kind: 'feed', kindSource: 'title', units: 5, unitsSource: 'assets', assetCount: 5, complexity: null, complexitySource: null, openDeps: 0 });
  assert.deepEqual(c.result.steps, expected.steps, 'the engine\'s own explanation');
  assert.deepEqual(c.result.suggestions.scope, { value: 3, source: 'assets', assetCount: 5, assumed: false });
  assert.equal(c.rows.hours.value, 6); assert.equal(c.rows.hours.source, 'math'); assert.equal(c.rows.hours.status, 'draft'); assert.equal(c.rows.hours.mathValue, 6); assert.equal(c.rows.hours.rev, 1);
  assert.deepEqual(c.rows.hours.math.steps, expected.steps, 'kept with the row');
  assert.equal(c.task.effort, 6, 'the task\'s Estimate is the final hours');
  assert.equal(c.task.meta.effortAuto.src, 'kind'); assert.equal(c.task.meta.effortAuto.kind, 'feed'); assert.equal(c.task.meta.effortAuto.items, 5);
  assert.deepEqual(c.task.scoring.hours, { value: 6, unit: 'h', status: 'draft', source: 'math', lockedValue: null, lockedAt: null, rev: 1, proposed: false });
  await refused(await k.calc(T.id, { module: 'hours' }, maya), 403, /permission/, 'a member not on the task');
  await refused(await k.calc(T.id, { module: 'nope' }, sarah), 400);

  /* change: the assignee proposes, with a reason, on the current revision */
  await refused(await k.put(T.id, 'hours', { value: 8, rev: 1 }, sarah), 400, /reason/, 'a reason is required by default');
  await refused(await k.put(T.id, 'hours', { value: 8, rev: 0, reason: 'two more sizes' }, sarah), 409, /Someone else changed this score/, 'a stale revision');
  await refused(await k.put(T.id, 'hours', { value: 8, reason: 'x' }, sarah), 400, /rev/);
  await refused(await k.put(T.id, 'hours', { value: 900, rev: 1, reason: 'x' }, sarah), 400, /between/);
  await refused(await k.put(T.id, 'hours', { value: 8, rev: 1, reason: 'x'.repeat(1001) }, sarah), 413, /reason/);
  const p = await ok(await k.put(T.id, 'hours', { value: 8, rev: 1, reason: 'two more sizes' }, sarah), 'propose');
  assert.equal(p.applied, false); assert.equal(p.rows.hours.status, 'proposed'); assert.equal(p.rows.hours.value, 6);
  assert.equal(p.rows.hours.proposal.value, 8); assert.equal(p.rows.hours.proposal.by, 'sarah'); assert.equal(p.rows.hours.proposal.reason, 'two more sizes');
  assert.equal(p.task.effort, 6, 'a proposal changes nothing yet'); assert.equal(p.task.scoring.hours.proposed, true);
  await refused(await k.put(T.id, 'hours', { value: 8, rev: 2, reason: 'x' }, maya), 403);

  /* approve: not the member, not a team lead without the permission; the role given it, yes */
  await refused(await k.approve(T.id, 'hours', {}, sarah), 403, /permission/);
  await refused(await k.approve(T.id, 'hours', {}, andi), 403, /permission/);
  await k.role('team_lead', ['scoring_approve_estimate']);
  await refused(await k.approve(T.id, 'hours', { rev: 1 }, andi), 409, /Someone else changed/, 'a stale revision');
  let a = await ok(await k.approve(T.id, 'hours', { rev: 2, useProposal: true }, andi), 'approve the proposal');
  assert.equal(a.rows.hours.status, 'approved'); assert.equal(a.rows.hours.value, 8); assert.equal(a.rows.hours.lockedValue, 8); assert.equal(a.rows.hours.source, 'manual');
  assert.equal(a.rows.hours.approvedBy, 'andi'); assert.equal(a.rows.hours.lockedBy, 'andi'); assert.equal(a.rows.hours.approvedAtLock, true); assert.equal(a.rows.hours.proposal, null);
  assert.equal(a.audit[0].action, 'approved'); assert.equal(a.audit[0].meta.acceptedProposal, true); assert.equal(a.audit[0].meta.workStarted, false, 'locked before the work');
  assert.deepEqual(a.rows.hours.scope, { assets: 5, deps: 0, text: S.inputHash({ description: '', brief: null }) });
  assert.equal(a.task.effort, 8, 'the locked hours are the task\'s estimate'); assert.equal(a.task.scoring.hours.status, 'approved'); assert.equal(a.task.scoring.hours.lockedValue, 8);
  await refused(await k.approve(T.id, 'hours', {}, andi), 409, /already approved/);
  assert.equal((await k.view(T.id, andi)).can.approve, true);

  /* change a locked estimate: only with scoring_edit_task — here given to one member on top of their role */
  await refused(await k.put(T.id, 'hours', { value: 7, rev: a.rows.hours.rev, reason: 'x' }, rizky), 403);
  await k.grant('rizky', ['scoring_edit_task']);
  assert.equal((await k.view(T.id, rizky)).can.edit, true);
  const e = await ok(await k.put(T.id, 'hours', { value: 7, rev: a.rows.hours.rev, reason: 'brief was smaller' }, rizky), 'an editor changes a locked estimate');
  assert.equal(e.applied, true); assert.equal(e.rows.hours.status, 'locked', 'still locked'); assert.equal(e.rows.hours.approvedBy, null, 'but no longer approved');
  assert.equal(e.rows.hours.lockedValue, 7); assert.equal(e.rows.hours.lockedBy, 'rizky'); assert.equal(e.task.effort, 7); assert.equal(e.task.meta.effortManual, true);
  assert.equal(e.audit[0].action, 'locked_changed'); assert.equal(e.audit[0].by, 'rizky'); assert.equal(e.audit[0].reason, 'brief was smaller'); assert.equal(e.audit[0].from.lockedValue, 8); assert.equal(e.audit[0].meta.approvalCleared, true);
  assert.deepEqual(e.audit.map(x => x.action).reverse(), ['calculated', 'proposed', 'approved', 'locked_changed']);

  /* an admin assigned to a task does not approve its estimate — unless the workspace allows self-approval, audited */
  const A = await k.task({ title: 'Instagram carousel', assignee: 'admin', assignees: ['admin'] });
  await ok(await k.calc(A.id, { module: 'hours' }));
  v = await k.view(A.id); assert.equal(v.can.approve, false); assert.equal(v.can.approveBlocked, 'assignee');
  await refused(await k.approve(A.id, 'hours'), 403, /assigned to this task/);
  await k.set(x => { x.overrides.allowSelfApproveEstimate = true; });
  a = await ok(await k.approve(A.id, 'hours'), 'self-approval allowed');
  assert.equal(a.rows.hours.approvedBy, 'admin'); assert.equal(a.audit[0].meta.selfApproved, true);
  await k.set(x => { x.overrides.allowSelfApproveEstimate = false; });

  /* acting as someone else: never an approval, whoever it is */
  const B = await k.task({ title: 'Promo banner' });
  await ok(await k.calc(B.id, { module: 'hours' }));
  await refused(await k.approve(B.id, 'hours', {}, s.admin, { 'x-act-as': 'andi' }), 403, /acting as someone else/);
  v = await k.view(B.id, s.admin, { 'x-act-as': 'andi' });
  assert.equal(v.can.approve, false); assert.equal(v.can.approveBlocked, 'impersonating'); assert.equal(v.can.impersonating, true);
  assert.equal((await k.view(B.id)).rows.hours.status, 'draft', 'nothing approved');

  /* changes need an approval: an editor who cannot approve proposes instead */
  await k.set(x => { x.overrides.requireApproval = true; });
  const R = await ok(await k.put(B.id, 'hours', { value: 5, rev: (await k.view(B.id)).rows.hours.rev, reason: 'smaller' }, rizky));
  assert.equal(R.applied, false); assert.equal(R.rows.hours.status, 'proposed');
  await k.set(x => { x.overrides.requireApproval = false; });
  /* the approval given to one member on top of their role: they approve the estimate as it is, the proposal declined */
  await refused(await k.approve(B.id, 'hours', {}, maya), 403);
  await k.grant('maya', ['scoring_approve_estimate']);
  a = await ok(await k.approve(B.id, 'hours', { rev: R.rows.hours.rev, reason: 'as estimated' }, maya), 'an extra permission');
  assert.equal(a.rows.hours.status, 'approved'); assert.equal(a.rows.hours.value, S.hours(D.hours, { kind: 'banner', units: 5 }).value, 'five banners: 9 h'); assert.equal(a.rows.hours.approvedBy, 'maya'); assert.equal(a.rows.hours.proposal, null);
  assert.equal(a.audit[0].meta.declinedProposal, true); assert.equal(a.audit[0].reason, 'as estimated');

  /* the audit is in the database, with who acted */
  const db = dbAt(s.dir);
  try {
    assert.deepEqual(db.prepare("SELECT action, actor_id FROM scoring_audit WHERE task_id=? ORDER BY created_at, rowid").all(T.id).map(r => r.action + ':' + r.actor_id), ['calculated:sarah', 'proposed:sarah', 'approved:andi', 'locked_changed:rizky']);
  } finally { db.close(); }
});

test('calculate gives the engine\'s numbers: the kind from the title, the asset count as deliverables, the open dependencies; Scope suggested from the asset count; a manual estimate stays', { timeout: 120000 }, async t => {
  const s = await start(place(t)), k = kit(s);
  await k.on(x => { x.modules.story.on = true; x.modules.weighted.on = true; });
  const T = await k.task({ title: 'Konten feed Ramadan', assetCount: 5 });
  /* an open dependency: ×1.1 */
  const other = await k.task({ title: 'Copy for Ramadan' });
  await ok(await k.save(T.id, s.admin, d => { d.dependencies = [{ taskId: other.id, type: 'finish_to_start' }]; }));
  let c = await ok(await k.calc(T.id, { module: 'hours' }));
  assert.equal(c.result.inputs.openDeps, 1); assert.equal(c.result.inputs.kind, 'feed', 'Indonesian titles too');
  assert.equal(c.result.value, S.hours(D.hours, { kind: 'feed', units: 5, openDeps: 1 }).value); assert.equal(c.result.value, 6.6);
  assert.equal(c.result.final, 6.5, 'the task gets it to the half hour, as today\'s estimate does'); assert.equal(c.task.effort, 6.5);
  /* corrected by the person: another kind, another count, a complexity */
  c = await ok(await k.calc(T.id, { module: 'hours', inputs: { kind: 'carousel', units: 2, complexity: 4 } }));
  assert.equal(c.result.value, S.hours(D.hours, { kind: 'carousel', units: 2, complexity1to5: 4, openDeps: 1 }).value);
  assert.deepEqual([c.result.inputs.kindSource, c.result.inputs.unitsSource, c.result.inputs.complexitySource], ['given', 'given', 'given']);
  assert.equal(c.rows.hours.factors.complexity, 4); assert.equal(c.rows.hours.value, c.result.final, 'still a math draft: the final follows');
  await refused(await k.calc(T.id, { module: 'hours', inputs: { kind: 'spaceship' } }), 400, /Unknown kind/);
  await refused(await k.calc(T.id, { module: 'hours', inputs: { complexity: 9 } }), 400, /1 to 5/);
  /* the rated complexity is remembered: the next calculation uses it */
  c = await ok(await k.calc(T.id, { module: 'hours' }));
  assert.equal(c.result.inputs.complexity, 4); assert.equal(c.result.inputs.complexitySource, 'stored');
  /* a title that names no kind of work: no number made up */
  const U = await k.task({ title: 'Quarterly sync', assetCount: 1 });
  c = await ok(await k.calc(U.id, { module: 'hours' }));
  assert.equal(c.result.value, null); assert.equal(c.result.reason, 'no_template'); assert.equal(c.result.finalSet, false); assert.equal(c.rows.hours.value, null); assert.equal(c.task.effort, 0);

  /* Story and Weighted Points: Scope from the asset count when nobody rated it, saying so */
  const ratings = { complexity: 3, uncertainty: 2, dependencies: 1 };
  c = await ok(await k.calc(T.id, { module: 'story', ratings }));
  assert.equal(c.result.inputs.sources.scope, 'assets'); assert.equal(c.result.inputs.ratings.scope, 3);
  assert.equal(c.result.value, S.storyPoints(D.story, Object.assign({ scope: 3 }, ratings)).value); assert.equal(c.result.value, 3);
  assert.equal(c.rows.story.value, 3); assert.equal(c.rows.story.source, 'math'); assert.equal(c.rows.story.unit, 'story_points');
  /* the weighted points take the story ratings already given */
  c = await ok(await k.calc(T.id, { module: 'weighted' }));
  assert.deepEqual(c.result.inputs.sources, { complexity: 'story', scope: 'story', uncertainty: 'story', dependencies: 'story' });
  assert.equal(c.result.value, S.weightedPoints(D.weighted, Object.assign({ scope: 3 }, ratings)).value); assert.equal(c.result.value, 4.6);
  assert.equal(c.rows.weighted.mappingVersion, 1); assert.equal(c.task.scoring.weighted.value, 4.6);
  /* a rated scope wins over the suggestion; a missing rating is said */
  c = await ok(await k.calc(T.id, { module: 'story', ratings: { scope: 5 } }));
  assert.equal(c.result.inputs.sources.scope, 'given'); assert.equal(c.result.inputs.sources.complexity, 'stored');
  const N = await k.task({ title: 'Story set', assetCount: 13 });
  c = await ok(await k.calc(N.id, { module: 'weighted', ratings: { complexity: 2 } }));
  assert.equal(c.result.value, null); assert.deepEqual(c.result.missing, ['uncertainty', 'dependencies']); assert.equal(c.result.suggestions.scope.value, 5);
  await refused(await k.calc(N.id, { module: 'story', ratings: { complexity: 'lots' } }), 400, /1 to 5/);

  /* set by value, by ratings, or "use the math" */
  let rev = (await k.view(T.id)).rows.story.rev;
  await refused(await k.put(T.id, 'story', { value: 4, rev, reason: 'x' }), 400, /1, 2, 3, 5, 8 or 13/);
  let p = await ok(await k.put(T.id, 'story', { ratings: { complexity: 5, scope: 5, uncertainty: 5, dependencies: 5 }, rev, reason: 'it is bigger' }));
  assert.equal(p.applied, true); assert.equal(p.rows.story.value, 13); assert.equal(p.rows.story.source, 'manual'); assert.equal(p.rows.story.factors.scope, 5);
  p = await ok(await k.put(T.id, 'story', { use: 'math', rev: p.rows.story.rev, reason: 'back to the math' }));
  assert.equal(p.rows.story.value, p.rows.story.mathValue); assert.equal(p.rows.story.source, 'math');
  p = await ok(await k.put(T.id, 'weighted', { value: 7.256, rev: (await k.view(T.id)).rows.weighted.rev, reason: 'judgement' }));
  assert.equal(p.rows.weighted.value, 7.26); assert.equal(p.rows.weighted.source, 'manual');
  /* worked out again: the manual value stays, the math is new */
  c = await ok(await k.calc(T.id, { module: 'weighted', ratings: { complexity: 1, scope: 1, uncertainty: 1, dependencies: 1 } }));
  assert.equal(c.result.finalSet, false); assert.equal(c.rows.weighted.value, 7.26); assert.equal(c.rows.weighted.mathValue, 1);
  /* an estimate typed into the task is manual, and stays when Calculate runs again */
  await ok(await k.save(T.id, s.admin, d => { d.effort = 3; d.meta.effortManual = true; delete d.meta.effortAuto; }));
  const v = await k.view(T.id); assert.equal(v.rows.hours.value, 3); assert.equal(v.rows.hours.source, 'manual'); assert.equal(v.audit[0].action, 'estimate_changed'); assert.equal(v.audit[0].by, 'admin');
  c = await ok(await k.calc(T.id, { module: 'hours' }));
  assert.equal(c.result.finalSet, false); assert.equal(c.task.effort, 3); assert.equal(c.rows.hours.value, 3); assert.equal(c.rows.hours.mathValue, c.result.value);
  rev = c.rows.hours.rev;
  p = await ok(await k.put(T.id, 'hours', { use: 'math', rev, reason: 'the math is right' }));
  assert.equal(p.rows.hours.value, c.result.final); assert.equal(p.rows.hours.source, 'math'); assert.equal(p.task.effort, c.result.final); assert.equal(p.task.meta.effortAuto.src, 'kind');
});

test('a locked estimate cannot change through the task\'s save, the grid\'s merge, a restore or an old slim copy; the time log owns the Actual; off, everything is as before', { timeout: 180000 }, async t => {
  const s = await start(place(t)), k = kit(s);
  const sarah = await s.as('sarah'), zein = await s.as('zein');
  const T = await k.task({ effort: 4 });
  /* before Smart Scoring: the Actual is anyone's who edits the task */
  await ok(await k.save(T.id, sarah, d => { d.meta.actualEffort = 3; }));
  await k.on();
  await k.role('creative_lead', ['scoring_approve_estimate']);
  /* an estimate nobody typed (4 h when it was created) gives way to the math */
  let v = await k.view(T.id); assert.equal(v.rows.hours.value, 4); assert.equal(v.rows.hours.source, 'legacy'); assert.equal(v.rows.hours.status, 'draft');
  await ok(await k.calc(T.id, { module: 'hours' }));
  const a = await ok(await k.approve(T.id, 'hours', {}, zein));
  assert.equal(a.task.effort, 6); assert.equal(a.rows.hours.approvedBy, 'zein');

  /* the drawer's save */
  await refused(await k.save(T.id, sarah, d => { d.effort = 9; }), 403, /estimate is locked/);
  /* the grid's merge, on a copy someone else saved in the meantime */
  const stale = await k.doc(T.id, sarah);
  await ok(await k.save(T.id, s.admin, d => { d.title = 'Feed post Ramadan (5 sizes)'; }));
  stale.effort = 9; stale._rev = stale.updatedAt; stale._changed = ['effort'];
  await refused(await s.req('PUT', '/api/tasks/' + T.id, stale, sarah), 403, /locked/);
  /* an old slim copy */
  await refused(await s.req('PUT', '/api/tasks/' + T.id, { _slim: true, title: 'Feed post Ramadan (5 sizes)', team: 'design', status: 'todo', prio: 'medium', assignee: 'sarah', assignees: ['sarah'], effort: 9, assetCount: 5 }, sarah), 403, /locked/);
  /* everything else still saves, the estimate as it is */
  let d = await ok(await k.save(T.id, sarah, x => { x.title = 'Feed post Ramadan, five sizes'; }));
  assert.equal(d.effort, 6); assert.equal(d.title, 'Feed post Ramadan, five sizes'); assert.equal(d.scoring.hours.status, 'approved');

  /* the time log owns the Actual: a save, a new task (a duplicate) */
  d = await ok(await k.save(T.id, sarah, x => { x.meta.actualEffort = 10; }));
  assert.equal(d.meta.actualEffort, 3, 'kept: the time log writes it');
  const N = await k.task({ title: 'Feed post Ramadan (copy)', meta: { actualEffort: 5, watchers: ['sarah'], assetSplitOk: { by: 'laura', at: '2026-01-01', split: {}, total: 5 } } });
  assert.equal(N.meta.actualEffort, undefined); assert.deepEqual(N.meta.watchers, ['sarah']);
  assert.equal(N.meta.assetSplitOk, undefined, 'and never born validated by a lead');

  /* whoever may change locked scores changes it in the task: still locked, no longer approved */
  d = await ok(await k.save(T.id, s.admin, x => { x.effort = 9; x.meta.effortManual = true; }));
  assert.equal(d.effort, 9); assert.equal(d.scoring.hours.status, 'locked'); assert.equal(d.scoring.hours.lockedValue, 9);
  v = await k.view(T.id); assert.equal(v.rows.hours.approvedBy, null); assert.equal(v.audit[0].action, 'locked_changed'); assert.equal(v.audit[0].meta.via, 'task'); assert.equal(v.audit[0].by, 'admin');

  /* a restore to how it was created: the rest goes back, the locked estimate and the logged Actual stay */
  const created = d.activity.find(x => x.k === 'created' && x.a && x.a.snap);
  assert.ok(created, 'the creation has a copy to go back to');
  d = await ok(await s.req('POST', '/api/restore/task/' + T.id, { activityId: created.id }, s.admin), 'restore');
  assert.equal(d.title, 'Feed post Ramadan', 'the restore did happen'); assert.equal(d.effort, 9); assert.equal(d.meta.actualEffort, 3);

  /* Smart Scoring off: the task's save is as it always was; scores are read, not changed */
  await k.off();
  d = await ok(await k.save(T.id, sarah, x => { x.effort = 2; x.meta.actualEffort = 10; }));
  assert.equal(d.effort, 2, 'off: as before'); assert.equal(d.meta.actualEffort, 10);
  await refused(await k.put(T.id, 'hours', { value: 5, rev: 1, reason: 'x' }), 409, /turned off in this workspace/);
  v = await k.view(T.id); assert.equal(v.rows.hours.lockedValue, 9, 'nothing re-evaluated while off'); assert.ok(v.audit.length >= 4, 'the history is still read');
  /* on again: the change made meanwhile is caught up with, and said */
  await k.on();
  v = await k.view(T.id); assert.equal(v.rows.hours.lockedValue, 2); assert.equal(v.rows.hours.status, 'locked'); assert.equal(v.audit[0].action, 'locked_changed'); assert.equal(v.audit[0].by, null); assert.equal(v.audit[0].meta.via, 'sync');
});

test('work starting first freezes the estimate as an unapproved baseline; a changed scope asks for a new baseline; a re-baseline keeps the old one in the audit', { timeout: 180000 }, async t => {
  const s = await start(place(t)), k = kit(s);
  await k.on(); await k.role('team_lead', ['scoring_approve_estimate']);
  const sarah = await s.as('sarah'), andi = await s.as('andi');
  const T = await k.task();
  await ok(await k.calc(T.id, { module: 'hours' }, sarah));
  let d = await ok(await k.move(T.id, 'progress', sarah), 'move to In Progress');
  assert.equal(d.status, 'progress'); assert.equal(d.scoring.hours.status, 'locked'); assert.equal(d.scoring.hours.lockedValue, 6);
  let v = await k.view(T.id, sarah);
  assert.equal(v.rows.hours.approvedBy, null); assert.equal(v.rows.hours.lockedBy, null); assert.equal(v.rows.hours.approvedAtLock, false);
  assert.equal(v.audit[0].action, 'frozen_at_work_start'); assert.equal(v.audit[0].meta.trigger, 'stage'); assert.equal(v.audit[0].by, 'sarah');
  await refused(await k.save(T.id, sarah, x => { x.effort = 12; }), 403, /locked/, 'work has started: the assignee no longer changes it');
  /* approved later: approved, but not in the act of locking it */
  let a = await ok(await k.approve(T.id, 'hours', {}, andi));
  assert.equal(a.rows.hours.status, 'approved'); assert.equal(a.rows.hours.lockedAt, v.rows.hours.lockedAt); assert.equal(a.rows.hours.approvedAtLock, false); assert.equal(a.audit[0].meta.frozenAt, v.rows.hours.lockedAt);
  assert.equal(a.audit[0].meta.workStarted, true);

  /* more deliverables after the lock: a new baseline is needed; put back, it is as it was */
  d = await ok(await k.save(T.id, sarah, x => { x.assetCount = 8; }));
  assert.equal(d.scoring.hours.status, 'rebaseline_needed');
  v = await k.view(T.id); assert.equal(v.audit[0].action, 'scope_changed'); assert.deepEqual(v.audit[0].meta.what, ['assets']);
  d = await ok(await k.save(T.id, sarah, x => { x.assetCount = 5; }));
  assert.equal(d.scoring.hours.status, 'approved'); assert.equal((await k.view(T.id)).audit[0].action, 'scope_restored');
  /* a new dependency, a changed brief: the same */
  const dep = await k.task({ title: 'Copy for Ramadan' });
  d = await ok(await k.save(T.id, sarah, x => { x.dependencies = [{ taskId: dep.id, type: 'finish_to_start' }]; }));
  assert.equal(d.scoring.hours.status, 'rebaseline_needed');
  d = await ok(await k.save(T.id, sarah, x => { x.dependencies = []; x.description = 'Five feed posts and two stories'; }));
  assert.equal(d.scoring.hours.status, 'rebaseline_needed');
  assert.deepEqual((await k.view(T.id)).rows.hours.scope.deps, 0, 'the lock still remembers its own scope');
  await refused(await k.approve(T.id, 'hours', {}, andi), 409, /re-baseline/);
  await refused(await k.rebaseline(T.id, 'hours', { value: 7.5 }, andi), 400, /reason/);
  await refused(await k.rebaseline(T.id, 'hours', { value: 7.5, reason: 'two stories added' }, sarah), 403);
  a = await ok(await k.rebaseline(T.id, 'hours', { value: 7.5, reason: 'two stories added' }, andi), 'rebaseline');
  assert.equal(a.rows.hours.status, 'approved'); assert.equal(a.rows.hours.lockedValue, 7.5); assert.equal(a.rows.hours.approvedAtLock, true); assert.equal(a.rows.hours.source, 'manual'); assert.equal(a.task.effort, 7.5);
  assert.equal(a.audit[0].action, 'rebaselined'); assert.equal(a.audit[0].reason, 'two stories added');
  assert.equal(a.audit[0].from.lockedValue, 6); assert.equal(a.audit[0].from.status, 'rebaseline_needed'); assert.equal(a.audit[0].from.approvedBy, 'andi'); assert.equal(a.audit[0].to.lockedValue, 7.5);
  assert.equal(a.rows.hours.scope.text, S.inputHash({ description: 'Five feed posts and two stories', brief: null }), 'the new baseline remembers the new scope');
  await refused(await k.rebaseline(dep.id, 'hours', { value: 2, reason: 'x' }, andi), 409, /Only a locked estimate/);

  /* the drawer moves it and changes the estimate in one save: the estimate is taken, then frozen */
  const U = await k.task({ title: 'Poster A3', assetCount: 1, effort: 3 });
  d = await ok(await k.save(U.id, sarah, x => { x.status = 'progress'; x.effort = 4; x.meta.effortManual = true; }));
  assert.equal(d.scoring.hours.status, 'locked'); assert.equal(d.scoring.hours.lockedValue, 4); assert.equal(d.scoring.hours.source, 'manual');
  /* created right into a stage of work: frozen at once */
  const W = await k.task({ title: 'Reels cutdown', status: 'progress', effort: 6 });
  assert.equal(W.scoring.hours.status, 'locked');
  /* back to To Do and on again: still the same lock */
  await ok(await k.move(W.id, 'todo')); d = await ok(await k.move(W.id, 'progress'));
  assert.equal(d.scoring.hours.rev, W.scoring.hours.rev, 'nothing written twice');
  /* with the policy "approve", starting work freezes nothing */
  await k.set(x => { x.hours.lockPolicy = 'approve'; });
  const P = await k.task({ title: 'Email header', effort: 2 });
  d = await ok(await k.move(P.id, 'progress', sarah));
  assert.equal(d.scoring.hours.status, 'draft');
  d = await ok(await k.save(P.id, sarah, x => { x.effort = 2.5; x.meta.effortManual = true; }));
  assert.equal(d.effort, 2.5); assert.equal(d.scoring.hours.value, 2.5); assert.equal(d.scoring.hours.source, 'manual');
});

test('a finished task opened again sends its efficiency awards back to provisional; only those credited (their own), approving finished work or with analytics see them', { timeout: 120000 }, async t => {
  const s = await start(place(t)), k = kit(s);
  await k.on();
  const sarah = await s.as('sarah'), maya = await s.as('maya'), dian = await s.as('dian');
  const T = await k.task({ title: 'Story set', status: 'done', reviewer: 'laura', reviewers: ['laura'], assignees: ['sarah', 'rizky'] });
  /* awards as the bonus phase will write them (none is written yet: the bonus is off until it ships) */
  const db = dbAt(s.dir), ws = db.prepare("SELECT workspace_id AS w FROM tasks WHERE id=?").get(T.id).w;
  try {
    const ins = db.prepare("INSERT INTO task_efficiency_awards (id, workspace_id, task_id, user_id, share, base_points, bonus_points, awarded_points, status, created_at) VALUES (?,?,?,?,?,?,?,?,?,?)");
    ins.run('aw_1', ws, T.id, 'sarah', 0.6, 5, 0.66, 5.66, 'approved', new Date().toISOString());
    ins.run('aw_2', ws, T.id, 'rizky', 0.4, 5, 0.44, 5.44, 'pending_review', new Date().toISOString());
  } finally { db.close(); }
  let v = await k.view(T.id, sarah);
  assert.deepEqual(v.efficiency.awards.map(a => [a.userId, a.awardedPoints, a.status]), [['sarah', 5.66, 'approved']], 'a credited person sees their own award');
  assert.equal('efficiency' in (await k.view(T.id, maya)), false, 'someone else sees none');
  assert.equal('efficiency' in (await k.doc(T.id, maya)).scoring, false, 'and the task document carries no bonus for anyone');
  await k.grant('dian', ['scoring_view_analytics']);
  assert.equal((await k.view(T.id, dian)).efficiency.awards.length, 2, 'the team\'s analytics: every award');
  assert.equal((await k.view(T.id)).efficiency.awards.length, 2);
  /* opened again: both wait for it to be finished again; finished again, nothing is approved by itself */
  await ok(await k.move(T.id, 'progress'));
  v = await k.view(T.id);
  assert.deepEqual(v.efficiency.awards.map(a => a.status), ['provisional', 'provisional']);
  assert.equal(v.audit[0].module, 'efficiency'); assert.equal(v.audit[0].action, 'reopened'); assert.equal(v.audit[0].meta.awards, 2); assert.equal(v.audit[0].by, 'admin');
  assert.equal((await k.view(T.id, maya)).audit.some(a => a.module === 'efficiency'), false, 'its history line is not someone else\'s to see');
  await ok(await k.move(T.id, 'done'));
  assert.deepEqual((await k.view(T.id)).efficiency.awards.map(a => a.status), ['provisional', 'provisional']);
});

test('a module or Smart Scoring off refuses changes and shows the history; COS_SCORING=0 answers 409 and the task saves as before', { timeout: 120000 }, async t => {
  const at = place(t); let s = await start(at), k = kit(s);
  await k.on();
  const T = await k.task();
  await ok(await k.calc(T.id, { module: 'hours' }));
  await refused(await k.calc(T.id, { module: 'story', ratings: { complexity: 2, scope: 2, uncertainty: 2, dependencies: 2 } }), 409, /Story Points is turned off/);
  await refused(await k.put(T.id, 'weighted', { value: 3, rev: 0, reason: 'x' }), 409, /Weighted Points is turned off/);
  await refused(await k.approve(T.id, 'story'), 409, /Story Points is turned off/);
  await refused(await k.put(T.id, 'nope', { value: 3, rev: 0, reason: 'x' }), 400, /Unknown score/);
  /* Effort Hours off: read, not changed; and the Actual is the task's again */
  await k.set(x => { x.modules.hours.on = false; });
  await refused(await k.approve(T.id, 'hours'), 409, /Effort Hours is turned off/);
  await refused(await k.calc(T.id, { module: 'hours' }), 409, /Effort Hours is turned off/);
  const v = await k.view(T.id); assert.equal(v.rows.hours.value, 6); assert.equal(v.on.hours, false); assert.equal(v.audit[0].action, 'calculated');
  await ok(await k.save(T.id, s.admin, x => { x.meta.actualEffort = 4; }));
  assert.equal((await k.doc(T.id)).meta.actualEffort, 4);
  await s.stop();

  s = await start(at, { COS_SCORING: '0' }); k = kit(s);
  for (const [m, p, b] of [['GET', '/api/tasks/' + T.id + '/scoring'], ['POST', '/api/tasks/' + T.id + '/scoring/calculate', { module: 'hours' }], ['PUT', '/api/tasks/' + T.id + '/scoring/hours', { value: 2, rev: 1, reason: 'x' }], ['POST', '/api/tasks/' + T.id + '/scoring/hours/approve', {}], ['POST', '/api/tasks/' + T.id + '/scoring/hours/rebaseline', { reason: 'x' }]])
    await refused(await s.req(m, p, b, s.admin), 409, /turned off on this server/, m + ' ' + p);
  const d = await ok(await k.save(T.id, s.admin, x => { x.effort = 3; x.meta.actualEffort = 2; }));
  assert.equal(d.effort, 3); assert.equal(d.meta.actualEffort, 2);
});

test('the backfill runs once, on the demo seed, for this workspace only, and never rewrites an estimate', { timeout: 120000 }, async t => {
  const at = place(t); let s = await start(at);
  let db = dbAt(at.dir);
  const tasks = db.prepare("SELECT id, estimated_minutes, meta FROM tasks WHERE estimated_minutes > 0 ORDER BY id").all();
  assert.ok(tasks.length > 20, 'the demo seed has estimates');
  const rows = db.prepare("SELECT * FROM task_scoring ORDER BY task_id").all();
  assert.equal(rows.length, tasks.length, 'one row per task with an estimate');
  const byId = new Map(rows.map(r => [r.task_id, r]));
  tasks.forEach(x => {
    const r = byId.get(x.id), m = JSON.parse(x.meta || '{}'), a = m.effortAuto || {};
    assert.equal(r.module, 'hours'); assert.equal(r.status, 'unverified'); assert.equal(r.locked_value, null); assert.equal(r.approved_by, null); assert.equal(r.unit, 'h');
    assert.equal(Math.round(r.final_value * 60), x.estimated_minutes, x.id);
    assert.equal(r.source, a.src === 'ai' ? 'ai' : a.src === 'history' || a.src === 'kind' ? 'math' : m.effortManual ? 'manual' : 'legacy', x.id);
  });
  const before = JSON.stringify(tasks.map(x => [x.id, x.estimated_minutes]));
  const counts = JSON.parse(db.prepare("SELECT value FROM app_meta WHERE key='scoring_backfill_v1'").get().value).counts;
  assert.equal(counts.ai + counts.math + counts.manual + counts.legacy, tasks.length); assert.equal(counts.kept, 0);
  assert.equal(db.prepare("SELECT count(*) n FROM scoring_audit WHERE action='backfilled'").get().n, 1);
  db.close();
  /* every task document carries its summary, slim ones too */
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const withEffort = boot.tasks.filter(x => x.effort > 0);
  assert.ok(withEffort.some(x => x._slim) && withEffort.some(x => !x._slim), 'slim and full tasks');
  withEffort.forEach(x => { assert.equal(x.scoring.hours.status, 'unverified', x.id); assert.equal(x.scoring.hours.source !== null, true); assert.equal(Math.round(x.scoring.hours.value * 60), Math.round(x.effort * 60), x.id); });
  await s.stop();

  /* another workspace's task in the same database, and the once-only mark taken away: nothing twice, nothing of theirs */
  db = dbAt(at.dir);
  db.prepare("INSERT INTO workspaces (id, name) VALUES ('ws_zzother', 'Other')").run();
  db.prepare("INSERT INTO tasks (id, workspace_id, title, status_id, estimated_minutes, meta, created_at, updated_at) VALUES ('X-1', 'ws_zzother', 'Their feed post', 'todo', 120, '{}', ?, ?)").run(new Date().toISOString(), new Date().toISOString());
  db.prepare("DELETE FROM app_meta WHERE key='scoring_backfill_v1'").run();
  db.close();
  s = await start(at);
  db = dbAt(at.dir);
  try {
    assert.equal(db.prepare("SELECT count(*) n FROM task_scoring").get().n, tasks.length, 'nothing twice, nothing from the other workspace');
    assert.equal(db.prepare("SELECT count(*) n FROM task_scoring WHERE task_id='X-1'").get().n, 0);
    assert.equal(JSON.stringify(db.prepare("SELECT id, estimated_minutes FROM tasks WHERE estimated_minutes > 0 AND workspace_id<>'ws_zzother' ORDER BY id").all().map(x => [x.id, x.estimated_minutes])), before, 'the estimates were never rewritten');
    assert.equal(JSON.parse(db.prepare("SELECT value FROM app_meta WHERE key='scoring_backfill_v1'").get().value).counts.kept, tasks.length);
    assert.equal(db.prepare("SELECT count(*) n FROM scoring_audit WHERE action='backfilled'").get().n, 1, 'no new line when nothing was made');
  } finally { db.close(); }
  await refused(await s.req('GET', '/api/tasks/X-1/scoring', undefined, s.admin), 404);
  await refused(await s.req('POST', '/api/tasks/X-1/scoring/calculate', { module: 'hours' }, s.admin), 404);
});

test('the hooks other modules register run after every task write, a throwing one does not stop the save; a deleted task leaves "removed with task" in the audit', { timeout: 120000 }, async t => {
  const at = place(t), logFile = path.join(at.dir, 'hooks.log'), preload = path.join(at.dir, 'hooks-preload.js');
  /* a stand-in for a later module: it registers three hooks, the second of which always throws */
  fs.writeFileSync(preload, [
    "const Module = require('module'), fs = require('fs'), path = require('path');",
    "const load = Module._load, LOG = " + JSON.stringify(logFile) + ";",
    "Module._load = function (request, parent) {",
    "  const out = load.apply(this, arguments);",
    "  if (request === './scoring' && parent && parent.filename.endsWith(path.join('server', 'server.js'))) return function () {",
    "    const api = out.apply(this, arguments);",
    "    api.onTaskWritten((id, u, info) => fs.appendFileSync(LOG, JSON.stringify({ id, by: u && u.id, via: info && info.via }) + '\\n'));",
    "    api.onTaskWritten(() => { throw new Error('a broken hook'); });",
    "    api.onTaskWritten(id => fs.appendFileSync(LOG, JSON.stringify({ id, after: true }) + '\\n'));",
    "    return api; };",
    "  return out;",
    "};"].join('\n'));
  const s = await start(at, {}, preload), k = kit(s);
  const lines = () => (fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').trim().split('\n').filter(Boolean).map(l => JSON.parse(l)) : []);
  const T = await k.task({ effort: 2 });
  await ok(await k.save(T.id, s.admin, d => { d.title = 'Feed post Ramadan, again'; }));
  await ok(await k.move(T.id, 'progress'));
  const created = (await k.doc(T.id)).activity.find(x => x.k === 'created');
  await ok(await s.req('POST', '/api/restore/task/' + T.id, { activityId: created.id }, s.admin));
  await k.on();
  await ok(await k.calc(T.id, { module: 'hours', inputs: { units: 2 } }));
  const L = lines();
  assert.deepEqual(L.filter(x => !x.after).map(x => x.via), ['create', 'task', 'move', 'restore', 'scoring']);
  assert.ok(L.every(x => x.id === T.id)); assert.ok(L.filter(x => !x.after).every(x => x.by === 'admin'));
  assert.equal(L.filter(x => x.after).length, 5, 'the hook after the broken one still ran every time');
  assert.match(s.log(), /a task-write hook failed for .*a broken hook/);
  assert.equal((await k.doc(T.id)).title, 'Feed post Ramadan', 'and every save stood');

  /* deleting the task: its scores leave a line each in the audit first */
  await ok(await s.req('DELETE', '/api/tasks/' + T.id, undefined, s.admin));
  const db = dbAt(at.dir);
  try {
    assert.equal(db.prepare("SELECT count(*) n FROM task_scoring WHERE task_id=?").get(T.id).n, 0);
    const gone = db.prepare("SELECT * FROM scoring_audit WHERE task_id=? AND action='removed_with_task'").all(T.id);
    assert.equal(gone.length, 1); assert.equal(gone[0].module, 'hours'); assert.equal(gone[0].actor_id, 'admin'); assert.equal(JSON.parse(gone[0].old_value).value, S.hours(D.hours, { kind: 'feed', units: 2 }).value, 'what the score was: two feed posts');
    assert.ok(db.prepare("SELECT count(*) n FROM scoring_audit WHERE task_id=?").get(T.id).n > 1, 'the rest of its history stays');
  } finally { db.close(); }
});

test('the sweep at start catches up with what changed outside a request: a changed scope, time logged before approval', { timeout: 120000 }, async t => {
  const at = place(t); let s = await start(at), k = kit(s);
  await k.on(); await k.role('team_lead', ['scoring_approve_estimate']);
  const andi = await s.as('andi');
  const T = await k.task(); await ok(await k.calc(T.id, { module: 'hours' })); await ok(await k.approve(T.id, 'hours', {}, andi));
  const U = await k.task({ title: 'Story set', assetCount: 3 }); await ok(await k.calc(U.id, { module: 'hours' }));
  await s.stop();
  let db = dbAt(at.dir); const ws = db.prepare("SELECT id FROM workspaces ORDER BY rowid LIMIT 1").get().id, at0 = new Date().toISOString();
  db.prepare("UPDATE tasks SET asset_count=9, updated_at=? WHERE id=?").run(at0, T.id);
  db.prepare("INSERT INTO task_time_entries (id, workspace_id, task_id, user_id, work_date, minutes, kind, source, created_at) VALUES ('te_test_1', ?, ?, 'sarah', ?, 90, 'work', 'manual', ?)").run(ws, U.id, at0.slice(0, 10), at0);
  db.close();
  s = await start(at);
  const status = id => { const x = dbAt(at.dir); try { return (x.prepare("SELECT status FROM task_scoring WHERE task_id=? AND module='hours'").get(id) || {}).status; } finally { x.close(); } };
  for (let i = 0; i < 60 && !(status(T.id) === 'rebaseline_needed' && status(U.id) === 'locked'); i++) await wait(250);
  assert.equal(status(T.id), 'rebaseline_needed', 'the scope changed after the lock');
  assert.equal(status(U.id), 'locked', 'time logged: work has started');
  const v = await kit(s).view(U.id);
  assert.equal(v.audit[0].action, 'frozen_at_work_start'); assert.equal(v.audit[0].meta.trigger, 'time'); assert.equal(v.audit[0].by, null);
  assert.match(s.log(), /\[scoring\] sweep: 2 task\(s\)/);
});
