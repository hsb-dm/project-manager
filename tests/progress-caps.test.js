/* Progress notes are set per role in Roles & permissions: view_progress_notes and write_progress_notes. By
   default every role sees and writes them (a Viewer only sees them); writing is on any task the person can see.
   Roles that existed before get them once, at start; a choice made afterwards sticks across restarts. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');

async function start(temp) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Caps!Admin2345', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'caps-secret-key-longer-than-32-characters-x', COS_BACKUP_KEY: 'caps-backup-key-longer-than-32-characters-x', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const text = await r.text(); return { status: r.status, body: text ? JSON.parse(text) : null }; };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const stop = async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  return { json, req, login, stop };
}
const perms = (temp, id) => { const db = new DatabaseSync(path.join(temp, 'creative-os.db')); const r = db.prepare('SELECT permissions FROM roles WHERE id=?').get(id); db.close(); return JSON.parse(r.permissions); };

test('progress notes follow the role: every member by default, a Viewer reads, a role without it sees nothing', { timeout: 60000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-pncaps-'));
  let s = await start(temp);
  t.after(async () => { await s.stop(); fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  const admin = await s.login('admin@zencrevia.demo', 'Caps!Admin2345');
  const boot = (await s.json('GET', '/api/bootstrap', undefined, admin)).body;
  assert.ok(boot.caps.some(c => c[0] === 'view_progress_notes') && boot.caps.some(c => c[0] === 'write_progress_notes'), 'both are in Roles & permissions');
  const as = async (id, perm) => { await s.req('PUT', '/api/members/' + id, Object.assign({}, boot.people[id], { id, perm }), admin); await s.req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return s.login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  /* a member on a task they have nothing to do with */
  const tk = boot.tasks.find(x => !x._slim && x.assignee);
  const outsider = Object.keys(boot.people).find(id => id !== 'admin' && boot.people[id].perm === 'member' && !boot.people[id].stakeholder && tk.assignee !== id && !(tk.assignees || []).includes(id) && !(tk.reviewers || []).includes(id) && tk.reviewer !== id && tk.createdBy !== id);
  const member = await as(outsider, 'member');
  let r = await s.json('POST', '/api/tasks/' + tk.id + '/progress', { text: 'Seen from the side' }, member);
  assert.equal(r.status, 200, 'a member writes on any task: ' + JSON.stringify(r.body));
  /* a viewer reads, does not write */
  const viewerId = Object.keys(boot.people).find(id => id !== 'admin' && id !== outsider && !boot.people[id].stakeholder);
  const viewer = await as(viewerId, 'viewer');
  const seen = await s.json('GET', '/api/tasks/' + tk.id, undefined, viewer);
  assert.equal(seen.status, 200); assert.deepEqual(seen.body.progress.map(p => p.text), ['Seen from the side']);
  assert.equal((await s.json('POST', '/api/tasks/' + tk.id + '/progress', { text: 'viewer' }, viewer)).status, 403);
  /* an admin takes them from the Member role: nothing to see, nothing to write, not in the bootstrap either */
  const memberRole = boot.roles.find(x => x.id === 'member');
  r = await s.json('PUT', '/api/roles/member', Object.assign({}, memberRole, { permissions: memberRole.permissions.filter(c => !/progress_notes$/.test(c)) }), admin);
  assert.equal(r.status, 200, JSON.stringify(r.body));
  const member2 = await s.login(outsider + '@zencrevia.demo', 'Member!Pass2345');
  assert.deepEqual((await s.json('GET', '/api/tasks/' + tk.id, undefined, member2)).body.progress, []);
  assert.ok((await s.json('GET', '/api/bootstrap', undefined, member2)).body.tasks.every(x => !(x.progress || []).length), 'stripped from the bootstrap');
  assert.equal((await s.json('POST', '/api/tasks/' + tk.id + '/progress', { text: 'no' }, member2)).status, 403);

  /* the start-up grant: roles from before get them once; a later choice sticks */
  await s.stop();
  { const db = new DatabaseSync(path.join(temp, 'creative-os.db'));
    db.prepare("UPDATE roles SET permissions=? WHERE id='team_lead'").run(JSON.stringify(['create_task', 'edit_team_tasks']));                 /* as before the capabilities existed */
    db.prepare("INSERT OR REPLACE INTO roles (id,workspace_id,name,description,permissions,rank,is_system,sort_order) SELECT 'photographer', workspace_id, 'Photographer', '', '[\"upload_file\"]', 30, 0, 9 FROM roles WHERE id='member'").run();
    db.prepare("DELETE FROM app_meta WHERE key='caps_progress_notes'").run(); db.close(); }
  s = await start(temp);
  assert.ok(perms(temp, 'team_lead').includes('view_progress_notes') && perms(temp, 'team_lead').includes('write_progress_notes'), 'an older role gets both');
  assert.ok(perms(temp, 'photographer').includes('write_progress_notes'), 'a custom role too');
  assert.ok(perms(temp, 'viewer').includes('view_progress_notes') && !perms(temp, 'viewer').includes('write_progress_notes'), 'a Viewer reads only');
  await s.stop();
  /* with the grant done, a role's choice survives a restart */
  { const db = new DatabaseSync(path.join(temp, 'creative-os.db')); db.prepare("UPDATE roles SET permissions=? WHERE id='team_lead'").run(JSON.stringify(['create_task'])); db.close(); }
  s = await start(temp);
  assert.deepEqual(perms(temp, 'team_lead'), ['create_task'], 'not granted again');
});
