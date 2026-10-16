/* The time log on the real server (Oct 2026, server/scoring-time.js, docs/SMART-SCORING.md Phase 3a). With Smart
   Scoring and its Effort Hours on, the people assigned to a task log their own time as dated entries — work, revision
   or blocked — and the task's Actual (meta.actualEffort) is their work and revision, to the nearest quarter hour,
   written by the server; blocked time is kept apart. Someone else's entry is changed or deleted only by whoever may
   correct scores, with a reason, and every entry made, changed and deleted is audited with what it was and became. A
   day that has not come, a day over 60 days back, a person's day over 24 hours and two entries at the same time are
   refused; a long day is saved with a warning. Off, the routes answer 409 and Actual is typed as before. The Actual of
   before becomes one legacy, unverified entry per task, once, without changing it. The hooks (a task saved elsewhere
   gets its Actual back, the sweep) are tried in-process at the end. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');

function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-time-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at, env) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Time!Admin2345678', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'time-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'time-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_SCORING: '' }, env || {}) });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 15000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Time!Admin2345678');
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const as = async id => { const r = await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); assert.ok(r.ok, await r.text()); return login(boot.people[id].email, 'Member!Pass2345'); };
  const s = { req, admin, as, boot, stop, dir: at.dir, out: () => out }; at.servers.push(s); return s;
}
const json = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { raw: t }; } };
const day = n => new Date(Date.now() - n * 86400000).toISOString().slice(0, 10);   /* n days ago (UTC) */
const readDb = (s, sql, ...args) => { const db = new DatabaseSync(path.join(s.dir, 'creative-os.db'), { readOnly: true }); try { return db.prepare(sql).all(...args).map(r => Object.assign({}, r)); } finally { db.close(); } };
/* the time log on and off: Smart Scoring's master switch (Effort Hours is on inside it by default) */
async function timeLog(s, on) {
  const cur = (await (await s.req('GET', '/api/scoring/settings', undefined, s.admin)).json()).settings;
  const r = await s.req('PUT', '/api/scoring/settings', { settings: Object.assign({}, cur, { enabled: on }), configVersion: cur.configVersion }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
}
const people = s => { const ids = Object.keys(s.boot.people), by = perm => ids.filter(id => s.boot.people[id].perm === perm && !s.boot.people[id].stakeholder); return { members: by('member'), lead: by('team_lead')[0], stakeholder: ids.find(id => s.boot.people[id].stakeholder) }; };
async function newTask(s, extra) { const r = await s.req('POST', '/api/tasks', Object.assign({ title: 'Time ' + Math.random().toString(36).slice(2, 7), status: s.boot.ws.workflow[1].id, prio: 'medium' }, extra), s.admin); assert.equal(r.status, 200, await r.clone().text()); return (await r.json()).id; }

test('the assignees log their own time; Actual is work + revision to the quarter hour; blocked is kept apart; corrections need a reason and are audited', { timeout: 120000 }, async t => {
  const s = await start(place(t));
  const { members: [m1, m2], lead, stakeholder } = people(s);
  assert.ok(m1 && m2 && lead && stakeholder, 'the demo has two members, a team lead and a stakeholder');
  await timeLog(s, true);
  const id = await newTask(s, { assignee: m1, assignees: [m1, m2] });
  const a = await s.as(m1), b = await s.as(m2), l = await s.as(lead), st = await s.as(stakeholder);
  const log = async (who, body) => { const r = await s.req('POST', '/api/tasks/' + id + '/time', body, who); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
  const task = async () => (await s.req('GET', '/api/tasks/' + id, undefined, s.admin)).json();
  const before = (await task()).updatedAt;

  let d = await log(a, { workDate: day(0), minutes: 90, kind: 'work', note: 'Layouts' });
  assert.equal(d.actualEffort, 1.5); assert.equal(d.entries.length, 1);
  assert.deepEqual([d.entry.userId, d.entry.minutes, d.entry.kind, d.entry.note, d.entry.source, d.entry.verified], [m1, 90, 'work', 'Layouts', 'manual', false]);
  let tk = await task();
  assert.equal(tk.meta.actualEffort, 1.5, 'Actual is written onto the task'); assert.notEqual(tk.updatedAt, before, 'and the task is touched, so open tabs fetch it');
  assert.equal(d.updatedAt, tk.updatedAt);
  d = await log(a, { workDate: day(0), minutes: 60, kind: 'blocked', note: 'Waiting for the copy' });
  assert.equal(d.actualEffort, 1.5, 'blocked time is not counted'); assert.equal(d.totals.minutes.blocked, 60);
  d = await log(a, { work_date: day(1), minutes: '20', kind: 'revision' });
  assert.equal(d.actualEffort, 1.75, '110 minutes: 1.75 h');
  d = await log(b, { workDate: day(0), minutes: 50 });
  assert.equal(d.entry.kind, 'work', 'work unless said'); assert.equal(d.actualEffort, 2.75, '160 minutes: 2.75 h');
  assert.deepEqual(d.totals.minutes, { work: 140, revision: 20, blocked: 60 });
  assert.deepEqual(d.totals.byPerson[m1], { work: 90, revision: 20, blocked: 60, actualHours: 1.75 });
  assert.equal(d.totals.byPerson[m2].actualHours, 0.75);
  assert.equal((await task()).meta.actualEffort, 2.75);

  /* who may log: the people assigned, for themselves */
  for (const [who, what] of [[l, 'a team lead not on the task'], [st, 'a stakeholder'], [s.admin, 'an admin not on the task']]) {
    const r = await s.req('POST', '/api/tasks/' + id + '/time', { workDate: day(0), minutes: 30 }, who);
    assert.equal(r.status, 403, what); assert.match((await json(r)).error, /people assigned to it log their own time/);
  }
  /* who sees it: everyone who sees the task; a stakeholder the totals only */
  const seen = await (await s.req('GET', '/api/tasks/' + id + '/time', undefined, l)).json();
  assert.equal(seen.entries.length, 4); assert.deepEqual(seen.can, { log: false, correct: false });
  const client = await (await s.req('GET', '/api/tasks/' + id + '/time', undefined, st)).json();
  assert.deepEqual([client.entries, client.totals.byPerson, client.totals.actualHours], [[], {}, 2.75]);
  assert.deepEqual((await (await s.req('GET', '/api/tasks/' + id + '/time', undefined, a)).json()).can, { log: true, correct: false });

  /* one's own entries are changed and deleted by them; someone else's are not */
  const mine = d.entries.find(e => e.userId === m1 && e.kind === 'work'), rev = d.entries.find(e => e.kind === 'revision'), theirs = d.entries.find(e => e.userId === m2);
  let r = await s.req('PUT', '/api/tasks/' + id + '/time/' + mine.id, { minutes: 120 }, b);
  assert.equal(r.status, 403, 'not someone else\'s');
  r = await s.req('DELETE', '/api/tasks/' + id + '/time/' + mine.id, undefined, b); assert.equal(r.status, 403);
  r = await s.req('PUT', '/api/tasks/' + id + '/time/' + mine.id, { minutes: 120, note: 'Layouts and the key visual' }, a);
  assert.equal(r.status, 200, await r.clone().text()); d = await r.json();
  assert.deepEqual([d.entry.minutes, d.entry.note, d.entry.editedBy, d.actualEffort], [120, 'Layouts and the key visual', m1, 3.25]);
  assert.equal((await (await s.req('PUT', '/api/tasks/' + id + '/time/' + mine.id, { minutes: 120 }, a)).json()).unchanged, true, 'the same again is no change');
  r = await s.req('DELETE', '/api/tasks/' + id + '/time/' + rev.id, undefined, a);
  assert.equal(r.status, 200, await r.clone().text()); d = await r.json();
  assert.equal(d.actualEffort, 2.75, '170 minutes'); assert.equal(d.entries.some(e => e.id === rev.id), false);
  assert.equal((await s.req('DELETE', '/api/tasks/' + id + '/time/' + rev.id, undefined, a)).status, 404, 'gone');

  /* a correction: scoring_edit_task (an admin has it) and a reason */
  r = await s.req('PUT', '/api/tasks/' + id + '/time/' + theirs.id, { minutes: 40 }, s.admin);
  assert.equal(r.status, 400); assert.match((await json(r)).error, /needs a reason/);
  r = await s.req('PUT', '/api/tasks/' + id + '/time/' + theirs.id, { minutes: 40, reason: 'Counted twice in the stand-up' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text()); d = await r.json();
  assert.equal(d.entry.minutes, 40); assert.equal(d.entry.userId, m2, 'still theirs'); assert.equal(d.entry.editedBy, 'admin'); assert.equal(d.actualEffort, 2.75, '160 minutes');
  r = await s.req('DELETE', '/api/tasks/' + id + '/time/' + mine.id, undefined, s.admin); assert.equal(r.status, 400, 'a deletion too');
  r = await s.req('DELETE', '/api/tasks/' + id + '/time/' + mine.id + '?reason=' + encodeURIComponent('Logged on the wrong task'), undefined, s.admin);
  assert.equal(r.status, 200, await r.clone().text()); d = await r.json();
  assert.equal(d.actualEffort, 0.75, 'only the 40 minutes of work left');
  /* a member given scoring_edit_task corrects too; a lead without it does not */
  assert.equal((await s.req('PUT', '/api/tasks/' + id + '/time/' + theirs.id, { minutes: 45, reason: 'x' }, l)).status, 403);

  /* soft: the row stays, marked; every step audited with what it was and became */
  const row = readDb(s, 'SELECT * FROM task_time_entries WHERE id=?', mine.id)[0];
  assert.ok(row.deleted_at); assert.equal(row.deleted_by, 'admin'); assert.equal(row.minutes, 120);
  const audit = readDb(s, "SELECT * FROM scoring_audit WHERE task_id=? AND module='time' ORDER BY created_at, rowid", id);
  assert.deepEqual(audit.map(x => x.action), ['time_logged', 'time_logged', 'time_logged', 'time_logged', 'time_edited', 'time_deleted', 'time_edited', 'time_deleted']);
  const fix = audit[6];
  assert.deepEqual([fix.actor_id, fix.reason, JSON.parse(fix.old_value).minutes, JSON.parse(fix.new_value).minutes, JSON.parse(fix.meta).own, JSON.parse(fix.meta).userId], ['admin', 'Counted twice in the stand-up', 50, 40, false, m2]);
  assert.equal(audit[7].reason, 'Logged on the wrong task'); assert.equal(JSON.parse(audit[7].old_value).id, mine.id); assert.equal(audit[7].new_value, null);
  assert.equal(audit[4].reason, null, 'one\'s own change needs no reason'); assert.equal(JSON.parse(audit[4].meta).own, true);
  const sec = fs.readFileSync(path.join(s.dir, 'security.log'), 'utf8').split('\n').filter(Boolean).map(x => JSON.parse(x)).filter(e => e.event === 'scoring_time_corrected');
  assert.equal(sec.length, 2, 'corrections of someone else\'s time reach the security log');
  assert.ok((await task()).activity.some(x => x.a && x.a.what === 'the time log'), 'and the task\'s history');
});

test('what is refused and what is warned: minutes, kinds, days, start and end, overlaps, a day over 24 hours, a long day', { timeout: 120000 }, async t => {
  const s = await start(place(t));
  const { members: [m1] } = people(s);
  await timeLog(s, true);
  const id = await newTask(s, { assignee: m1, assignees: [m1] }), other = await newTask(s, { assignee: m1, assignees: [m1] });
  const a = await s.as(m1);
  const post = (body, task) => s.req('POST', '/api/tasks/' + (task || id) + '/time', body, a);
  const refused = async (body, status, re, what, task) => { const r = await post(body, task); assert.equal(r.status, status, what + ': ' + (await r.clone().text())); assert.match((await json(r)).error, re, what); };
  await refused({ workDate: day(0), minutes: 0 }, 400, /from 1 minute to 24 hours/, 'no minutes');
  await refused({ workDate: day(0), minutes: 1441 }, 400, /from 1 minute to 24 hours/, 'over a day');
  await refused({ workDate: day(0) }, 400, /how long/, 'no length');
  await refused({ workDate: day(0), minutes: 'an hour' }, 400, /how long/, 'not a number');
  await refused({ workDate: day(0), minutes: 30, kind: 'nap' }, 400, /work, revision or blocked/, 'a kind that is not one');
  await refused({ workDate: '2026-02-30', minutes: 30 }, 400, /Choose the day/, 'not a date');
  await refused({ workDate: day(-3), minutes: 30 }, 400, /has not come yet/, 'a day to come');
  await refused({ workDate: day(70), minutes: 30 }, 400, /last 60 days.*scoring_edit_task/, 'more than 60 days back');
  await refused({ workDate: day(0), minutes: 30, note: 'x'.repeat(501) }, 413, /note/, 'a long note');
  await refused({ workDate: day(0), startedAt: '9:5', endedAt: '10:00' }, 400, /times of the day/, 'not a time');
  await refused({ workDate: day(0), startedAt: '10:00', endedAt: '09:00' }, 400, /end must be after the start/, 'backwards');
  await refused({ workDate: day(0), minutes: 120, startedAt: '09:00', endedAt: '10:00' }, 400, /more than the time between/, 'more than the span');
  assert.equal(readDb(s, 'SELECT count(*) AS n FROM task_time_entries WHERE task_id=?', id)[0].n, 0, 'nothing refused was saved');

  /* 60 days back is still fine; start and end give the minutes */
  let r = await post({ workDate: day(59), minutes: 30 }); assert.equal(r.status, 200, await r.clone().text());
  r = await post({ workDate: day(1), startedAt: '09:00', endedAt: '10:30' }); assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).entry.minutes, 90);
  await refused({ workDate: day(1), startedAt: '10:00', endedAt: '11:00' }, 409, /overlaps another entry.*09:00–10:30/, 'an overlap');
  await refused({ workDate: day(1), startedAt: '08:00', endedAt: '12:00', minutes: 60 }, 409, /overlaps/, 'an overlap around it, on another task too', other);
  r = await post({ workDate: day(1), startedAt: '10:30', endedAt: '11:00' }); assert.equal(r.status, 200, 'touching is not overlapping');
  r = await post({ workDate: day(2), startedAt: '10:00', endedAt: '11:00' }); assert.equal(r.status, 200, 'the same hours on another day');

  /* one person's day, over every task: above 1.5 × 8 h a warning, above 24 h refused */
  r = await post({ workDate: day(3), minutes: 700 }); let d = await r.json();
  assert.deepEqual(d.warnings, [], '11 h 40 min: no warning');
  r = await post({ workDate: day(3), minutes: 700 }, other); d = await r.json();
  assert.equal(r.status, 200); assert.equal(d.warnings.length, 1);
  assert.deepEqual([d.warnings[0].code, d.warnings[0].vars], ['long_day', { hours: 23.33, date: day(3), perDay: 8 }]);
  assert.match(d.warnings[0].text, /A long day: 23\.33 h logged on .*more than 1\.5 × the usual 8 h a day/);
  await refused({ workDate: day(3), minutes: 41 }, 409, /More than 24 hours in one day/, '24 h and a minute');
  r = await post({ workDate: day(3), minutes: 40 }); assert.equal(r.status, 200, 'exactly 24 h is a (very long) day');
  /* an edit is checked the same way, without counting the entry itself twice */
  const big = d.entry;
  r = await s.req('PUT', '/api/tasks/' + other + '/time/' + big.id, { minutes: 701 }, a);
  assert.equal(r.status, 409, await r.clone().text());
  r = await s.req('PUT', '/api/tasks/' + other + '/time/' + big.id, { minutes: 690, kind: 'blocked' }, a);
  assert.equal(r.status, 200, await r.clone().text());
  /* the long day is the person's own number of hours (4 h a day: above 6 h) */
  { const db = new DatabaseSync(path.join(s.dir, 'creative-os.db')); db.exec('PRAGMA busy_timeout = 5000'); db.prepare('UPDATE workspace_members SET hours_per_day=4 WHERE user_id=?').run(m1); db.close(); }
  d = await (await post({ workDate: day(4), minutes: 370 })).json();
  assert.deepEqual(d.warnings.map(w => [w.code, w.vars.perDay, w.vars.hours]), [['long_day', 4, 6.17]]);
  assert.equal(d.limits.longDayMinutes, 360);
  /* an entry older than 60 days is not changed by its owner */
  const old = readDb(s, 'SELECT id FROM task_time_entries WHERE task_id=? AND work_date=?', id, day(59))[0].id;
  r = await s.req('PUT', '/api/tasks/' + id + '/time/' + old, { workDate: day(65) }, a);
  assert.equal(r.status, 400); assert.match((await json(r)).error, /last 60 days/);
});

test('with the time log off the routes answer 409 and Actual is typed as before; COS_SCORING=0 turns the routes off', { timeout: 120000 }, async t => {
  const at = place(t);
  let s = await start(at);
  const { members: [m1] } = people(s);
  const id = await newTask(s, { assignee: m1, assignees: [m1] });
  const a = await s.as(m1);
  for (const [m, p, b] of [['GET', '/api/tasks/' + id + '/time'], ['POST', '/api/tasks/' + id + '/time', { workDate: day(0), minutes: 30 }], ['PUT', '/api/tasks/' + id + '/time/te_x', { minutes: 30 }], ['DELETE', '/api/tasks/' + id + '/time/te_x']]) {
    const r = await s.req(m, p, b, a);
    assert.equal(r.status, 409, m + ' ' + p); assert.match((await json(r)).error, /Time logging is off/);
  }
  /* Actual, typed as today */
  const cur = await (await s.req('GET', '/api/tasks/' + id, undefined, a)).json();
  cur.meta = Object.assign({}, cur.meta, { actualEffort: 3 });
  let r = await s.req('PUT', '/api/tasks/' + id, cur, a); assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await r.json()).meta.actualEffort, 3);
  assert.equal(readDb(s, 'SELECT count(*) AS n FROM task_time_entries')[0].n, 0, 'nothing is made while it is off');
  assert.equal(readDb(s, "SELECT count(*) AS n FROM app_meta WHERE key='scoring_time_backfill_v1'")[0].n, 0, 'and the backfill waits for it to be on');
  /* Smart Scoring on with Effort Hours off: still off */
  const set = (await (await s.req('GET', '/api/scoring/settings', undefined, s.admin)).json()).settings;
  r = await s.req('PUT', '/api/scoring/settings', { settings: Object.assign({}, set, { enabled: true, modules: Object.assign({}, set.modules, { hours: { on: false, mode: 'hybrid' } }) }), configVersion: set.configVersion }, s.admin);
  assert.equal(r.status, 200);
  assert.equal((await s.req('POST', '/api/tasks/' + id + '/time', { workDate: day(0), minutes: 30 }, a)).status, 409, 'Effort Hours off: no time log');
  await s.stop();
  s = await start(at, { COS_SCORING: '0' });
  r = await s.req('GET', '/api/tasks/' + id + '/time', undefined, s.admin);
  assert.equal(r.status, 409); assert.equal((await json(r)).error, 'Smart Scoring is turned off on this server');
});

test('the Actual of before becomes one legacy, unverified entry per task, once, and Actual is not changed by it', { timeout: 150000 }, async t => {
  const at = place(t);
  let s = await start(at);
  const { members: [m1, m2] } = people(s);
  const one = await newTask(s, { assignee: m1, assignees: [m1, m2], meta: { actualEffort: 1.3 } });
  const many = await newTask(s, { assignee: m2, assignees: [m2], meta: { actualEffort: 40 } });
  const nobody = await newTask(s, { meta: { actualEffort: 2 } });
  const none = await newTask(s, { assignee: m1, assignees: [m1], meta: { actualEffort: 0 } });
  const actual = async id => (await (await s.req('GET', '/api/tasks/' + id, undefined, s.admin)).json()).meta.actualEffort;
  await timeLog(s, true);
  let d = await (await s.req('GET', '/api/tasks/' + one + '/time', undefined, s.admin)).json();
  assert.equal(d.entries.length, 1); assert.equal(d.touched, false);
  assert.deepEqual([d.entries[0].userId, d.entries[0].minutes, d.entries[0].kind, d.entries[0].source, d.entries[0].verified], [m1, 78, 'work', 'legacy', false]);
  const tk = await (await s.req('GET', '/api/tasks/' + one, undefined, s.admin)).json();
  assert.equal(d.entries[0].workDate, String(tk.updatedAt).slice(0, 10), 'on the day it was last changed (not finished yet)');
  const rows = () => readDb(s, 'SELECT task_id, user_id, minutes, source, verified FROM task_time_entries ORDER BY task_id');
  const was = rows();
  assert.deepEqual(was.find(r => r.task_id === many), { task_id: many, user_id: m2, minutes: 2400, source: 'legacy', verified: 0 }, 'over 24 hours as one legacy entry');
  assert.deepEqual(was.find(r => r.task_id === nobody), { task_id: nobody, user_id: 'admin', minutes: 120, source: 'legacy', verified: 0 }, 'no one assigned: its creator');
  assert.equal(was.some(r => r.task_id === none), false, 'no Actual, no entry');
  assert.deepEqual([await actual(one), await actual(many), await actual(nobody)], [1.3, 40, 2], 'Actual is not changed');
  const meta = JSON.parse(readDb(s, "SELECT value FROM app_meta WHERE key='scoring_time_backfill_v1'")[0].value);
  assert.equal(meta.entries, was.length);
  assert.ok(/legacy time entries: \d+ made/.test(s.out()), 'the count is logged');
  assert.equal(readDb(s, "SELECT count(*) AS n FROM scoring_audit WHERE module='time' AND action='legacy_backfill'")[0].n, 1);

  /* once: a restart does nothing again, and run again by hand it finds nothing to do */
  await s.stop(); s = await start(at);
  await s.req('GET', '/api/tasks/' + one + '/time', undefined, s.admin);
  assert.deepEqual(rows(), was, 'the same after a restart');
  await s.stop();
  { const db = new DatabaseSync(path.join(at.dir, 'creative-os.db')); db.prepare("DELETE FROM app_meta WHERE key='scoring_time_backfill_v1'").run(); db.close(); }
  s = await start(at);
  await s.req('GET', '/api/tasks/' + one + '/time', undefined, s.admin);
  assert.deepEqual(rows(), was, 'run again: no task gets a second one');
  assert.deepEqual([await actual(one), await actual(many)], [1.3, 40]);

  /* the first entry logged on it: Actual becomes the log's sum, the legacy part kept */
  const a = await s.as(m1);
  let r = await s.req('POST', '/api/tasks/' + one + '/time', { workDate: day(0), minutes: 30 }, a);
  assert.equal(r.status, 200, await r.clone().text()); d = await r.json();
  assert.equal(d.actualEffort, 1.75, '78 + 30 minutes'); assert.equal(d.touched, true);
  /* its owner cannot change a legacy entry, only delete it (and log the days instead); a corrector can, with a reason */
  const legacy = d.entries.find(e => e.source === 'legacy');
  r = await s.req('PUT', '/api/tasks/' + one + '/time/' + legacy.id, { minutes: 60 }, a);
  assert.equal(r.status, 403); assert.match((await json(r)).error, /before the time log/);
  r = await s.req('PUT', '/api/tasks/' + many + '/time/' + d.entries[0].id, { minutes: 60 }, s.admin); assert.equal(r.status, 404, 'an entry of another task is not this task\'s');
  const big = readDb(s, 'SELECT id FROM task_time_entries WHERE task_id=?', many)[0].id;
  r = await s.req('PUT', '/api/tasks/' + many + '/time/' + big, { minutes: 2100, reason: 'Five hours were another task' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text()); assert.equal((await r.json()).actualEffort, 35, 'a legacy entry stays over 24 hours');
  r = await s.req('DELETE', '/api/tasks/' + one + '/time/' + legacy.id, undefined, a);
  assert.equal(r.status, 200, await r.clone().text()); assert.equal((await r.json()).actualEffort, 0.5);

  /* an Actual typed while the log was off, on a task with no log: kept as legacy when its first entry is logged */
  await timeLog(s, false);
  const later = await newTask(s, { assignee: m1, assignees: [m1] });
  const cur = await (await s.req('GET', '/api/tasks/' + later, undefined, a)).json(); cur.meta = Object.assign({}, cur.meta, { actualEffort: 2 });
  assert.equal((await s.req('PUT', '/api/tasks/' + later, cur, a)).status, 200);
  await timeLog(s, true);
  r = await s.req('POST', '/api/tasks/' + later + '/time', { workDate: day(0), minutes: 30 }, a);
  d = await r.json(); assert.equal(d.actualEffort, 2.5); assert.deepEqual(d.entries.map(e => e.source).sort(), ['legacy', 'manual']);
});

/* ---------- in-process: the module's hooks with a stand-in for server/scoring.js ---------- */
function harness(opts) {
  const db = new DatabaseSync(':memory:');
  db.exec(fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8'));
  db.exec("INSERT INTO workspaces (id, name) VALUES ('ws','W')");
  db.exec("INSERT INTO roles (id, workspace_id, name, permissions) VALUES ('member','ws','Member','[]')");
  for (const u of ['u1', 'u2']) { db.prepare("INSERT INTO users (id, name, email) VALUES (?,?,?)").run(u, u, u + '@x.test'); db.prepare("INSERT INTO workspace_members (id, workspace_id, user_id, role_id) VALUES (?,?,?,?)").run('wm' + u, 'ws', u, 'member'); }
  db.exec("INSERT INTO task_statuses (id, workspace_id, name) VALUES ('todo','ws','To do')");
  const task = (id, meta, assignee) => db.prepare("INSERT INTO tasks (id, workspace_id, title, status_id, assignee_id, assignees, meta, updated_at) VALUES (?,?,?,?,?,?,?,?)").run(id, 'ws', id, 'todo', assignee || 'u1', JSON.stringify([assignee || 'u1']), JSON.stringify(meta || {}), '2026-10-01T00:00:00.000Z');
  const { tx, uid, now } = require('../server/db'), { can } = require('../server/permissions');
  const state = { on: true, hooks: [], audit: [], bumps: 0, announced: [], routes: [] };
  const scoring = { featureOn: () => true, isOn: () => state.on, moduleOn: () => state.on, audit: e => { state.audit.push(e); return 'sa' + state.audit.length; } };
  if (!opts || opts.hooks !== false) scoring.onTaskWritten = fn => state.hooks.push(fn);
  class HttpError extends Error { constructor(status, msg) { super(msg); this.status = status; } }
  const forbid = (ok, what) => { if (!ok) throw new HttpError(403, "You don't have permission to " + what + '.'); };
  const route = (method, pattern, handler) => state.routes.push({ method, re: new RegExp('^' + pattern.replace(/:(\w+)/g, '(?<$1>[^/]+)') + '$'), handler });
  const mod = require('../server/scoring-time')(db, 'ws', { scoring, route, HttpError, forbid, can, security: { log() {} }, uid, now, tx, act() {}, bumpData: () => { state.bumps++; }, announceTask: id => state.announced.push(id) });
  const call = (method, p, body, u, q) => { const r = state.routes.find(x => x.method === method && x.re.test(p)); return r.handler(u, p.match(r.re).groups, q || {}, body || {}, { ip: '127.0.0.1' }); };
  const meta = id => JSON.parse(db.prepare('SELECT meta FROM tasks WHERE id=?').get(id).meta);
  const u1 = { id: 'u1', role: 'member', caps: ['edit_own_task'], teams: [], ledTeams: [] };
  return { db, task, state, mod, call, meta, u1, HttpError };
}

test('a task saved elsewhere gets its Actual back from its log (onTaskWritten and the sweep); a legacy-only task keeps its own', () => {
  const h = harness();
  h.task('T-1'); h.task('T-2', { actualEffort: 1.3 });
  assert.equal(h.state.hooks.length, 1, 'registered with Smart Scoring\'s onTaskWritten');
  let d = h.call('POST', '/api/tasks/T-1/time', { workDate: day(0), minutes: 45 }, h.u1);
  assert.equal(d.actualEffort, 0.75); assert.ok(h.state.bumps >= 1); assert.deepEqual(h.state.announced, ['T-1']);
  /* a task save that sent an old number back (or a restore) */
  h.db.prepare('UPDATE tasks SET meta=? WHERE id=?').run(JSON.stringify({ actualEffort: 9, other: 'kept' }), 'T-1');
  h.state.hooks.forEach(fn => fn('T-1', h.u1));
  assert.deepEqual(h.meta('T-1'), { actualEffort: 0.75, other: 'kept' }, 'Actual from the log, the rest of meta as it was');
  assert.deepEqual(h.state.announced, ['T-1', 'T-1']);
  const bumps = h.state.bumps; h.state.hooks.forEach(fn => fn('T-1', h.u1)); assert.equal(h.state.bumps, bumps, 'nothing to change: nothing written');
  /* the backfill made T-2's legacy entry: never touched, so neither the hook nor the sweep changes its 1.3 */
  assert.equal(h.db.prepare("SELECT minutes FROM task_time_entries WHERE task_id='T-2'").get().minutes, 78);
  h.state.hooks.forEach(fn => fn('T-2', h.u1)); assert.equal(h.meta('T-2').actualEffort, 1.3);
  /* the sweep: a task changed since */
  h.db.prepare('UPDATE tasks SET meta=?, updated_at=? WHERE id=?').run(JSON.stringify({ actualEffort: 5 }), new Date(Date.now() + 1000).toISOString(), 'T-1');
  assert.equal(h.mod.sweep(), 1); assert.equal(h.meta('T-1').actualEffort, 0.75); assert.equal(h.meta('T-2').actualEffort, 1.3);
  /* off: nothing is done */
  h.state.on = false; h.db.prepare('UPDATE tasks SET meta=? WHERE id=?').run(JSON.stringify({ actualEffort: 5 }), 'T-1');
  h.state.hooks.forEach(fn => fn('T-1', h.u1)); assert.equal(h.mod.sweep(), 0); assert.equal(h.meta('T-1').actualEffort, 5);
  assert.throws(() => h.call('GET', '/api/tasks/T-1/time', null, h.u1), e => e.status === 409);
  /* the audit is handed every entry */
  assert.deepEqual(h.state.audit.map(e => e.action), ['legacy_backfill', 'time_logged']);
});

test('without Smart Scoring\'s hooks the time log still works', () => {
  const h = harness({ hooks: false });
  h.task('T-1');
  const d = h.call('POST', '/api/tasks/T-1/time', { workDate: day(0), minutes: 61, kind: 'revision' }, h.u1);
  assert.equal(d.actualEffort, 1, '61 minutes: 1 h'); assert.equal(h.meta('T-1').actualEffort, 1);
  const e = h.call('PUT', '/api/tasks/T-1/time/' + d.entry.id, { kind: 'blocked' }, h.u1);
  assert.equal(e.actualEffort, 0); assert.equal('actualEffort' in h.meta('T-1'), false, 'nothing counted: no Actual');
});
