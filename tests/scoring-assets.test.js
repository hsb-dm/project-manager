/* Smart Scoring — points for the assets people produce (Oct 2026, server/scoring-assets.js, docs/SMART-SCORING.md §11),
   on the real server. GET /api/scoring/assets credits each person with the assets of the tasks completed in the period
   exactly as the reports do (src/export.js taskAssetCredit / personAssetCredit — the same numbers, checked here against
   that code run on the same tasks), at the kind of work's points per asset; says how much a lead has validated, how
   much is not validated yet and how much changed since; by kind and by week. Open and declined work does not count.
   Whoever holds scoring_view_analytics sees everyone, anyone else only themselves; switched off it says what is off. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const E = require('../shared/scoring-engine');
const root = path.join(__dirname, '..');

function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-asset-points-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at, env) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Assets!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'asset-points-secret-key-longer-than-32-chars!!', COS_BACKUP_KEY: 'asset-points-backup-key-longer-than-32-chars!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }, env || {}) });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 15000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const t = await r.text(); assert.ok(r.ok, m + ' ' + p + ': ' + r.status + ' ' + t); return JSON.parse(t); };
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Assets!Admin234567');
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const as = async id => { const r = await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); assert.ok(r.ok, await r.text()); return login(boot.people[id].email, 'Member!Pass2345'); };
  const s = { req, json, admin, as, boot, stop }; at.servers.push(s); return s;
}
/* the settings, changed and saved as the Settings tab does */
async function setScoring(s, change) {
  const cur = (await s.json('GET', '/api/scoring/settings', undefined, s.admin)).settings, next = JSON.parse(JSON.stringify(cur));
  change(next);
  return (await s.json('PUT', '/api/scoring/settings', { settings: next, configVersion: cur.configVersion }, s.admin)).settings;
}
const assets = (s, who, query) => s.req('GET', '/api/scoring/assets' + (query ? '?' + new URLSearchParams(query) : ''), undefined, who);

/* the reports' own crediting, run from src/export.js as the page has it */
function reportsCredit() {
  const src = fs.readFileSync(path.join(root, 'src', 'export.js'), 'utf8'), core = fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8');
  const fn = (text, name) => {
    const at = text.indexOf('function ' + name + '('); assert.ok(at >= 0, name);
    let i = text.indexOf('{', at), depth = 0;
    for (; i < text.length; i++) { if (text[i] === '{') depth++; else if (text[i] === '}' && --depth === 0) break; }
    return text.slice(at, i + 1);
  };
  const c = { ASSETS: [] }; vm.createContext(c);
  vm.runInContext([fn(core, 'assigneesOf'), fn(src, 'assetCreatorOf'), fn(src, 'taskAssetSplit'), fn(src, 'taskAssetCredit'), fn(src, 'personAssetCredit')].join('\n'), c);
  return c;
}

test('switched off — on the server, for the workspace, or the module — it answers 409 and says what is off', { timeout: 90000 }, async t => {
  const at = place(t);
  const off = await start(at, { COS_SCORING: '0' });
  let r = await assets(off, off.admin);
  assert.equal(r.status, 409); assert.match((await r.json()).error, /turned off on this server/);
  await off.stop();
  const s = await start(at);
  assert.equal((await assets(s)).status, 401, 'signed in only');
  r = await assets(s, s.admin);
  assert.equal(r.status, 409); assert.match((await r.json()).error, /switched off for this workspace/);
  await setScoring(s, x => { x.enabled = true; });
  r = await assets(s, s.admin);
  assert.equal(r.status, 409); assert.match((await r.json()).error, /assets produced are switched off/, 'the module is off by default');
  const on = await setScoring(s, x => { x.modules.assets.on = true; });
  assert.equal(on.assets.on, true, 'assets.on mirrors the module switch');
  assert.equal((await assets(s, s.admin)).status, 200);
  for (const q of [{ from: '2026-13-01' }, { to: 'yesterday' }, { from: '2026-10-10', to: '2026-10-01' }, { team: 'bad id!' }]) assert.equal((await assets(s, s.admin, q)).status, 400, JSON.stringify(q));
});

test('each person\'s assets and points: the reports\' crediting, the kind\'s points, validated or not, by kind and by week, in a period', { timeout: 180000 }, async t => {
  const s = await start(place(t));
  await setScoring(s, x => { x.enabled = true; x.modules.assets.on = true; });
  const people = s.boot.people, ws = s.boot.ws;
  const adminId = s.boot.me.id;
  const plain = id => people[id] && !people[id].stakeholder && people[id].perm === 'member' && id !== adminId;
  const [X, Y, Z] = Object.keys(people).filter(plain);
  assert.ok(X && Y && Z, 'three members in the demo');
  const open = ws.workflow[1].id, closed = ws.workflow.filter(w => w.kind === 'closed' && w.id !== 'declined')[0].id;
  assert.ok(closed && ws.workflow.some(w => w.id === 'declined'), 'a closed stage and Declined');
  const proj = (await s.json('POST', '/api/projects', { name: 'Asset points', owner: adminId, status: 'active' }, s.admin)).find(p => p.name === 'Asset points').id;
  const team = (s.boot.teams || []).find(x => !x.archived).id;
  const make = async (b, who) => (await s.json('POST', '/api/tasks', Object.assign({ prio: 'medium', proj, reviewer: adminId, reviewers: [adminId] }, b), who || s.admin));
  const put = async (id, who, fn) => { const d = await s.json('GET', '/api/tasks/' + id, undefined, who); fn(d); return s.json('PUT', '/api/tasks/' + id, d, who); };

  /* a logo concept: each person's count typed — X 2, Y 1 */
  const logo = await make({ title: 'Logo concept', status: closed, team, assignee: X, assignees: [X, Y], meta: { assetSplit: { [X]: 2, [Y]: 1 } } });
  /* twelve resizes, X alone: nothing typed per person, so the assignee's */
  const resize = await make({ title: 'Resize banner 12 sizes', status: closed, assignee: X, assignees: [X], assetCount: 12 });
  /* three feed posts between X and Y, nothing typed, nothing uploaded: shared, an estimate */
  const feed = await make({ title: 'Feed post weekly', status: closed, assignee: X, assignees: [X, Y], assetCount: 3 });
  /* a carousel of four: X uploads two versions, Y one — credited by uploads */
  const car = await make({ title: 'Carousel promo', status: open, assignee: X, assignees: [X, Y], assetCount: 4 });
  const x = await s.as(X), y = await s.as(Y), z = await s.as(Z);
  await put(car.id, x, d => { d.versions = [{ n: 1, note: 'first' }, { n: 2, note: 'second' }]; });
  await put(car.id, y, d => { d.versions = d.versions.concat([{ n: 3, note: 'third' }]); });
  await put(car.id, s.admin, d => { d.status = closed; });
  /* not counted: still open, declined, finished in January */
  await make({ title: 'Poster seminar', status: open, assignee: Y, assignees: [Y], assetCount: 5 });
  await make({ title: 'IG story set', status: 'declined', assignee: X, assignees: [X], assetCount: 2 });
  const jan = await make({ title: 'Email newsletter', status: closed, assignee: Y, assignees: [Y], assetCount: 2, completedAt: '2026-01-07T10:00:00.000Z' });
  assert.equal((await s.json('GET', '/api/tasks/' + jan.id, undefined, s.admin)).completedAt.slice(0, 10), '2026-01-07');

  /* the lead validates the logo's counts; then Y's count changes: Y's is changed since, X's still validated */
  await put(logo.id, s.admin, d => { d.meta.assetSplitOk = { split: d.meta.assetSplit }; });
  const after = await put(logo.id, s.admin, d => { d.meta.assetSplit[Y] = 2; });
  assert.deepEqual([after.assetCount, after.meta.assetSplitOk.split[Y]], [4, 1]);

  /* this week's Monday, and a period of the last 30 days (January is not in it) */
  const day = new Date(new Date().toISOString().slice(0, 10) + 'T00:00:00Z'); day.setUTCDate(day.getUTCDate() - (day.getUTCDay() + 6) % 7);
  const week = day.toISOString().slice(0, 10), from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
  const r = await s.json('GET', '/api/scoring/assets?' + new URLSearchParams({ project: proj, from }), undefined, s.admin);
  assert.equal(r.scope, 'everyone'); assert.equal(r.rule, 'completed_in_period'); assert.ok(!r.stages.includes('declined'));
  assert.deepEqual(r.people.map(p => p.userId), [X, Y].sort((a, b) => people[a].name.localeCompare(people[b].name)), 'the people credited, in name order');
  const px = r.people.find(p => p.userId === X), py = r.people.find(p => p.userId === Y);
  /* X: logo 2 × 5, resize 12 × 0.25, feed 1.5 × 1, carousel 8/3 × 2 */
  assert.deepEqual([px.assets, px.assetsExact, px.points, px.tasks], [18, 18.17, 19.83, 4]);
  assert.deepEqual(px.validated, { assets: 2, points: 10 }); assert.deepEqual(px.changed, { assets: 0, points: 0 }); assert.deepEqual(px.notValidated, { assets: 16.17, points: 9.83 });
  assert.deepEqual(px.byKind, { carousel: { assets: 2.67, points: 5.33 }, feed: { assets: 1.5, points: 1.5 }, logo: { assets: 2, points: 10 }, resize: { assets: 12, points: 3 } });
  assert.deepEqual(px.byWeek, { [week]: { assets: 18.17, points: 19.83 } });
  assert.deepEqual([px.attributed, px.typed, px.uploads], [true, true, true]);
  /* Y: logo 2 × 5 (changed since the lead validated 1), feed 1.5, carousel 4/3 × 2 */
  assert.deepEqual([py.assets, py.points, py.tasks], [5, 14.17, 3]);
  assert.deepEqual(py.changed, { assets: 2, points: 10 }); assert.deepEqual(py.validated, { assets: 0, points: 0 });
  assert.deepEqual(r.total, { assets: 23, assetsExact: 23, points: 34, tasks: 4, people: 2 });
  /* January: only the newsletter (2 × 1.5) */
  const j = await s.json('GET', '/api/scoring/assets?' + new URLSearchParams({ from: '2026-01-01', to: '2026-01-31', project: proj }), undefined, s.admin);
  assert.deepEqual(j.people.map(p => [p.userId, p.assets, p.points, Object.keys(p.byWeek)]), [[Y, 2, 3, ['2026-01-05']]]);
  /* the team's tasks: the logo only */
  const tm = await s.json('GET', '/api/scoring/assets?' + new URLSearchParams({ team, project: proj }), undefined, s.admin);
  assert.deepEqual(tm.people.map(p => [p.userId, p.points]).sort(), [[X, 10], [Y, 10]].sort());
  /* only validated counts counting: X keeps the validated logo, Y keeps what was validated (1), the rest waits */
  await setScoring(s, v => { v.assets.countUnvalidated = false; v.assets.perKind.logo = 6; });
  const strict = await s.json('GET', '/api/scoring/assets?' + new URLSearchParams({ project: proj, from }), undefined, s.admin);
  assert.deepEqual(strict.people.map(p => [p.userId, p.points]).sort(), [[X, 12], [Y, 6]].sort(), 'the admin\'s table and the switch are used');
  assert.equal(strict.countUnvalidated, false); assert.equal(strict.perKind.logo, 6);
  await setScoring(s, v => { v.assets.countUnvalidated = true; v.assets.perKind.logo = 5; });

  /* who sees what: a member only themselves; asking for someone else is refused; a holder of the analytics permission everyone */
  const mine = await s.json('GET', '/api/scoring/assets?' + new URLSearchParams({ project: proj }), undefined, x);
  assert.equal(mine.scope, 'own'); assert.deepEqual(mine.people.map(p => p.userId), [X]);
  assert.equal(mine.people[0].points, 19.83);
  assert.equal((await assets(s, x, { person: Y })).status, 403);
  const zero = await s.json('GET', '/api/scoring/assets?' + new URLSearchParams({ project: proj }), undefined, z);
  assert.deepEqual(zero.people.map(p => [p.userId, p.assets, p.points]), [[Z, 0, 0]], 'someone with nothing credited sees their own row, at 0');
  assert.ok((await s.req('PUT', '/api/members/' + Z + '/cap-grants', { caps: ['scoring_view_analytics'] }, s.admin)).ok);
  const z2 = await s.as(Z);
  const seen = await s.json('GET', '/api/scoring/assets?' + new URLSearchParams({ project: proj, person: Y }), undefined, z2);
  assert.equal(seen.scope, 'everyone'); assert.deepEqual(seen.people.map(p => [p.userId, p.points]), [[Y, 17.17]], 'Y with the January newsletter');

  /* the same numbers as the reports, for every person and every completed task of the workspace (the demo's too) */
  const C = reportsCredit();
  const ids = (await s.json('GET', '/api/bootstrap', undefined, s.admin)).tasks.map(t => t.id);
  const docs = []; for (const id of ids) docs.push(await s.json('GET', '/api/tasks/' + id, undefined, s.admin));
  const counted = docs.filter(d => d.completedAt && ws.workflow.some(w => w.id === d.status && w.kind === 'closed') && d.status !== 'declined' && d.assetCount > 0);
  assert.ok(counted.length >= 6, 'the demo has finished work with assets');
  const everyone = await s.json('GET', '/api/scoring/assets', undefined, s.admin);
  assert.equal(everyone.total.tasks, counted.length, 'every completed task with assets, and nothing else');
  const credited = new Set(); counted.forEach(d => Object.keys(C.taskAssetCredit(d).by).forEach(id => credited.add(id)));
  assert.deepEqual(everyone.people.map(p => p.userId).sort(), [...credited].sort(), 'everyone credited, nobody else');
  for (const p of everyone.people) {
    const rep = C.personAssetCredit(p.userId, counted);
    assert.equal(p.assets, rep.count, p.userId + ': the reports\' count');
    assert.equal(p.assetsExact, E.round2(rep.raw), p.userId + ': the reports\' exact share');
    assert.deepEqual([p.attributed, p.typed, p.uploads], [rep.attributed, rep.typed, rep.uploads], p.userId + ': where it came from');
    /* the points: each task's credited count at its kind's points */
    const pts = counted.reduce((n, d) => { const c = C.taskAssetCredit(d).by[p.userId]; return c ? n + E.round2(c * E.assetPoints(E.ENGINE_DEFAULTS.assets, { kind: E.kindOf(d.title), split: { a: c } }).pointsPerAsset) : n; }, 0);
    assert.equal(p.points, E.round2(pts), p.userId + ': points');
  }
});
