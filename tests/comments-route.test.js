/* Comments (audit, Oct 2026).
   - Someone who may comment but not edit the task — a Viewer, a stakeholder — posts a comment on its
     own route; through a task PUT it was refused and what they typed was lost.
   - Deleting a comment that someone else replied to keeps the reply, as a comment of its own; it
     used to fail with a server error, the reply still pointing at the deleted comment. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

async function start(t) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-comments-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Comments!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'comments-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'comments-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  t.after(async () => { if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Comments!Admin23456');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const get = async id => (await req('GET', '/api/tasks/' + id, undefined, admin)).json();
  return { req, admin, as, get };
}

test('a Viewer comments on a task they cannot edit', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const tk = boot.tasks.find(x => !x._slim);
  const who = Object.keys(boot.people).find(id => id !== 'admin' && boot.people[id].active !== false);
  assert.equal((await s.req('PUT', '/api/members/' + who, { perm: 'viewer' }, s.admin)).status, 200);
  const viewer = await s.as(who);
  const doc = await s.get(tk.id); doc.comments.push({ id: 'cm_put', text: 'via PUT' });
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id, doc, viewer)).status, 403, 'a Viewer still cannot edit the task');
  const r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_view', text: 'Looks good to me', vis: 'internal', parent: 'nope' }, viewer);
  assert.equal(r.status, 200, await r.clone().text());
  const c = (await s.get(tk.id)).comments.find(x => x.id === 'cm_view');
  assert.ok(c, 'kept'); assert.equal(c.by, who); assert.equal(c.parent, null, 'a parent that does not exist is dropped');
  assert.ok((await s.get(tk.id)).activity.some(a => a.k === 'comment' && a.who === who), 'in the history');
  assert.equal((await s.req('POST', '/api/tasks/' + tk.id + '/comments', { text: '   ' }, viewer)).status, 400);
  assert.equal((await s.req('POST', '/api/tasks/' + tk.id + '/comments', { text: 'x'.repeat(10001) }, viewer)).status, 413);
});

test('deleting a comment someone replied to keeps the reply', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const tk = boot.tasks.find(x => !x._slim && x.assignee && x.assignee !== 'admin');
  const a = await s.as(tk.assignee);
  const other = Object.keys(boot.people).find(id => id !== 'admin' && id !== tk.assignee && boot.people[id].active !== false);
  const b = await s.as(other);
  let r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_root', text: 'First thought' }, a); assert.equal(r.status, 200, await r.clone().text());
  r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_reply', text: 'Agreed', parent: 'cm_root' }, b); assert.equal(r.status, 200, await r.clone().text());
  const doc = await s.get(tk.id); doc.comments = doc.comments.filter(c => c.id !== 'cm_root' && c.parent !== 'cm_root');
  r = await s.req('PUT', '/api/tasks/' + tk.id, doc, a);
  assert.equal(r.status, 200, await r.clone().text());
  const after = (await s.get(tk.id)).comments;
  assert.ok(!after.some(c => c.id === 'cm_root'), 'the comment is gone');
  const reply = after.find(c => c.id === 'cm_reply');
  assert.ok(reply, 'the reply stays'); assert.equal(reply.parent, null);
});

/* Editing a comment (Oct 2026): whoever wrote it may change its words — a Viewer too, who cannot edit the
   task — on its own route; an admin may as well; nobody else. It is stamped as edited by the server, and
   its attachments stay as they were. */
test('the author edits their comment; it says it was edited; nobody else can', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const tk = boot.tasks.find(x => !x._slim);
  const ids = Object.keys(boot.people).filter(id => id !== 'admin' && boot.people[id].active !== false);
  assert.equal((await s.req('PUT', '/api/members/' + ids[0], { perm: 'viewer' }, s.admin)).status, 200);
  const viewer = await s.as(ids[0]), other = await s.as(ids[1]);
  let r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_edit', text: 'Logo 2x lebih kecil', attachments: [{ ref: 'task', refId: tk.id, name: tk.id }] }, viewer);
  assert.equal(r.status, 200, await r.clone().text());
  let c = (await s.get(tk.id)).comments.find(x => x.id === 'cm_edit');
  assert.equal(c.editedAt, null, 'a new comment is not edited');
  r = await s.req('PUT', '/api/tasks/' + tk.id + '/comments/cm_edit', { text: 'Logo 3x lebih kecil' }, viewer);
  assert.equal(r.status, 200, await r.clone().text());
  c = (await s.get(tk.id)).comments.find(x => x.id === 'cm_edit');
  assert.equal(c.text, 'Logo 3x lebih kecil');
  assert.ok(c.editedAt && !isNaN(Date.parse(c.editedAt)), 'stamped as edited');
  assert.deepEqual(c.attachments.map(a => a.ref + ':' + a.refId), ['task:' + tk.id], 'attachments stay');
  assert.equal(c.by, ids[0], 'still theirs');
  /* someone else cannot; an admin can; empty is refused; too long is refused; an unknown comment is 404 */
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id + '/comments/cm_edit', { text: 'mine now' }, other)).status, 403);
  assert.equal((await s.get(tk.id)).comments.find(x => x.id === 'cm_edit').text, 'Logo 3x lebih kecil');
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id + '/comments/cm_edit', { text: 'Logo 3x lebih kecil (moderated)' }, s.admin)).status, 200);
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id + '/comments/cm_nope', { text: 'x' }, viewer)).status, 404);
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id + '/comments/cm_edit', { text: 'x'.repeat(10001) }, viewer)).status, 413);
  /* the attachments as the box left them: one taken off, one added; a link that is not https is refused, as when posting */
  r = await s.req('PUT', '/api/tasks/' + tk.id + '/comments/cm_edit', { text: 'Logo 3x lebih kecil', attachments: [{ name: 'Brief', url: 'https://example.org/brief', kind: 'link' }] }, viewer);
  assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual((await s.get(tk.id)).comments.find(x => x.id === 'cm_edit').attachments.map(a => a.url), ['https://example.org/brief']);
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id + '/comments/cm_edit', { text: 'x', attachments: [{ name: 'Bad', url: 'http://example.org/insecure' }] }, viewer)).status, 400);
  assert.equal((await s.get(tk.id)).comments.find(x => x.id === 'cm_edit').text, 'Logo 3x lebih kecil', 'a refused edit changes nothing');
  r = await s.req('POST', '/api/tasks/' + tk.id + '/comments', { id: 'cm_plain', text: 'Just words' }, viewer);
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id + '/comments/cm_plain', { text: '   ' }, viewer)).status, 400, 'a comment with nothing in it is refused');
  /* through a task PUT: the stamp is the server's — set when the words change, never taken from the client */
  const doc = await s.get(tk.id);
  doc.comments = doc.comments.map(x => x.id === 'cm_plain' ? Object.assign({}, x, { editedAt: '2001-01-01T00:00:00.000Z' }) : x);
  assert.equal((await s.req('PUT', '/api/tasks/' + tk.id, doc, s.admin)).status, 200);
  assert.equal((await s.get(tk.id)).comments.find(x => x.id === 'cm_plain').editedAt, null, 'unchanged words, no stamp');
});

/* A reply from someone who may comment but not edit the task (Oct 2026). Their comments go through POST
   .../comments, which dropped the comment a reply answers: every reply from a Viewer or a stakeholder landed as a
   comment of its own. It now stays in its thread, under the rules of a reply saved with the task: it answers one of
   this task's comments; a reply to a reply joins the thread (it answers the comment the thread starts with, as the
   task panel sends it); a stakeholder answers only what a stakeholder can see. The answer is still the task. */
test('a reply posted on the comment route stays under the comment it answers', { timeout: 30000 }, async t => {
  const s = await start(t);
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json();
  const [tk, other] = boot.tasks.filter(x => !x._slim);
  const ids = Object.keys(boot.people).filter(id => id !== 'admin' && boot.people[id].active !== false && !boot.people[id].stakeholder);
  assert.equal((await s.req('PUT', '/api/members/' + ids[0], { perm: 'viewer' }, s.admin)).status, 200);
  assert.equal((await s.req('PUT', '/api/members/' + ids[1], { stakeholder: true }, s.admin)).status, 200);
  const viewer = await s.as(ids[0]), sh = await s.as(ids[1]);
  const post = async (body, who, on) => { const r = await s.req('POST', '/api/tasks/' + (on || tk).id + '/comments', body, who); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
  const saved = async id => (await s.get(tk.id)).comments.find(c => c.id === id);
  await post({ id: 'cm_thread', text: 'Which logo?', vis: 'client' }, s.admin);
  await post({ id: 'cm_inside', text: 'Only the team sees this', vis: 'internal' }, s.admin);
  await post({ id: 'cm_other_task', text: 'Not here' }, s.admin, other);
  /* a Viewer's reply: kept under its comment, and the answer is the task, as before */
  const doc = await post({ id: 'cm_v_reply', text: 'The blue one', parent: 'cm_thread' }, viewer);
  assert.equal(doc.id, tk.id); assert.ok(Array.isArray(doc.comments) && Array.isArray(doc.activity), 'the answer is the task, as before');
  assert.equal(doc.comments.find(c => c.id === 'cm_v_reply').parent, 'cm_thread');
  assert.equal((await saved('cm_v_reply')).parent, 'cm_thread', 'stored under the comment it answers');
  assert.equal((await saved('cm_v_reply')).by, ids[0]);
  /* a reply to that reply joins the thread */
  await post({ id: 'cm_v_reply2', text: 'Agreed', parent: 'cm_v_reply' }, viewer);
  assert.equal((await saved('cm_v_reply2')).parent, 'cm_thread', 'a reply to a reply joins the thread');
  /* a comment of another task, or anything but a comment's id, is no parent */
  await post({ id: 'cm_v_stray', text: 'Hm', parent: 'cm_other_task' }, viewer);
  assert.equal((await saved('cm_v_stray')).parent, null, 'a comment on another task is not answered here');
  await post({ id: 'cm_v_odd', text: 'Hm', parent: { id: 'cm_thread' } }, viewer);
  assert.equal((await saved('cm_v_odd')).parent, null, 'only a comment id names a parent');
  /* a stakeholder answers what they can see, and not an internal comment */
  await post({ id: 'cm_s_reply', text: 'Blue works for us', parent: 'cm_thread' }, sh);
  assert.equal((await saved('cm_s_reply')).parent, 'cm_thread');
  assert.equal((await saved('cm_s_reply')).vis, 'client');
  await post({ id: 'cm_s_inside', text: 'Guessing an id', parent: 'cm_inside' }, sh);
  assert.equal((await saved('cm_s_inside')).parent, null, 'a stakeholder cannot answer a comment they cannot see');
  /* someone on the team answers the internal one */
  await post({ id: 'cm_v_inside', text: 'Noted', parent: 'cm_inside' }, viewer);
  assert.equal((await saved('cm_v_inside')).parent, 'cm_inside');
});
