/* Permissions (audit, Oct 2026).
   - Nobody approves their own work by naming themselves reviewer: a member could create a task with
     themselves as assignee and reviewer and approve their own versions.
   - Creating a task for yourself means every assignee is you.
   - Someone who manages members without being an admin hands out no role above their own and does
     not act on an account above it: no making an admin, no resetting an admin's password.
   - The workspace keeps an active admin, whichever way one would be removed; joining never makes one. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-perms-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Perms!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'perms-secret-key-longer-than-32-characters!!!!', COS_BACKUP_KEY: 'perms-backup-key-longer-than-32-characters!!!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Perms!Admin234567');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  return { req, admin, as, boot };
}

test('a member does not approve their own work', { timeout: 30000 }, async t => {
  const s = await start(t);
  const who = Object.keys(s.boot.people).find(id => id !== 'admin' && s.boot.people[id].active !== false);
  assert.equal((await s.req('PUT', '/api/members/' + who, { perm: 'member' }, s.admin)).status, 200);
  const me = await s.as(who), other = Object.keys(s.boot.people).find(id => id !== who && id !== 'admin');
  const stage = (s.boot.ws || s.boot.workspace).workflow[0].id;
  /* someone else as an assignee: not "your own task" */
  let r = await s.req('POST', '/api/tasks', { title: 'Not mine', status: stage, prio: 'medium', assignee: who, assignees: [who, other] }, me);
  assert.equal(r.status, 403, await r.clone().text());
  /* myself as assignee and reviewer, then approving my own version */
  r = await s.req('POST', '/api/tasks', { title: 'Mine', status: stage, prio: 'medium', assignee: who, assignees: [who], reviewer: who, reviewers: [who] }, me);
  assert.equal(r.status, 200, await r.clone().text());
  let doc = await r.json();
  doc.versions.push({ id: 'ver_me', n: 1, annots: [] });
  assert.equal((await s.req('PUT', '/api/tasks/' + doc.id, doc, me)).status, 200);
  doc = await (await s.req('GET', '/api/tasks/' + doc.id, undefined, me)).json();
  doc.versions[0].state = 'approved';
  assert.equal((await s.req('PUT', '/api/tasks/' + doc.id, doc, me)).status, 403, 'not their own approval');
  /* the admin still can */
  assert.equal((await s.req('PUT', '/api/tasks/' + doc.id, doc, s.admin)).status, 200);
});

test('a member manager stays below their own rank, and an admin always remains', { timeout: 30000 }, async t => {
  const s = await start(t);
  let r = await s.req('POST', '/api/roles', { id: 'people_ops', name: 'People ops', permissions: ['manage_members', 'view_all'], rank: 50 }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const ids = Object.keys(s.boot.people).filter(id => id !== 'admin' && s.boot.people[id].active !== false);
  const [mgr, target] = ids;
  assert.equal((await s.req('PUT', '/api/members/' + mgr, { perm: 'people_ops' }, s.admin)).status, 200);
  assert.equal((await s.req('PUT', '/api/members/' + target, { perm: 'member' }, s.admin)).status, 200);
  const m = await s.as(mgr);
  /* no admins made, not even themselves */
  assert.equal((await s.req('PUT', '/api/members/' + target, { perm: 'admin' }, m)).status, 403);
  assert.equal((await s.req('PUT', '/api/members/' + mgr, { perm: 'admin' }, m)).status, 403);
  assert.equal((await s.req('POST', '/api/members', { name: 'Sneaky', email: 'sneaky@zencrevia.demo', perm: 'admin' }, m)).status, 403);
  /* no acting on the admin */
  assert.equal((await s.req('POST', '/api/members/admin/password', { password: 'Taken!Over2345' }, m)).status, 403);
  assert.equal((await s.req('PUT', '/api/members/admin', { active: false }, m)).status, 403);
  /* what is theirs to do still works */
  assert.equal((await s.req('PUT', '/api/members/' + target, { perm: 'viewer' }, m)).status, 200);
  assert.equal((await s.req('POST', '/api/members/' + target + '/password', { password: 'Fresh!Pass23456' }, m)).status, 200);
  /* the only active admin cannot deactivate themselves — it locked everyone out of settings */
  assert.equal((await s.req('PUT', '/api/members/admin', { active: false }, s.admin)).status, 400);
  assert.notEqual((await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).people.admin.active, false);
  /* joining with the code never makes an admin */
  assert.equal((await s.req('PUT', '/api/workspace', Object.assign({}, s.boot.ws || s.boot.workspace, { defaultRole: 'admin' }), s.admin)).status, 400);
});

test('a lead on the work does not approve it; requestId is the server’s; a stale save keeps a colleague’s version', { timeout: 30000 }, async t => {
  const s = await start(t);
  const team = s.boot.teams.find(x => x.lead && x.lead !== 'admin');
  const lead = team.lead;
  assert.equal((await s.req('PUT', '/api/members/' + lead, { perm: 'team_lead' }, s.admin)).status, 200);
  const L = await s.as(lead);
  const stage = (s.boot.ws || s.boot.workspace).workflow[0].id;
  let r = await s.req('POST', '/api/tasks', { title: 'Lead on it', status: stage, prio: 'medium', team: team.id, assignee: lead, assignees: [lead] }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  let doc = await r.json();
  doc.versions.push({ id: 'ver_l', n: 1, annots: [] }); doc.requestId = 'R-not-mine';
  assert.equal((await s.req('PUT', '/api/tasks/' + doc.id, doc, L)).status, 200);
  doc = await (await s.req('GET', '/api/tasks/' + doc.id, undefined, s.admin)).json();
  assert.equal(doc.requestId || null, null, 'an edit does not set where a task came from');
  doc.versions[0].state = 'approved';
  assert.equal((await s.req('PUT', '/api/tasks/' + doc.id, doc, L)).status, 403, 'the lead is on the work');

  /* the admin's copy goes stale while the lead adds version 2; the admin then saves versions */
  const stale = await (await s.req('GET', '/api/tasks/' + doc.id, undefined, s.admin)).json();
  const fresh = JSON.parse(JSON.stringify(stale)); fresh.versions.push({ id: 'ver_l2', n: 2, annots: [] });
  assert.equal((await s.req('PUT', '/api/tasks/' + doc.id, fresh, L)).status, 200);
  stale.versions[0].note = 'checked'; stale._rev = stale.updatedAt; stale._changed = ['versions'];
  r = await s.req('PUT', '/api/tasks/' + doc.id, stale, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const after = await (await s.req('GET', '/api/tasks/' + doc.id, undefined, s.admin)).json();
  assert.deepEqual(after.versions.map(v => v.n), [1, 2], 'the colleague’s version 2 is kept');
});
