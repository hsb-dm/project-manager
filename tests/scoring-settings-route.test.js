/* Smart Scoring's settings on the real server (Oct 2026, server/scoring.js, docs/SMART-SCORING.md). Everyone signed in
   reads them; only whoever holds scoring_manage_workspace changes them — Admin, a role given it, or one person given it
   on top of their role — and changing scores (scoring_edit_task) does not give the settings. A save is made on a
   version: an older one answers 409. What is saved is normalized, the version goes up, and the change is audited with
   the old and new settings and what changed; the workspace's own save (PUT /api/workspace) never touches them. Team Lead
   and Creative Lead get the approval and analytics permissions in one click, for whoever manages roles. With
   COS_SCORING=0 the feature is off on the server: its routes answer 409 and the page is told. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const { DatabaseSync } = require('node:sqlite');
const root = path.join(__dirname, '..');

function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-scoring-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at, env) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Score!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'score-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'score-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_SCORING: '' }, env || {}) });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Score!Admin234567');
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const as = async id => { const r = await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); assert.ok(r.ok, await r.text()); return login(boot.people[id].email, 'Member!Pass2345'); };
  const s = { req, admin, as, boot, stop, dir: at.dir }; at.servers.push(s); return s;
}
const json = async r => { const t = await r.text(); try { return JSON.parse(t); } catch (e) { return { raw: t }; } };

test('who reads and who changes the settings; versions, 409, normalizing, the audit, and the workspace save leaving them alone', { timeout: 120000 }, async t => {
  const s = await start(place(t));
  const ids = Object.keys(s.boot.people), by = perm => ids.filter(id => s.boot.people[id].perm === perm && !s.boot.people[id].stakeholder);
  const [sarah, maya, rizky] = by('member'), andi = by('team_lead')[0], zein = by('creative_lead')[0], nadia = ids.find(id => s.boot.people[id].stakeholder);
  assert.ok(sarah && maya && rizky && andi && zein && nadia, 'the demo has members, a team lead, a creative lead and a stakeholder');
  const get = async who => { const r = await s.req('GET', '/api/scoring/settings', undefined, who); assert.equal(r.status, 200, await r.clone().text()); return r.json(); };
  const put = (who, settings, configVersion, extra) => s.req('PUT', '/api/scoring/settings', Object.assign({ settings, configVersion }, extra || {}), who);

  /* off on a new workspace, and the page is told the server has the feature */
  assert.equal(s.boot.features.scoring, true);
  assert.equal(s.boot.ws.scoring.enabled, false); assert.equal(s.boot.ws.scoring.modules.hours.on, true); assert.equal(s.boot.ws.scoring.configVersion, 1);
  assert.equal((await s.req('GET', '/api/scoring/settings')).status, 401, 'signed in only');
  let a = await get(s.admin);
  assert.deepEqual(a.settings, s.boot.ws.scoring); assert.deepEqual(a.audit, []);

  /* the permission matrix */
  const m = await s.as(sarah), st = await s.as(nadia);
  assert.equal((await get(m)).settings.enabled, false, 'every member reads them');
  assert.equal((await put(m, Object.assign({}, a.settings, { enabled: true }), 1)).status, 403, 'a member does not change them');
  assert.equal((await put(st, Object.assign({}, a.settings, { enabled: true }), 1)).status, 403, 'nor a stakeholder');

  /* the admin turns it on with Story Points */
  let r = await put(s.admin, Object.assign({}, a.settings, { enabled: true, modules: Object.assign({}, a.settings.modules, { story: { on: true, mode: 'hybrid' } }) }), 1, { reason: 'pilot' });
  assert.equal(r.status, 200, await r.clone().text());
  let d = await r.json();
  assert.equal(d.settings.enabled, true); assert.equal(d.settings.modules.story.on, true); assert.equal(d.settings.configVersion, 2); assert.equal(d.settings.updatedBy, 'admin');
  assert.equal(d.audit.length, 1); assert.equal(d.audit[0].reason, 'pilot');
  assert.deepEqual(d.audit[0].diff.map(c => c.path), ['enabled', 'modules.story.mode', 'modules.story.on']);
  assert.deepEqual((await (await s.req('GET', '/api/bootstrap', undefined, m)).json()).ws.scoring, d.settings, 'everyone\'s workspace carries them');

  /* a save made on the old version is refused; a version that is not a number is a bad request */
  r = await put(s.admin, Object.assign({}, d.settings, { enabled: false }), 1);
  assert.equal(r.status, 409); assert.match((await r.json()).error, /Someone else changed the Smart Scoring settings/);
  assert.equal((await put(s.admin, d.settings)).status, 400, 'configVersion is required');
  assert.equal((await get(s.admin)).settings.enabled, true, 'the refused save changed nothing');
  /* a save that changes nothing is not a change */
  d = await (await put(s.admin, d.settings, 2)).json();
  assert.equal(d.unchanged, true); assert.equal(d.settings.configVersion, 2); assert.equal(d.audit.length, 1);

  /* what is saved is normalized; the server's own fields are the server's */
  const weird = JSON.parse(JSON.stringify(d.settings));
  Object.assign(weird, { foo: 'bar', configVersion: 77, updatedBy: 'sarah', primaryCapacity: 'money' });
  weird.weighted.weights = { complexity: 50, scope: 50, uncertainty: 0, dependencies: 0 }; weird.weighted.mappingVersion = 40;
  weird.hours.bounds.max = 99999; weird.bonus.on = true; weird.bonus.enabledAt = '2020-01-01T00:00:00.000Z'; weird.story.scale = [1, 100];
  d = await (await put(s.admin, weird, 2)).json();
  assert.equal(d.settings.configVersion, 3); assert.equal(d.settings.updatedBy, 'admin'); assert.equal('foo' in d.settings, false);
  assert.equal(d.settings.primaryCapacity, 'hours'); assert.deepEqual(d.settings.weighted.weights, { complexity: 0.5, scope: 0.5, uncertainty: 0, dependencies: 0 });
  assert.equal(d.settings.weighted.mappingVersion, 2, 'new weights: a new mapping version, counted by the server');
  assert.equal(d.settings.hours.bounds.max, 400); assert.deepEqual(d.settings.story.scale, [1, 2, 3, 5, 8, 13]);
  assert.equal(d.settings.bonus.on, false, 'the bonus stays off until the awards ship'); assert.equal(d.settings.bonus.enabledAt, null);

  /* the audit row: the whole old and new settings, what changed, who and why */
  { const db = new DatabaseSync(path.join(s.dir, 'creative-os.db'), { readOnly: true });
    const rows = db.prepare("SELECT * FROM scoring_audit WHERE module='settings' ORDER BY created_at, rowid").all(); db.close();
    assert.equal(rows.length, 2);
    assert.equal(rows[0].action, 'settings_changed'); assert.equal(rows[0].actor_id, 'admin'); assert.equal(rows[0].reason, 'pilot'); assert.equal(rows[0].task_id, null);
    assert.equal(JSON.parse(rows[0].old_value).enabled, false); assert.equal(JSON.parse(rows[0].new_value).enabled, true);
    assert.equal(JSON.parse(rows[0].new_value).configVersion, 2); assert.equal(JSON.parse(rows[0].meta).configVersion, 2);
    assert.ok(JSON.parse(rows[1].meta).diff.some(c => c.path === 'weighted.weights.complexity' && c.from === 0.4 && c.to === 0.5)); }
  const log = fs.readFileSync(path.join(s.dir, 'security.log'), 'utf8').split('\n').filter(Boolean).map(l => JSON.parse(l)).filter(e => e.event === 'scoring_settings_changed');
  assert.equal(log.length, 2); assert.equal(log[1].details.configVersion, 3);
  assert.ok((await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).activity.some(x => x.a && x.a.what === 'Smart Scoring settings'), 'in the workspace history');

  /* a role given the permission changes them; a role that may change scores does not */
  const roles = (await (await s.req('GET', '/api/roles', undefined, s.admin)).json()).roles, role = id => roles.find(x => x.id === id);
  assert.ok((await s.req('PUT', '/api/roles/team_lead', Object.assign({}, role('team_lead'), { permissions: role('team_lead').permissions.concat(['scoring_manage_workspace']) }), s.admin)).ok);
  assert.ok((await s.req('PUT', '/api/roles/creative_lead', Object.assign({}, role('creative_lead'), { permissions: role('creative_lead').permissions.concat(['scoring_edit_task']) }), s.admin)).ok);
  const tl = await s.as(andi), cl = await s.as(zein);
  r = await put(tl, Object.assign({}, d.settings, { primaryCapacity: 'story_points' }), 3);
  assert.equal(r.status, 200, await r.clone().text()); d = await r.json(); assert.equal(d.settings.updatedBy, andi);
  assert.equal((await put(cl, Object.assign({}, d.settings, { enabled: false }), 4)).status, 403, 'changing scores does not give the settings');
  assert.deepEqual((await get(cl)).audit, [], 'nor their history');
  /* one person given it on top of their role changes them; one given the analytics permission sees them only */
  assert.ok((await s.req('PUT', '/api/members/' + maya + '/cap-grants', { caps: ['scoring_manage_workspace'] }, s.admin)).ok);
  assert.ok((await s.req('PUT', '/api/members/' + rizky + '/cap-grants', { caps: ['scoring_view_analytics'] }, s.admin)).ok);
  const mg = await s.as(maya), ra = await s.as(rizky);
  r = await put(mg, Object.assign({}, d.settings, { primaryCapacity: 'hours' }), 4);
  assert.equal(r.status, 200, await r.clone().text()); d = await r.json(); assert.equal(d.settings.configVersion, 5);
  assert.equal((await get(ra)).audit.length, 4, 'the analytics permission sees the history');
  assert.equal((await put(ra, Object.assign({}, d.settings, { enabled: false }), 5)).status, 403, 'but does not change them');
  assert.deepEqual((await get(m)).audit, [], 'a member does not see the history');

  /* the workspace's own save sends the whole workspace back, scoring included: it changes nothing of it */
  const ws = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws;
  ws.scoring = { enabled: false, configVersion: 99, modules: {} }; ws.tagline = 'Saved without touching scoring';
  r = await s.req('PUT', '/api/workspace', ws, s.admin); assert.equal(r.status, 200, await r.clone().text());
  assert.deepEqual((await r.json()).scoring, d.settings);
  const after = await get(s.admin);
  assert.deepEqual(after.settings, d.settings); assert.equal(after.settings.enabled, true); assert.equal(after.audit.length, 4);
});

test('Team Lead and Creative Lead get the approval and analytics permissions in one click, once, for whoever manages roles', { timeout: 90000 }, async t => {
  const s = await start(place(t));
  const ids = Object.keys(s.boot.people), sarah = ids.find(id => s.boot.people[id].perm === 'member' && !s.boot.people[id].stakeholder), andi = ids.find(id => s.boot.people[id].perm === 'team_lead');
  const LEAD = ['scoring_approve_estimate', 'scoring_approve_completion', 'scoring_view_analytics'];
  const m = await s.as(sarah);
  assert.equal((await s.req('POST', '/api/scoring/delegate-leads', {}, m)).status, 403, 'a member does not manage roles');
  const before = (await (await s.req('GET', '/api/roles', undefined, s.admin)).json()).roles;
  let r = await s.req('POST', '/api/scoring/delegate-leads', {}, s.admin); assert.equal(r.status, 200, await r.clone().text());
  let d = await r.json();
  assert.deepEqual(d.added, { team_lead: LEAD, creative_lead: LEAD });
  const roles = (await (await s.req('GET', '/api/roles', undefined, s.admin)).json()).roles;
  for (const id of ['team_lead', 'creative_lead']) {
    const was = before.find(x => x.id === id).permissions, now = roles.find(x => x.id === id).permissions;
    assert.deepEqual(now, was.concat(LEAD), id + ' keeps everything it had and gains the three');
  }
  for (const id of ['member', 'viewer']) assert.deepEqual(roles.find(x => x.id === id).permissions, before.find(x => x.id === id).permissions, id + ' is left alone');
  assert.equal(d.audit[0].action, 'leads_delegated'); assert.deepEqual(d.audit[0].added, { team_lead: LEAD, creative_lead: LEAD });
  /* again: nothing to add, nothing audited */
  d = await (await s.req('POST', '/api/scoring/delegate-leads', {}, s.admin)).json();
  assert.deepEqual(d.added, {}); assert.equal(d.audit.length, 1);
  /* a team lead now sees the settings' history (scoring_view_analytics) */
  const tl = await s.as(andi);
  assert.equal((await (await s.req('GET', '/api/scoring/settings', undefined, tl)).json()).audit.length, 1);
  assert.ok(fs.readFileSync(path.join(s.dir, 'security.log'), 'utf8').includes('"scoring_leads_delegated"'));
});

test('COS_SCORING=0 turns the feature off on the server: the page is told, the routes answer 409, nothing is erased', { timeout: 90000 }, async t => {
  const at = place(t);
  let s = await start(at);
  const d = await (await s.req('PUT', '/api/scoring/settings', { settings: Object.assign({}, s.boot.ws.scoring, { enabled: true }), configVersion: 1 }, s.admin)).json();
  assert.equal(d.settings.enabled, true);
  await s.stop();
  s = await start(at, { COS_SCORING: '0' });
  assert.equal(s.boot.features.scoring, false);
  assert.equal(s.boot.ws.scoring.enabled, true, 'the settings are kept');
  for (const [m, p, b] of [['GET', '/api/scoring/settings'], ['PUT', '/api/scoring/settings', { settings: { enabled: false }, configVersion: 2 }], ['POST', '/api/scoring/delegate-leads', {}]]) {
    const r = await s.req(m, p, b, s.admin);
    assert.equal(r.status, 409, m + ' ' + p); assert.equal((await json(r)).error, 'Smart Scoring is turned off on this server');
  }
  await s.stop();
  s = await start(at);
  assert.equal(s.boot.features.scoring, true);
  assert.equal((await (await s.req('GET', '/api/scoring/settings', undefined, s.admin)).json()).settings.enabled, true, 'back on: as it was');
});
