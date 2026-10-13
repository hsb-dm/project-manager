/* Sign-ups wait for approval (Oct 2026). Someone who registers is not let in until an approver says so: they cannot
   sign in, and nobody's lists hold them. Approvers — Admin and Team Lead by default, any role given "approve_members"
   in Roles & permissions — are told, see them, let them in (with the role they registered with, or another chosen by
   someone who manages members) or turn them away, which frees the address. A workspace can let everyone straight in. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-signup-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Signup!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'signup-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'signup-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); return r.status === 200 ? r.headers.get('set-cookie').split(';')[0] : r; };
  const admin = await login('admin@zencrevia.demo', 'Signup!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = async c => (await req('GET', '/api/bootstrap', undefined, c)).json();
  const register = (name, email) => req('POST', '/api/auth/register', { name, email, password: 'Newbie!Pass2345', jobTitle: 'Designer' });
  /* registration on, no join code */
  const b0 = await boot(admin); const ws = Object.assign({}, b0.ws, { allowRegistration: true, joinCode: '' });
  assert.equal((await req('PUT', '/api/workspace', ws, admin)).status, 200);
  return { req, admin, as, boot, login, register, temp, ws };
}

test('a sign-up waits for an approver; approvers are told; a team lead lets them in', { timeout: 40000 }, async t => {
  const s = await start(t);
  const b0 = await s.boot(s.admin);
  assert.equal(b0.ws.requireApproval, true, 'on by default');
  const leadId = Object.keys(b0.people).find(id => b0.people[id].perm === 'team_lead' && b0.people[id].active !== false);
  const memberId = Object.keys(b0.people).find(id => b0.people[id].perm === 'member' && b0.people[id].active !== false);
  assert.ok(leadId && memberId, 'the demo has a team lead and a member');
  const lead = await s.as(leadId), member = await s.as(memberId);
  /* the session tells the sign-in page */
  assert.equal((await (await s.req('GET', '/api/auth/session')).json()).approvalRequired, true);
  /* registering: no session, told to wait */
  let r = await s.register('Pending Person', 'pending.person@example.org');
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual(await r.json(), { pending: true });
  assert.equal(r.headers.get('set-cookie'), null, 'not signed in');
  /* signing in before being let in */
  r = await s.login('pending.person@example.org', 'Newbie!Pass2345');
  assert.equal(r.status, 403); assert.match((await r.json()).error, /waiting for approval/);
  /* a wrong password still says nothing about the account */
  assert.equal((await s.login('pending.person@example.org', 'Wrong!Pass2345')).status, 401);
  /* nobody's lists hold them; approvers see them */
  const ba = await s.boot(s.admin);
  const pid = ba.pendingMembers.find(x => x.email === 'pending.person@example.org').id;
  assert.ok(pid); assert.equal(ba.people[pid], undefined, 'not among the people');
  assert.equal(ba.pendingMembers.find(x => x.id === pid).role, 'Designer');
  assert.ok(!isNaN(Date.parse(ba.pendingMembers.find(x => x.id === pid).createdAt)), 'when they signed up');
  assert.ok(ba.notifs.some(n => n.k === 'signup' && n.t === pid && n.entityType === 'user' && n.message === 'Pending Person'), 'the admin is told');
  const bl = await s.boot(lead);
  assert.ok(bl.pendingMembers.some(x => x.id === pid), 'a team lead sees them');
  assert.ok(bl.notifs.some(n => n.k === 'signup' && n.t === pid), 'and is told');
  const bm = await s.boot(member);
  assert.deepEqual(bm.pendingMembers, [], 'a member does not');
  assert.ok(!bm.notifs.some(n => n.k === 'signup'), 'and is not told');
  assert.equal((await s.req('GET', '/api/members/pending', undefined, member)).status, 403);
  assert.equal((await s.req('POST', '/api/members/' + pid + '/approve', {}, member)).status, 403);
  /* the approver's e-mail */
  const outbox = path.join(s.temp, 'outbox');
  await new Promise(res => setTimeout(res, 300));
  /* each mail as "To: … | its subject" (the subject is written base64-encoded) */
  const mails = () => fs.existsSync(outbox) ? fs.readdirSync(outbox).map(f => { const m = fs.readFileSync(path.join(outbox, f), 'utf8'), sub = (m.match(/^Subject: =\?UTF-8\?B\?([^?]+)\?=/m) || [])[1]; return (m.match(/^To: .*$/m) || [''])[0] + ' | ' + (sub ? Buffer.from(sub, 'base64').toString() : ''); }) : [];
  assert.ok(mails().some(m => /Pending Person signed up and is waiting for your approval/.test(m)), 'approvers are e-mailed');
  /* a team lead lets them in — with the role they registered with; choosing another is for whoever manages members */
  assert.equal((await s.req('POST', '/api/members/' + pid + '/approve', { role: 'admin' }, lead)).status, 403, 'not above their own');
  assert.equal((await s.req('POST', '/api/members/' + pid + '/approve', { role: 'viewer' }, lead)).status, 403, 'not even below: choosing a role is for whoever manages members');
  r = await s.req('POST', '/api/members/' + pid + '/approve', {}, lead);
  assert.equal(r.status, 200, await r.clone().text());
  const after = await r.json();
  assert.equal(after.people[pid].perm, 'member');
  assert.ok(!after.pending.some(x => x.id === pid));
  assert.equal((await s.req('POST', '/api/members/' + pid + '/approve', {}, lead)).status, 404, 'once');
  assert.ok((await s.boot(s.admin)).notifs.filter(n => n.k === 'signup' && n.t === pid).every(n => n.read), "the other approvers' notice is settled");
  /* now they can sign in, and they are told */
  assert.equal(typeof await s.login('pending.person@example.org', 'Newbie!Pass2345'), 'string');
  await new Promise(res => setTimeout(res, 300));
  assert.ok(mails().some(m => /Your account is approved/.test(m) && /pending.person@example.org/.test(m)), 'the person is e-mailed');
});

test('turned away frees the address; an admin may choose the role; roles decide who approves; or everyone straight in', { timeout: 40000 }, async t => {
  const s = await start(t);
  const b0 = await s.boot(s.admin);
  const leadId = Object.keys(b0.people).find(id => b0.people[id].perm === 'team_lead' && b0.people[id].active !== false);
  const memberId = Object.keys(b0.people).find(id => b0.people[id].perm === 'member' && b0.people[id].active !== false);
  const lead = await s.as(leadId), member = await s.as(memberId);
  /* turned away */
  await s.register('Turned Away', 'turned.away@example.org');
  let pid = (await s.boot(s.admin)).pendingMembers.find(x => x.email === 'turned.away@example.org').id;
  assert.equal((await s.req('POST', '/api/members/' + pid + '/decline', {}, s.admin)).status, 200);
  assert.ok(!(await s.boot(s.admin)).notifs.some(n => n.k === 'signup' && n.t === pid), 'the notices go');
  assert.equal((await s.login('turned.away@example.org', 'Newbie!Pass2345')).status, 401);
  assert.equal((await s.register('Turned Away', 'turned.away@example.org')).status, 200, 'the address is free again');
  /* an admin may let someone in with another role */
  pid = (await s.boot(s.admin)).pendingMembers.find(x => x.email === 'turned.away@example.org').id;
  const r = await s.req('POST', '/api/members/' + pid + '/approve', { role: 'team_lead' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text()); assert.equal((await r.json()).people[pid].perm, 'team_lead');
  /* the team they chose is reviewed too: an approver keeps it, picks another, or none; an unknown one is refused */
  const [chosen, better] = b0.teams.filter(x => !x.archived).map(x => x.id);
  await s.req('POST', '/api/auth/register', { name: 'Team Pick', email: 'team.pick@example.org', password: 'Newbie!Pass2345', teamId: chosen });
  pid = (await s.boot(s.admin)).pendingMembers.find(x => x.email === 'team.pick@example.org').id;
  assert.deepEqual((await s.boot(lead)).pendingMembers.find(x => x.id === pid).teams, [chosen], 'the approver sees the team they chose');
  assert.equal((await s.req('POST', '/api/members/' + pid + '/approve', { teamId: 'no_such_team' }, lead)).status, 400);
  const moved = await s.req('POST', '/api/members/' + pid + '/approve', { teamId: better }, lead);
  assert.equal(moved.status, 200, await moved.clone().text());
  assert.deepEqual((await moved.json()).people[pid].teams.map(x => x[0]), [better], 'a team lead may put them in another team');
  await s.req('POST', '/api/auth/register', { name: 'No Team', email: 'no.team@example.org', password: 'Newbie!Pass2345', teamId: chosen });
  pid = (await s.boot(s.admin)).pendingMembers.find(x => x.email === 'no.team@example.org').id;
  assert.deepEqual((await (await s.req('POST', '/api/members/' + pid + '/approve', { teamId: '' }, s.admin)).json()).people[pid].teams, [], 'or in none');
  /* Roles & permissions decide: taken from Team Lead, given to Member */
  const roles = (await s.boot(s.admin)).roles;
  const perms = id => (roles.find(x => x.id === id) || {}).permissions || [];
  assert.ok(perms('team_lead').includes('approve_members'), 'Team Lead has it by default');
  assert.ok(!perms('member').includes('approve_members'));
  assert.equal((await s.req('PUT', '/api/roles/team_lead', { permissions: perms('team_lead').filter(c => c !== 'approve_members') }, s.admin)).status, 200);
  assert.equal((await s.req('PUT', '/api/roles/member', { permissions: perms('member').concat(['approve_members']) }, s.admin)).status, 200);
  assert.equal((await s.req('GET', '/api/members/pending', undefined, lead)).status, 403);
  assert.equal((await s.req('GET', '/api/members/pending', undefined, member)).status, 200);
  await s.register('Second Person', 'second.person@example.org');
  const bm = await s.boot(member), bl = await s.boot(lead);
  assert.ok(bm.notifs.some(n => n.k === 'signup' && n.message === 'Second Person'), 'the role given it is told');
  assert.ok(!bl.notifs.some(n => n.k === 'signup' && n.message === 'Second Person'), 'the role it was taken from is not');
  /* everyone straight in */
  const ws = Object.assign({}, (await s.boot(s.admin)).ws, { requireApproval: false });
  assert.equal((await s.req('PUT', '/api/workspace', ws, s.admin)).status, 200);
  assert.equal((await s.boot(s.admin)).ws.requireApproval, false);
  const direct = await s.register('Straight In', 'straight.in@example.org');
  assert.equal(direct.status, 200);
  const body = await direct.json();
  assert.ok(body.user && body.user.id, 'signed in at once'); assert.ok(direct.headers.get('set-cookie'));
});
