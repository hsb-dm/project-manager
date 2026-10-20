/* Smart Scoring's AI suggestions in process (Oct 2026), for tests/scoring-ai.test.js and tests/scoring-sanity.test.js:
   an in-memory database with the schema (and the columns server/db.js adds) and the demo seed, server/scoring.js and
   server/scoring-ai.js wired as server.js wires them, and the model injected — nothing reaches a provider. setup(o):
   o.model (prompt, info) → the reply's text (or {text, usage, provider, model}, or a thrown error); o.aiFetch (and
   o.aiConf) instead, to run the module's own call to the provider (retries included); o.feature false: COS_SCORING=0;
   o.debounceMs: "AI on brief revision"'s wait; o.fetchDoc (url, init) → a Response, standing in for Google when the AI
   reads a brief's documents (every address asked for is in k.fetched; without it nothing is fetched), o.docsLimits,
   o.docsFileFor (a stored file's name → its path). Not a test file itself (no .test.js). */
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { tx, uid, now } = require('../server/db');
const seed = require('../server/seed');
const sz = require('../server/serialize');
const { can } = require('../server/permissions');
const WS = 'ws_zencrevia';
const root = path.join(__dirname, '..');

class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
const forbid = (ok, what) => { if (!ok) throw new HttpError(403, "You don't have permission to " + what); };
const wait = ms => new Promise(r => setTimeout(r, ms));

/* what the stand-in model answers unless told otherwise: five feed posts */
const ANSWER = { kind: 'feed', deliverables: 5, factors: { complexity: 3, scope: 3, uncertainty: 2, dependencies: 1 }, hours: 6.5, storyPoints: 3, weightedPoints: 4.6, confidence: 0.8, explanation: 'Five feed posts from one key visual; the first takes longest.', assumptions: ['One round of revision'], missing: ['The copy is not written yet'], comparables: [], outcomes: [] };
const reply = over => JSON.stringify(Object.assign({}, ANSWER, over || {}));

function setup(o) {
  o = o || {};
  const db = new DatabaseSync(':memory:');
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec(fs.readFileSync(path.join(root, 'db', 'schema.sql'), 'utf8'));
  /* the columns server/db.js adds to older databases, as it adds them */
  for (const m of fs.readFileSync(path.join(root, 'server', 'db.js'), 'utf8').matchAll(/"(ALTER TABLE [^"]+)"/g)) { try { db.exec(m[1]); } catch (e) { /* already there */ } }
  seed.run(db);
  const routes = {}, logs = [], calls = [], bumps = [], announced = [];
  const route = (m, p, h) => { routes[m + ' ' + p] = h; };
  const deps = { route, HttpError, forbid, can, security: { log: (e, x) => logs.push([e, x]) }, uid, now, tx, act: () => {}, readRoles: () => [], featureOn: () => o.feature !== false, sz, bumpData: () => bumps.push(1), announce: id => announced.push(id) };
  const scoring = require('../server/scoring')(db, WS, deps);
  const k = { db, routes, logs, calls, bumps, announced, scoring, model: o.model || (() => reply()) };
  const aiDeps = Object.assign({}, deps, { scoring, debounceMs: o.debounceMs || 40 });
  /* the brief's documents: o.fetchDoc stands in for Google; without it any fetch is refused and noted in k.fetched */
  k.fetched = [];
  aiDeps.fetchDoc = async (url, init) => { k.fetched.push(url); if (o.fetchDoc) return o.fetchDoc(url, init); throw new Error('no network in tests'); };
  if (o.docsLimits) aiDeps.docsLimits = o.docsLimits;
  if (o.docsFileFor) aiDeps.docsFileFor = o.docsFileFor;
  if (o.aiFetch) { aiDeps.aiFetch = o.aiFetch; aiDeps.aiConf = o.aiConf || (() => ({ provider: 'openai', endpoint: 'https://api.openai.com/v1/chat/completions', key: 'k', model: 'gpt-test' })); }
  else aiDeps.callModel = async (prompt, info) => { calls.push({ prompt, info }); const r = await k.model(prompt, info); return typeof r === 'string' ? { text: r, usage: { in: 800, out: 140 }, provider: 'fake', model: 'fake-1' } : r; };
  k.ai = require('../server/scoring-ai')(db, WS, aiDeps);
  k.user = (id, extra) => {
    const m = db.prepare('SELECT role_id, is_stakeholder FROM workspace_members WHERE workspace_id=? AND user_id=?').get(WS, id);
    const caps = {}; JSON.parse(db.prepare('SELECT permissions FROM roles WHERE id=?').get(m.role_id).permissions).forEach(c => { caps[c] = true; }); (extra || []).forEach(c => { caps[c] = true; });
    return { id, role: m.role_id, caps, stakeholder: !!m.is_stakeholder, teams: db.prepare('SELECT team_id FROM team_memberships WHERE user_id=?').all(id).map(r => r.team_id), ledTeams: db.prepare('SELECT id FROM teams WHERE workspace_id=? AND team_lead_id=?').all(WS, id).map(r => r.id) };
  };
  k.admin = k.user('admin');
  k.call = async (method, p, u, params, body) => { const h = routes[method + ' ' + p]; if (!h) throw new Error('no route ' + method + ' ' + p); return h(u, params || {}, {}, body === undefined ? {} : body, { ip: 'test' }); };
  k.settings = () => scoring.settings();
  k.set = async fn => { const cur = scoring.settings(), next = JSON.parse(JSON.stringify(cur)); fn(next); return k.call('PUT', '/api/scoring/settings', k.admin, {}, { settings: next, configVersion: cur.configVersion }); };
  /* Smart Scoring on, with Story Points (AI assisted) and Weighted Points (hybrid) beside Effort Hours (hybrid) */
  k.on = fn => k.set(s => { s.enabled = true; s.modules.story.on = true; s.modules.story.mode = 'ai_assisted'; s.modules.weighted.on = true; s.modules.weighted.mode = 'hybrid'; if (fn) fn(s); });
  k.processing = p => db.prepare('UPDATE workspaces SET ai_settings=? WHERE id=?').run(JSON.stringify({ processing: Object.assign({ externalEnabled: true, workspaceContextEnabled: true }, p || {}) }), WS);
  let seq = 9000;
  k.task = (fields, by) => { const id = 'T-' + (++seq); sz.writeTask(db, WS, Object.assign({ id, title: 'Feed post Ramadan', description: '', status: 'todo', prio: 'medium', team: 'design', assignee: 'sarah', assignees: ['sarah'], effort: 0, assetCount: 5, labels: [], tags: [], brief: null, custom: {}, versions: [], files: [], comments: [], activity: [], meta: {}, createdBy: by || 'admin', createdAt: now() }, fields || {}), by || 'admin'); return id; };
  /* a save of the task, as PUT /api/tasks/:id makes it, with the hooks after it */
  k.edit = (id, fields, u) => { const cur = sz.readTask(db, id); sz.writeTask(db, WS, Object.assign({}, cur, fields), (u || k.admin).id); return scoring.afterTaskWrite(id, u || k.admin, { via: 'task', prevStatus: cur.status }); };
  k.ask = (id, u, body) => k.call('POST', '/api/tasks/:id/scoring/ai', u || k.admin, { id }, Object.assign({ module: 'hours' }, body || {}));
  k.view = (id, u) => k.call('GET', '/api/tasks/:id/scoring', u || k.admin, { id });
  k.put = (id, m, body, u) => k.call('PUT', '/api/tasks/:id/scoring/:module', u || k.admin, { id, module: m }, body);
  k.calc = (id, body, u) => k.call('POST', '/api/tasks/:id/scoring/calculate', u || k.admin, { id }, body);
  k.approve = (id, m, body, u) => k.call('POST', '/api/tasks/:id/scoring/:module/approve', u || k.admin, { id, module: m }, body || {});
  k.runs = id => db.prepare('SELECT * FROM scoring_ai_runs WHERE task_id=? ORDER BY created_at, rowid').all(id);
  k.row = (id, m) => db.prepare('SELECT * FROM task_scoring WHERE task_id=? AND module=?').get(id, m);
  k.processing();
  return k;
}
const refused = async (p, status, re) => { await assert.rejects(p, e => { assert.equal(e.status, status, e.message); if (re) assert.match(e.message, re); return true; }); };

module.exports = { setup, reply, ANSWER, refused, wait, HttpError, WS, root };
