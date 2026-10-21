/* Hydrate once, redraw once (Oct 2026): a task is copied once when it arrives (src/core.js hTask, src/v34.js keeps
   what the server sent as the base of its next save); a save, a bulk edit, a time entry and a batch of live updates
   each draw the page once, on the next frame (requestRefresh), and a server answer that changes nothing drawn is
   not drawn again. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const read = f => fs.readFileSync(path.join(__dirname, '..', 'src', f), 'utf8');
const core = read('core.js'), v34 = read('v34.js'), v38 = read('v38.js'), enhance = read('enhance.js'), stime = read('scoring-time.js');

/* one top-level function's source, by its name (brace matching, quoted strings skipped) */
function fn(src, name) {
  const m = new RegExp('(^|\\n|[;}] *)function ' + name + '\\(').exec(src); assert.ok(m, 'function ' + name);
  let i = src.indexOf('{', m.index + m[0].length), depth = 0, q = null;
  for (; i < src.length; i++) { const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c; else if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
  return src.slice(m.index + m[0].indexOf('function'), i + 1);
}
const between = (src, a, b) => { const i = src.indexOf(a), j = src.indexOf(b, i + a.length); assert.ok(i >= 0 && j > i, a + ' … ' + b); return src.slice(i, j); };
const scriptOf = (src, n) => src.split('<script>')[n + 1].split('</script>')[0];
/* the frames the page would draw, run by hand */
function frames() { const q = []; let id = 0; return { raf(f) { q.push({ id: ++id, f }); return id; }, caf(k) { const i = q.findIndex(x => x.id === k); if (i >= 0) q.splice(i, 1); }, run() { const all = q.splice(0); all.forEach(x => x.f()); return all.length; }, get size() { return q.length; } }; }
const tick = () => new Promise(r => setImmediate(r));
async function settle() { for (let i = 0; i < 6; i++) await tick(); }

function serverTask(id, extra) {
  const at = '2026-10-20T03:00:00.000Z';
  return Object.assign({ id, title: 'Task ' + id, status: 'todo', prio: 'medium', assignee: 'admin', assignees: ['admin'], reviewer: null, reviewers: [], dueDate: '2026-10-30', startDate: '2026-10-28', createdAt: at, updatedAt: '2026-10-21T01:00:00.000Z',
    tags: ['a'], dependencies: [{ taskId: 'T-9', type: 'finish_to_start' }], labels: ['l1'], alsoIn: [], custom: { c1: 'x' }, meta: { kind: 'feed' }, description: 'Brief', brief: { tpl: 'banner', objective: 'o' },
    versions: [{ id: 'ver1', n: 1, by: 'admin', state: 'approved', createdAt: at, decidedAt: at, decidedBy: 'admin', note: 'v1' }, { id: 'ver2', n: 2, by: 'admin', state: 'pending', createdAt: at, decidedAt: null, note: 'v2' }],
    files: [{ id: 'f1', name: 'a.pdf', createdAt: at }, { id: 'f2', name: 'b.png', createdAt: at }],
    comments: [{ id: 'c1', by: 'admin', text: 'hi', createdAt: at, attachments: [] }, { id: 'c2', by: 'admin', text: 'yo', createdAt: at }],
    activity: [{ id: 'a1', who: 'admin', k: 'created', a: {}, createdAt: at }, { id: 'a2', who: 'admin', k: 'moved', a: { from: 'backlog', to: 'todo' }, createdAt: at }] }, extra || {});
}

/* core.js's hydration and saving, with v34's base of the next save, in a page of their own */
function page(opts) {
  opts = opts || {};
  const F = frames(), counts = { refresh: 0, drawer: 0, bg: 0, stringify: 0, dTask: 0 }, sent = [], replies = [];
  const ctx = { console, setTimeout, clearTimeout, Promise, Date, Math, JSON, Object, Array, String,
    S: { drawerTask: null }, API: { on: true }, AN: null, ME: 'admin', UI_ID: {}, tr: s => s, toast() {}, fail() {}, log() {}, notifyMoved() {},
    document: { hidden: false, listeners: {}, addEventListener(t, f) { (this.listeners[t] = this.listeners[t] || []).push(f); } },
    requestAnimationFrame: F.raf, cancelAnimationFrame: F.caf, uid: p => p + '_' + Math.random().toString(36).slice(2),
    renderNav() {}, renderScreen() {}, renderDrawer() { counts.drawer++; }, bgRedraw(f) { counts.bg++; return f(); },
    apiFetch(method, p, body) { sent.push({ method, path: p, body }); return new Promise((res, rej) => replies.push({ method, path: p, body, res, rej })); } };
  vm.createContext(ctx);
  vm.runInContext(['var TODAY=new Date(); TODAY.setHours(0,0,0,0);', 'dateOf', 'iso', 'offsetFromIso', 'minAgo', 'isoAgo', 'assigneesOf', 'reviewersOf', 'clone', 'replaceInto', 'hTask', 'dTask', 'refresh'].map(n => /^var /.test(n) ? n : fn(core, n)).join('\n'), ctx);
  vm.runInContext(between(core, '/* ---------- one redraw for what happened', 'function moveTask('), ctx);
  /* the page's own counter on refresh(), as the audit's: refresh() itself is core.js's */
  vm.runInContext('var __refresh=refresh; refresh=function(){ __counts.refresh++; return __refresh.apply(this,arguments); };', Object.assign(ctx, { __counts: counts }));
  if (opts.v34) vm.runInContext(scriptOf(v34, 0), ctx);
  vm.runInContext('(function(){ var s=JSON.stringify; JSON.stringify=function(){ __counts.stringify++; return s.apply(JSON,arguments); }; var d=dTask; dTask=function(){ __counts.dTask++; return d.apply(this,arguments); }; })()', ctx);
  return { ctx, F, counts, sent, replies, reset() { Object.keys(counts).forEach(k => { counts[k] = 0; }); } };
}

test('a task arriving from the server is copied once; the base of its next save is made on that save, from what was sent', async () => {
  const p = page({ v34: true }), raw = serverTask('T-1'), keep = JSON.stringify(raw);
  p.reset();
  const t = p.ctx.hTask(raw);
  assert.equal(p.counts.stringify, 1, 'one copy of the task (its versions, files, comments and history included)');
  assert.equal(p.counts.dTask, 0, 'nothing is made for the next save until there is one');
  assert.ok(p.ctx.ZC_BASE['T-1'] && p.ctx.ZC_BASE['T-1'].raw === raw, 'what the server sent is kept as it came');
  assert.equal(t.versions[0].ago >= 0 && t.comments[1].attachments.length === 0 && t.activity.length === 2, true, 'hydrated as before');
  /* nothing in the hydrated task is the server's object: changing it leaves the base as it came */
  t.dependencies.push({ taskId: 'T-8' }); t.versions[0].note = 'changed'; t.labels.push('l2'); t.custom.c1 = 'y'; t.comments[0].text = 'edited';
  assert.equal(JSON.stringify(raw), keep, 'the server copy is never changed');
  /* the save carries the revision it was loaded at and only what changed, compared with the task as it was loaded */
  t.title = 'Renamed';
  p.reset();
  p.ctx.apiFetch('PUT', '/api/tasks/T-1', p.ctx.dTask(t));
  const put = p.sent[p.sent.length - 1].body;
  assert.equal(put._rev, raw.updatedAt);
  assert.deepEqual([...put._changed].sort(), ['custom', 'comments', 'dependencies', 'labels', 'title', 'versions'].sort());
  assert.equal(p.counts.dTask, 2, 'the base is made once, on the first save (and the save itself)');
  p.reset(); t.prio = 'high';
  p.ctx.apiFetch('PUT', '/api/tasks/T-1', p.ctx.dTask(t));
  assert.equal(p.counts.dTask, 1, 'and kept for the next save');
  assert.ok(p.sent[p.sent.length - 1].body._changed.includes('prio'));
  /* a task loaded again starts from its new copy */
  const again = serverTask('T-1', { updatedAt: '2026-10-21T02:00:00.000Z', title: 'Renamed' });
  const t2 = p.ctx.hTask(again); t2.status = 'done';
  p.ctx.apiFetch('PUT', '/api/tasks/T-1', p.ctx.dTask(t2));
  const put2 = p.sent[p.sent.length - 1].body;
  assert.equal(put2._rev, again.updatedAt); assert.deepEqual([...put2._changed], ['status']);
});

test('saves draw once on the next frame, and the server\'s same answer is not drawn again', async () => {
  const p = page(), c = p.ctx;
  const tasks = ['T-1', 'T-2', 'T-3'].map(id => c.hTask(serverTask(id)));
  /* three saves in one go: nothing drawn yet, one frame draws them all */
  tasks.forEach(t => c.editTaskWith(t, x => { x.prio = 'high'; }));
  assert.equal(p.counts.refresh, 0, 'not drawn while the saves are being made');
  assert.equal(p.F.size, 1, 'one frame asked for');
  p.F.run(); assert.equal(p.counts.refresh, 1, 'drawn once');
  /* the server keeps what was sent: answers that change nothing on screen are not drawn */
  p.replies.splice(0).forEach(r => r.res(Object.assign(JSON.parse(JSON.stringify(r.body)), { updatedAt: '2026-10-21T05:00:00.000Z' })));
  await settle(); assert.equal(p.F.size, 0, 'no redraw for answers equal to what is drawn'); assert.equal(tasks[0].updatedAt, '2026-10-21T05:00:00.000Z', 'the task is the server\'s copy');
  /* the server wrote the history itself: only the open task's panel draws it */
  c.S.drawerTask = 'T-2';
  c.editTaskWith(tasks[1], x => { x.description = 'New words'; x.activity.push({ id: 'act_local', who: 'admin', k: 'edited', ago: 0, a: { what: 'the description' } }); });
  p.F.run(); p.reset();
  let r = p.replies.shift(), b = JSON.parse(JSON.stringify(r.body)); b.activity = b.activity.filter(a => a.id !== 'act_local').concat([{ id: 'act_server', who: 'admin', k: 'edited', a: { what: 'the description' }, createdAt: new Date().toISOString() }]);
  r.res(b); await settle(); p.F.run();
  assert.equal(p.counts.refresh, 0, 'not the whole page'); assert.equal(p.counts.drawer, 1, 'the task\'s panel, once');
  /* an answer that changes what is drawn is drawn, once */
  c.S.drawerTask = null;
  c.editTaskWith(tasks[2], x => { x.title = 'Mine'; }); p.F.run(); p.reset();
  r = p.replies.shift(); r.res(Object.assign(JSON.parse(JSON.stringify(r.body)), { title: 'Mine, as the server keeps it' })); await settle();
  assert.equal(p.F.run(), 1); assert.equal(p.counts.refresh, 1);
  /* a task without a due date is drawn as due today; its first save stores today: nothing new on screen */
  const undated = c.hTask(serverTask('T-4', { dueDate: null, startDate: null }));
  c.editTaskWith(undated, x => { x.prio = 'low'; }); p.F.run(); p.reset();
  r = p.replies.shift(); b = JSON.parse(JSON.stringify(r.body)); assert.equal(b.dueDate, c.iso(0), 'sent as today'); r.res(b); await settle();
  assert.equal(p.F.run(), 0, 'not drawn again'); assert.equal(undated.dueDate, c.iso(0));
  /* refresh() at once answers what was waiting */
  c.requestRefresh(); c.refresh(); assert.equal(p.F.size, 0, 'the frame asked for is not drawn again');
});

test('a hidden tab is not drawn; it is drawn once, as a redraw from elsewhere, when shown again', () => {
  const p = page(), c = p.ctx; c.document.hidden = true;
  c.requestRefresh(); c.requestRefresh({ bg: true }); c.requestRefresh();
  assert.equal(p.F.size, 0, 'no frame while hidden'); assert.equal(p.counts.refresh, 0);
  c.document.hidden = false; c.document.listeners.visibilitychange.forEach(f => f());
  p.F.run(); assert.equal(p.counts.refresh, 1, 'once'); assert.equal(p.counts.bg, 1, 'keeping what is typed');
  c.document.listeners.visibilitychange.forEach(f => f()); assert.equal(p.F.size, 0, 'and not again');
});

test('a bulk edit and its undo each draw once, and once more only if an answer changes what is drawn', async () => {
  const p = page(), c = p.ctx, ids = Array.from({ length: 20 }, (_, i) => 'T-' + (i + 1));
  const TASKS = ids.map(id => c.hTask(serverTask(id))); let undo = null;
  Object.assign(c, { ENH: { bulkSel: {} }, task: id => TASKS.find(t => t.id === id), bulkIds: () => ids, canI: { editTask: () => true }, fmt: s => s, undoToast(m, f) { undo = f; } });
  vm.runInContext(fn(enhance, 'bulkApply'), c);
  c.bulkApply('{n} tasks set to high', t => { t.prio = 'high'; });
  assert.equal(p.replies.length, 20, 'every task saved');
  assert.equal(p.F.run(), 1); assert.equal(p.counts.refresh, 1, 'drawn once, not once per task');
  /* the answers come in one by one, each in a frame of its own, and the server changed four of them: the page is
     drawn again once, when the last has come in */
  const answers = p.replies.splice(0);
  for (let i = 0; i < answers.length; i++) { const b = JSON.parse(JSON.stringify(answers[i].body)); if (i % 5 === 2) b.prio = 'urgent'; answers[i].res(b); await settle(); p.F.run(); }
  assert.equal(p.counts.refresh, 2, 'one more, for the ones the server changed, once');
  /* undo: the same */
  p.reset(); undo();
  assert.equal(p.replies.length, 20); assert.equal(p.F.run(), 1); assert.equal(p.counts.refresh, 1);
  p.replies.splice(0).forEach(r => r.res(JSON.parse(JSON.stringify(r.body)))); await settle();
  assert.equal(p.F.run(), 0, 'nothing changed by the server: not drawn again'); assert.equal(TASKS[7].prio, 'medium');
});

test('a time entry draws the page once, after the task is fetched again', async () => {
  const p = page(), c = p.ctx, tk = c.hTask(serverTask('T-5')); let drawn = 0;
  Object.assign(c, { SCR_TIME: { cache: {} }, task: () => tk, taskMeta: t => (t.meta = t.meta || {}), scoringTimeDrawAll() { drawn++; } });
  vm.runInContext(fn(stime, 'scoringTimeTook') + '\n' + fn(stime, 'scoringTimeRedraw'), c);
  c.scoringTimeTook('T-5', { actualEffort: 1.5, entries: [] });
  assert.equal(drawn, 1, 'the log and the Actual at once'); assert.equal(tk.meta.actualEffort, 1.5);
  p.F.run(); assert.equal(p.counts.refresh, 0, 'not drawn before the task comes back');
  p.replies.shift().res(serverTask('T-5', { meta: { actualEffort: 1.5 }, updatedAt: '2026-10-21T06:00:00.000Z' })); await settle();
  assert.equal(p.F.run(), 1); assert.equal(p.counts.refresh, 1, 'once'); assert.equal(p.counts.bg, 1, 'as a redraw from elsewhere');
  /* the fetch failing still draws what changed, once */
  p.reset(); c.scoringTimeTook('T-5', { actualEffort: 2, entries: [] }); p.replies.shift().rej(new Error('offline')); await settle();
  assert.equal(p.F.run(), 1); assert.equal(p.counts.refresh, 1);
});

test('live updates: one fetch each, all at once, drawn once; this tab\'s own save is not fetched again', async () => {
  const p = page({ v34: true }), c = p.ctx, timers = [];
  const TASKS = ['T-1', 'T-2', 'T-3'].map(id => c.hTask(serverTask(id)));
  /* the browser's EventSource, recording the listener the live board adds to it */
  const listeners = [], Base = function () {}; Base.prototype.addEventListener = (t, f) => listeners.push(f);
  Object.assign(c, { TASKS, window: { EventSource: Base }, person: () => ({ name: 'Sarah' }), closeDrawer() {},
    setTimeout: (f, ms) => { if (ms === 250) { timers.push(f); return 1; } return setTimeout(f, ms); } });
  vm.runInContext(scriptOf(v34, 1), c);
  new c.window.EventSource('/api/messages/stream');
  const send = ev => listeners.forEach(f => f({ data: JSON.stringify(Object.assign({ type: 'task_changed', by: 'sarah' }, ev)) }));
  p.reset();
  send({ id: 'T-1', updatedAt: '2026-10-21T09:00:00.000Z' }); send({ id: 'T-2', updatedAt: '2026-10-21T09:00:00.000Z' }); send({ id: 'T-3', updatedAt: '2026-10-21T09:00:00.000Z' });
  assert.equal(timers.length, 1, 'batched'); timers.shift()(); await settle();
  const gets = p.replies.splice(0); assert.equal(gets.length, 3, 'one fetch per task, all at once');
  gets.forEach(r => r.res(serverTask(r.path.split('/').pop(), { title: 'Changed by Sarah', updatedAt: '2026-10-21T09:00:00.000Z' })));
  await settle(); await settle();
  assert.equal(p.F.run(), 1, 'one frame'); assert.equal(p.counts.refresh, 1, 'drawn once for the three'); assert.equal(p.counts.bg, 1, 'as a redraw from elsewhere');
  /* this tab saves T-2; the server tells every tab, this one too, before its answer is back */
  p.reset();
  const t2 = TASKS[1]; c.editTaskWith(t2, x => { x.title = 'Mine'; }); p.F.run(); p.reset();
  const put = p.replies.shift();
  send({ id: 'T-2', updatedAt: '2026-10-21T10:00:00.000Z', by: 'admin' }); timers.shift()(); await settle();
  assert.equal(p.replies.length, 0, 'not fetched while this tab\'s own save is on its way');
  const kept = JSON.parse(JSON.stringify(put.body)); delete kept._rev; delete kept._changed;   /* the server answers with the task, not the request */
  put.res(Object.assign(kept, { updatedAt: '2026-10-21T10:00:00.000Z' }));
  await new Promise(r => setTimeout(r, 20)); await settle();
  assert.equal(p.replies.length, 0, 'nor after: the answer is that revision');
  assert.equal(p.F.run(), 0, 'and nothing drawn again'); assert.equal(p.counts.refresh, 0);
  /* a fetched task that changes nothing drawn is not drawn */
  send({ id: 'T-3', updatedAt: '2026-10-21T11:00:00.000Z' }); timers.shift()(); await settle();
  const g = p.replies.shift(); g.res(serverTask('T-3', { title: 'Changed by Sarah', updatedAt: '2026-10-21T11:00:00.000Z' })); await settle(); await settle();
  assert.equal(p.F.run(), 0, 'unchanged: not drawn'); assert.equal(TASKS[2].updatedAt, '2026-10-21T11:00:00.000Z');
});

test('a workspace change (projects, people…) in a hidden tab is fetched, and drawn once when the tab is shown', async () => {
  const p = page(), c = p.ctx, timers = [];
  const listeners = [], Base = function () {}; Base.prototype.addEventListener = (t, f) => listeners.push(f);
  Object.assign(c, { window: { EventSource: Base }, PROJECTS: [], hProject: x => x, msgRefreshConversations() {},
    setTimeout: (f, ms) => { if (ms === 400) { timers.push(f); return 1; } return setTimeout(f, ms); } });
  c.document.activeElement = null; c.document.getElementById = () => null;
  vm.runInContext(between(v38, '/* ---------- #18 live updates', '/* ---------- #19 '), c);
  new c.window.EventSource('/api/messages/stream');
  c.document.hidden = true;
  listeners.forEach(f => f({ data: JSON.stringify({ type: 'ws_changed', kind: 'projects', by: 'sarah' }) }));
  timers.shift()(); await settle();
  const r = p.replies.shift(); assert.equal(r.path, '/api/live/projects', 'fetched while hidden');
  r.res({ projects: [{ id: 'p1', name: 'New' }] }); await settle();
  assert.equal(c.PROJECTS.length, 1, 'the data is there');
  assert.equal(p.counts.refresh, 0, 'not drawn while hidden'); assert.equal(p.F.size, 0);
  c.document.hidden = false; c.document.listeners.visibilitychange.forEach(f => f());
  assert.equal(p.F.run(), 1); assert.equal(p.counts.refresh, 1, 'drawn once when shown');
});
