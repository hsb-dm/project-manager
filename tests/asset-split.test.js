/* Assets produced, per person (Oct 2026), on the real server. The counts typed for each person are kept whole and the
   task's total is their sum. A team's lead validates them — the lead of the task's team or of a team someone counted
   on it is in, or an admin; who and when is the server's to write, anyone else's change leaves the validation as it
   was, and a count changed afterwards keeps the validation it had (the page shows it as changed since). Every API reply
   also says which page the server serves (X-ZC-Build), so a tab left open across an update offers to reload. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-split-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Split!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'split-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'split-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Split!Admin234567');
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const as = async id => { const r = await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); assert.ok(r.ok, await r.text()); return login(boot.people[id].email, 'Member!Pass2345'); };
  const s = { req, admin, as, boot, stop }; at.servers.push(s); return s;
}

test('counts are kept whole, the total is their sum, and only a team lead or an admin validates them', { timeout: 90000 }, async t => {
  const s = await start(place(t));
  const people = s.boot.people, teams = s.boot.teams.filter(x => !x.archived && x.lead);
  const teamsOf = id => (people[id].teams || []).map(x => x[0]);
  const plain = id => people[id] && !people[id].stakeholder && people[id].role !== 'admin';
  /* a member M of a team T led by L; a lead L2 of a team M is not in */
  let T, L, M, L2;
  for (const team of teams) {
    const m = Object.keys(people).find(id => plain(id) && id !== team.lead && teamsOf(id).includes(team.id) && teams.some(o => o.lead !== team.lead && plain(o.lead) && !teamsOf(id).includes(o.id)));
    if (m && plain(team.lead)) { T = team; L = team.lead; M = m; L2 = teams.find(o => o.lead !== L && plain(o.lead) && !teamsOf(m).includes(o.id)).lead; break; }
  }
  assert.ok(T && L && M && L2, 'the demo has a team with a lead and a member, and another lead');
  const other = Object.keys(people).find(id => plain(id) && ![L, M, L2].includes(id));
  const created = await (await s.req('POST', '/api/tasks', { title: 'Split counts', status: s.boot.ws.workflow[1].id, prio: 'medium', assignee: M, assignees: [M, other] }, s.admin)).json();
  const id = created.id;
  const get = async () => (await (await s.req('GET', '/api/tasks/' + id, undefined, s.admin)).json());
  const put = async (who, fn) => { const d = await (await s.req('GET', '/api/tasks/' + id, undefined, who)).json(); fn(d); const r = await s.req('PUT', '/api/tasks/' + id, d, who); assert.ok(r.ok, await r.text()); return get(); };
  const m = await s.as(M), l = await s.as(L), l2 = await s.as(L2);

  /* the member types the counts, and tries to validate them too */
  let d = await put(m, x => { x.meta = Object.assign({}, x.meta, { assetSplit: { [M]: 2.4, [other]: '3', 'bad key!': 9 }, assetSplitOk: { by: M, at: '2020-01-01', split: { [M]: 2 } } }); x.assetCount = 50; });
  assert.deepEqual(d.meta.assetSplit, { [M]: 2, [other]: 3 }, 'whole numbers, people only');
  assert.equal(d.assetCount, 5, 'the total is their sum');
  assert.equal(d.meta.assetSplitOk, undefined, 'a member cannot validate');

  /* a lead of a team nobody on it is in cannot either */
  { const x = await (await s.req('GET', '/api/tasks/' + id, undefined, s.admin)).json(); x.meta.assetSplitOk = { by: L2, split: x.meta.assetSplit };
    await s.req('PUT', '/api/tasks/' + id, x, l2);   /* refused outright when they cannot edit the task, or saved without it */
    assert.equal((await get()).meta.assetSplitOk, undefined, 'another team\'s lead'); }
  /* one who may edit any task, and leads a team of their own nobody on this task is in: the edit is saved, not the
     validation */
  const P = Object.keys(people).find(id => plain(id) && ![L, M, L2, other].includes(id));
  assert.ok((await s.req('PUT', '/api/members/' + P + '/cap-grants', { caps: ['edit_any_task'] }, s.admin)).ok);
  assert.ok((await s.req('POST', '/api/teams', { id: 'tsolo', name: 'Solo', color: 'blue', lead: P }, s.admin)).ok);
  const p = await s.as(P);
  d = await put(p, x => { x.title = 'Split counts, renamed'; x.meta.assetSplitOk = { by: P, split: x.meta.assetSplit }; });
  assert.equal(d.title, 'Split counts, renamed', 'the edit is saved');
  assert.equal(d.meta.assetSplitOk, undefined, 'the validation is not');

  /* one person on the task: the one number is validated the same way, and kept with its total */
  const one = (await (await s.req('POST', '/api/tasks', { title: 'One person', status: s.boot.ws.workflow[1].id, prio: 'medium', assignee: M, assignees: [M], assetCount: 3 }, s.admin)).json()).id;
  const putOne = async (who, fn) => { const x = await (await s.req('GET', '/api/tasks/' + one, undefined, who)).json(); fn(x); const r = await s.req('PUT', '/api/tasks/' + one, x, who); assert.ok(r.ok, await r.text()); return (await s.req('GET', '/api/tasks/' + one, undefined, s.admin)).json(); };
  d = await putOne(m, x => { x.meta = Object.assign({}, x.meta, { assetSplitOk: { by: M, total: 3 } }); });
  assert.equal(d.meta.assetSplitOk, undefined, 'not by the member');
  d = await putOne(l, x => { x.meta = Object.assign({}, x.meta, { assetSplitOk: { total: 99 } }); });
  assert.deepEqual([d.meta.assetSplitOk.by, d.meta.assetSplitOk.total, d.meta.assetSplitOk.split], [L, 3, {}], 'by the lead, with the task\'s own total');
  d = await putOne(m, x => { x.assetCount = 5; });
  assert.deepEqual([d.assetCount, d.meta.assetSplitOk.by, d.meta.assetSplitOk.total], [5, L, 3], 'changed afterwards: the validation keeps what it validated');

  /* the lead of the member's team: who and when are the server's */
  d = await put(l, x => { x.meta.assetSplitOk = { by: 'someone', at: '1999-01-01', split: { nope: 1 } }; });
  assert.equal(d.meta.assetSplitOk.by, L);
  assert.ok(Date.now() - new Date(d.meta.assetSplitOk.at).getTime() < 60000, 'now');
  assert.deepEqual(d.meta.assetSplitOk.split, { [M]: 2, [other]: 3 }, 'the counts it validated');

  /* a count changed afterwards keeps the validation (the page shows it as changed since); a member cannot remove it */
  d = await put(m, x => { x.meta.assetSplit[M] = 4; });
  assert.equal(d.assetCount, 7); assert.equal(d.meta.assetSplitOk.by, L); assert.deepEqual(d.meta.assetSplitOk.split, { [M]: 2, [other]: 3 });
  d = await put(m, x => { delete x.meta.assetSplitOk; });
  assert.equal(d.meta.assetSplitOk.by, L, 'still there');
  /* an admin validates again */
  d = await put(s.admin, x => { x.meta.assetSplitOk = { split: x.meta.assetSplit }; });
  assert.deepEqual(d.meta.assetSplitOk.split, { [M]: 4, [other]: 3 });
  assert.notEqual(d.meta.assetSplitOk.by, L);
});

test('every API reply says which page the server serves', { timeout: 60000 }, async t => {
  const s = await start(place(t));
  const page = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const id = (page.match(/<meta name="zc-build" content="([\w-]+)">/) || [])[1];
  assert.ok(id, 'the build stamps the page');
  assert.equal((await s.req('GET', '/api/auth/status')).headers.get('x-zc-build'), id, 'signed out');
  assert.equal((await s.req('GET', '/api/bootstrap', undefined, s.admin)).headers.get('x-zc-build'), id, 'signed in');
});
