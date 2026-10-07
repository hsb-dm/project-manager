/* A deleted task's number is never handed to a new task, and nothing of the deleted task — its
   brief, comments, versions, files, history — ever shows up on another one. Before, the server
   numbered a new task max+1, so deleting the newest task and creating another gave the new one the
   same id, and it opened with the old task's history. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-idreuse-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'IdReuse!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'idreuse-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'idreuse-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const r = await req('POST', '/api/auth/login', { email: 'admin@zencrevia.demo', password: 'IdReuse!Admin23456' });
  assert.equal(r.status, 200, await r.clone().text());
  return { req, admin: r.headers.get('set-cookie').split(';')[0], dbFile: path.join(temp, 'creative-os.db') };
}

test('a new task never inherits a deleted task’s number or anything of it', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const stage = (boot.ws || boot.workspace).workflow[0].id;
  const create = async (title, extra) => { const r = await s.req('POST', '/api/tasks', Object.assign({ title, status: stage, prio: 'medium' }, extra || {}), s.admin); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };

  /* the newest task, with a brief and a comment and a history */
  const old = await create('Old banner', { brief: { tpl: null, objective: 'OLD BRIEF — do not show elsewhere' } });
  let doc = (await (await s.req('GET', '/api/tasks/' + old.id, undefined, s.admin)).json());
  doc.comments.push({ id: 'cm_old', text: 'old comment' });
  assert.equal((await s.req('PUT', '/api/tasks/' + old.id, doc, s.admin)).status, 200);
  assert.equal((await s.req('DELETE', '/api/tasks/' + old.id, undefined, s.admin)).status, 200);

  /* a new task, with no id and with the old id proposed by a browser that has not caught up */
  for (const proposed of [undefined, old.id]) {
    const fresh = await create('New poster', proposed ? { id: proposed } : {});
    assert.notEqual(fresh.id, old.id, 'the deleted number is not reused');
    const got = await (await s.req('GET', '/api/tasks/' + fresh.id, undefined, s.admin)).json();
    const text = JSON.stringify(got);
    assert.ok(!text.includes('OLD BRIEF'), 'no brief of the deleted task');
    assert.ok(!text.includes('old comment'), 'no comment of the deleted task');
    assert.ok(!got.activity.some(a => /Old banner/.test(JSON.stringify(a)) || a.k === 'brief'), 'no history of the deleted task: ' + JSON.stringify(got.activity));
  }

  /* a database from before the cascading deletes still holds a deleted task's brief; a new task
     written under that id starts empty all the same */
  const { DatabaseSync } = require('node:sqlite');
  const raw = new DatabaseSync(s.dbFile, { enableForeignKeyConstraints: false });
  raw.prepare("INSERT INTO briefs (id, task_id, template_id, fields) VALUES ('brief_T-500', 'T-500', NULL, ?)").run(JSON.stringify({ objective: 'ORPHAN BRIEF from a deleted task' }));
  raw.close();
  const orphan = await create('Brand new', { id: 'T-500' });
  assert.equal(orphan.id, 'T-500', 'a number never used is kept as proposed');
  const got = await (await s.req('GET', '/api/tasks/T-500', undefined, s.admin)).json();
  assert.equal(got.brief, null, 'no brief left behind by a deleted task: ' + JSON.stringify(got.brief));
});
