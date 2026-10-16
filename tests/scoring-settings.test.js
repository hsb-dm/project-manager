/* Smart Scoring's settings (Oct 2026, shared/scoring-settings.js, docs/SMART-SCORING.md): one shape for the server, the
   page and the tests. Off by default, Effort Hours on inside it; the hours templates are the estimator's kinds of work
   with its numbers; whatever arrives is held to the shape — unknown keys dropped, numbers clamped, weights adding up
   to exactly 1, thresholds sorted, the Fibonacci scale pinned, modes and the capacity metric only the known ones. The
   permissions it comes with: in no default role, separation of duties binding admins too, mirrored in the page. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const S = require('../shared/scoring-settings');
const { can, CAPS, DEFAULT_ROLES } = require('../server/permissions');
const root = path.join(__dirname, '..');
const sum = w => Object.values(w).reduce((a, b) => a + b, 0);
const SCORING_CAPS = ['scoring_manage_workspace', 'scoring_manage_project', 'scoring_approve_estimate', 'scoring_edit_task', 'scoring_request_ai', 'scoring_approve_completion', 'scoring_manage_outcomes', 'scoring_view_analytics'];

test('the defaults: everything off but Effort Hours inside the master switch; bonus off; the scale and weights as specified', () => {
  const d = S.normalizeSettings(undefined);
  assert.equal(d.enabled, false);
  assert.deepEqual(d.modules, { hours: { on: true, mode: 'hybrid' }, story: { on: false, mode: 'math_only' }, weighted: { on: false, mode: 'math_only' }, kpi: { on: false }, okr: { on: false } });
  assert.equal(d.primaryCapacity, 'hours');
  assert.equal(d.configVersion, 1);
  assert.deepEqual(d.story.scale, [1, 2, 3, 5, 8, 13]);
  assert.deepEqual(d.weighted.weights, { complexity: 0.4, scope: 0.3, uncertainty: 0.2, dependencies: 0.1 });
  assert.equal(d.weighted.scaleMax, 10);
  assert.equal(d.bonus.on, false);
  assert.deepEqual(d.bonus.hourMapping.bands, [[1, 1], [2, 2], [4, 3], [8, 5], [16, 8], [999, 13]]);
  assert.equal(d.bonus.independentApproval, true); assert.equal(d.bonus.allowSelfApproval, false); assert.equal(d.bonus.retroactive, false);
  assert.deepEqual(S.normalizeSettings(S.DEFAULTS), d, 'DEFAULTS is the normalized default');
  assert.ok(Object.isFrozen(S.DEFAULTS) && Object.isFrozen(S.DEFAULTS.modules.hours) && Object.isFrozen(S.DEFAULTS.hours.templates.feed), 'DEFAULTS cannot be changed by a caller');
  assert.equal(S.moduleOn(d, 'hours'), false, 'a module counts only with the master switch on');
  assert.equal(S.moduleOn(Object.assign({}, d, { enabled: true }), 'hours'), true);
});

test('the hours templates are src/effort-estimate.js EST_KINDS: same ids, same numbers, the same per-deliverable rule', () => {
  const src = fs.readFileSync(path.join(root, 'src', 'effort-estimate.js'), 'utf8');
  const kinds = JSON.parse(JSON.stringify(vm.runInNewContext(src.match(/var EST_KINDS=(\[[\s\S]*?\n\]);/)[1])));
  const t = S.normalizeSettings({}).hours.templates;
  assert.deepEqual(Object.keys(t), kinds.map(k => k[0]));
  kinds.forEach(k => assert.deepEqual(t[k[0]], { perUnit: k[4], low: k[5], high: k[6], nextUnitFactor: k[7] }, k[0]));
});

/* the engine (shared/scoring-engine.js, written alongside) falls back to its own copy of the defaults: the two agree */
const ENGINE = path.join(root, 'shared', 'scoring-engine.js');
test('the defaults are the engine\'s defaults, sub-object by sub-object', { skip: !fs.existsSync(ENGINE) && 'shared/scoring-engine.js is not here yet' }, () => {
  const E = require(ENGINE), d = S.normalizeSettings({}), story = Object.assign({}, d.story); delete story.scale;
  assert.deepEqual(JSON.parse(JSON.stringify(E.ENGINE_DEFAULTS.hours)), d.hours);
  assert.deepEqual(JSON.parse(JSON.stringify(E.ENGINE_DEFAULTS.story)), story);
  assert.deepEqual(JSON.parse(JSON.stringify(E.ENGINE_DEFAULTS.weighted)), d.weighted);
  assert.deepEqual(JSON.parse(JSON.stringify(E.ENGINE_DEFAULTS.ai)), d.ai);
  assert.deepEqual(JSON.parse(JSON.stringify(E.ENGINE_DEFAULTS.bonus)), d.bonus);
  assert.deepEqual(E.STORY_SCALE, d.story.scale);
  /* and a normalized settings object is what the engine reads */
  assert.equal(E.storyPoints(d.story, { complexity: 3, scope: 3, uncertainty: 3, dependencies: 3 }).value, 3);
  assert.equal(E.basePoints(d.bonus, { lockedHours: 8 }).value, 5);
});

test('whatever arrives is held to the shape', () => {
  for (const raw of [null, 'not json', '[]', 42, [], { modules: 'x', hours: [], story: null }]) assert.deepEqual(S.normalizeSettings(raw), S.normalizeSettings({}), String(raw));
  assert.equal(S.normalizeSettings('{"enabled":true}').enabled, true, 'the stored JSON text is read');
  const n = S.normalizeSettings({
    enabled: 'yes', foo: 1, modules: { story: { on: true, mode: 'magic', x: 1 }, kpi: { on: true, mode: 'hybrid' }, extra: { on: true } },
    primaryCapacity: 'money',
    hours: { templates: { feed: { perUnit: 999, low: -4, high: 1, nextUnitFactor: 9, junk: 1 }, story: { perUnit: '2.5' }, made_up: { perUnit: 3 } }, complexity: { 1: 0, 5: 99, 6: 2 }, dependency: { 0: 'x' }, bounds: { min: 50, max: 10 }, lockPolicy: 'never' },
    story: { scale: [1, 2, 100], thresholds: [4.5, 9, '2', 1, -3] },
    weighted: { weights: { complexity: 50, scope: 30, uncertainty: 15, dependencies: 5, luck: 90 }, scaleMax: 1000, mappingVersion: -2 },
    ai: { minConfidence: 7, onCreate: 1, perUserDaily: -5, workspaceDaily: 1e9, comparables: 'everyone' },
    bonus: { on: true, grace: 3, perPeriodCap: 50, negative: true, retroactive: true, independentApproval: false, allowSelfApproval: true, completionStages: ['done', 'bad id!', 'done'], pilotTeams: 'all', minQuality: 9, hourMapping: { bands: [[8, 5], [1, 1], [8, 7]] } }
  });
  assert.equal(n.enabled, false, 'not a boolean: the default');
  assert.equal('foo' in n, false); assert.equal('extra' in n.modules, false); assert.equal('x' in n.modules.story, false); assert.equal('mode' in n.modules.kpi, false);
  assert.equal(n.modules.story.on, true); assert.equal(n.modules.story.mode, 'math_only', 'an unknown mode: the module\'s default');
  assert.equal(n.primaryCapacity, 'hours');
  assert.deepEqual(n.hours.templates.feed, { perUnit: 200, low: 0.05, high: 200, nextUnitFactor: 1 }, 'clamped, low ≤ typical ≤ high, a next piece never more than the first');
  assert.equal(n.hours.templates.story.perUnit, 2.5, 'a number written as text');
  assert.equal('made_up' in n.hours.templates, false, 'only the known kinds');
  assert.deepEqual(n.hours.complexity, { 1: 0.1, 2: 0.9, 3: 1, 4: 1.25, 5: 10 });
  assert.equal(n.hours.dependency[0], 1);
  assert.deepEqual(n.hours.bounds, { min: 40, max: 40 }, 'the most is never below the fewest');
  assert.equal(n.hours.lockPolicy, 'approve_or_work_start');
  assert.deepEqual(n.story.scale, [1, 2, 3, 5, 8, 13], 'the Fibonacci scale is pinned');
  assert.deepEqual(n.story.thresholds, [1, 1, 2, 4.5, 5], 'clamped to the 1–5 index and sorted');
  assert.deepEqual(S.normalizeSettings({ story: { thresholds: [1, 2] } }).story.thresholds, [1.5, 2.5, 3.5, 4.25, 4.75], 'five or the defaults');
  assert.deepEqual(n.weighted.weights, { complexity: 0.5, scope: 0.3, uncertainty: 0.15, dependencies: 0.05 }, 'percentages work; unknown factors dropped');
  assert.equal(n.weighted.scaleMax, 100); assert.equal(n.weighted.mappingVersion, 1);
  assert.deepEqual(n.ai, { minConfidence: 1, onCreate: false, onBriefRevision: false, perUserDaily: 0, workspaceDaily: 100000, comparables: 'team' });
  assert.equal(n.bonus.on, true, 'the bonus switch itself is the caller\'s (the server keeps it off until the awards ship)');
  assert.equal(n.bonus.grace, 0.9);
  assert.equal(n.bonus.perPeriodCap, null); assert.equal(n.bonus.negative, false); assert.equal(n.bonus.retroactive, false);
  assert.equal(n.bonus.independentApproval, true); assert.equal(n.bonus.allowSelfApproval, false);
  assert.deepEqual(n.bonus.completionStages, ['done']); assert.deepEqual(n.bonus.pilotTeams, []);
  assert.equal(n.bonus.minQuality, 5);
  assert.deepEqual(n.bonus.hourMapping.bands, [[1, 1], [8, 5]], 'fewest hours first, each once');
  assert.deepEqual(S.normalizeSettings(n), n, 'normalizing twice changes nothing');
});

test('the factor weights always add up to exactly 1', () => {
  let seed = 7; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  for (let i = 0; i < 500; i++) {
    const w = { complexity: rnd() * 10, scope: rnd(), uncertainty: rnd() * 3, dependencies: i % 5 ? rnd() : 0 };
    const n = S.normalizeSettings({ weighted: { weights: w }, story: { weights: w } });
    for (const k of ['weighted', 'story']) { assert.ok(Math.abs(sum(n[k].weights) - 1) < 1e-9, JSON.stringify(n[k].weights)); assert.ok(Object.values(n[k].weights).every(x => x >= 0)); }
  }
  assert.deepEqual(S.normalizeSettings({ weighted: { weights: { complexity: 0, scope: 0, uncertainty: 0, dependencies: 0 } } }).weighted.weights, S.DEFAULTS.weighted.weights, 'all zero: the defaults');
  assert.deepEqual(S.normalizeSettings({ weighted: { weights: { complexity: -5, scope: 1 } } }).weighted.weights, { complexity: 0, scope: 1, uncertainty: 0, dependencies: 0 });
  const third = S.normalizeSettings({ weighted: { weights: { complexity: 1, scope: 1, uncertainty: 1, dependencies: 0 } } }).weighted.weights;
  assert.equal(Math.round(sum(third) * 1e4), 1e4, 'the rounding remainder goes to one factor');
});

test('diffSettings lists each changed leaf, not the server\'s bookkeeping', () => {
  const a = S.normalizeSettings({}), b = S.normalizeSettings(Object.assign({}, a, { enabled: true, configVersion: 9, updatedAt: '2026-10-16T10:00:00.000Z', updatedBy: 'admin', modules: Object.assign({}, a.modules, { story: { on: true, mode: 'hybrid' } }), story: Object.assign({}, a.story, { thresholds: [1, 2, 3, 4, 5] }) }));
  assert.deepEqual(S.diffSettings(a, b), [
    { path: 'enabled', from: false, to: true },
    { path: 'modules.story.mode', from: 'math_only', to: 'hybrid' },
    { path: 'modules.story.on', from: false, to: true },
    { path: 'story.thresholds', from: [1.5, 2.5, 3.5, 4.25, 4.75], to: [1, 2, 3, 4, 5] }]);
  assert.deepEqual(S.diffSettings(a, S.normalizeSettings(a)), []);
  assert.deepEqual(S.diffSettings({}, { x: { y: 1 } }), [{ path: 'x', from: null, to: { y: 1 } }], 'what one side lacks is reported whole');
});

test('in the page the module is window.ScoringSettings', () => {
  const ctx = { window: {} }; vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(root, 'shared', 'scoring-settings.js'), 'utf8'), ctx);
  assert.equal(typeof ctx.window.ScoringSettings.normalizeSettings, 'function');
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  assert.ok(html.includes('root.ScoringSettings = model'), 'build.js inlines it');
  assert.ok(html.indexOf('root.ScoringSettings = model') < html.indexOf('function scoringSettings('), 'before the page\'s scoring code');
});

test('the eight Smart Scoring permissions: in no default role but Admin, with the separation of duties binding admins too', () => {
  const ids = CAPS.map(c => c[0]);
  SCORING_CAPS.forEach(c => assert.ok(ids.includes(c), c));
  DEFAULT_ROLES.filter(r => r.id !== 'admin').forEach(r => SCORING_CAPS.forEach(c => assert.ok(!r.permissions.includes(c), r.id + ' ' + c)));
  const user = (id, o) => Object.assign({ id, role: 'member', caps: {}, teams: [], ledTeams: [] }, o);
  const admin = user('ad', { role: 'admin' }), task = { id: 'T', assignee: 'ad', assignees: ['ad'], reviewer: 'rv' }, other = { id: 'T2', assignee: 'x', assignees: ['x'] };
  assert.equal(can.scoringConfigure(admin), true);
  assert.equal(can.scoringApproveEstimate(admin, task, {}), false, 'an admin assigned to the task cannot approve its estimate');
  assert.equal(can.scoringApproveEstimate(admin, task, { allowSelfApproveEstimate: true }), true, 'unless the workspace allows it');
  assert.equal(can.scoringApproveEstimate(admin, other, {}), true);
  assert.equal(can.scoringApproveEstimate(Object.assign({}, admin, { impersonatedBy: 'boss' }), other, {}), false, 'never while acting as someone else');
  assert.equal(can.scoringApproveCompletion(admin, task, []), false, 'nor the finished work of their own task');
  assert.equal(can.scoringApproveCompletion(admin, other, ['ad']), false, 'nor of a task they are credited on');
  assert.equal(can.scoringApproveCompletion(admin, other, ['x']), true);
  assert.equal(can.scoringApproveCompletion(Object.assign({}, admin, { impersonatedBy: 'boss' }), other, []), false);
  const editor = user('ed', { caps: { scoring_edit_task: true } });
  assert.equal(can.scoringEditTask(editor, other), true);
  assert.equal(can.scoringConfigure(editor), false, 'changing scores does not give the settings');
  assert.equal(can.scoringApproveEstimate(editor, other, {}), false);
  const member = user('m', { caps: { edit_own_task: true } }), mine = { id: 'T3', assignee: 'm', assignees: ['m'] };
  assert.equal(can.scoringPropose(member, mine), true, 'an assignee may propose');
  assert.equal(can.scoringPropose(member, other), false);
  assert.equal(can.scoringEditTask(member, mine), false, 'but being assigned gives no scoring permission');
  assert.equal(can.scoringApproveEstimate(member, mine, { allowSelfApproveEstimate: true }), false);
  assert.equal(can.logTime(member, mine), true); assert.equal(can.logTime(member, other), false); assert.equal(can.logTime(admin, other), false, 'time is logged by the people assigned');
  assert.equal(can.logTime(user('s', { stakeholder: true }), { assignees: ['s'] }), false);
  assert.equal(can.scoringViewAnalytics(user('v', { caps: { scoring_view_analytics: true } })), true);
  assert.equal(can.scoringManageOutcomes(member), false);
  assert.equal(can.scoringRequestAi(user('r', { caps: { scoring_request_ai: true } }), other), true);
});

test('the page mirrors them: the demo admin only, a group of their own in the role editor, a Settings tab after Automation', () => {
  const core = fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8');
  const list = vm.runInNewContext(core.match(/var DEMO_CAP_LIST=(\[[^\r\n]*\]);/)[1]);
  const server = Object.fromEntries(CAPS), mirror = Object.fromEntries(list);
  SCORING_CAPS.forEach(c => assert.equal(mirror[c], server[c], c + ' has the server\'s description'));
  const ctx = { DEMO_CAP_LIST: list }; vm.createContext(ctx);
  vm.runInContext('var DEMO_CAPS=' + core.match(/var DEMO_CAPS=(\{[^\r\n]*\});/)[1], ctx);
  SCORING_CAPS.forEach(c => { assert.ok(ctx.DEMO_CAPS.admin.includes(c)); Object.keys(ctx.DEMO_CAPS).filter(r => r !== 'admin').forEach(r => assert.ok(!ctx.DEMO_CAPS[r].includes(c), r + ' ' + c)); });
  const sa = fs.readFileSync(path.join(root, 'src', 'settings-access.js'), 'utf8').replace(/^<script>/, '').replace(/<\/script>\s*$/, '');
  const c2 = { canI: {}, has: () => false, UI_ID: {}, API: { on: true } }; vm.createContext(c2); vm.runInContext(sa + ';this.G=CAP_GROUPS;this.A=SETTINGS_ACCESS;this.ICO=CAP_GROUP_ICON;', c2);
  assert.deepEqual(JSON.parse(JSON.stringify(c2.G.find(g => g[0] === 'Smart Scoring')[1])), SCORING_CAPS);
  assert.equal(c2.ICO['Smart Scoring'], 'gauge');
  assert.deepEqual(JSON.parse(JSON.stringify(c2.A.scoring)), ['scoring_manage_workspace', 'scoring_view_analytics']);
  const settings = fs.readFileSync(path.join(root, 'src', 'settings.js'), 'utf8');
  assert.match(settings, /\["automation","Automation"\],\["scoring","Smart Scoring"\]/);
  assert.match(settings, /scoring:setScoring/);
});
