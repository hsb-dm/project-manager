/* The task's Scoring & Intelligence panel, src/scoring-panel.js (Oct 2026), run as the page runs it: what it reads from
   the server in either spelling (camelCase or snake_case, a summary or a whole row), how it shows numbers (hours to the
   half hour, Story Points whole, Weighted Points with two decimals), when an estimate counts as locked, and that every
   word it shows — every sentence of the engine's explanations too — has its Indonesian; and the "Documents for the AI"
   line (what the server found, what the last ask did with each, a task left out); and the team's context for the AI
   (each assumption right or wrong, the note, what is sent, read-only, hidden, before → now). The panel in the browser:
   e2e/scoring-panel.spec.js, e2e/scoring-ai-docs.spec.js, e2e/scoring-ai-context.spec.js. */
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
  for (const map of [c.SCR_NAMES, c.SCR_SRC, c.SCR_SRC_WHY, c.SCR_ST, c.SCR_FACTOR_NAMES, c.SCR_ACTIONS, c.SCR_AI_WARN, c.SCR_AI_GAPS, c.SCR_AI_NOTE, c.SCR_DOC_ST, c.SCR_DOC_WHY]) Object.values(map).forEach(v => literals.add(v));
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
test('the documents in the brief: only while the workspace reads them and the AI is asked; each says what the last ask did with it; a task can leave them out', async () => {
  const tasks = { 'T-1': { id: 'T-1', meta: {} } }, base = Settings.normalizeSettings({}), on = { configure: true, mode: 'hybrid' };
  let settings = base;
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const c = load({ task: id => tasks[id], API: { on: true }, S: { drawerTask: null }, scoringSettings: () => settings, scoringMode: () => on.mode, esc, attr: esc, jsq: s => "'" + s + "'",
    fmt: (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (o[k] !== undefined ? o[k] : m)), canI: { scoringConfigure: () => on.configure, editTask: () => true },
    taskMeta: t => (t.meta = t.meta || {}), editTaskWith: (t, fn) => { fn(t); return Promise.resolve(t); }, toast: () => {} });
  /* the workspace's switch as the settings say (ai.readDocs, the server's side), else as GET …/scoring says */
  const ws = v => { settings = Object.assign({}, base, { ai: Object.assign({}, base.ai) }); if (v === undefined) delete settings.ai.readDocs; else settings.ai.readDocs = v; };
  const found = [{ ref: 'https://docs.google.com/presentation/d/abc/edit', kind: 'gslides', title: 'Ramadan deck', status: 'ready' }, { ref: 'https://docs.google.com/document/d/p/edit', kind: 'gdoc', title: 'Private brief', status: 'not_public' },
    { ref: 'file:f1', kind: 'file', title: 'Spec.pdf', status: 'too_large' }, { ref: 'file:f2', kind: 'toString', title: 'logo.ai', status: 'unsupported' }];
  c.SCR.cache['T-1'] = { rows: {}, at: 100, ai: { external: true, docs: { on: false, allowed: false, canToggle: true, charsLimit: 15000, found } } };
  const html = () => c.scrDocsHtml(tasks['T-1'], ['hours']), chip = (h, ref) => { const at = h.indexOf('data-scr-doc="' + ref + '"'); return at < 0 ? null : h.slice(at, h.indexOf('</li>', at)); };
  const stOf = (h, ref) => { const x = chip(h, ref); return x && x.slice(x.indexOf('scr-doc-st">') + 12, x.lastIndexOf('</span>')); };
  ws(false);
  assert.match(html(), /data-scr-docs="off"/, 'reading off: one quiet line for whoever may turn it on');
  assert.doesNotMatch(html(), /scr-doc"/);
  on.configure = false; assert.equal(html(), '', '…and nothing for anyone else'); on.configure = true;
  ws(undefined); assert.match(html(), /data-scr-docs="off"/, 'no word in the settings: the server\'s');
  c.SCR.cache['T-1'].ai.docs.on = true; assert.match(html(), /data-scr-docs="on"/);
  ws(true); c.SCR.cache['T-1'].ai.docs.on = false; let h = html();
  assert.match(h, /data-scr-docs="on"/, 'the settings\' word counts first');
  assert.equal(stOf(h, found[0].ref), 'read when the AI is asked'); assert.equal(stOf(h, found[1].ref), 'not shared publicly — set it to “anyone with the link”');
  assert.equal(stOf(h, 'file:f1'), 'too large'); assert.equal(stOf(h, 'file:f2'), 'not supported');
  assert.match(chip(h, 'file:f2'), /data-kind="file"/, 'a kind it does not know is a file');
  assert.match(chip(h, found[0].ref), /<a href="https:\/\/docs\.google\.com\/presentation\/d\/abc\/edit" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(chip(h, 'file:f1'), /<a /, 'a file on this server is not a link');
  assert.doesNotMatch(h, /data-scr-docs-sum/, 'nothing read yet');
  /* after an ask: what it read, how much of the budget, what was cut */
  c.scrDocsRun('T-1', [{ ref: found[0].ref, kind: 'gslides', title: 'Ramadan deck', status: 'read', chars: 4200 }, { ref: found[1].ref, status: 'not_public' }, { ref: 'file:f1', status: 'read', chars: 9000, cut: true }]);
  h = html();
  assert.equal(stOf(h, found[0].ref), 'read · 4,200 characters'); assert.equal(stOf(h, 'file:f1'), 'read · 9,000 characters · cut to fit');
  assert.match(h, /data-scr-docs-sum>read 13,200 of 15,000 characters</);
  delete c.SCR.cache['T-1'].ai.docs.charsLimit; settings.ai.docsChars = 30000;
  assert.match(html(), />read 13,200 of 30,000 characters</, 'no charsLimit from the server: the settings\' budget');
  delete settings.ai.docsChars; assert.match(html(), />read 13,200 characters</, 'neither: how much was read');
  /* the server answering later with more than "ready" is newer; "ready" says nothing new */
  c.SCR.cache['T-1'].at = 200; found[0].status = 'not_public';
  assert.equal(stOf(html(), found[0].ref), 'not shared publicly — set it to “anyone with the link”');
  found[0].status = 'ready'; assert.equal(stOf(html(), found[0].ref), 'read · 4,200 characters');
  c.UI_LANG = 'id'; assert.equal(stOf(html(), found[0].ref), 'dibaca · 4.200 karakter'); c.UI_LANG = 'en';
  /* the server's reason, in words (docs/SMART-SCORING.md §5.4.1); a code it does not know is left out; not_public's own words say what to do */
  c.scrDocsRun('T-1', [{ ref: 'file:f1', status: 'too_large', reason: 'over_15mb' }, { ref: 'file:f2', status: 'unsupported', reason: 'no_text' }, { ref: found[1].ref, status: 'not_public', reason: 'login' }, { ref: found[0].ref, status: 'limit', reason: 'max_docs' }]);
  c.SCR.cache['T-1'].ai.docs.maxDocs = 5; c.SCR.docRun['T-1'].at = 200; h = html();
  assert.equal(stOf(h, 'file:f1'), 'too large · over 15 MB'); assert.equal(stOf(h, 'file:f2'), 'not supported · no text in it (a scan?)');
  assert.equal(stOf(h, found[1].ref), 'not shared publicly — set it to “anyone with the link”'); assert.equal(stOf(h, found[0].ref), 'not read: only the first 5 are read per ask');
  c.scrDocsRun('T-1', [{ ref: 'file:f1', status: 'error', reason: 'something_new' }]); c.SCR.docRun['T-1'].at = 200;
  assert.equal(stOf(html(), 'file:f1'), 'could not be read');
  c.UI_LANG = 'id'; c.scrDocsRun('T-1', [{ ref: 'file:f1', status: 'error', reason: 'rate_limited' }]); c.SCR.docRun['T-1'].at = 200;
  assert.equal(stOf(html(), 'file:f1'), 'tidak dapat dibaca · Google meminta menunggu: coba lagi nanti'); c.UI_LANG = 'en';
  c.scrDocsRun('T-1', [{ ref: found[0].ref, kind: 'gslides', title: 'Ramadan deck', status: 'read', chars: 4200 }, { ref: found[1].ref, status: 'not_public' }, { ref: 'file:f1', status: 'read', chars: 9000, cut: true, reason: 'budget' }]);
  c.SCR.docRun['T-1'].at = 200;
  /* left out on this task: every chip says it will not be sent */
  await c.scrDocsUse('T-1'); assert.equal(tasks['T-1'].meta.aiReadDocs, false);
  h = html(); assert.match(h, /data-scr-docs="excluded"/); for (const x of found) assert.equal(stOf(h, x.ref), 'will not be sent', x.ref);
  assert.doesNotMatch(h, /data-scr-docs-sum/); assert.match(h, /class="switch" role="switch" aria-checked="false"/);
  await c.scrDocsUse('T-1'); assert.equal('aiReadDocs' in tasks['T-1'].meta, false, 'used again: no word of its own, the workspace\'s');
  /* not where nothing asks the AI, nor while external AI processing is off, nor without documents */
  on.mode = 'math_only'; assert.equal(html(), ''); on.mode = 'hybrid';
  c.SCR.cache['T-1'].ai.external = false; assert.equal(html(), ''); c.SCR.cache['T-1'].ai.external = true;
  c.SCR.cache['T-1'].ai.docs.found = []; delete c.SCR.docRun['T-1']; assert.equal(html(), '');
  c.SCR.cache['T-1'].ai.docs.canToggle = false; c.SCR.cache['T-1'].ai.docs.found = found;
  assert.match(html(), /data-scr-act="docs-use" disabled/, 'whoever may not edit the task sees the switch, not to be changed');
});

/* the panel with what the team's context needs: a task, the server's view (ai.rows, ai.context), the calls it makes */
function ctxPanel() {
  const tasks = { 'T-1': { id: 'T-1', meta: {} }, 'T-7': { id: 'T-7', title: 'Older feed' } }, on = { mods: ['hours'], mode: 'hybrid' }, calls = [], toasts = [];
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const c = load({ task: id => tasks[id], API: { on: true }, S: { drawerTask: null }, scoringSettings: () => Settings.normalizeSettings({}), scoringMode: () => on.mode, scoringModuleOn: m => on.mods.includes(m),
    esc, attr: esc, jsq: s => esc(JSON.stringify(String(s))), fmt: (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (o[k] !== undefined ? o[k] : m)), person: id => ({ name: { u1: 'Ayu' }[id] || id }),
    canI: { editTask: () => true, scoringConfigure: () => true }, scoringStakeholder: () => false, ago: (m, iso) => 'at ' + iso, toast: (t, k) => toasts.push([t, k || '']),
    document: { querySelector: () => null, querySelectorAll: () => [] }, assetCount: () => 0, refresh: () => {}, replaceInto: () => {},
    apiFetch: (method, path, body) => { calls.push({ method, path, body }); const r = c.__answer ? c.__answer(method, path, body) : null; return r instanceof Error ? Promise.reject(r) : Promise.resolve(r || {}); } });
  c.I.x = '<svg></svg>';
  const sug = (o) => Object.assign({ module: 'hours', value: 9, runId: 'r2', at: '2026-10-20T08:00:00.000Z', by: 'u1', confidence: 0.8, shownConfidence: 0.8, stale: false, warnings: [],
    explanation: 'Twelve posts.', assumptions: ['1 revision round', 'Copy is ready'], missing: [], acceptable: true }, o || {});
  const ctx = (o) => Object.assign({ note: '', checks: [], by: null, byName: null, at: null, canEdit: true, maxNote: 1000, maxChecks: 8, similar: [] }, o || {});
  c.SCR.cache['T-1'] = { rows: {}, at: 1, can: { requestAi: true, edit: true, propose: true }, ai: { external: true, rows: { hours: sug(), story: null, weighted: null }, context: ctx() } };
  return { c, tasks, on, calls, toasts, sug, ctx, tk: tasks['T-1'], ai: () => c.SCR.cache['T-1'].ai };
}
test('the team\'s context: each assumption right or wrong, a wrong one with what is true instead; what is sent; the button follows', async () => {
  const { c, tk, ai, calls, toasts, sug } = ctxPanel();
  const card = () => c.scrAiCardHtml(tk, 'hours', c.scrCan(tk, 'hours'), false), box = () => c.scrCtxHtml(tk);
  /* the toggles on each assumption, nothing marked yet; the box under the rows with its words */
  let h = card();
  assert.match(h, /<li class="scr-asm" data-st=""><span data-no-translate>1 revision round<\/span><span class="scr-asm-acts"><button type="button" class="scr-tog" data-ok="1" aria-pressed="false"/);
  assert.match(h, /onclick="scrCtxMark\(&quot;T-1&quot;,'hours',0,false\)">✗ Wrong</);
  assert.doesNotMatch(h, /scr-fix/);
  h = box();
  assert.match(h, /data-scr-ctx="edit"/); assert.match(h, /<b>Add context for the AI<\/b>/); assert.match(h, /maxlength="1000"/);
  assert.match(h, /placeholder="E\.g\. this client usually asks for 3 revision rounds; product photos arrive two days before the deadline\."/);
  assert.match(h, /The AI uses this on every Ask AI for this task, and as an example for similar tasks\./); assert.match(h, /data-scr-ctx-n>0 \/ 1,000</);
  assert.match(h, /data-scr-act="ctx-send" data-scr-key="ctx-send" disabled/, 'nothing to send yet');
  assert.doesNotMatch(h, /ctx-clear/, 'nothing saved: no Clear context');
  /* Wrong: the line for what is true instead; Right on the other */
  c.scrCtxMark('T-1', 'hours', 0, false); c.scrCtxMark('T-1', 'hours', 1, true);
  h = card();
  assert.match(h, /data-st="wrong"><span data-no-translate>1 revision round<\/span>.*class="scr-tog on" data-ok="0" aria-pressed="true".*<input type="text" class="scr-fix" data-scr-key="fix:hours:0" maxlength="200" value="" placeholder="What is true instead…"/);
  assert.match(h, /data-st="ok"><span data-no-translate>Copy is ready/);
  c.scrCtxFix('T-1', 'hours', 0, { value: 'this client usually asks for 3 rounds' });
  assert.match(box(), /data-scr-act="ctx-send" data-scr-key="ctx-send" onclick=/, 'something to send: enabled');
  c.scrCtxNote('T-1', { value: '  Photos arrive two days before the deadline.  ' });
  assert.match(box(), /data-scr-ctx-n>47 \/ 1,000</, 'counted as typed');
  assert.deepEqual(JSON.parse(JSON.stringify(c.scrCtxBody(c.scrCtxCur(tk)))), { note: 'Photos arrive two days before the deadline.', checks: [{ a: '1 revision round', ok: false, fix: 'this client usually asks for 3 rounds' }, { a: 'Copy is ready', ok: true }] });
  /* the same mark again takes it away; marking back to what is saved leaves nothing of its own */
  c.scrCtxMark('T-1', 'hours', 1, true); assert.equal(c.scrCtxCur(tk).checks.length, 1);
  c.scrCtxMark('T-1', 'hours', 0, true); assert.deepEqual(JSON.parse(JSON.stringify(c.scrCtxCur(tk).checks)), [{ a: '1 revision round', ok: true, fix: '' }], 'right: no correction kept');
  c.scrCtxMark('T-1', 'hours', 0, true); c.scrCtxNote('T-1', { value: '' }); assert.equal(c.SCR.ctx.draft['T-1'], undefined, 'as saved again: no draft');
  /* marked again in another order: what is saved, nothing to send */
  ai().context.checks = [{ a: '1 revision round', ok: true }, { a: 'Copy is ready', ok: false, fix: 'not yet' }];
  c.scrCtxMark('T-1', 'hours', 0, true); c.scrCtxMark('T-1', 'hours', 0, true); assert.equal(c.scrCtxDirty(tk), false, 'the same marks in another order');
  assert.equal(c.SCR.ctx.draft['T-1'], undefined); ai().context.checks = [];
  /* at most 8 checks */
  ai().rows.hours = sug({ assumptions: Array.from({ length: 9 }, (_, i) => 'A' + i) });
  for (let i = 0; i < 9; i++) c.scrCtxMark('T-1', 'hours', i, true);
  assert.equal(c.scrCtxCur(tk).checks.length, 8); assert.deepEqual(toasts.pop(), ['At most 8 assumptions can be marked', 'bad']);
  delete c.SCR.ctx.draft['T-1']; ai().rows.hours = sug();
  /* out of date: Send & ask again is there for the asking even with nothing new */
  ai().rows.hours = sug({ stale: true }); assert.match(box(), /data-scr-key="ctx-send" onclick=/); ai().rows.hours = sug({ warnings: [{ code: 'stale' }] }); assert.equal(c.scrCtxSendOk(tk), true);
  ai().rows.hours = sug();
  /* Send & ask again: one ask with the context, for the one score with a suggestion; the draft goes once sent */
  c.scrCtxMark('T-1', 'hours', 0, false); c.scrCtxFix('T-1', 'hours', 0, { value: '3 rounds' });
  c.__answer = (m, p) => (p.endsWith('/scoring/ai') ? { rows: {}, ai: { external: true, rows: { hours: sug({ runId: 'r3', value: 12 }) }, context: { note: '', checks: [{ a: '1 revision round', ok: false, fix: '3 rounds' }], canEdit: true, by: 'u1', at: '2026-10-20T09:00:00.000Z' } },
    aiResult: { status: 'ok', runId: 'r3', modules: ['hours'], previous: { hours: 9, storyPoints: null, weightedPoints: null }, contextEffect: 'Three rounds add three hours.', context: { used: true, similar: [] } } } : {});
  c.scrCtxSend('T-1');
  assert.equal(c.SCR.aiBusy['T-1'], 'hours'); assert.equal(c.SCR.ctx.busy['T-1'], 'send');
  assert.equal(c.scrCtxSendOk(tk), false, 'busy: no second send');
  let b = box(); assert.match(b, /data-scr-key="ctx-send" disabled aria-busy="true"/); assert.match(b, />Sending…</); assert.match(b, /<textarea [^>]*oninput=/, 'the note stays to be typed in');
  await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  const post = calls.find(x => x.path === '/api/tasks/T-1/scoring/ai');
  assert.deepEqual(JSON.parse(JSON.stringify(post.body)), { module: 'hours', trigger: 'ask', comparables: [], lang: 'en', context: { note: '', checks: [{ a: '1 revision round', ok: false, fix: '3 rounds' }] } });
  assert.equal(c.SCR.ctx.draft['T-1'], undefined); assert.equal(c.SCR.aiBusy['T-1'], undefined); assert.equal(c.SCR.ctx.busy['T-1'], undefined);
  /* what changed and why, from what the ask said */
  h = card(); assert.match(h, /data-scr-ai-delta="hours">Before <b>9 h<\/b> → now <b>12 h<\/b></); assert.match(h, /Because of the team&#39;s context: <span data-no-translate>Three rounds add three hours\.<\/span>/);
  b = box(); assert.match(b, /data-scr-ctx-by>Context from <span data-no-translate>Ayu<\/span> · at 2026-10-20T09:00:00\.000Z</); assert.match(b, /data-scr-act="ctx-clear"/);
  /* two scores with a suggestion: one ask for all of them */
  const p2 = ctxPanel(); p2.on.mods = ['hours', 'story']; p2.ai().rows.story = p2.sug({ module: 'story', value: 5 });
  assert.equal(p2.c.scrCtxTarget(p2.tk), 'all'); p2.ai().rows.story = null; assert.equal(p2.c.scrCtxTarget(p2.tk), 'hours');
  p2.ai().rows.hours = null; assert.equal(p2.c.scrCtxTarget(p2.tk), 'all', 'none yet, two asked for: all');
  assert.equal(p2.c.scrAiBusy('T-1', 'story'), false); p2.c.SCR.aiBusy['T-1'] = 'all'; assert.equal(p2.c.scrAiBusy('T-1', 'story'), true);
  /* without the right to ask the AI, the context is only saved; Clear context saves it empty and asks nothing */
  calls.length = 0; c.SCR.cache['T-1'].can.requestAi = false; c.scrCtxNote('T-1', { value: 'Client is slow to reply' });
  assert.match(box(), />Save context</);
  c.__answer = (m, p, body) => (p.endsWith('/context') ? { context: Object.assign({ canEdit: true, by: 'u1', at: '2026-10-20T10:00:00.000Z', similar: [] }, body) } : { rows: {}, ai: ai() });
  c.scrCtxSend('T-1'); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(calls.map(x => x.method + ' ' + x.path).slice(0, 1), ['PUT /api/tasks/T-1/scoring/context']); assert.equal(calls[0].body.note, 'Client is slow to reply');
  assert.ok(toasts.some(t => t[0] === 'Context saved'));
  calls.length = 0; c.SCR.cache['T-1'].ai.context.note = 'Client is slow to reply'; c.scrCtxClear('T-1'); await new Promise(r => setTimeout(r, 0));
  assert.deepEqual(JSON.parse(JSON.stringify(calls[0])), { method: 'PUT', path: '/api/tasks/T-1/scoring/context', body: { note: '', checks: [] } });
  assert.ok(calls.every(x => !x.path.endsWith('/ai')), 'nothing asked'); assert.ok(toasts.some(t => t[0] === 'Context cleared'));
  /* refused (403): nothing is lost */
  c.SCR.cache['T-1'].can.requestAi = true; c.scrCtxNote('T-1', { value: 'Keep me' }); c.__answer = () => new Error('You don\'t have permission to do that');
  c.scrCtxSend('T-1'); await new Promise(r => setTimeout(r, 0)); await new Promise(r => setTimeout(r, 0));
  assert.equal(c.scrCtxCur(tk).note, 'Keep me'); assert.equal(c.SCR.ctx.busy['T-1'], undefined);
});
test('the team\'s context: saved corrections, similar tasks, read-only, hidden; before → now kept in the view; in Indonesian', () => {
  const { c, tk, ai, on, sug, ctx } = ctxPanel();
  const card = () => c.scrAiCardHtml(tk, 'hours', c.scrCan(tk, 'hours'), false), box = () => c.scrCtxHtml(tk);
  ai().context = ctx({ note: 'Line one\nline two <b>', by: 'u1', byName: 'Ayu Lestari', at: '2026-10-19T08:00:00.000Z',
    checks: [{ a: '1 revision round', ok: false, fix: 'three rounds' }, { a: 'Stock photos are fine', ok: false, fix: 'shoot needed' }, { a: 'One size only', ok: true }], similar: [{ id: 'T-7', title: 'Older feed' }, { id: 'T-404', title: 'Not here' }] });
  let h = box();
  /* the checks of no shown assumption are saved corrections, each to be removed */
  assert.match(h, /data-scr-ctx-saved><b>Saved corrections<\/b>/);
  assert.match(h, /“<span data-no-translate>Stock photos are fine<\/span>” — wrong; in fact: <span data-no-translate>shoot needed<\/span>/);
  assert.match(h, /“<span data-no-translate>One size only<\/span>” — right/);
  assert.doesNotMatch(h.slice(h.indexOf('data-scr-ctx-saved'), h.indexOf('</ul>')), /1 revision round/, 'shown with its assumption, not here');
  assert.match(h, /data-scr-key="ctx-rm:1" aria-label="Remove"/);
  assert.match(h, />Line one\nline two &lt;b&gt;<\/textarea>/);
  assert.match(h, /Context from <span data-no-translate>Ayu Lestari<\/span>/);
  /* the similar tasks' notes going with it: links to the tasks there are */
  assert.match(h, /data-scr-ctx-sim="2">\+ 2 notes from similar tasks will be used: <button type="button" class="scr-link" data-scr-sim="T-7" onclick="openTask\(&quot;T-7&quot;\)"><span class="mono">T-7<\/span> <span data-no-translate>Older feed<\/span><\/button>, <span><span class="mono">T-404/);
  ai().context.similar = [{ id: 'T-7', title: 'Older feed' }]; assert.match(box(), /\+ 1 note from a similar task will be used: /);
  assert.match(card(), /data-st="wrong">.*value="three rounds"/, 'the saved correction on its assumption');
  c.scrCtxRemove('T-1', 1); assert.doesNotMatch(box(), /Stock photos/); assert.match(box(), /data-scr-key="ctx-send" onclick=/, 'removed: something to send');
  delete c.SCR.ctx.draft['T-1'];
  /* a long assumption matches its check as the server keeps it (200 characters) */
  const long = 'x'.repeat(230); ai().rows.hours = sug({ assumptions: [long] }); ai().context.checks = [{ a: 'x'.repeat(200), ok: true }];
  assert.match(card(), /data-st="ok"/); assert.doesNotMatch(box(), /Saved corrections/);
  ai().rows.hours = sug(); ai().context.checks = [{ a: '1 revision round', ok: false, fix: 'three rounds' }];
  /* read-only: the context and the marks, no input, no button */
  ai().context.canEdit = false; h = box();
  assert.ok(h.includes('data-scr-ctx="ro"><div class="scr-ctx-head"><b>The team\'s context for the AI</b>'), 'read-only: its own heading');
  assert.match(h, /<p class="scr-ctx-text" data-no-translate>Line one\nline two &lt;b&gt;<\/p>/);
  assert.doesNotMatch(h, /<textarea|<button type="button" class="btn|scr-x/);
  h = card(); assert.match(h, /data-st="wrong"><span data-no-translate>1 revision round<\/span> <span class="scr-asm-mark">✗ Wrong<\/span><span class="scr-asm-fix" data-no-translate>three rounds<\/span>/);
  assert.doesNotMatch(h, /scr-tog|scr-fix/);
  ai().context = ctx({ canEdit: false }); assert.equal(box(), '', 'read-only, nothing saved: nothing');
  ai().context = ctx(); c.canI.editTask = () => false; delete ai().context.canEdit; assert.equal(box(), '', 'no word from the server: the page\'s own rule');
  c.canI.editTask = () => true; assert.match(box(), /data-scr-ctx="edit"/);
  ai().context.canEdit = true;
  /* hidden: external AI processing off, no score asking the AI, an older server without it; and no toggles then */
  ai().external = false; assert.equal(box(), ''); assert.doesNotMatch(card(), /scr-tog/); ai().external = true;
  on.mode = 'math_only'; assert.equal(box(), ''); on.mode = 'hybrid';
  const keep = ai().context; delete ai().context; assert.equal(box(), ''); assert.match(card(), /<li data-no-translate>1 revision round<\/li>/, 'the list as it was'); ai().context = keep;
  ai().rows.hours = null; assert.equal(box(), '', 'no suggestion, nothing saved: nothing yet'); ai().rows.hours = sug();
  /* before → now from the view itself (GET carries previous and contextEffect), as an object or a number; the same value says so */
  ai().rows.hours = sug({ value: 9, previous: { hours: 6, storyPoints: null, weightedPoints: null }, contextEffect: 'Three rounds of revision instead of one.' });
  h = card(); assert.match(h, /Before <b>6 h<\/b> → now <b>9 h<\/b>/); assert.match(h, /data-scr-ai-effect>Because of the team&#39;s context: <span data-no-translate>Three rounds of revision instead of one\.<\/span>/);
  assert.ok(h.indexOf('data-scr-ai-delta') < h.indexOf('scr-ai-text'), 'right under what it suggests');
  ai().rows.hours = sug({ value: 9, previous: 9.2 }); assert.match(card(), /Same as before: <b>9 h<\/b>/); assert.doesNotMatch(card(), /data-scr-ai-effect/);
  ai().rows.hours = sug({ previous: { hours: null } }); assert.doesNotMatch(card(), /data-scr-ai-delta/, 'no earlier suggestion: nothing');
  const st = sug({ module: 'story', value: 8, previous: { hours: 6, storyPoints: 5, weightedPoints: null } }); on.mods = ['hours', 'story']; ai().rows.story = st;
  assert.match(c.scrAiCardHtml(tk, 'story', c.scrCan(tk, 'story'), false), /Before <b>5 SP<\/b> → now <b>8 SP<\/b>/);
  /* in Indonesian, with the placeholders kept */
  c.UI_LANG = 'id'; ai().rows.hours = sug({ value: 9, previous: { hours: 6 }, contextEffect: 'Tiga putaran revisi.' }); ai().context = ctx({ note: 'x', by: 'u1', at: '2026-10-19T08:00:00.000Z', similar: [{ id: 'T-7', title: 'Older feed' }], checks: [{ a: 'Gone', ok: false, fix: 'y' }] });
  h = card(); assert.match(h, /Sebelumnya <b>6 h<\/b> → sekarang <b>9 h<\/b>/); assert.match(h, /Karena konteks tim: /); assert.match(h, />✓ Benar</); assert.match(h, />✗ Salah</);
  h = box(); for (const s of ['Tambah konteks untuk AI', 'AI memakai ini setiap Ask AI di task ini, dan sebagai contoh untuk task serupa.', 'placeholder="Misal: klien ini biasanya minta 3x revisi; foto produk dari klien baru masuk H-2."', '>Kirim & tanya ulang</button>', '>Hapus konteks</button>', 'Konteks dari <span data-no-translate>Ayu</span> · ', '+ 1 catatan dari task serupa ikut dipakai: ', 'Koreksi tersimpan', '” — salah; sebenarnya: '])
    assert.ok(h.includes(s), s);
  const marks = s => (String(s).match(/\{\w+\}/g) || []).sort().join(' ');
  for (const k of ['Before {a} → now {b}', 'Same as before: {v}', 'Context from {name} · {when}', '+ {n} notes from similar tasks will be used', '“{a}” — wrong; in fact: {fix}', 'At most {n} assumptions can be marked'])
    assert.equal(marks(c.UI_ID[k]), marks(k), k + ': the placeholders differ');
  assert.equal(c.UI_ID['✓ Right'], '✓ Benar', 'not "Kanan", the direction');
});

test('the part a document points to: beside its title, what was sent of it, or that it could not be read on its own; a deck or a PDF has its slides or pages to set by hand, saved with the task', async () => {
  const tasks = { 'T-1': { id: 'T-1', meta: {} } }, settings = Settings.normalizeSettings({ ai: { readDocs: true } }), saved = [], toasts = [], loads = [];
  const esc = s => String(s).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[ch]);
  const c = load({ task: id => tasks[id], API: { on: true }, S: { drawerTask: null }, scoringSettings: () => settings, scoringMode: () => 'hybrid', esc, attr: esc, jsq: s => esc(JSON.stringify(String(s))),
    fmt: (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => (o[k] !== undefined ? o[k] : m)), canI: { scoringConfigure: () => true, editTask: () => true },
    taskMeta: t => (t.meta = t.meta || {}), editTaskWith: (t, fn) => { fn(t); saved.push(JSON.parse(JSON.stringify(t.meta))); return Promise.resolve(t); }, toast: (m, k) => toasts.push([m, k || '']) });
  c.scrLoad = tk => loads.push(tk.id);
  const deck = 'https://docs.google.com/presentation/d/SLDAAabcdefghij', sheet = 'https://docs.google.com/spreadsheets/d/SHT1abcdefghij';
  const found = [
    { ref: deck + '#slide=id.p11', kind: 'gslides', title: 'Ramadan plan', status: 'read', chars: 2300, part: { kind: 'slide', label: 'slide 12', from: 12, to: 12, of: 40, resolved: true, also: [{ role: 'continues', n: 13 }, { role: 'continues', n: 14 }, { role: 'heading', n: 11 }, { role: 'general', n: 2 }] } },
    { ref: deck + '#slide=id.gone', kind: 'gslides', title: 'Old plan', status: 'read', chars: 0, reason: 'part_not_found', part: { kind: 'slide', label: 'slide id.gone', resolved: false } },
    { ref: 'file:f1#page=2-4', kind: 'file', title: 'Spec.pdf', status: 'ready', part: { kind: 'page', label: 'pages 2–4', from: 2, to: 4, resolved: false } },
    { ref: sheet + '#gid=123', kind: 'gsheet', title: 'Sizes', status: 'read', chars: 300, part: { kind: 'sheet', label: 'tab gid 123', resolved: true } },
    { ref: sheet + '#range=A1:C20', kind: 'gsheet', title: 'Plan', status: 'read', chars: 90, cut: true, reason: 'budget', part: { kind: 'range', label: 'A1:C20', resolved: true } },
    { ref: 'https://docs.google.com/document/d/DOC1abcdefghij', kind: 'gdoc', title: 'Brief', status: 'read', chars: 500 }
  ];
  c.SCR.cache['T-1'] = { rows: {}, at: 100, ai: { external: true, docs: { on: true, allowed: true, canToggle: true, charsLimit: 15000, found } } };
  const html = () => c.scrDocsHtml(tasks['T-1'], ['hours']);
  const chip = (h, ref) => { const at = h.indexOf('data-scr-doc="' + esc(ref) + '"'); return at < 0 ? null : h.slice(at, h.indexOf('</li>', at)); };
  const piece = (x, cls) => { const at = x.indexOf('class="' + cls + '">'); return at < 0 ? null : x.slice(at + cls.length + 9, x.indexOf('</span>', at)); };
  const field = x => { const m = /<input[^>]*data-scr-doc-parts="([^"]*)"[^>]*>/.exec(x); return m ? { ref: m[1], value: (/value="([^"]*)"/.exec(m[0]) || [])[1], tag: m[0] } : null; };
  let h = html();
  assert.equal(piece(chip(h, found[0].ref), 'scr-doc-part'), '· slide 12');
  assert.equal(piece(chip(h, found[0].ref), 'scr-doc-st'), 'read: slide 12 (the work) + slides 13–14 (continues) + slide 11 (section heading) + slide 2 (general) of 40 · 2,300 characters');
  assert.equal(piece(chip(h, found[1].ref), 'scr-doc-part'), '· one slide');
  assert.equal(piece(chip(h, found[1].ref), 'scr-doc-st'), 'points to one slide; not sent: it could not be read on its own · not found in it');
  assert.match(chip(h, found[1].ref), /data-resolved="false"/);
  assert.equal(piece(chip(h, found[2].ref), 'scr-doc-part'), '· pages 2–4'); assert.equal(piece(chip(h, found[2].ref), 'scr-doc-st'), 'read when the AI is asked', 'not read yet: nothing said about whether it could be');
  assert.equal(piece(chip(h, found[3].ref), 'scr-doc-part'), '· sheet tab'); assert.equal(piece(chip(h, found[3].ref), 'scr-doc-st'), 'read: sheet tab (the work) · 300 characters');
  assert.equal(piece(chip(h, found[4].ref), 'scr-doc-part'), '· range A1:C20'); assert.equal(piece(chip(h, found[4].ref), 'scr-doc-st'), 'read: range A1:C20 (the work) · 90 characters · cut to fit');
  assert.equal(piece(chip(h, found[5].ref), 'scr-doc-part'), null, 'a document with no part as before'); assert.equal(piece(chip(h, found[5].ref), 'scr-doc-st'), 'read · 500 characters');
  /* the slides or pages to set: for decks and PDFs only, filled from what was found, keyed by the document without its part */
  assert.deepEqual([field(chip(h, found[0].ref)).ref, field(chip(h, found[0].ref)).value], [deck, '12']);
  assert.deepEqual([field(chip(h, found[2].ref)).ref, field(chip(h, found[2].ref)).value], ['file:f1', '2–4']);
  assert.equal(field(chip(h, found[1].ref)).value, '', 'nothing found: empty, to be set');
  assert.equal(field(chip(h, found[3].ref)), null); assert.equal(field(chip(h, found[5].ref)), null);
  assert.match(field(chip(h, found[0].ref)).tag, /onchange="scrDocParts\(&quot;T-1&quot;,&quot;https:\/\/docs\.google\.com\/presentation\/d\/SLDAAabcdefghij&quot;,this\.value\)"/, 'jsq() for the strings in the handler');
  assert.match(chip(h, found[0].ref), /<label class="scr-doc-parts">Slides\/pages:<input/);
  /* in Indonesian */
  c.UI_LANG = 'id'; h = html();
  assert.equal(piece(chip(h, found[0].ref), 'scr-doc-st'), 'terbaca: slide 12 (dikerjakan) + slide 13–14 (lanjutan) + slide 11 (judul bagian) + slide 2 (umum) dari 40 · 2.300 karakter');
  assert.equal(piece(chip(h, found[1].ref), 'scr-doc-st'), 'menunjuk satu slide; tidak dikirim: tidak bisa dibaca tersendiri · tidak ditemukan di dalamnya');
  assert.equal(piece(chip(h, found[2].ref), 'scr-doc-part'), '· hal. 2–4'); assert.equal(piece(chip(h, found[3].ref), 'scr-doc-part'), '· tab sheet'); assert.equal(piece(chip(h, found[4].ref), 'scr-doc-part'), '· rentang A1:C20');
  assert.match(chip(h, found[0].ref), /<label class="scr-doc-parts">Slide\/halaman:<input[^>]*placeholder="mis\. 12–13"/);
  c.UI_LANG = 'en';
  /* set by hand: saved with the task as numbers and ranges, the view read again; cleared: back to the link */
  await c.scrDocParts('T-1', deck, ' 12 – 13, 15 ');
  assert.deepEqual(saved.pop(), { aiDocParts: { [deck]: '12-13,15' } }); assert.deepEqual(loads, ['T-1']);
  assert.equal(field(chip(html(), found[0].ref)).value, '12–13, 15', 'what was set shows, over what was found');
  await c.scrDocParts('T-1', deck, '12-13,15'); assert.equal(saved.length, 0, 'the same again: not saved');
  await c.scrDocParts('T-1', deck, 'slide five');
  assert.equal(saved.length, 0); assert.deepEqual(toasts.pop(), ['Use slide or page numbers, such as 12–13 or 3, 5 (at most 20, up to 999)', 'bad']);
  for (const v of ['0', '1000', '1-21', '8-3']) { await c.scrDocParts('T-1', deck, v); assert.equal(saved.length, 0, v); }
  tasks['T-1'].meta.aiDocParts = { 'file:a': '1', 'file:b': '1', 'file:c': '1', 'file:d': '1', [deck]: '12' };
  await c.scrDocParts('T-1', 'file:e', '3'); assert.equal(saved.length, 0, 'five documents at most'); assert.match(toasts.pop()[0], /at most 5 documents/);
  await c.scrDocParts('T-1', deck, '');
  assert.deepEqual(saved.pop(), { aiDocParts: { 'file:a': '1', 'file:b': '1', 'file:c': '1', 'file:d': '1' } });
  tasks['T-1'].meta = { aiDocParts: { [deck]: '4' } }; await c.scrDocParts('T-1', deck, ' ');
  assert.deepEqual(saved.pop(), {}, 'the last one cleared: no key left');
  /* left out, or not to be changed: the field cannot be used */
  tasks['T-1'].meta = { aiReadDocs: false };
  assert.match(field(chip(html(), found[0].ref)).tag, / disabled/);
  tasks['T-1'].meta = {}; c.SCR.cache['T-1'].ai.docs.canToggle = false;
  assert.match(field(chip(html(), found[0].ref)).tag, / disabled/);
  /* every word of it has its Indonesian */
  Object.values(c.SCR_DOC_ROLE).forEach(v => assert.ok(v in c.UI_ID, v));
  ['slide {n}', 'slides {n}', 'page {n}', 'pages {n}', 'one slide', 'one page', 'one range', 'one section', 'sheet tab', 'range {r}', '{parts} of {of}', 'read: {parts}', '{n} characters'].forEach(v => assert.ok(v in c.UI_ID, v));
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
