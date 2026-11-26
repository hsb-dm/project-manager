/* What AI Intelligence is told beyond the lists (Nov 2026, src/ai-insights.js). The owner asked for the chat to know
   how many assets each person has and how many tasks or assets someone produced in a project in a given month, then
   for the dashboard's and Analytics' figures. Here the real page code (src/core.js, teams.js, dashboard.js,
   analytics.js, export.js, ai.js, ai-insights.js) runs in a sandbox on a small workspace whose numbers are known: two
   people producing, two projects and one archived, tasks finished this month, last month and two months ago (the old
   ones slim, as the server sends them: no versions), a task with two people and a typed split, a task shared out as an
   estimate, a declined one, an open one whose versions someone else uploaded. It checks:
   - every new section of the snapshot carries the exact counts, and each equals what the app's own function gives on
     the same data (memberAssets, personAssetCredit, assetsProduced, dashCounts, metrics, teamWorkload, reportData,
     demoAnalytics), so the chat cannot disagree with Home, the person pages, Analytics or the report;
   - the budget: thousands of tasks keep every new section whole and ahead of the open-task list, which stays last;
   - the answers without a model, in English and Indonesian, give the same numbers as the snapshot;
   - month names and phrases in both languages;
   - someone who may not open Analytics is not told its figures. */
/* the e2e server's time zone: a month starts at local midnight, seven hours before UTC's */
process.env.TZ = 'Asia/Jakarta';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const D = require('../shared/demo-data.js');
const FILES = ['src/core.js', 'src/teams.js', 'src/dashboard.js', 'src/analytics.js', 'src/report-template.js', 'src/report-layout.js', 'src/export.js', 'src/ai.js', 'src/ai-insights.js'];

/* a stand-in for the DOM that answers anything: the page code only touches it at load and when it draws */
function anything() { const f = function () { return p; }; const p = new Proxy(f, { get(t, k) { if (k === Symbol.toPrimitive) return () => ''; if (k === 'length') return 0; return p; }, apply() { return p; }, construct() { return p; }, set() { return true; } }); return p; }
function page() {
  const store = { getItem() { return null; }, setItem() {}, removeItem() {} };
  const ctx = { console, setTimeout, clearTimeout, setInterval, clearInterval, Promise, Date, Math, JSON, Intl, URL, TextEncoder, Uint8Array,
    navigator: { userAgent: 'node', language: 'en' }, location: { href: 'http://x/', pathname: '/', search: '', hash: '' }, document: anything(), localStorage: store, sessionStorage: store,
    matchMedia: () => ({ matches: false, addEventListener() {}, addListener() {} }), addEventListener() {}, removeEventListener() {}, requestAnimationFrame: () => 0, history: { replaceState() {}, pushState() {} },
    fetch: () => Promise.reject(new Error('no network')), Image: function () {}, Blob: function () {}, FileReader: function () {} };
  ctx.window = ctx; ctx.self = ctx;
  vm.createContext(ctx);
  for (const f of FILES) vm.runInContext(fs.readFileSync(path.join(root, f), 'utf8').replace(/^\s*<script>\s*/, '').replace(/<\/script>\s*$/, ''), ctx, { filename: f });
  return ctx;
}
const run = (ctx, code) => vm.runInContext(code, ctx);

/* ---------- the workspace, its dates counted from today ---------- */
const DAY = 864e5;
function monthKey(d) { return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'); }
function shift(key, n) { const [y, m] = key.split('-').map(Number); return monthKey(new Date(y, m - 1 + n, 1)); }
/* noon on the 10th of a month, n months from this one (0: this month), as the server writes a finish time */
function finishedIn(n) { const t = new Date(); return new Date(t.getFullYear(), t.getMonth() + n, 10, 12, 0, 0).toISOString(); }
function workspace(ctx, extra) {
  const cur = monthKey(new Date()), prev = shift(cur, -1), m3 = shift(cur, -2);
  ctx.UI_LANG = 'en'; ctx.ME = 'ana'; ctx.API = { on: false }; ctx.AN = null; ctx.S.range = 8; ctx.ASSETS = []; ctx.ROLES = []; ctx.REQUESTS = [];
  ctx.WS = { name: 'Studio', workflow: JSON.parse(JSON.stringify(D.workflow)), autoHide: { tasks: 'off', projects: 'off' }, ai: {}, customFields: [], tags: [], labels: [] };
  ctx.PEOPLE = {
    ana: { id: 'ana', name: 'Ana Putri', role: 'Designer', perm: 'admin', cap: 40, teams: [['brand', true]], active: true },
    budi: { id: 'budi', name: 'Budi Santoso', role: 'Illustrator', perm: 'member', cap: 20, teams: [['brand', false]], active: true },
    cici: { id: 'cici', name: 'Cici Lestari', role: 'Copywriter', perm: 'member', cap: 10, teams: [], active: true },
    sari: { id: 'sari', name: 'Sari Klien', role: 'Client', perm: 'member', cap: 0, teams: [], active: true, stakeholder: true }
  };
  ctx.WS.people = ctx.PEOPLE;
  ctx.TEAMS = [{ id: 'brand', name: 'Brand', lead: 'ana', color: 'blue', sort: 1, archived: false }];
  ctx.PROJECTS = [
    { id: 'p1', name: 'Website relaunch', status: 'active', owner: 'ana', due: 10, start: -40, team: [], milestones: [] },
    { id: 'p2', name: 'Brand book', status: 'active', owner: 'budi', due: 3, start: -40, team: [], milestones: [] },
    { id: 'p3', name: 'Old campaign', status: 'archived', owner: 'ana', due: -90, start: -200, team: [], milestones: [] }
  ];
  const at = (days, h) => new Date(Date.now() + days * DAY + (h || 0) * 36e5).toISOString();
  const mk = (id, o) => Object.assign({ id, title: 'Task ' + id, description: '', proj: null, alsoIn: [], team: null, status: 'progress', prio: 'medium', assignee: null, assignees: [], reviewer: null, reviewers: [], dependencies: [], hidden: false, assetCount: 0, labels: [], due: 20, span: 1, effort: 2, sort: 0, tags: [], custom: {}, versions: [], files: [], comments: [], activity: [], createdAt: at(-60), createdBy: 'ana', meta: {} }, o);
  const done = (n, o) => Object.assign({ status: 'done', completedAt: finishedIn(n), due: Math.round((Date.parse(finishedIn(n)) - Date.now()) / DAY) + 2 }, o);
  ctx.TASKS = [
    /* this month: four of Ana's, by her uploads (one sent back once, then approved); a split typed 2 / 4 */
    mk('T-101', done(0, { proj: 'p1', assignee: 'ana', assignees: ['ana'], assetCount: 4, createdAt: at(-20), versions: [{ id: 'v1', n: 1, by: 'ana', state: 'revision', createdAt: at(-8), decidedAt: at(-7) }, { id: 'v2', n: 2, by: 'ana', state: 'approved', createdAt: at(-6), decidedAt: at(-5) }],
      activity: [{ k: 'moved', a: { from: 'todo', to: 'progress' }, createdAt: at(-10) }, { k: 'moved', a: { from: 'progress', to: 'review' }, createdAt: at(-8) }, { k: 'moved', a: { from: 'review', to: 'done' }, createdAt: at(-7) }] })),
    mk('T-102', done(0, { proj: 'p1', assignee: 'ana', assignees: ['ana', 'budi'], assetCount: 6, meta: { assetSplit: { ana: 2, budi: 4 } } })),
    /* last month: nobody uploaded or typed anything, so the assignees are credited, as an estimate */
    mk('T-103', done(-1, { proj: 'p2', assignee: 'budi', assignees: ['budi'], assetCount: 3 })),
    mk('T-104', done(-1, { proj: 'p1', alsoIn: ['p2'], assignee: 'ana', assignees: ['ana', 'budi'], assetCount: 2 })),
    mk('T-109', done(-1, { proj: null, assignee: 'ana', assignees: ['ana'], assetCount: 1, versions: [{ id: 'v9', n: 1, by: 'ana', state: 'approved', createdAt: finishedIn(-1) }] })),
    /* two months ago, slim, as the server sends work finished long ago: no versions, the typed split beside the meta */
    mk('T-105', done(-2, { _slim: true, proj: 'p2', assignee: 'ana', assignees: ['ana'], assetCount: 5, assetSplit: { ana: 3, budi: 2 }, meta: {} })),
    mk('T-106', done(-2, { _slim: true, proj: 'p1', assignee: 'budi', assignees: ['budi'], assetCount: 2 })),
    /* seven months ago: only in the totals */
    mk('T-110', done(-7, { _slim: true, proj: 'p1', assignee: 'ana', assignees: ['ana'], assetCount: 2 })),
    /* declined: produced nothing */
    mk('T-107', { proj: 'p1', status: 'declined', completedAt: finishedIn(0), assignee: 'ana', assignees: ['ana'], assetCount: 9 }),
    /* open: Ana's task, Budi uploaded its version */
    mk('T-108', { proj: 'p1', assignee: 'ana', assignees: ['ana'], assetCount: 3, due: 8, effort: 6, versions: [{ id: 'v8', n: 1, by: 'budi', state: 'pending', createdAt: at(-1) }] }),
    /* open work for the risks: too big for its day, overdue in review, blocked by work due later, a request */
    mk('T-201', { proj: 'p2', assignee: 'budi', assignees: ['budi'], due: 1, effort: 30, meta: { actualEffort: 2 } }),
    mk('T-202', { proj: 'p1', assignee: 'ana', assignees: ['ana'], status: 'review', reviewer: 'budi', reviewers: ['budi'], due: -2, effort: 4 }),
    mk('T-203', { proj: 'p1', assignee: 'ana', assignees: ['ana'], due: 0, effort: 2, dependencies: [{ taskId: 'T-204', type: 'finish_to_start' }] }),
    mk('T-204', { proj: 'p1', assignee: 'budi', assignees: ['budi'], due: 5, effort: 3 }),
    mk('T-205', { status: 'backlog', tags: ['request'], due: 12, effort: 0 }),
    /* in the archived project: not on the board */
    mk('T-301', { proj: 'p3', assignee: 'cici', assignees: ['cici'], due: 4, effort: 8 })
  ];
  ctx.ACTIVITY = [{ id: 'a1', who: 'ana', k: 'moved', createdAt: at(-1), a: {} }, { id: 'a2', who: 'budi', k: 'upload', createdAt: at(-2), a: {} }, { id: 'a3', who: 'ana', k: 'moved', createdAt: at(-3), a: {} }, { id: 'a4', who: 'ana', k: 'created', createdAt: at(-10), a: {} }];
  if (extra) extra(ctx);
  return { cur, prev, m3, m7: shift(cur, -7) };
}
const section = (ctx, head) => { const i = ctx.indexOf(head); assert.ok(i >= 0, head + ' is in the snapshot'); return ctx.slice(i).split('\n'); };
const lineOf = (ctx, re) => { const l = ctx.split('\n').find(x => re.test(x)); assert.ok(l, String(re) + ' has a line'); return l; };

test('ASSETS BY PERSON and the monthly tables carry the exact counts, slim tasks included', () => {
  const p = page(), m = workspace(p), ctx = run(p, 'aiContext(60)');
  assert.ok(ctx.length <= run(p, 'AI_CTX_MAX'));
  assert.match(ctx, /OUTPUT RULE: a task is finished in a done stage other than Declined/);
  assert.ok(ctx.includes('ASSETS IN ALL: produced=28 on every task not Declined, open ones included; delivered=25 on 8 finished tasks; ' + m.cur + ' (this month)=10; ' + m.prev + ' (last month)=6.'));
  /* Ana: 4 by upload + 2 typed this month; 1 shared out + 1 by upload last month; 3 typed on a slim task; 2 seven months ago */
  assert.ok(ctx.includes('- Ana Putri: produced=13* delivered=13* ' + m.cur + '=6 ' + m.prev + '=2* | tasks finished: all=6 ' + m.cur + '=2 ' + m.prev + '=2'), 'Ana');
  /* Budi: 4 typed; 3 + 1 estimated; 2 typed on a slim task he is not assigned to and 2 estimated on a slim one; 3 uploaded to Ana's open task */
  assert.ok(ctx.includes('- Budi Santoso: produced=15* delivered=12* ' + m.cur + '=4 ' + m.prev + '=4* | tasks finished: all=4 ' + m.cur + '=1 ' + m.prev + '=2'), 'Budi');
  assert.ok(ctx.includes('- nothing produced or finished yet: Cici Lestari'), 'someone with nothing is named once, cheaply');
  assert.ok(!/Sari Klien: produced/.test(ctx), 'a stakeholder is not on the team');
  /* the workspace month by month: six calendar months, the current one first */
  const months = lineOf(ctx, /^OUTPUT BY MONTH, whole workspace/);
  assert.match(months, /6 calendar months, newest first/);
  assert.ok(months.includes(m.cur + ' ' + run(p, 'MOL[' + (Number(m.cur.slice(5)) - 1) + ']') + ' tasks=2 assets=10'));
  assert.ok(months.includes(m.prev + ' ') && months.includes(' tasks=3 assets=6') && months.includes(' tasks=2 assets=7'));
  assert.equal((months.match(/ tasks=/g) || []).length, 6);
  assert.ok(!months.includes(m.m7), 'seven months ago is outside the window');
  /* per project, per month, with the all-time total; a task in two projects counts in each */
  assert.ok(ctx.includes('- Website relaunch: ' + m.cur + ' tasks=2 assets=10; ' + m.prev + ' tasks=1 assets=2; ' + m.m3 + ' tasks=1 assets=2 | all time: tasks=5 assets=16'));
  assert.ok(ctx.includes('- Brand book: ' + m.prev + ' tasks=2 assets=5; ' + m.m3 + ' tasks=1 assets=5 | all time: tasks=3 assets=10'));
  assert.ok(ctx.includes('- (no project): ' + m.prev + ' tasks=1 assets=1 | all time: tasks=1 assets=1'));
  /* person x project, month by month; the busiest first in each month */
  const px = section(ctx, 'MONTHLY OUTPUT BY PERSON x PROJECT');
  const at = s => px.findIndex(l => l.startsWith(s));
  assert.ok(at(m.cur) > 0 && at(m.prev) > at(m.cur) && at(m.m3) > at(m.prev));
  assert.equal(px[at(m.cur) + 1], '- Ana Putri: tasks=2 assets=6 | all in Website relaunch');
  assert.equal(px[at(m.cur) + 2], '- Budi Santoso: tasks=1 assets=4 | all in Website relaunch');
  assert.equal(px[at(m.prev) + 1], '- Budi Santoso: tasks=2 assets=4* | Brand book tasks=2 assets=4*; Website relaunch tasks=1 assets=1*');
  assert.equal(px[at(m.prev) + 2], '- Ana Putri: tasks=2 assets=2* | Website relaunch tasks=1 assets=1*; Brand book tasks=1 assets=1*; (no project) tasks=1 assets=1');
  /* the slim tasks count: Budi's typed 2 on a task of Ana's and his own estimated 2 */
  assert.equal(px[at(m.m3) + 1], '- Budi Santoso: tasks=1 assets=4* | Brand book tasks=0 assets=2; Website relaunch tasks=1 assets=2*');
  assert.equal(px[at(m.m3) + 2], '- Ana Putri: tasks=1 assets=3 | all in Brand book');
  assert.ok(px.some(l => l === shift(m.cur, -5) + ' ' + run(p, 'MOL[' + (Number(shift(m.cur, -5).slice(5)) - 1) + ']') + ': nothing finished'), 'an empty month says so');
  assert.ok(!ctx.includes('ASSETS: '), 'the old one-line total gave way to the sections');
});

test('each figure equals the app\'s own count for the same data', () => {
  const p = page(), m = workspace(p);
  const A = run(p, 'aiOutput()');
  for (const id of ['ana', 'budi', 'cici']) {
    /* the person page and the Team page (memberAssets: total, delivered, this month) */
    const ma = run(p, 'memberAssets(' + JSON.stringify(id) + ')');
    assert.equal(A.get('total', id).assets, ma.total, id + ' total');
    assert.equal(A.get('done', id).assets, ma.delivered, id + ' delivered');
    assert.equal(A.get(m.cur, id).assets, ma.month, id + ' this month');
    assert.equal(A.get('total', id).est, ma.attributed, id + ' estimated');
    /* any month, any project: the reports' personAssetCredit over the tasks finished then */
    for (const mo of [m.cur, m.prev, m.m3, m.m7]) for (const pj of [null, 'p1', 'p2']) {
      const want = run(p, 'personAssetCredit(' + JSON.stringify(id) + ',TASKS.filter(function(t){ return isSuccessfulTask(t)&&aiDoneMonth(t)===' + JSON.stringify(mo) + (pj ? '&&inProject(t,' + JSON.stringify(pj) + ')' : '') + '; })).count');
      assert.equal(A.get(mo, id, pj).assets, want, id + ' ' + mo + ' ' + pj);
    }
  }
  /* a month's or a project's total: assetsProduced over the tasks finished then, as Teams' "Assets produced" */
  for (const mo of [m.cur, m.prev, m.m3]) assert.equal(A.get(mo).assets, run(p, 'assetsProduced(TASKS.filter(function(t){ return aiDoneMonth(t)===' + JSON.stringify(mo) + '; }))'));
  assert.equal(A.get(m.cur).tasks, run(p, 'TASKS.filter(teamDoneThisMonth).length'), 'Teams\' "Done this month"');
  /* the month rule is teamDoneThisMonth's */
  assert.deepEqual(run(p, 'TASKS.filter(teamDoneThisMonth).map(function(t){ return t.id; })'), run(p, 'TASKS.filter(function(t){ return aiDoneMonth(t)===aiMonthKey(TODAY); }).map(function(t){ return t.id; })'));
});

/* the edges: a task finished just after local midnight on the 1st (still the last day of the month before in UTC),
   shares added before rounding (1.5 + 1.5 is 3, not 2 + 2), someone with more tasks and fewer assets, a version
   approved on a task its uploader is not assigned to, a task two people share the hours of, hours logged */
test('edges: local midnight, shares added up before rounding, the ranking, review outcomes and shared hours', () => {
  const p = page(), m = workspace(p, ctx => {
    const t = new Date(), m4 = new Date(t.getFullYear(), t.getMonth() - 3, 12, 12).toISOString();
    const base = (id, o) => Object.assign({ id, title: 'Edge ' + id, description: '', proj: 'p1', alsoIn: [], team: null, status: 'done', prio: 'medium', assignee: null, assignees: [], reviewer: null, reviewers: [], dependencies: [], hidden: false, assetCount: 0, labels: [], due: -80, span: 1, effort: 1, sort: 0, tags: [], custom: {}, versions: [], files: [], comments: [], activity: [], createdAt: m4, completedAt: m4, meta: {} }, o);
    ctx.TASKS.push(base('T-120', { assignee: 'ana', assignees: ['ana', 'budi'], assetCount: 3 }), base('T-121', { assignee: 'ana', assignees: ['ana', 'budi'], assetCount: 3 }),
      base('T-123', { assignee: 'cici', assignees: ['cici'], assetCount: 1 }), base('T-124', { assignee: 'cici', assignees: ['cici'] }), base('T-125', { assignee: 'cici', assignees: ['cici'] }),
      base('T-122', { assignee: 'cici', assignees: ['cici'], assetCount: 1, completedAt: new Date(t.getFullYear(), t.getMonth(), 1, 0, 30).toISOString(), due: 0 }),
      base('T-126', { assignee: 'ana', assignees: ['ana'], completedAt: new Date(t.getFullYear(), t.getMonth() - 4, 12, 12).toISOString(), versions: [{ id: 'v26', n: 1, by: 'budi', state: 'approved', createdAt: m4, decidedAt: m4 }] }),
      base('T-127', { status: 'progress', completedAt: null, assignee: 'ana', assignees: ['ana', 'budi'], effort: 10, due: 15 }));
  });
  const m4 = shift(m.cur, -3), A = run(p, 'aiOutput()');
  /* the 1st at 00:30 local is this month, as teamDoneThisMonth has it, though UTC still says last month */
  assert.equal(run(p, 'new Date(task("T-122").completedAt).toISOString().slice(0,7)'), m.prev, 'in UTC it is still last month');
  assert.equal(A.get(m.cur, 'cici').tasks, 1); assert.equal(A.get(m.prev, 'cici').tasks, 0);
  assert.equal(run(p, 'teamDoneThisMonth(task("T-122"))'), true);
  /* 1.5 + 1.5 is 3, as personAssetCredit adds them */
  assert.equal(A.get(m4, 'ana').assets, 3); assert.equal(A.get(m4, 'budi').assets, 3);
  for (const id of ['ana', 'budi', 'cici']) for (const mo of [m.cur, m.prev, m4]) assert.equal(A.get(mo, id).assets, run(p, 'personAssetCredit(' + JSON.stringify(id) + ',TASKS.filter(function(t){ return isSuccessfulTask(t)&&aiDoneMonth(t)===' + JSON.stringify(mo) + '; })).count'), id + ' ' + mo);
  /* most assets is not most tasks */
  const mon = run(p, 'aiMonthName(' + JSON.stringify(m4) + ')').split(' ')[0];
  assert.match(run(p, 'aiLocalAnswer(' + JSON.stringify('who produced the most assets in ' + mon) + ')'), /\n\n1\. \*\*(Ana Putri|Budi Santoso)\*\* — 3\* assets, 2 finished tasks\n2\. \*\*(Ana Putri|Budi Santoso)\*\* — 3\* assets, 2 finished tasks\n3\. \*\*Cici Lestari\*\* — 1\* asset, 3 finished tasks/);
  assert.match(run(p, 'aiLocalAnswer(' + JSON.stringify('who finished the most tasks in ' + mon) + ')'), /\n\n1\. \*\*Cici Lestari\*\* — 3 finished tasks, 1\* asset\n/);
  /* review outcomes only on the uploader's own tasks, as the report counts them */
  for (const x of run(p, 'reportData().people')) {
    const r = run(p, 'aiReviewOutcomes(' + JSON.stringify(x.id) + ',exportTasks())');
    assert.deepEqual([r.outcomes, r.approvalRate, r.revisionRate, r.firstPassRate], [x.reviewOutcomes, x.approvalRate, x.revisionRate, x.firstPassRate], x.id);
  }
  /* a task two people share: 5h each, as Team workload counts it, in the snapshot and in the answer */
  const ctx = run(p, 'aiContext(60)');
  assert.equal(run(p, 'assigned("ana")'), 17);
  assert.match(ctx, /- Ana Putri \(Designer\) teams=Brand capacity=40h assigned=17h util=43% open=4/);
  assert.match(run(p, 'aiLocalAnswer("what is my workload")'), /^\*\*Ana Putri\*\* — 43% utilisation \(17h \/ 40h, 4 open\)/);
  /* the hours logged come off what is left: 20h with 12 logged fits two days of 8h; 20h with none does not */
  run(p, 'TASKS.push(Object.assign({},task("T-127"),{id:"T-128",assignee:"cici",assignees:["cici"],effort:20,due:1,meta:{actualEffort:12}}),Object.assign({},task("T-127"),{id:"T-129",assignee:"cici",assignees:["cici"],effort:20,due:1,meta:{}}))');
  assert.deepEqual(run(p, 'aiTasksTooBig(TASKS.filter(function(t){ return /^T-12[89]$/.test(t.id); })).map(function(t){ return t.id; })'), ['T-129']);
});

test('Home, load, risk, the pipeline, Analytics and the week are there, each with the screen\'s own numbers', () => {
  const p = page(); workspace(p); const ctx = run(p, 'aiContext(60)'), dc = run(p, 'dashCounts()'), mt = run(p, 'metrics()');
  /* Home */
  const home = lineOf(ctx, /^HOME DASHBOARD/);
  assert.ok(home.includes('my tasks=' + dc.mine.length + ', due today=' + dc.today.length + ', in review=' + dc.inrev.length + ' (' + dc.rev.length + ' waiting for your review), overdue=' + dc.over.length + ', completed in the last 7 days=' + dc.doneWeek + ', assets delivered=' + dc.assetsDone));
  assert.ok(home.includes('my tasks=3, due today=1, in review=1 (1 waiting for your review), overdue=1,'), 'the known numbers');
  assert.ok(home.includes('assets delivered=34 (from completed tasks: every done stage, Declined included, so it can differ from ASSETS IN ALL), assets in production=3 (planned on open tasks)'), 'as Home counts them, Declined included');
  assert.match(ctx, /- inbox, new requests waiting \(1\): T-205 "Task T-205"/);
  assert.match(ctx, /- needs your review \(1\): T-202 "Task T-202"/);
  /* load: as Team workload counts it */
  assert.match(ctx, /- Budi Santoso \(Illustrator\) teams=Brand capacity=20h assigned=33h util=165% open=2/);
  assert.ok(ctx.includes('OVER CAPACITY (open hours above their weekly capacity, as Team workload shows): Budi Santoso 165% (33h of 20h)'));
  const w = run(p, 'teamWorkload("brand")');
  assert.ok(ctx.includes(' util=' + w.pct + '% (' + w.assigned + 'h of ' + w.cap + 'h)') && w.pct === 75);
  /* risk: Analytics' Deadline risk, more work than time, tasks that cannot fit, the schedule risk and the top blocker */
  const risk = lineOf(ctx, /^- projects at risk/);
  assert.match(risk, /Website relaunch risk=high progress=\d+% open=4 overdue=1/);
  assert.match(risk, /Brand book risk=medium MORE-WORK-THAN-TIME progress=17% open=1 overdue=0 hours_left=30h days_left=3 people=1/);
  assert.ok(risk.indexOf('Website relaunch') < risk.indexOf('Brand book'), 'high before medium');
  assert.equal(run(p, 'aiProjectRisks(metrics()).map(function(x){ return x.risk; }).join()'), mt.byProject.filter(x => x.risk !== 'low').map(x => x.risk).join(), 'the levels are Analytics\' own');
  assert.match(ctx, /- open tasks that cannot fit before their due date \(1;[^)]*\): T-201 "Task T-201" 28h left for 1 people/);
  assert.match(ctx, /SCHEDULE-RISK, 1\): T-203 due \d{4}-\d\d-\d\d needs T-204 due/);
  assert.match(ctx, /- top blockers, open tasks others wait on \(1\): T-204 "Task T-204" blocks 1/);
  /* the pipeline: Analytics' snapshot; the archived project's task is not on it */
  const pipe = lineOf(ctx, /^PIPELINE/);
  assert.ok(pipe.includes('In Progress=' + run(p, 'boardTasks().filter(function(t){ return t.status==="progress"; }).length')));
  assert.match(pipe, /most open work waits in In Progress \(4\)/);
  /* Analytics, from its own formula over the loaded tasks (no server here) */
  assert.match(ctx, /^ANALYTICS \(from Analytics' own formula, worked out in the browser over the loaded tasks; old finished tasks are loaded without their versions/m);
  assert.match(ctx, /^TIME IN STATUS \(average days a task stays in a stage before it moves on, from Analytics' own formula, worked out in the browser over the loaded tasks; n = moves measured\)/m);
  const weeks = section(ctx, '- by week (').slice(1, 9);
  assert.equal(weeks.length, 8);
  weeks.forEach((l, i) => assert.ok(l.includes(': created=' + mt.created[i] + ' completed=' + mt.completed[i] + ' overdue=' + mt.overdue[i] + ' '), l));
  assert.equal(weeks[7].trim().slice(0, 10), run(p, 'aiDayKey((function(){ var d=new Date(TODAY); d.setDate(d.getDate()-((d.getDay()+6)%7)); return d; })())'), 'the last week is this one, from its Monday');
  assert.ok(ctx.includes('- totals: created=' + mt.totalCreated + ' completed=' + mt.totalCompleted + ' avg completion=' + mt.avgCompletion + ' days'));
  assert.ok(ctx.includes('- quality: revision rate=33% (Analytics\' card') && mt.liveRevRate === 33, 'one of the three tasks with versions was sent back');
  assert.ok(ctx.includes('approval rate=67%') && mt.approvalRate === 67, 'two of them end approved');
  assert.ok(ctx.includes('- revision rounds (versions sent back per task, over the 3 loaded tasks with versions): average=0.3, 1 tasks had at least one; most: T-101 "Task T-101" 1 rounds, up to V2'));
  /* per person: review outcomes as the report counts them (reportData), and on time */
  const rd = run(p, 'reportData().people.filter(function(x){ return x.id==="ana"; })[0]');
  assert.equal(rd.reviewOutcomes, 3);
  assert.ok(ctx.includes('  Ana Putri: review outcomes=3 approved=67% sent back=33% first pass=50% | on time='), 'Ana');
  for (const x of run(p, 'reportData().people')) {
    const r = run(p, 'aiReviewOutcomes(' + JSON.stringify(x.id) + ',exportTasks())');
    assert.deepEqual([r.outcomes, r.approvalRate, r.revisionRate, r.firstPassRate], [x.reviewOutcomes, x.approvalRate, x.revisionRate, x.firstPassRate], x.id + ': the report\'s own numbers');
  }
  /* time in status: Analytics' own, from the moves */
  assert.match(ctx, /TIME IN STATUS \(average days a task stays in a stage before it moves on[^)]*\): In Progress 2d \(n=1\), Internal Review 1d \(n=1\); slowest: In Progress/);
  /* the week's events, by kind and by person */
  assert.ok(ctx.includes('ACTIVITY IN THE LAST 7 DAYS (3 events among the 4 latest the page holds): moved=2, upload=1; most active: Ana Putri=2, Budi Santoso=1'));
});

test('a month of revisions is worked out as Analytics works out a week', () => {
  const p = page(); workspace(p);
  const an = run(p, 'demoAnalytics()'), starts = run(p, 'aiWeekStarts(8)');
  starts.forEach((s, i) => {
    const r = run(p, 'aiRevisionsIn(new Date(' + JSON.stringify(s + 'T00:00:00') + ').getTime(),new Date(' + JSON.stringify(s + 'T00:00:00') + ').getTime()+7*864e5)');
    assert.equal(r.rate, an.revisionRate[i], s);
  });
});

test('thousands of tasks: every new section whole, ahead of the open tasks, within the budget', () => {
  const p = page(); workspace(p, ctx => {
    for (let i = 0; i < 40; i++) ctx.PEOPLE['u' + i] = { id: 'u' + i, name: 'Person Number ' + i, role: 'Designer', perm: 'member', cap: 40, teams: [['brand', false]], active: true };
    for (let i = 0; i < 30; i++) ctx.PROJECTS.push({ id: 'q' + i, name: 'Campaign project ' + i, status: 'active', owner: 'ana', due: 40 + i, start: -300, team: [], milestones: [] });
    let n = 0;
    for (let mo = 0; mo < 12; mo++) for (let k = 0; k < 300; k++) { const who = 'u' + (k % 40), two = 'u' + ((k + 7) % 40);
      ctx.TASKS.push({ id: 'T-' + (5000 + n++), title: 'Finished deliverable with a long enough title ' + n, description: '', proj: 'q' + (k % 30), alsoIn: [], team: null, status: 'done', prio: 'medium', assignee: who, assignees: k % 5 ? [who] : [who, two], reviewer: null, reviewers: [], dependencies: [], hidden: false, assetCount: 1 + k % 4, labels: [], due: -mo * 30, span: 1, effort: 3, sort: n, tags: [], custom: {}, versions: [], files: [], comments: [], activity: [], createdAt: finishedIn(-mo - 1), completedAt: finishedIn(-mo), meta: {}, _slim: mo > 1 }); }
    for (let k = 0; k < 1000; k++) ctx.TASKS.push({ id: 'T-' + (9000 + k), title: 'Open task waiting in the queue number ' + k, description: '', proj: 'q' + (k % 30), alsoIn: [], team: null, status: 'todo', prio: 'medium', assignee: 'u' + (k % 40), assignees: ['u' + (k % 40)], reviewer: null, reviewers: [], dependencies: [], hidden: false, assetCount: 1, labels: [], due: k < 20 ? -1 - k : 10 + k % 50, span: 1, effort: 1, sort: k, tags: [], custom: {}, versions: [], files: [], comments: [], activity: [], createdAt: finishedIn(0), meta: {} });
  });
  const max = run(p, 'AI_CTX_MAX');
  for (const [lim, budget] of [[60, max], [18, max - 7000]]) {
    const ctx = run(p, 'aiContext(' + lim + ',' + budget + ')');
    assert.ok(run(p, 'TASKS.length') > 4600);
    assert.ok(ctx.length <= budget, 'within ' + budget + ': ' + ctx.length);
    const open = ctx.indexOf('\nOPEN TASKS (');
    assert.ok(open > 0, 'the open tasks are there');
    for (const h of ['HOME DASHBOARD', 'OVER CAPACITY', 'RISK:', 'PIPELINE', 'TIME IN STATUS', 'ANALYTICS (', 'ACTIVITY IN THE LAST 7 DAYS', 'OUTPUT RULE', 'ASSETS IN ALL', 'ASSETS BY PERSON', 'OUTPUT BY MONTH, whole workspace', 'PROJECT OUTPUT BY MONTH', 'MONTHLY OUTPUT BY PERSON x PROJECT']) {
      const at = ctx.indexOf(h); assert.ok(at > 0 && at < open, h + ' is ahead of the open tasks'); }
    /* whole: every person, every week, and the tables end on a full line or say what they left out */
    for (let i = 0; i < 40; i++) assert.ok(ctx.includes('- Person Number ' + i + ': produced='), 'person ' + i);
    assert.equal((section(ctx, '- by week (').slice(1, 9).filter(l => /^  \d{4}-\d\d-\d\d: created=/.test(l))).length, 8);
    const px = ctx.slice(ctx.indexOf('MONTHLY OUTPUT BY PERSON x PROJECT'), open).trim().split('\n');
    assert.match(px[px.length - 1], /^…\d+ more lines left out, for room: part of \d{4}-\d\d \w+ and the months before it\. The totals above still cover every month\.$/);
    assert.ok(px.slice(1, -1).every(l => /^\d{4}-\d\d \w+( \((current|last) month\))?(:|: nothing finished)$/.test(l) || /^- Person Number \d+: tasks=\d+ assets=\d+\*? \| /.test(l)), 'only whole lines');
    assert.ok(px.some(l => l.startsWith(monthKey(new Date()) + ' ')), 'the current month made it in');
    const proj = ctx.slice(ctx.indexOf('PROJECT OUTPUT BY MONTH'), ctx.indexOf('MONTHLY OUTPUT BY PERSON x PROJECT')).trim().split('\n');
    assert.ok(proj.slice(1).every(l => /^- (Campaign project \d+|Website relaunch|Brand book|\(no project\)): .* \| all time: tasks=\d+ assets=\d+\*?$/.test(l) || /^- …\d+ more projects with less output left out, for room$/.test(l)), 'projects: whole lines');
    /* the open tasks are still last, and some made it in */
    assert.ok(/\n- T-9\d{3} "Open task waiting/.test(ctx.slice(open)));
    assert.match(ctx, /…and \d+ more open tasks not listed here\.$/);
  }
});

test('the answers without a model give the snapshot\'s numbers, in English and in Indonesian', () => {
  const p = page(), m = workspace(p);
  const ask = q => run(p, 'aiLocalAnswer(' + JSON.stringify(q) + ')');
  const mon = (key, id) => run(p, 'aiMonthName(' + JSON.stringify(key) + ',' + !!id + ')');
  /* how many assets someone produced this month */
  let a = ask('How many assets did Ana produce this month?');
  assert.ok(a.startsWith('**Ana Putri** produced **6** asset(s) in ' + mon(m.cur) + ' (this month), from **2** finished task(s).'), a);
  assert.match(a, /- \*\*T-101\*\* Task T-101 — 4 of 4 assets/);
  assert.match(a, /Counted as the person pages, the reports and Smart Scoring count them/);
  a = ask('berapa asset ana bulan ini');
  assert.ok(a.startsWith('**Ana Putri** menghasilkan **6** aset pada ' + mon(m.cur, true) + ' (bulan ini), dari **2** task selesai.'), a);
  assert.match(a, /- \*\*T-102\*\* Task T-102 — 2 dari 6 aset/);
  /* by a month's name, in both languages; the slim tasks of two months ago are counted, not read as 0 */
  const prevName = mon(m.prev).split(' ')[0], m3En = mon(m.m3).split(' ')[0], m3Id = mon(m.m3, true).split(' ')[0];
  assert.ok(ask('how many assets did Budi produce in ' + prevName).startsWith('**Budi Santoso** produced **4*** asset(s) in ' + mon(m.prev) + ' (last month), from **2** finished task(s).'));
  assert.ok(ask('how many assets did Budi produce in ' + m3En).startsWith('**Budi Santoso** produced **4*** asset(s) in ' + mon(m.m3) + ', from **1** finished task(s).'));
  assert.ok(ask('berapa aset Budi pada ' + m3Id.toLowerCase()).startsWith('**Budi Santoso** menghasilkan **4*** aset pada ' + mon(m.m3, true) + ', dari **1** task selesai.'));
  assert.match(ask('how many assets did Budi produce in ' + m3En), /Partly estimated: shared among the assignees/);
  /* in a project, in a month */
  a = ask('How many tasks did Budi finish in Brand book last month?');
  assert.ok(a.startsWith('**Budi Santoso** finished **2** task(s) in **Brand book** in ' + mon(m.prev) + ' (last month), with **4*** asset(s) credited to them.'), a);
  a = ask('berapa task yang diselesaikan Budi di Brand book bulan lalu');
  assert.ok(a.startsWith('**Budi Santoso** menyelesaikan **2** task di **Brand book** pada ' + mon(m.prev, true) + ' (bulan lalu), dengan **4*** aset.'), a);
  /* all of someone's assets */
  assert.ok(ask('how many assets does Budi have').startsWith('**Budi Santoso** has produced **15*** asset(s) in total: 12* delivered from finished tasks, 4 this month, 4* last month. Finished tasks: 4.'));
  assert.ok(ask('berapa total aset Budi').startsWith('**Budi Santoso** telah menghasilkan **15*** aset secara total: 12* terkirim dari task selesai, 4 bulan ini, 4* bulan lalu. Task selesai: 4.'));
  assert.ok(ask('how many assets did I produce this month').startsWith('**Ana Putri** produced **6**'), 'I is the viewer');
  /* who produced the most */
  a = ask('Who produced the most assets this month?');
  assert.ok(a.startsWith('Most assets produced in ' + mon(m.cur) + ' (this month):\n\n1. **Ana Putri** — 6 assets, 2 finished tasks\n2. **Budi Santoso** — 4 assets, 1 finished task'), a);
  a = ask('siapa yang paling banyak menghasilkan aset bulan lalu');
  assert.ok(a.startsWith('Aset terbanyak yang dihasilkan pada ' + mon(m.prev, true) + ' (bulan lalu):\n\n1. **Budi Santoso** — 4* aset, 2 task selesai\n2. **Ana Putri** — 2* aset, 2 task selesai'), a);
  /* a project in a month, and the workspace */
  assert.ok(ask('how many assets were produced in Website relaunch this month').startsWith('**2** task(s) finished in **Website relaunch** in ' + mon(m.cur) + ' (this month), with **10** asset(s).'));
  assert.ok(ask('berapa aset bulan lalu').startsWith('**3** task selesai pada ' + mon(m.prev, true) + ' (bulan lalu), dengan **6** aset.'));
  /* plain "how many assets" keeps its workspace answer */
  assert.match(ask('how many assets'), /assets in total, \*\*\d+\*\* delivered from completed tasks/);
});

test('speed, quality, flow and risk without a model, with Analytics\' and Team workload\'s numbers', () => {
  const p = page(); workspace(p);
  const ask = q => run(p, 'aiLocalAnswer(' + JSON.stringify(q) + ')'), mt = run(p, 'metrics()');
  assert.ok(ask('what is our revision rate?').startsWith('Revision rate: **33%** of the tasks with versions had one sent back. Over the last 8 weeks, revision requests were **' + mt.revRate + '%** of the versions uploaded on average. Approval rate **67%**'));
  assert.ok(ask('berapa tingkat revisi?').startsWith('Tingkat revisi: **33%** task yang punya versi pernah dikembalikan untuk revisi.'));
  const thisMonth = run(p, 'var d=new Date(TODAY.getFullYear(),TODAY.getMonth(),1).getTime(); aiRevisionsIn(d,new Date(TODAY.getFullYear(),TODAY.getMonth()+1,1).getTime())');
  const rm = ask('revision rate this month');
  if (thisMonth.uploaded) assert.ok(rm.startsWith('Revision rate in ' + run(p, 'aiMonthName(aiMonthKey(TODAY))') + ': **' + Math.round(thisMonth.rate * 100) + '%**'), rm);
  else assert.match(rm, /^No versions were uploaded in /);
  assert.match(ask('tingkat revisi bulan ini'), /^(Tingkat revisi pada|Tidak ada versi yang diunggah pada) /);
  assert.match(ask('which task had the most revision rounds'), /^On average \*\*0\.3\*\* revision round\(s\) per task with versions \(3 tasks; 1 had at least one\)\.\n\n- \*\*T-101\*\* Task T-101 — 1 round\(s\), up to V2/);
  assert.ok(ask('what is the average completion time').startsWith('Average completion time: **' + mt.avgCompletion + ' days** from created to completed, over the last 8 weeks'));
  assert.ok(ask('rata-rata waktu selesai').startsWith('Rata-rata waktu selesai: **' + mt.avgCompletion + ' hari**'));
  assert.ok(ask('throughput this week').startsWith('This week (from ' + run(p, 'aiWeekStarts(8)[7]') + '): **' + mt.created[7] + '** created, **' + mt.completed[7] + '** completed.'));
  assert.ok(ask('berapa task selesai minggu ini').startsWith('Minggu ini (sejak '), 'a week goes to throughput, not to a month');
  assert.match(ask('where does work pile up?'), /^Most open work waits in \*\*In Progress\*\* \(4 tasks\); tasks stay longest in \*\*In Progress\*\* \(2 days on average\)\./);
  /* risk: one rule with the snapshot's RISK */
  const r = ask('which projects are at risk?');
  assert.match(r, /^\*\*2\*\* project\(s\) at risk:/);
  assert.match(r, /- \*\*Website relaunch\*\* \(high risk\) \d+%, in 10d — 4 open, 1 overdue, 1 blocked, \d+h left/);
  assert.match(r, /- \*\*Brand book\*\* \(medium risk, more work left than time\) 17%, in 3d — 1 open, 0 overdue, 0 blocked, 30h left/);
  assert.match(ask('project mana yang berisiko'), /^\*\*2\*\* project berisiko:[\s\S]*\*\*Brand book\*\* \(risiko sedang, sisa pekerjaan melebihi waktu\)/);
  /* who is overloaded: Team workload's hours, each person's share */
  const o = ask('who is overloaded?');
  assert.match(o, /^\*\*1\*\* over capacity; \*\*2\*\* have room\./);
  assert.match(o, /- \*\*Budi Santoso\*\* 165% \(33h \/ 20h, 2 open\)/);
  assert.match(ask('workload budi'), /^\*\*Budi Santoso\*\* — 165% utilisation \(33h \/ 20h, 2 open\)/);
});

test('months, in English and Indonesian', () => {
  const p = page(); workspace(p);
  run(p, 'TODAY=new Date(2026,10,25)');
  const mi = (q, skip) => run(p, 'aiMonthIn(' + JSON.stringify(q) + (skip ? ',' + JSON.stringify(skip) : '') + ')');
  const cases = { 'bulan ini': '2026-11', 'this month': '2026-11', 'last month': '2026-10', 'Bulan lalu?': '2026-10', 'bulan kemarin': '2026-10', 'sebulan yang lalu': '2026-10',
    'dua bulan lalu': '2026-09', '3 months ago': '2026-08', 'two months ago': '2026-09', 'a month ago': '2026-10', 'in October': '2026-10', 'Oktober 2025': '2025-10', 'okt': '2026-10',
    'desember': '2025-12', 'December 2026': '2026-12', 'in May': '2026-05', 'mei': '2026-05', 'may I ask how many': null, '2026-03': '2026-03', 'sept': '2026-09', 'agustus': '2026-08',
    'pebruari': '2026-02', 'Januari': '2026-01', 'juni': '2026-06', 'Jul 2025': '2025-07', 'nothing here': null, 'the constructor months ago': null };
  for (const [q, want] of Object.entries(cases)) assert.equal(mi(q), want, q);
  assert.equal(mi('how many assets does jan have', ['jan']), null, 'a person called Jan is no month');
  assert.equal(mi('april berapa aset bulan lalu', ['april']), '2026-10');
  assert.equal(run(p, 'aiMonthName("2026-08",true)'), 'Agustus 2026');
  assert.equal(run(p, 'aiMonthTag("2026-08")'), '2026-08 August');
});

test('someone who may not open Analytics is not told its figures', () => {
  const p = page(); workspace(p, ctx => { ctx.ME = 'budi'; });
  assert.equal(run(p, 'canI.viewAnalytics()'), false);
  const ctx = run(p, 'aiContext(60)');
  assert.ok(ctx.includes('ANALYTICS (throughput, completion time, revision and approval rates, time in status): not included'));
  assert.ok(!ctx.includes('- by week (') && !ctx.includes('TIME IN STATUS') && !ctx.includes('review outcomes='));
  /* what everyone sees stays: Home, output, the pipeline, risk */
  for (const h of ['HOME DASHBOARD', 'ASSETS BY PERSON', 'PIPELINE', 'RISK:']) assert.ok(ctx.includes(h), h);
  assert.match(run(p, 'aiLocalAnswer("berapa tingkat revisi?")'), /^Angka throughput, waktu selesai, dan revisi berasal dari Analytics, yang hanya untuk lead dan admin/);
  assert.match(run(p, 'aiLocalAnswer("what is the revision rate?")'), /^Throughput, completion time and revision figures come from Analytics, which is for leads and admins/);
});

test('the server\'s Analytics figures are used when the page holds them, and nothing is fetched for it', () => {
  const p = page(); workspace(p);
  let fetched = 0; p.fetch = () => { fetched++; return Promise.reject(new Error('no')); }; p.apiFetch = () => { fetched++; return Promise.reject(new Error('no')); };
  run(p, 'var srv=demoAnalytics(); srv.demo=false; srv.created=srv.created.map(function(){ return 7; }); AN=null; AN_SHOWN={key:"x",an:srv};');
  const ctx = run(p, 'aiContext(60)');
  assert.match(ctx, /^ANALYTICS \(from the server's figures, as the Analytics screen last drew them;/m);
  assert.ok(section(ctx, '- by week (').slice(1, 9).every(l => l.includes(': created=7 ')));
  assert.equal(run(p, 'AN'), null, 'AN is put back as it was');
  run(p, 'AN=srv;');
  assert.match(run(p, 'aiContext(60)'), /^ANALYTICS \(from the server's figures;/m);
  assert.equal(fetched, 0);
});

test('a section that cannot be worked out never stops the question', () => {
  const p = page(); workspace(p);
  run(p, 'metrics=function(){ throw new Error("no figures"); }; dashCounts=function(){ throw new Error("no home"); };');
  const ctx = run(p, 'aiContext(60)');
  assert.ok(ctx.includes('HOME DASHBOARD: could not be worked out this time (no home); say so if asked.'));
  assert.ok(ctx.includes('RISK: could not be worked out this time (no figures); say so if asked.'));
  assert.ok(ctx.includes('- Ana Putri: produced=13* delivered=13* '), 'the rest is all there');
  assert.ok(ctx.indexOf('ASSETS BY PERSON') < ctx.indexOf('\nOPEN TASKS ('));
});

test('the system prompt says where the numbers are', () => {
  const p = page(); workspace(p);
  const sys = run(p, 'aiSystem("berapa aset ana bulan ini")');
  assert.match(sys, /Take assets and finished tasks per person, month and project from ASSETS BY PERSON, OUTPUT BY MONTH, PROJECT OUTPUT BY MONTH and MONTHLY OUTPUT BY PERSON x PROJECT, counted as OUTPUT RULE says; never add them up yourself from the task lists/);
  assert.match(sys, /Trends, speed and quality are in ANALYTICS, TIME IN STATUS and PIPELINE; risk in RISK; Home's figures in HOME DASHBOARD/);
  assert.match(sys, /Reply in Indonesian/);
});

test('the server tells the model the same, for AI Intelligence only, and reads a question\'s language as the page does', () => {
  const srv = fs.readFileSync(path.join(root, 'server/server.js'), 'utf8'), ai = fs.readFileSync(path.join(root, 'src/ai.js'), 'utf8');
  /* the chat goes through the server (purpose "intelligence"), which writes its own system message */
  assert.match(srv, /\(b\.purpose === "intelligence" \? "Take assets and finished tasks per person, month and project from ASSETS BY PERSON, OUTPUT BY MONTH, PROJECT OUTPUT BY MONTH and MONTHLY OUTPUT BY PERSON x PROJECT, counted as OUTPUT RULE says; never add them up yourself from the task lists/);
  assert.match(srv, /"Trends, speed and quality are in ANALYTICS, TIME IN STATUS and PIPELINE; risk in RISK; Home's figures in HOME DASHBOARD; load in PEOPLE, TEAMS and OVER CAPACITY; the week's events in ACTIVITY\. " : ""\)/);
  const words = s => (s.match(/\/\\b\(apa\|yang[^)]*\)\\b\/i/) || [''])[0];
  assert.ok(words(ai).includes('|bulan|aset|revisi|tingkat|rata|waktu|'), 'Indonesian questions about months, assets and revisions');
  assert.equal(words(srv), words(ai), 'the same words on both sides, so the reply\'s language and the local answer\'s agree');
  const p = page();
  for (const q of ['tingkat revisi bulan ini', 'rata-rata waktu selesai', 'aset terbanyak bulan lalu']) assert.equal(run(p, 'aiQuestionLanguage(' + JSON.stringify(q) + ')'), 'id', q);
  for (const q of ['revision rate this month', 'who produced the most assets']) assert.equal(run(p, 'aiQuestionLanguage(' + JSON.stringify(q) + ')'), 'en', q);
});
