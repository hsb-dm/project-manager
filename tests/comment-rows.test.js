/* Posting or editing a comment writes that comment's row (Oct 2026, performance). Both routes used to rewrite the
   whole task through writeTask — every comment deleted and put back, every file too — for one line of text. Now only
   the comment's row and the task's updated time change; the answer, the history entry, the live update and the
   right to comment are as before. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-comment-rows-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Rows!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'rows-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'rows-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Rows!Admin234567');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const dbFile = path.join(temp, 'creative-os.db');
  const peek = (sql, ...p) => { const d = new DatabaseSync(dbFile, { readOnly: true }); try { return d.prepare(sql).all(...p); } finally { d.close(); } };
  return { req, admin, as, peek };
}
const rowsOf = (s, id) => ({
  comments: s.peek('SELECT rowid, id, author_id, visibility, body, attachments, created_at, edited_at FROM comments WHERE task_id=? ORDER BY rowid', id),
  files: s.peek('SELECT rowid, id, uploaded_by, file_type, storage_provider FROM files WHERE task_id=? ORDER BY rowid', id),
  task: s.peek('SELECT updated_at FROM tasks WHERE id=?', id)[0]
});

test('a new comment adds its row and nothing else is written again', { timeout: 60000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  /* a task with comments and files, someone else's to comment on */
  const tk = boot.tasks.filter(x => !x._slim && (x.comments || []).length >= 2 && (x.files || []).length >= 1)[0];
  assert.ok(tk, 'the demo has a task with comments and files');
  const who = Object.keys(boot.people).find(id => id !== 'admin' && boot.people[id].active !== false && !boot.people[id].stakeholder);
  const member = await s.as(who);
  const before = rowsOf(s, tk.id);
  let r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_rows_1', text: 'One more thing @' + who, vis: 'internal' }, member);
  assert.equal(r.status, 200, await r.clone().text());
  const answer = await r.json();
  const after = rowsOf(s, tk.id);
  assert.deepEqual(after.comments.slice(0, before.comments.length), before.comments, 'the comments already there are not deleted and put back');
  assert.deepEqual(after.files, before.files, 'nor are the files');
  const added = after.comments.slice(before.comments.length);
  assert.equal(added.length, 1); assert.equal(added[0].id, 'cm_rows_1'); assert.equal(added[0].author_id, who); assert.equal(added[0].visibility, 'internal');
  assert.ok(after.task.updated_at > before.task.updated_at, 'the task says it changed');
  /* the answer is the task as anyone reading it now gets it, with the comment and its history entry */
  const read = await (await s.req('GET', '/api/tasks/' + tk.id, undefined, member)).json();
  assert.deepEqual(answer, read);
  assert.equal(answer.updatedAt, after.task.updated_at);
  assert.ok(answer.comments.some(c => c.id === 'cm_rows_1' && c.by === who && c.editedAt === null));
  assert.ok(answer.activity.some(a => a.k === 'comment' && a.who === who && a.a && a.a.snap), 'in the history, with its point to go back to');
  /* and the next one, by someone else, adds its own row the same way */
  r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_rows_2', text: 'Agreed' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const again = rowsOf(s, tk.id);
  assert.deepEqual(again.comments.slice(0, after.comments.length), after.comments);
  assert.deepEqual(again.comments.slice(after.comments.length).map(c => [c.id, c.author_id]), [['cm_rows_2', 'admin']]);
});

test('editing a comment changes that row only', { timeout: 60000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const tk = boot.tasks.filter(x => !x._slim && (x.comments || []).length >= 1 && (x.files || []).length >= 1)[0];
  let r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_rows_e', text: 'First words', attachments: [{ name: 'Brief', url: 'https://example.org/brief', kind: 'link' }] }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const before = rowsOf(s, tk.id), activity = (await r.json()).activity.length;
  r = await s.req('PUT', '/api/tasks/' + tk.id + '/comments/cm_rows_e', { text: 'Better words' }, s.admin);
  assert.equal(r.status, 200, await r.clone().text());
  const answer = await r.json(), after = rowsOf(s, tk.id);
  const i = before.comments.findIndex(c => c.id === 'cm_rows_e');
  assert.deepEqual(after.comments.filter((c, k) => k !== i), before.comments.filter((c, k) => k !== i), 'the other comments are untouched');
  assert.equal(after.comments[i].rowid, before.comments[i].rowid, 'the same row, changed in place');
  assert.equal(after.comments[i].body, 'Better words');
  assert.equal(after.comments[i].attachments, before.comments[i].attachments, 'its attachments stay');
  assert.ok(after.comments[i].edited_at, 'stamped as edited');
  assert.deepEqual(after.files, before.files);
  assert.ok(after.task.updated_at > before.task.updated_at);
  assert.deepEqual(answer, await (await s.req('GET', '/api/tasks/' + tk.id, undefined, s.admin)).json());
  assert.equal(answer.activity.length, activity, 'an edit adds nothing to the history, as before');
  /* unchanged words write nothing at all */
  r = await s.req('PUT', '/api/tasks/' + tk.id + '/comments/cm_rows_e', { text: 'Better words' }, s.admin);
  assert.equal(r.status, 200);
  assert.deepEqual(rowsOf(s, tk.id), after);
});
