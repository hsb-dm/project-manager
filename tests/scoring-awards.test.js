/* The efficiency bonus on the real server (Oct 2026, server/scoring-awards.js, docs/SMART-SCORING.md §13). The spec's
   acceptance case end to end (§14.6): an estimate of 8 h locked by someone not assigned after the bonus was turned
   on, 5 h logged by the assignee through the time log, the version approved by the reviewer, the task completed — the
   award waits for review with a bonus of 1.10 and 9.10 earned, the approvers are told, and someone independent
   approves it, which verifies the time it rests on. Nobody who worked on the task approves its bonus, an admin
   included, nor anyone acting as someone else. A shared task is split by the time each person logged, cent for cent,
   adjustable by the approver (to 100%, with a reason). Opening the task again sends the award back to provisional; a
   change of scope pauses it until a re-baseline; time changed after the approval sends it back to review; a
   recalculation twice changes nothing the second time. Time kept from before the time log never earns; an estimate
   approved after the work started, before the bonus was on or outside the pilot teams earns nothing, each with its
   reason; a duplicated task carries no award. The bonus can now be turned on (BONUS_READY); with it off, or COS_SCORING=0,
   the awards are read and never changed. The engine's numbers: tests/scoring-sanity.test.js; the page: the last tests
   here and e2e/scoring-awards.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');

function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-scoring-awards-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at, env) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Award!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'award-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'award-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_SCORING: '', COS_ALLOW_IMPERSONATION: '1', COS_MAIL_TRANSPORT: 'log' }, env || {}) });
  let out = ''; child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 15000); const look = () => { const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }; child.stdout.on('data', look); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c, h) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}, h || {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Award!Admin234567');
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const cookies = {};
  const as = async id => { if (cookies[id]) return cookies[id]; const r = await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); assert.ok(r.ok, await r.text()); return (cookies[id] = await login(boot.people[id].email, 'Member!Pass2345')); };
  const s = { req, admin, as, boot, stop, dir: at.dir, log: () => out }; at.servers.push(s); return s;
}
const json = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { raw: t }; } };
const dbAt = dir => new DatabaseSync(path.join(dir, 'creative-os.db'));
const ok = async (r, what) => { const b = await json(r); assert.equal(r.status, 200, (what || '') + ' ' + JSON.stringify(b).slice(0, 500)); return b; };
const refused = async (r, status, re, what) => { const b = await json(r); assert.equal(r.status, status, (what || '') + ' ' + JSON.stringify(b).slice(0, 500)); if (re) assert.match(b.error || '', re, what); return b; };
const today = () => new Date().toISOString().slice(0, 10);
const rows = (s, sql, ...a) => { const db = dbAt(s.dir); try { return db.prepare(sql).all(...a); } finally { db.close(); } };

function kit(s) {
  const k = {
    async settings() { return (await (await s.req('GET', '/api/scoring/settings', undefined, s.admin)).json()).settings; },
    async set(fn) { const cur = await k.settings(), next = JSON.parse(JSON.stringify(cur)); fn(next); const r = await s.req('PUT', '/api/scoring/settings', { settings: next, configVersion: cur.configVersion }, s.admin); assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).settings; },
    /* Smart Scoring on with the bonus */
    on: fn => k.set(x => { x.enabled = true; x.bonus.on = true; if (fn) fn(x); }),
    async task(fields, who) { return ok(await s.req('POST', '/api/tasks', Object.assign({ title: 'Feed post Ramadan', status: 'todo', prio: 'medium', assignee: 'sarah', assignees: ['sarah'], reviewer: 'laura', reviewers: ['laura'], team: 'design', assetCount: 5, effort: 8 }, fields || {}), who || s.admin), 'create'); },
    async doc(id, who) { return (await s.req('GET', '/api/tasks/' + id, undefined, who || s.admin)).json(); },
    async view(id, who, h) { return ok(await s.req('GET', '/api/tasks/' + id + '/scoring', undefined, who || s.admin, h), 'view'); },
    async eff(id, who) { return (await k.view(id, who)).efficiency; },
    put: (id, m, body, who) => s.req('PUT', '/api/tasks/' + id + '/scoring/' + m, body, who || s.admin),
    lock: (id, m, who, body) => s.req('POST', '/api/tasks/' + id + '/scoring/' + m + '/approve', body || {}, who || s.admin),
    rebaseline: (id, m, body, who) => s.req('POST', '/api/tasks/' + id + '/scoring/' + m + '/rebaseline', body || {}, who || s.admin),
    async save(id, who, fn) { const d = await k.doc(id, who); d.meta = d.meta || {}; fn(d); return s.req('PUT', '/api/tasks/' + id, d, who || s.admin); },
    move: (id, to, who) => s.req('POST', '/api/tasks/' + id + '/move', { type: 'MOVE_TASK_STATUS', toStatusId: to }, who || s.admin),
    log: (id, minutes, who, extra) => s.req('POST', '/api/tasks/' + id + '/time', Object.assign({ workDate: today(), minutes, kind: 'work' }, extra || {}), who),
    editTime: (id, entryId, body, who) => s.req('PUT', '/api/tasks/' + id + '/time/' + entryId, body, who),
    recalc: (id, who) => s.req('POST', '/api/tasks/' + id + '/efficiency/recalculate', {}, who || s.admin),
    approve: (id, body, who, h) => s.req('POST', '/api/tasks/' + id + '/efficiency/approve', body || {}, who || s.admin, h),
    reject: (id, body, who) => s.req('POST', '/api/tasks/' + id + '/efficiency/reject', body || {}, who || s.admin),
    async grant(id, caps) { const r = await s.req('PUT', '/api/members/' + id + '/cap-grants', { caps }, s.admin); assert.ok(r.ok, await r.text()); },
    /* the assignee uploads a version, the reviewer approves it */
    async version(id, uploader, reviewer) {
      await ok(await k.save(id, uploader, d => { d.versions.push({ id: 'ver_' + id + '_' + (d.versions.length + 1), n: d.versions.length + 1, annots: [] }); }), 'upload');
      await ok(await k.save(id, reviewer, d => { d.versions[d.versions.length - 1].state = 'approved'; }), 'approve the version');
    },
    effAudit: id => rows(s, "SELECT action, actor_id, reason, meta FROM scoring_audit WHERE task_id=? AND module='efficiency' ORDER BY created_at, rowid", id)
  };
  return k;
}
/* an estimate of 8 h approved by Laura before the work, the work in progress */
async function lockedTask(k, laura, fields) {
  const T = await k.task(fields);
  await ok(await k.lock(T.id, 'hours', laura), 'lock the estimate');
  return T;
}

test('the acceptance case: E 8 h, A 5 h, B 8 points → pending review with +1.10 and 9.10 earned, the approvers told, approved by someone independent, the time verified', { timeout: 180000 }, async t => {
  const s = await start(place(t)), k = kit(s);
  const st = await k.on(x => { x.modules.weighted.on = true; });
  assert.equal(st.bonus.on, true, 'the bonus can be turned on now'); assert.ok(st.bonus.enabledAt, 'and the server stamps when');
  const sarah = await s.as('sarah'), laura = await s.as('laura'), zein = await s.as('zein'), maya = await s.as('maya');
  await k.grant('laura', ['scoring_approve_estimate']); await k.grant('zein', ['scoring_approve_completion']);
  const T = await k.task();
  /* the base: 8 Weighted Points, set and locked by people not on the task */
  await ok(await k.put(T.id, 'weighted', { value: 8, reason: 'agreed with the lead', rev: 0 }), 'weighted points');
  await ok(await k.lock(T.id, 'weighted', laura), 'lock the weighted points');
  await ok(await k.lock(T.id, 'hours', laura), 'lock the estimate');
  await ok(await k.move(T.id, 'progress', sarah), 'start');
  await ok(await k.log(T.id, 300, sarah), '5 h logged');
  await k.version(T.id, sarah, laura);

  /* under way: provisional, and what it would be */
  let e = await k.eff(T.id, sarah);
  assert.equal(e.status, 'provisional');
  assert.deepEqual(e.reasons.map(r => r.code), ['not_completed']);
  assert.equal(e.bonus, 1.1, 'the bonus it would be'); assert.equal(e.earned, 9.1);
  assert.equal((await k.view(T.id, maya)).efficiency, undefined, 'someone not on it sees nothing');

  /* completed by the reviewer */
  await ok(await k.move(T.id, 'done', laura), 'done');
  e = await k.eff(T.id, zein);
  assert.equal(e.status, 'pending_review');
  assert.equal(e.estimate, 8); assert.equal(e.actual, 5); assert.equal(e.saved, 3);
  assert.equal(e.base.value, 8); assert.equal(e.base.source, 'weighted');
  assert.equal(e.bonus, 1.1); assert.equal(e.earned, 9.1); assert.equal(e.eligible, true); assert.deepEqual(e.reasons, []);
  assert.deepEqual(e.awards.map(a => [a.userId, a.share, a.basePoints, a.bonusPoints, a.awardedPoints, a.status]), [['sarah', 1, 8, 1.1, 9.1, 'pending_review']]);
  assert.equal(e.can.approve, true); assert.equal(e.can.blocked, null);
  const keys = e.steps.map(x => x.key).join('\n');
  assert.match(keys, /Time saved/); assert.match(keys, /Bonus: \{B\}/);
  assert.equal(e.steps.find(x => /^Bonus: /.test(x.key)).vars.earned, '9.10');

  /* the approvers are told — not the person who completed it, not the people credited */
  const notified = rows(s, "SELECT recipient_id FROM notifications WHERE type='efficiency_review' AND entity_id=? ORDER BY recipient_id", T.id).map(r => r.recipient_id);
  assert.deepEqual(notified, ['admin', 'zein']);
  assert.ok((await (await s.req('GET', '/api/bootstrap', undefined, zein)).json()).notifs.some(n => n.k === 'efficiency_review' && n.t === T.id), 'in their bell');

  /* recalculating changes nothing, twice */
  const before = k.effAudit(T.id).length;
  assert.equal((await ok(await k.recalc(T.id, zein))).changed, false);
  assert.equal((await ok(await k.recalc(T.id, sarah))).changed, false, 'the person credited may ask too');
  assert.equal(k.effAudit(T.id).length, before, 'and nothing is written');
  await refused(await k.recalc(T.id, maya), 403);

  /* the person credited never approves it; someone independent does */
  await refused(await k.approve(T.id, {}, sarah), 403);
  await refused(await k.approve(T.id, { qualityScore: 9 }, zein), 400, /quality score/);
  await refused(await k.approve(T.id, { calcKey: 'stale' }, zein), 409, /changed in the meantime/);
  const d = await ok(await k.approve(T.id, { qualityScore: 4, calcKey: e.calcKey }, zein), 'approve');
  assert.equal(d.efficiency.status, 'approved'); assert.equal(d.efficiency.earned, 9.1); assert.equal(d.efficiency.review.by, 'zein'); assert.equal(d.efficiency.review.quality, 4);
  assert.equal(d.verified, 1);
  const te = rows(s, "SELECT verified, verified_by, verified_at FROM task_time_entries WHERE task_id=? AND source='manual'", T.id);
  assert.deepEqual(te.map(x => [x.verified, x.verified_by]), [[1, 'zein']]); assert.ok(te[0].verified_at);
  await refused(await k.approve(T.id, {}, zein), 409, /already approved/);
  e = await k.eff(T.id, sarah);
  assert.equal(e.status, 'approved'); assert.equal(e.bonus, 1.1); assert.equal(e.earned, 9.1);
  assert.deepEqual(e.awards.map(a => a.userId), ['sarah'], 'her own award');
  const a = k.effAudit(T.id).pop(); assert.equal(a.action, 'approved'); assert.equal(a.actor_id, 'zein'); assert.equal(JSON.parse(a.meta).verifiedEntries, 1);
  /* the task as everyone has it carries none of it */
  const doc = await k.doc(T.id, sarah), text = JSON.stringify(doc);
  assert.equal('efficiency' in doc, false); assert.equal(/awardedPoints|bonusPoints|efficiency/.test(text), false);
  /* a later change of the policy — the grace, the bands, Weighted Points off, the bonus off and on again (which starts it
     again from then) — never reopens a decision or changes its numbers */
  await k.set(x => { x.bonus.grace = 0.3; x.bonus.hourMapping.bands = [[4, 2], [16, 6], [999, 10]]; x.modules.weighted.on = false; });
  await k.set(x => { x.bonus.on = false; }); await k.on();
  await ok(await k.recalc(T.id, zein));
  e = await k.eff(T.id, zein);
  assert.equal(e.status, 'approved'); assert.equal(e.bonus, 1.1); assert.equal(e.earned, 9.1); assert.equal(e.base.value, 8);
  assert.match(e.steps.map(x => x.key).join('\n'), /Bonus: \{B\}/, 'the breakdown of the decided award, as it was decided');
});

test('nobody who worked on the task approves its bonus — an admin assigned to it, someone credited and taken off it — nor anyone acting as someone else; a shared task is split by time, cent for cent, adjustable to 100% with a reason', { timeout: 180000 }, async t => {
  const s = await start(place(t)), k = kit(s);
  await k.on();
  const sarah = await s.as('sarah'), laura = await s.as('laura'), rizky = await s.as('rizky');
  await k.grant('laura', ['scoring_approve_estimate', 'scoring_approve_completion']); await k.grant('rizky', ['scoring_approve_completion']);
  const T = await lockedTask(k, laura, { assignee: 'admin', assignees: ['admin', 'sarah', 'rizky'] });
  await ok(await k.move(T.id, 'progress'), 'start');
  await ok(await k.log(T.id, 200, s.admin)); await ok(await k.log(T.id, 100, sarah)); await ok(await k.log(T.id, 30, rizky));
  /* Rizky is taken off the task: his time stays, and so does his credit */
  await ok(await k.save(T.id, s.admin, d => { d.assignees = ['admin', 'sarah']; }));
  await k.version(T.id, sarah, laura);
  await ok(await k.move(T.id, 'done', laura));
  let e = await k.eff(T.id, laura);
  assert.equal(e.status, 'pending_review');
  /* 330 min → 5.5 h on the 8 h estimate; base 5 (the bands: ≤ 8 h); saved 31.25 %, 21.25 % beyond the grace, × 0.5 = 10.625 % → 0.53 */
  assert.equal(e.actual, 5.5); assert.equal(e.base.value, 5); assert.equal(e.base.source, 'hour_mapping'); assert.equal(e.bonus, 0.53); assert.equal(e.earned, 5.53);
  const by = Object.fromEntries(e.awards.map(a => [a.userId, a]));
  assert.deepEqual(Object.keys(by).sort(), ['admin', 'rizky', 'sarah'], 'one award per person credited');
  const sum = k2 => Math.round(e.awards.reduce((x, a) => x + a[k2] * 100, 0)) / 100;
  assert.equal(sum('basePoints'), 5); assert.equal(sum('bonusPoints'), 0.53); assert.equal(sum('awardedPoints'), 5.53, 'the parts add up to the task, cent for cent');
  assert.ok(by.admin.share > by.sarah.share && by.sarah.share > by.rizky.share, 'shared by the time each logged');
  assert.equal(rows(s, 'SELECT count(*) n FROM task_efficiency_awards WHERE task_id=?', T.id)[0].n, 3, 'no duplicate rows');

  await refused(await k.approve(T.id, {}), 403, /You worked on this task/, 'an admin assigned to it');
  assert.equal((await k.eff(T.id)).can.blocked, 'worked_on_it');
  await refused(await k.approve(T.id, {}, rizky), 403, /You worked on this task/, 'credited, though no longer assigned');
  await refused(await k.reject(T.id, { reason: 'x' }, sarah), 403);
  await refused(await k.approve(T.id, {}, s.admin, { 'x-act-as': 'laura' }), 403, /acting as someone else/);

  /* the shares: for each person credited, adding up to 100%, with a reason */
  await refused(await k.approve(T.id, { shares: { admin: 50, sarah: 50 } }, laura), 400, /each person credited/);
  await refused(await k.approve(T.id, { shares: { admin: 50, sarah: 40, rizky: 5 }, reason: 'x' }, laura), 400, /add up to 100%/);
  await refused(await k.approve(T.id, { shares: { admin: 50, sarah: 40, rizky: 10 } }, laura), 400, /Say why the shares change/);
  /* a minimum quality, when the workspace sets one */
  await k.set(x => { x.bonus.minQuality = 3; });
  await refused(await k.approve(T.id, { shares: { admin: 50, sarah: 40, rizky: 10 }, reason: 'Sarah did the key visual' }, laura), 400, /from a score of 3/);
  await refused(await k.approve(T.id, { qualityScore: 2, shares: { admin: 50, sarah: 40, rizky: 10 }, reason: 'Sarah did the key visual' }, laura), 400, /under the 3/);
  assert.equal((await k.eff(T.id, laura)).can.qualityRequired, true);
  const d = await ok(await k.approve(T.id, { qualityScore: 4, shares: { admin: 50, sarah: 40, rizky: 10 }, reason: 'Sarah did the key visual' }, laura));
  e = d.efficiency;
  const after = Object.fromEntries(e.awards.map(a => [a.userId, a]));
  assert.deepEqual([after.admin.share, after.sarah.share, after.rizky.share], [0.5, 0.4, 0.1]);
  assert.deepEqual([after.admin.basePoints, after.sarah.basePoints, after.rizky.basePoints], [2.5, 2, 0.5]);
  assert.equal(Math.round((after.admin.bonusPoints + after.sarah.bonusPoints + after.rizky.bonusPoints) * 100) / 100, 0.53);
  assert.equal(d.verified, 3, 'every entry of the people credited verified');
  const audit = k.effAudit(T.id).pop(), meta = JSON.parse(audit.meta);
  assert.equal(audit.reason, 'Sarah did the key visual'); assert.equal(meta.sharesAdjusted, true); assert.deepEqual(meta.sharesTo, { admin: 50, sarah: 40, rizky: 10 });
});

test('opened again → provisional; completed again → review again; time changed after the approval → back to review; a change of scope pauses it until a re-baseline; a rejection needs a reason', { timeout: 180000 }, async t => {
  const s = await start(place(t)), k = kit(s);
  await k.on();
  const sarah = await s.as('sarah'), laura = await s.as('laura'), zein = await s.as('zein');
  await k.grant('laura', ['scoring_approve_estimate']); await k.grant('zein', ['scoring_approve_completion']);
  /* the assignee raises the estimate shortly before it is approved: the reviewer is told */
  const T = await k.task({ effort: 6 });
  await ok(await k.save(T.id, sarah, d => { d.effort = 8; d.meta.effortManual = true; }), 'raised');
  await ok(await k.lock(T.id, 'hours', laura), 'lock the estimate');
  await ok(await k.move(T.id, 'progress', sarah));
  const entry = (await ok(await k.log(T.id, 300, sarah))).entry;
  await k.version(T.id, sarah, laura);
  await ok(await k.move(T.id, 'done', laura));
  let e = await k.eff(T.id, zein);
  assert.equal(e.status, 'pending_review'); assert.equal(e.estimate, 8);
  assert.deepEqual(e.flags.map(f => [f.code, f.vars.from, f.vars.to]), [['review_estimate_raised', 6, 8]], 'flagged, never an accusation');
  await ok(await k.approve(T.id, {}, zein));

  /* a small change after the approval: the decision stands, the reviewer is told */
  await ok(await k.log(T.id, 5, sarah));
  e = await k.eff(T.id, zein);
  assert.equal(e.status, 'approved'); assert.ok(e.flags.some(f => f.code === 'review_time_after_approval'), 'flagged, never an accusation');
  /* a material one (30 min ≥ the 0.25 h set): back to review */
  await ok(await k.editTime(T.id, entry.id, { minutes: 330 }, sarah));
  e = await k.eff(T.id, zein);
  assert.equal(e.status, 'pending_review'); assert.equal(e.actual, 5.5);
  assert.equal(k.effAudit(T.id).pop().action, 'review_reopened');
  assert.deepEqual(JSON.parse(k.effAudit(T.id).pop().meta).material, ['time']);
  await ok(await k.approve(T.id, {}, zein));

  /* opened again: provisional, nothing approved by itself when it is completed again */
  await ok(await k.move(T.id, 'revision', laura));
  e = await k.eff(T.id, zein);
  assert.equal(e.status, 'provisional'); assert.equal(e.awards[0].status, 'provisional');
  await ok(await k.move(T.id, 'done', laura));
  assert.equal((await k.eff(T.id, zein)).status, 'pending_review', 'it waits for a new approval');

  /* the scope changes: paused (ineligible, scope_changed) until it is put back or re-baselined */
  await ok(await k.save(T.id, s.admin, d => { d.assetCount = 7; }));
  e = await k.eff(T.id, zein);
  assert.equal(e.status, 'ineligible'); assert.ok(e.reasons.some(r => r.code === 'scope_changed'));
  await refused(await k.approve(T.id, {}, zein), 409, /not waiting for review/);
  /* a re-baseline after the work started, on a baseline first approved before it: eligible again, flagged */
  await ok(await k.rebaseline(T.id, 'hours', { reason: 'two more sizes', value: 9 }, laura));
  e = await k.eff(T.id, zein);
  assert.equal(e.status, 'pending_review'); assert.equal(e.estimate, 9);
  assert.ok(e.flags.some(f => f.code === 'review_rebaselined' && f.vars.from === 8 && f.vars.to === 9));

  /* rejected, with a reason */
  await refused(await k.reject(T.id, {}, zein), 400, /reason is required/);
  const d = await ok(await k.reject(T.id, { reason: 'the time looks off' }, zein));
  assert.equal(d.efficiency.status, 'rejected'); assert.equal(d.efficiency.bonus, 0); assert.equal(d.efficiency.earned, d.efficiency.base.value);
  assert.equal(d.efficiency.review.note, 'the time looks off');
});

test('no bonus from time kept from before the time log, from an estimate approved after the work started or before the bonus was on, or outside the pilot teams; a duplicated task carries no award', { timeout: 180000 }, async t => {
  const s = await start(place(t)), k = kit(s);
  const laura = await s.as('laura'), sarah = await s.as('sarah'), andi = await s.as('andi');
  await k.grant('laura', ['scoring_approve_estimate', 'scoring_approve_completion']);
  /* before Smart Scoring: an Actual typed in, and an estimate approved while the bonus was off */
  const L = await k.task({ title: 'Poster A3', meta: { actualEffort: 4 } });
  await k.set(x => { x.enabled = true; x.bonus.requireApprovedVersion = false; });
  const R = await k.task({ title: 'Banner set' });
  await ok(await k.lock(R.id, 'hours', laura), 'locked while the bonus is off');
  await k.on();
  /* legacy: the time log keeps the Actual as a legacy entry, which never earns */
  await ok(await s.req('GET', '/api/tasks/' + L.id + '/time', undefined, sarah));
  assert.equal(rows(s, "SELECT count(*) n FROM task_time_entries WHERE task_id=? AND source='legacy'", L.id)[0].n, 1);
  await ok(await k.lock(L.id, 'hours', laura));
  await ok(await k.move(L.id, 'done', laura));
  let e = await k.eff(L.id, laura);
  assert.deepEqual(e.reasons.map(r => r.code), ['legacy_time_only']); assert.equal(e.status, null, 'no award at all'); assert.deepEqual(e.awards, []);
  /* approved before the bonus was turned on: never retroactive */
  await ok(await k.move(R.id, 'progress', sarah)); await ok(await k.log(R.id, 240, sarah)); await ok(await k.move(R.id, 'done', laura));
  e = await k.eff(R.id, laura);
  assert.equal(e.status, 'ineligible'); assert.deepEqual(e.reasons.map(r => r.code), ['lock_before_bonus']); assert.equal(e.bonus, 0);
  /* frozen when the work started, approved only afterwards */
  const W = await k.task({ title: 'Story set' });
  await ok(await k.move(W.id, 'progress', sarah));
  await ok(await k.lock(W.id, 'hours', laura));
  await ok(await k.log(W.id, 60, sarah)); await ok(await k.move(W.id, 'done', laura));
  e = await k.eff(W.id, laura);
  assert.equal(e.status, 'ineligible'); assert.deepEqual(e.reasons.map(r => r.code), ['lock_after_work_started']);
  /* the pilot: only the teams named */
  await k.set(x => { x.bonus.pilotTeams = ['motion']; });
  const P = await lockedTask(k, laura, { title: 'Reels cutdown', assignee: 'sarah', assignees: ['sarah'], team: 'design' });
  const M = await lockedTask(k, laura, { title: 'Reels teaser', assignee: 'andi', assignees: ['andi'], team: 'motion', effort: 6 });
  for (const [x, who] of [[P, sarah], [M, andi]]) { await ok(await k.move(x.id, 'progress', who)); await ok(await k.log(x.id, 180, who)); await ok(await k.move(x.id, 'done', laura)); }
  e = await k.eff(P.id, laura);
  assert.deepEqual(e.reasons.map(r => r.code), ['not_in_pilot']); assert.equal(e.status, null, 'no award is made outside the pilot');
  e = await k.eff(M.id, laura);
  assert.equal(e.status, 'pending_review'); assert.equal(e.estimate, 6); assert.equal(e.actual, 3);
  /* a duplicate: as the page makes one — the same task again, with nothing done on it */
  const src = await k.doc(M.id), copy = JSON.parse(JSON.stringify(src));
  Object.assign(copy, { id: undefined, title: src.title + ' (copy)', status: 'backlog', versions: [], comments: [], files: [], activity: [], completedAt: null }); delete copy.meta.actualEffort; delete copy.scoring;
  const C = await ok(await s.req('POST', '/api/tasks', copy, s.admin), 'duplicate');
  assert.notEqual(C.id, M.id);
  e = await k.eff(C.id);
  assert.deepEqual(e.awards, []); assert.equal(e.status, null);
  assert.equal(rows(s, 'SELECT count(*) n FROM task_efficiency_awards WHERE task_id=?', C.id)[0].n, 0);
});

test('the bonus off, Smart Scoring off or COS_SCORING=0: the awards are read, never changed', { timeout: 180000 }, async t => {
  const at = place(t), s = await start(at), k = kit(s);
  await k.on(x => { x.bonus.requireApprovedVersion = false; });
  const laura = await s.as('laura'), sarah = await s.as('sarah');
  await k.grant('laura', ['scoring_approve_estimate', 'scoring_approve_completion']);
  const T = await lockedTask(k, laura);
  await ok(await k.move(T.id, 'progress', sarah)); await ok(await k.log(T.id, 300, sarah)); await ok(await k.move(T.id, 'done', laura));
  assert.equal((await k.eff(T.id, laura)).status, 'pending_review');
  const st = await k.set(x => { x.bonus.on = false; });
  assert.equal(st.bonus.enabledAt, null);
  await refused(await k.approve(T.id, {}, laura), 409, /efficiency bonus is turned off/);
  await refused(await k.recalc(T.id, laura), 409, /efficiency bonus is turned off/);
  await ok(await k.log(T.id, 60, sarah), 'the time log goes on');
  let e = await k.eff(T.id, laura);
  assert.equal(e.on, false); assert.equal(e.status, 'pending_review', 'nothing is worked out again while it is off'); assert.equal(e.actual, 5);
  await k.set(x => { x.enabled = false; });
  e = await k.eff(T.id, laura);
  assert.deepEqual(e.awards.map(a => [a.userId, a.status, a.awardedPoints]), [['sarah', 'pending_review', 5.69]], 'still read with Smart Scoring off');
  await refused(await k.approve(T.id, {}, laura), 409, /turned off in this workspace/);
  await s.stop();
  const s2 = await start(at, { COS_SCORING: '0' }), k2 = kit(s2);
  await refused(await k2.recalc(T.id), 409, /turned off on this server/);
  await refused(await k2.approve(T.id, {}), 409, /turned off on this server/);
});

/* ---------- the page: the efficiency line (src/scoring-awards.js) ---------- */
const SRC = fs.readFileSync(path.join(root, 'src', 'scoring-awards.js'), 'utf8');
const JS = SRC.slice(SRC.indexOf('<script>') + 8, SRC.indexOf('</script>'));
const Engine = require('../shared/scoring-engine.js'), Settings = require('../shared/scoring-settings.js');
function page(over) {
  const c = Object.assign({ UI_ID: {}, UI_LANG: 'en', console, ScoringEngine: Engine, ScoringSettings: Settings, I: { star: '', flag: '', check: '', x: '', info: '' }, ME: 'zein', PEOPLE: { sarah: { name: 'Sarah Wijaya' }, zein: { name: 'Zein' } },
    API: { on: true }, SCR: { cache: {} }, WS: { workflow: [], scoring: Settings.defaults() }, TEAMS: [] }, over || {});
  c.tr = s => (c.UI_LANG === 'id' ? c.UI_ID[s] || s : s);
  c.esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[m]);
  c.attr = c.esc; c.jsq = s => "'" + String(s).replace(/'/g, "\\'") + "'";
  c.fmt = (s, v) => String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m));
  c.person = id => c.PEOPLE[id] || { name: id };
  vm.createContext(c); vm.runInContext(JS, c); return c;
}
const pendingBlock = () => ({ on: true, bonusOn: true, status: 'pending_review', eligible: true, completed: true, estimate: 8, actual: 5, saved: 3, base: { value: 8, source: 'weighted' }, bonus: 1.1, earned: 9.1,
  reasons: [], flags: [{ code: 'review_fast', key: Engine.SENTENCES.eReview, vars: { pct: 37.5, limit: 40 } }],
  steps: Engine.efficiency(Settings.defaults().bonus, { E: 8, A: 5, B: 8, completed: true, qualityApproved: true, validLogs: true }).steps,
  people: [{ userId: 'sarah', minutes: 300, hours: 5, share: 1 }], awards: [{ userId: 'sarah', share: 1, basePoints: 8, bonusPoints: 1.1, awardedPoints: 9.1, status: 'pending_review' }],
  calcKey: 'k', policy: { minQuality: null }, can: { recalculate: true, review: true, approve: true, reject: true, blocked: null, qualityRequired: false } });

test('the page: the efficiency line reads "Estimated 8 h · Actual 5 h · Saved 3 h · Base 8.00 pts · Efficiency Bonus +1.10 pts · Earned 9.10 pts · Pending review", with the review action for an approver and the operational-metric note', () => {
  const c = page(), html = c.scoringEfficiencyLineHtml({ id: 'T-1', assignees: ['sarah'] }, pendingBlock());
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const part of ['Estimated 8 h', 'Actual 5 h', 'Saved 3 h', 'Base 8.00 pts', 'Efficiency Bonus +1.10 pts', 'Earned 9.10 pts', 'Pending review', 'Operational metric, not compensation or a ranking']) assert.ok(text.includes(part), part + ' in: ' + text);
  assert.match(html, /data-scr-eff-act="approve"/); assert.match(html, /data-scr-eff-act="reject"/);
  assert.match(text, /Done in 37\.5% of the estimated time/, 'the flag');
  /* in Indonesian: time saved is "Hemat", not "Tersimpan" (stored) as elsewhere in the page */
  c.UI_LANG = 'id'; c.UI_ID.Saved = 'Tersimpan';
  const id = c.scoringEfficiencyLineHtml({ id: 'T-1' }, pendingBlock()).replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  for (const part of ['Estimasi 8 h', 'Aktual 5 h', 'Hemat 3 h', 'Dasar 8.00 poin', 'Bonus Efisiensi +1.10 poin', 'Diperoleh 9.10 poin', 'Menunggu review', 'Metrik operasional']) assert.ok(id.includes(part), part + ' in: ' + id);
  c.UI_LANG = 'en';
  /* someone who worked on it: no buttons, and why */
  const mine = pendingBlock(); mine.can = { recalculate: true, review: false, approve: false, reject: false, blocked: 'worked_on_it' };
  const h2 = c.scoringEfficiencyLineHtml({ id: 'T-1' }, mine);
  assert.doesNotMatch(h2, /data-scr-eff-act="approve"/); assert.match(h2, /someone else reviews/);
  /* nothing to show: no block, or the bonus off with nothing ever awarded */
  assert.equal(c.scoringEfficiencyLineHtml({ id: 'T-1' }, null), '');
  assert.equal(c.scoringEfficiencyLineHtml({ id: 'T-1' }, { on: false, bonusOn: false, status: null, awards: [], reasons: [], flags: [], steps: [] }), '');
  /* not eligible: the reasons */
  const no = pendingBlock(); Object.assign(no, { status: 'ineligible', eligible: false, bonus: 0, earned: 8, reasons: [{ code: 'lock_after_work_started', key: 'The estimate was approved only after the work had started. A bonus needs a baseline approved before the work.', vars: {} }], can: { review: true, approve: false, reject: false, blocked: null } });
  const h3 = c.scoringEfficiencyLineHtml({ id: 'T-1' }, no);
  assert.match(h3, /approved only after the work had started/); assert.match(h3, /Not eligible/);
});

test('the page: every word of the efficiency line and the bonus settings has its Indonesian, and the worked example follows the fields', () => {
  const c = page();
  const literals = new Set();
  for (const m of JS.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)) literals.add(JSON.parse('"' + m[1] + '"'));
  for (const v of Object.values(c.SCE_STATUS)) literals.add(v);
  for (const v of Object.values(c.SCE_AUDIT)) literals.add(v);
  for (const v of Object.values(c.SCE_QUALITY)) literals.add(v);
  for (const v of Object.values(c.SCE_SENTENCES)) literals.add(v);
  assert.ok(literals.size > 60, 'the strings were found (' + literals.size + ')');
  const missing = [...literals].filter(s => !(s in c.UI_ID));
  assert.deepEqual(missing, [], 'no Indonesian for: ' + missing.join(' | '));
  const marks = s => (String(s).match(/\{\w+\}/g) || []).sort().join(' ');
  for (const v of Object.values(c.SCE_SENTENCES)) assert.equal(marks(c.UI_ID[v]), marks(v), v);
  /* the server's sentences are the page's */
  const server = require('../server/scoring-awards.js').pure.SENTENCES;
  for (const [code, en] of Object.entries(server)) if (!/^review_fast$/.test(code)) assert.equal(c.SCE_SENTENCES[code], en, code);
  /* the worked example, from the policy as typed */
  const b = Settings.defaults().bonus;
  assert.deepEqual(JSON.parse(JSON.stringify(c.scoringBonusExample(b))), { bonus: '1.10', earned: '9.10', saved: 37.5, beyond: 27.5, rate: 13.75 });
  assert.equal(c.scoringBonusExample(Object.assign({}, b, { maxRate: 0.1 })).bonus, '0.80', 'capped at the most bonus');
  assert.equal(c.scoringBonusExample(Object.assign({}, b, { grace: 0.4 })).bonus, '0.00', 'within the grace');
});
