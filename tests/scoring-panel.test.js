/* The task's Scoring & Intelligence panel, src/scoring-panel.js (Oct 2026), run as the page runs it: what it reads from
   the server in either spelling (camelCase or snake_case, a summary or a whole row), how it shows numbers (hours to the
   half hour, Story Points whole, Weighted Points with two decimals), when an estimate counts as locked, and that every
   word it shows — every sentence of the engine's explanations too — has its Indonesian. The panel in the browser:
   e2e/scoring-panel.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Engine = require('../shared/scoring-engine.js'), Settings = require('../shared/scoring-settings.js');
const SRC = fs.readFileSync(path.join(__dirname, '..', 'src', 'scoring-panel.js'), 'utf8');
const JS = SRC.slice(SRC.indexOf('<script>') + 8, SRC.indexOf('</script>'));

function load(over) {
  const c = Object.assign({ UI_ID: {}, UI_LANG: 'en', console, ScoringEngine: Engine, ScoringSettings: Settings, I: { lock: '', gauge: '', chevd: '', clock: '', sparkle: '' } }, over || {});
  c.tr = s => (c.UI_LANG === 'id' ? c.UI_ID[s] || s : s);
  vm.createContext(c); vm.runInContext(JS, c); return c;
}

/* the Indonesian the other scoring modules add to the page: the asset points' sentences are the engine's too and the
   panel shows them (src/scoring-assets.js) */
function moduleIndonesian(file) {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', file), 'utf8'), head = '(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({';
  const at = src.indexOf(head); if (at < 0) throw new Error(file + ': its Indonesian block');
  return src.slice(at, src.indexOf('});', at + head.length) + 3);
}
test('every sentence of the engine\'s explanations has an Indonesian translation with the same placeholders', () => {
  const c = load();
  vm.runInContext(moduleIndonesian('scoring-assets.js'), c);
  const marks = s => (String(s).match(/\{\w+\}/g) || []).sort().join(' ');
  for (const [k, en] of Object.entries(Engine.SENTENCES)) {
    assert.ok(c.UI_ID[en], k + ' has no Indonesian: ' + en);
    assert.notEqual(c.UI_ID[en], en, k + ' is not translated');
    assert.equal(marks(c.UI_ID[en]), marks(en), k + ': the placeholders differ');
  }
});

test('every word the panel shows has its Indonesian', () => {
  const c = load();
  const literals = new Set();
  for (const m of JS.matchAll(/\btr\("((?:[^"\\]|\\.)*)"\)/g)) literals.add(JSON.parse('"' + m[1] + '"'));
  for (const m of JS.matchAll(/\btr\([^"()]*(?:\([^()]*\))?[^"()]*\?"((?:[^"\\]|\\.)*)":"((?:[^"\\]|\\.)*)"\)/g)) { literals.add(m[1]); literals.add(m[2]); }
  for (const m of JS.matchAll(/openModal\((?:mine\?)?"((?:[^"\\]|\\.)*)"(?::"((?:[^"\\]|\\.)*)")?/g)) { literals.add(m[1]); if (m[2]) literals.add(m[2]); }
  for (const m of JS.matchAll(/scrAfter\(tk,m,d,(?:proposed\?)?"((?:[^"\\]|\\.)*)"(?::"((?:[^"\\]|\\.)*)")?\)/g)) { literals.add(m[1]); if (m[2]) literals.add(m[2]); }
  for (const m of JS.matchAll(/scrBtn\(tk,m,"\w+",(?:r\.proposal\?)?"((?:[^"\\]|\\.)*)"(?::"((?:[^"\\]|\\.)*)")?/g)) { literals.add(m[1]); if (m[2]) literals.add(m[2]); }
  for (const map of [c.SCR_NAMES, c.SCR_SRC, c.SCR_SRC_WHY, c.SCR_ST, c.SCR_FACTOR_NAMES, c.SCR_ACTIONS, c.SCR_AI_WARN, c.SCR_AI_GAPS, c.SCR_AI_NOTE]) Object.values(map).forEach(v => literals.add(v));
  /* the AI's reason placeholders */
  for (const m of JS.matchAll(/scrReasonField\(true,s\.far\?"((?:[^"\\]|\\.)*)":"((?:[^"\\]|\\.)*)"\)/g)) { literals.add(m[1]); literals.add(m[2]); }
  Object.values(c.SCR_LEVELS).forEach(l => l.forEach(v => literals.add(v)));
  assert.ok(literals.size > 120, 'the strings were found (' + literals.size + ')');
  const missing = [...literals].filter(s => !(s in c.UI_ID));
  assert.deepEqual(missing, [], 'no Indonesian for: ' + missing.join(' | '));
  for (const f of ['complexity', 'scope', 'uncertainty', 'dependencies']) assert.equal(c.SCR_LEVELS[f].length, 5, f + ' describes each of its five levels');
});

test('what the server sends is read the same: a Row of GET …/scoring, the table\'s own columns, a task\'s summary', () => {
  const c = load();
  const at = '2026-10-16T08:00:00.000Z', steps = [{ key: Engine.SENTENCES.hOne, vars: {} }];
  /* docs/SMART-SCORING.md §5.2.1: value is the final, math holds the inputs and the steps, locked says so */
  const row = c.scrRowNorm({ module: 'hours', unit: 'h', value: 6, source: 'manual', status: 'approved', locked: true, mathValue: 7.35,
    math: { inputs: { kind: 'feed', kindSource: 'title', units: 5, unitsSource: 'assets', assetCount: 5, complexity: 4, complexitySource: 'given', openDeps: 0 }, steps, low: 4.5, high: 9 },
    aiValue: null, aiRunId: null, factors: {}, mappingVersion: null, configVersion: 3, lockedValue: 6, lockedAt: at, lockedBy: 'u1', approvedBy: 'u1', approvedAt: at, approvedAtLock: true,
    proposal: null, scope: { assets: 5, deps: 0, text: 'abc' }, updatedBy: 'u1', updatedAt: at, rev: 4 }, 'hours');
  const db = c.scrRowNorm({ module: 'hours', math_value: '7.35', math_inputs: JSON.stringify({ inputs: { kind: 'feed', kindSource: 'title', units: 5, unitsSource: 'assets', assetCount: 5, complexity: 4, complexitySource: 'given', openDeps: 0 }, steps, low: 4.5, high: 9 }),
    final_value: 6, source: 'manual', status: 'approved', locked_value: 6, locked_at: at, locked_by: 'u1', approved_by: 'u1', approved_at: at, proposal: null, updated_by: 'u1', updated_at: at, rev: '4' }, 'hours');
  const keep = o => { const x = JSON.parse(JSON.stringify(o)); delete x.locked; return x; };
  assert.deepEqual(keep(db), keep(row));
  assert.equal(row.finalValue, 6); assert.equal(row.mathValue, 7.35); assert.equal(row.mathInputs.kind, 'feed'); assert.equal(row.mathLow, 4.5); assert.equal(row.steps.length, 1); assert.equal(row.locked, true);
  assert.equal(c.scrRated(row.mathInputs), 4, 'a complexity given');
  assert.equal(c.scrRated({ complexity: null, complexitySource: null }), null, 'not rated');
  /* a task document's summary: {value, unit, status, source, lockedValue, lockedAt, rev, proposed} */
  const sum = c.scrRowNorm({ value: 6, unit: 'h', status: 'approved', source: 'manual', lockedValue: 6, lockedAt: at, rev: 4, proposed: true }, 'hours');
  assert.equal(sum.finalValue, 6); assert.equal(sum.module, 'hours'); assert.equal(sum.rev, 4); assert.equal(sum.mathValue, null); assert.equal(sum.proposed, true); assert.equal(c.scrLocked(sum), true);
  /* a proposal stored as JSON text, by whoever proposed it; one that takes the math has the math's value */
  const p = c.scrRowNorm({ status: 'proposed', proposal: '{"value":8,"reason":"More rounds","by":"u2","at":"2026-10-16T09:00:00.000Z"}', rev: 2 }, 'story').proposal;
  assert.deepEqual(JSON.parse(JSON.stringify(p)), { value: 8, ratings: null, use: null, reason: 'More rounds', by: 'u2', at: '2026-10-16T09:00:00.000Z' });
  assert.equal(c.scrRowNorm({ mathValue: 5, proposal: { use: 'math', by: 'u2' }, rev: 1 }, 'story').proposal.value, 5);
  assert.equal(c.scrRowNorm(null, 'hours'), null);
  /* an Audit entry: from and to are snapshots; null by is the server */
  const a = c.scrAuditNorm({ id: 'x', module: 'hours', action: 'approved', by: null, impersonatedBy: null, at, reason: '', from: { value: 3, lockedValue: null }, to: { value: 7.5, lockedValue: 7.5 }, meta: {} });
  assert.equal(c.scrAuditValue(a.oldValue), '3'); assert.equal(c.scrAuditValue(a.newValue), '7.5'); assert.equal(a.by, null);
  assert.equal(c.scrAuditValue('{"locked_value":7.5}'), '7.5'); assert.equal(c.scrAuditValue(3), '3'); assert.equal(c.scrAuditValue(null), '');
});

test('the details are kept whether the rows come keyed by module or as a list, and the task\'s summaries follow', () => {
  const tasks = { 'T-1': { id: 'T-1', effort: 3, assetCount: 5 }, 'T-2': { id: 'T-2', effort: 3, assetCount: 5 } };
  const c = load({ task: id => tasks[id], API: { on: true }, assetCount: t => +t.assetCount || 0 });
  c.scrStore('T-1', { taskId: 'T-1', rows: { hours: { value: 6, status: 'approved', locked: true, lockedValue: 6, lockedAt: 'x', rev: 3 }, story: null, weighted: null }, audit: [{ action: 'approved' }], can: { approve: true },
    context: { kind: 'feed', assetCount: 5, deliverables: 5, openDeps: 2, scope: { value: 3, source: 'assets', assetCount: 5, assumed: false }, requireReason: false } });
  c.scrStore('T-2', { rows: [{ module: 'hours', final_value: 6, status: 'approved', locked_value: 6, locked_at: 'x', rev: 3 }] });
  for (const id of ['T-1', 'T-2']) { assert.equal(c.SCR.cache[id].rows.hours.lockedValue, 6, id); assert.equal(tasks[id].scoring.hours.status, 'approved', id); assert.equal(tasks[id].scoring.hours.rev, 3, id); assert.equal(c.SCR.cache[id].sig, c.scrSig(tasks[id]), id + ': nothing more to ask for'); }
  assert.equal(c.SCR.cache['T-1'].rows.story, null); assert.equal(c.SCR.cache['T-1'].audit.length, 1);
  /* what the server counts with: its kind, its open dependencies, the Scope it suggests, whether a reason is needed */
  assert.equal(c.scrCtxKind(tasks['T-1']), 'feed'); assert.equal(c.scrCtxDeps(tasks['T-1']), 2);
  assert.deepEqual(JSON.parse(JSON.stringify(c.scrScopeSug(tasks['T-1']))), { v: 3, n: 5 }); assert.equal(c.scrNeedReason(tasks['T-1']), false);
  /* one answer for one module ({row}) changes only that module */
  c.scrStore('T-1', { row: { module: 'story', mathValue: 5, value: 5, source: 'math', status: 'draft', rev: 1 } }, 'story');
  assert.equal(c.SCR.cache['T-1'].rows.story.finalValue, 5); assert.equal(c.SCR.cache['T-1'].rows.hours.lockedValue, 6);
  /* an answer that left before a newer write and arrived after it does not put the older row back */
  c.scrStore('T-1', { rows: { hours: { value: 3, status: 'draft', rev: 2 } } });
  assert.equal(c.SCR.cache['T-1'].rows.hours.status, 'approved'); assert.equal(c.SCR.cache['T-1'].rows.hours.rev, 3);
  c.scrStore('T-1', { rows: { hours: { value: 7, status: 'draft', locked: false, rev: 4 } } });
  assert.equal(c.SCR.cache['T-1'].rows.hours.status, 'draft', 'a newer one does');
});

test('the server\'s `can` is read in its own words or the predicates\' names, per module or for all', () => {
  const tk = { id: 'T-1' };
  const c = load({ canI: { scoringEditTask: () => false, scoringPropose: () => true, scoringApproveEstimate: () => false, scoringRequestAi: () => false }, has: () => false });
  assert.deepEqual(JSON.parse(JSON.stringify(c.scrCan(tk, 'hours'))), { calculate: true, propose: true, edit: false, approve: false, rebaseline: false, requestAi: false, blocked: null }, 'before the server answers: the page\'s mirror');
  /* §5.2.1: can {view, calculate, propose, edit, approve, rebaseline, requestAi, logTime, …, approveBlocked} */
  c.SCR.cache['T-1'] = { rows: {}, can: { view: true, calculate: true, propose: true, edit: false, approve: false, rebaseline: false, requestAi: false, logTime: true, approveCompletion: false, viewEfficiency: false, viewAnalytics: false, assignee: true, impersonating: false, approveBlocked: 'assignee' } };
  assert.deepEqual(JSON.parse(JSON.stringify(c.scrCan(tk, 'hours'))), { calculate: true, propose: true, edit: false, approve: false, rebaseline: false, requestAi: false, blocked: 'assignee' });
  c.SCR.cache['T-1'].can = { scoringEditTask: true, scoringPropose: true, scoringApproveEstimate: true };
  assert.deepEqual(JSON.parse(JSON.stringify(c.scrCan(tk, 'hours'))), { calculate: true, propose: true, edit: true, approve: true, rebaseline: true, requestAi: false, blocked: null });
  c.SCR.cache['T-1'].can = { hours: { calculate: true, propose: true, edit: false, approve: false, rebaseline: false }, story: { calculate: false, propose: false } };
  assert.equal(c.scrCan(tk, 'hours').propose, true); assert.equal(c.scrCan(tk, 'story').calculate, false);
});

test('hours to the half hour, Story Points whole, Weighted Points with two decimals', () => {
  const c = load();
  assert.equal(c.scrFmt('hours', 7.35), '7.5 h'); assert.equal(c.scrFmt('hours', 7.2), '7 h'); assert.equal(c.scrFmt('hours', 0.25), '0.5 h'); assert.equal(c.scrFmt('hours', 0), '0 h');
  assert.equal(c.scrFmt('story', 5), '5 SP'); assert.equal(c.scrFmt('weighted', 8.425), '8.43 pts'); assert.equal(c.scrFmt('weighted', 1.1), '1.10 pts');
  assert.equal(c.scrFmt('hours', null), '—'); assert.equal(c.scrFmt('weighted', NaN), '—');
  c.UI_LANG = 'id'; assert.equal(c.scrFmt('weighted', 2), '2.00 poin');
});

test('an estimate is locked when approved, frozen or changed after its lock, or waiting for a new baseline; and says who holds it', () => {
  const c = load({ person: id => ({ name: { u1: 'Ayu', u2: 'Budi' }[id] || id }), fmt: (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (o[k] !== undefined ? o[k] : m)), UI_LANG: 'en' }), at = '2026-10-16T08:00:00.000Z';
  for (const s of ['locked', 'approved', 'rebaseline_needed']) assert.equal(c.scrLocked({ status: s }), true, s);
  for (const s of ['draft', 'proposed', 'unverified']) assert.equal(c.scrLocked({ status: s }), false, s);
  assert.equal(c.scrLocked({ status: 'draft', locked: true }), true, 'the server\'s own word counts first');
  assert.equal(c.scrLocked({ status: 'draft', lockedAt: at }), false);
  assert.equal(c.scrLocked(null), false);
  assert.equal(c.scrLockedValue({ lockedValue: 6, finalValue: 7 }), 6); assert.equal(c.scrLockedValue({ lockedValue: null, finalValue: 7 }), 7);
  const who = r => c.scrLockShort(Object.assign({ approvedAt: null, lockedAt: null }, r));
  assert.equal(who({ status: 'approved', approvedBy: 'u1', lockedBy: 'u1' }), 'Approved and locked by Ayu');
  assert.equal(who({ status: 'approved' }), 'Approved and locked', 'a task\'s summary does not say who');
  assert.equal(who({ status: 'locked', lockedBy: null }), 'Frozen when work started · not approved yet');
  assert.equal(who({ status: 'locked', lockedBy: 'u2' }), 'Locked by Budi · not approved yet', 'changed after its lock');
  assert.equal(who({ status: 'rebaseline_needed', approvedBy: 'u1' }), 'Approved and locked by Ayu · the scope changed since: it needs a new baseline');
});
test('the explanation of a stored row is the engine\'s, in Indonesian too, with a kind\'s and a factor\'s name in their words', () => {
  const c = load({ estKindName: id => (c.UI_LANG === 'id' ? { feed: 'post feed' } : { feed: 'feed post' })[id] || id, scoringSettings: () => Settings.normalizeSettings({}) });
  const res = Engine.hours(Settings.DEFAULTS.hours, { kind: 'feed', units: 5, complexity1to5: 4, openDeps: 0 });
  assert.equal(c.scrStep(res.steps[0]), 'Template "feed post": 2 h for one deliverable.');
  assert.equal(c.scrStep(res.steps[1]), '5 deliverables, the first in full and each next one at 50%: ×3.', '{factor} here is a multiplier, not a factor\'s name');
  const adj = Engine.storyPoints(Settings.DEFAULTS.story, { complexity: 4.6, scope: 3, uncertainty: 2, dependencies: 1 }).steps[0];
  c.UI_LANG = 'id';
  assert.equal(c.scrStep(res.steps[0]), 'Template "post feed": 2 jam untuk satu deliverable.');
  assert.equal(c.scrStep(adj), 'Nilai kompleksitas 4.6 dibaca sebagai 5 (nilai berupa bilangan bulat 1 sampai 5).');
  const miss = Engine.weightedPoints(Settings.DEFAULTS.weighted, { complexity: 3 }).steps[0];
  assert.equal(c.scrStep(miss), 'Nilai semua faktor dulu; belum dinilai: lingkup, ketidakpastian, dependensi.');
});
