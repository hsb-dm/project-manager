/* The sections other modules add to Settings → Smart Scoring (Oct 2026): Asset points (src/scoring-assets.js), KPIs
   and OKRs (src/scoring-outcomes.js), the efficiency bonus (src/scoring-awards.js) and who sees the Teams screen's
   bars (src/scoring-teams.js), drawn as the page draws them, in the tab's file (src/scoring-settings.js) with the
   page's own small helpers. Each shows first what is usually changed, with a plain line and an example, and keeps
   the technical fields under a closed "Advanced"; every setting is still there with the path it is saved under;
   none has a Save button of its own (the tab has one Save bar). Drawn by the tab's own section, fold and help line
   (scSection, scAdvanced, scHelp — called directly; the tab is built before them). Every word of
   the asset and KPI/OKR files has its Indonesian. In the browser: e2e/scoring-assets, scoring-outcomes,
   scoring-awards and scoring-teams. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const Engine = require('../shared/scoring-engine.js'), Settings = require('../shared/scoring-settings.js');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, 'src', f), 'utf8');
const script = f => { const s = read(f); return s.slice(s.indexOf('<script>') + 8, s.indexOf('</script>')); };
/* one of the page's one-line helpers, as it is in its file */
const helper = (f, name) => { const line = read(f).split(/\r?\n/).find(l => l.startsWith('function ' + name + '(')); assert.ok(line, name); return line; };
const FILES = ['scoring-settings.js', 'scoring-assets.js', 'scoring-awards.js', 'scoring-teams.js', 'scoring-outcomes.js'];

function page(over) {
  const icons = new Proxy({}, { get: (o, k) => (k in o ? o[k] : ''), set: (o, k, v) => { o[k] = v; return true; } });
  const s = Settings.defaults(); s.enabled = true; s.configVersion = 3;
  const c = Object.assign({ UI_ID: {}, UI_LANG: 'en', console, ScoringEngine: Engine, ScoringSettings: Settings, I: icons, ME: 'admin', PEOPLE: { admin: { name: 'Admin' } },
    API: { on: true, features: { scoring: true } }, WS: { scoring: s, workflow: [{ id: 'done', kind: 'closed', name: 'Done' }, { id: 'declined', kind: 'closed', name: 'Declined' }, { id: 'progress', kind: 'open', name: 'In progress' }] },
    TEAMS: [{ id: 't1', name: 'Design' }], ROLES: [], CAPS: [], SCORING_CAPS: [],
    canI: { scoringConfigure: () => true, scoringViewAnalytics: () => true, scoringManageOutcomes: () => true, manageRoles: () => false },
    document: { getElementById: () => null, querySelector: () => null, querySelectorAll: () => [] }, setTimeout: () => 0 }, over || {});
  c.tr = x => (c.UI_LANG === 'id' ? c.UI_ID[x] || x : x);
  c.clone = o => JSON.parse(JSON.stringify(o));
  c.scoringSettings = () => c.WS.scoring; c.scoringFeature = () => true; c.scoringOn = () => !!c.WS.scoring.enabled;
  c.scoringModuleOn = id => c.scoringOn() && !!(c.WS.scoring.modules[id] && c.WS.scoring.modules[id].on);
  c.person = id => c.PEOPLE[id] || { name: id };
  vm.createContext(c);
  vm.runInContext(['esc', 'attr', 'jsq', 'fmt', 'fieldHtml', 'selectHtml', 'stage', 'locName', 'stageName'].map(n => helper('core.js', n)).concat(helper('settings.js', 'sp')).join('\n'), c);
  for (const f of FILES) vm.runInContext(script(f), c, { filename: f });
  vm.runInContext('SC.owner=ME; SC.draft=clone(scoringSettings()); SC.base=scoringSettings().configVersion;', c);
  c.__real = { scSection: c.scSection, scAdvanced: c.scAdvanced, scHelp: c.scHelp };   /* the tab's own, for a test that draws with them */
  return c;
}
/* the tab's own pieces, as the tab gives them: they say what each section asked for */
function shell(c) {
  const calls = { sections: {}, adv: [], help: [] };
  c.scSection = (id, title, intro, body, opts) => { calls.sections[id] = { title, intro, body, opts: opts || {} }; return '<section data-scs="' + id + '"><h2>' + title + '</h2>' + body + '</section>'; };
  c.scAdvanced = (body, opts) => { calls.adv.push({ body, opts }); return '<details data-adv>' + body + '</details>'; };
  c.scHelp = (text, example) => { calls.help.push([text, example]); return '<p class="help">' + text + (example ? ' Example: ' + example : '') + '</p>'; };
  return calls;
}
const paths = h => [...h.matchAll(/data-sc="([^"]+)"/g)].map(m => m[1]);
const split = h => { const at = h.indexOf('<details'); assert.ok(at > 0, 'an Advanced fold'); return [h.slice(0, at), h.slice(at, h.indexOf('</details>', at))]; };

test('Asset points: the "count before validation" switch and the points of a kind not recognised (each kind\'s own are under Kinds of work); no Save button', () => {
  const c = page();
  let h = c.scoringAssetsSettingsHtml(false, true);
  for (const id of Engine.KIND_IDS) assert.ok(!paths(h).includes('assets.perKind.' + id), id + ': its points are with its row under Kinds of work');
  for (const p of ['assets.unknownKind', 'assets.countUnvalidated']) assert.ok(paths(h).includes(p), p);
  assert.ok(!paths(h).includes('modules.assets.on'), 'the module\'s switch is its card in the tab\'s Overview');
  assert.match(h, /under Kinds of work/);
  assert.match(h, /Example: with a logo at 5 points/);
  assert.doesNotMatch(h, /scSaveClick|<details/);
  /* what the section asks of the tab's pieces: off, it says so and offers to turn the module on */
  const calls = shell(c);
  h = c.scoringAssetsSettingsHtml(false, true);
  const sec = calls.sections.assets;
  assert.equal(sec.title, 'Asset points'); assert.ok(sec.intro && sec.opts.example, 'a plain line and an example');
  assert.equal(sec.opts.onModule, 'assets'); assert.match(sec.opts.off, /Asset points are off/);
  assert.ok(!paths(h).includes('modules.assets.on'), 'the switch is not drawn twice');
  c.SC.draft.modules.assets.on = true;
  c.scoringAssetsSettingsHtml(false, true);
  assert.equal(calls.sections.assets.opts.off, null, 'on: no notice');
  /* read-only: every field disabled */
  h = c.scoringAssetsSettingsHtml(true, false);
  assert.doesNotMatch(h, /oninput=|onclick="scSwitch/);
});

test('Efficiency bonus: the switch, the worked example, the grace and the largest bonus first; the rest of the policy under Advanced; the fixed rules listed', () => {
  const c = page();
  const h = c.scoringBonusSettingsHtml(false, true), [basic, adv] = split(h);
  for (const p of ['bonus.on', 'bonus.grace', 'bonus.maxRate']) assert.ok(paths(basic).includes(p), p + ' in the basic view');
  for (const p of ['bonus.rewardFactor', 'bonus.minE', 'bonus.minA', 'bonus.reviewBelowRatio', 'bonus.materialChangeHours', 'bonus.baseSource', 'bonus.hourMapping.bands.0.0', 'bonus.hourMapping.bands.5.1', 'bonus.requireApprovedVersion'])
    assert.ok(paths(adv).includes(p) && !paths(basic).includes(p), p + ' under Advanced');
  for (const id of ['sceStages', 'scePilot', 'sc_b_minq']) assert.ok(adv.includes('id="' + id + '"'), id + ' under Advanced');
  assert.match(basic, /id="sceExample"[^]*E 8 h, A 5 h, B 8 pts → bonus \+1\.10, earned 9\.10/);
  assert.match(basic, /E = the approved estimate/);
  assert.equal((basic.match(/class="scr-pinned"/g) || []).length, 5, 'the five rules that never change');
  assert.doesNotMatch(h, /scSaveClick/);
  /* the stages are named by the workflow, not "[object Object]" */
  assert.match(adv, /value="done" checked[^>]*> <span>Done<\/span>/); assert.match(adv, /value="declined"(?! checked)[^>]*> <span>Declined<\/span>/);
  /* with the tab's own pieces: the fold is the tab's, holding the same fields */
  const calls = shell(c), h2 = c.scoringBonusSettingsHtml(false, true);
  assert.equal(calls.adv.length, 1); assert.ok(paths(calls.adv[0].body).includes('bonus.rewardFactor'));
  assert.equal(calls.sections.bonus.title, 'Efficiency bonus'); assert.ok(calls.sections.bonus.intro);
  assert.deepEqual(paths(h2).sort(), paths(h).sort(), 'every field, wherever it is drawn');
  /* the offline demo keeps the switch off */
  const d = page({ API: { on: false, features: {} } }).scoringBonusSettingsHtml(false, true);
  assert.match(d, /data-sc="bonus.on" disabled/);
});

test('the bands are drawn again in place when one is added or removed, inside the open fold', () => {
  const el = { innerHTML: '' }, c = page();
  c.document = { getElementById: id => (id === 'sceBands' ? el : null), querySelector: () => null, querySelectorAll: () => [] };
  c.renderScreen = () => { throw new Error('the whole screen is not drawn again'); };
  c.sceBandAdd();
  assert.equal(c.SC.draft.bonus.hourMapping.bands.length, 7); assert.equal(c.SC.dirty, true);
  assert.match(el.innerHTML, /data-band="6"/);
  c.sceBandDel(0);
  assert.equal(c.SC.draft.bonus.hourMapping.bands.length, 6); assert.doesNotMatch(el.innerHTML, /data-band="6"/);
});

test('Teams screen: the two choices as radio cards with their trade-offs, saved under the same path', () => {
  const c = page();
  let h = c.scoringTeamsSettingsHtml(false, true);
  const radios = [...h.matchAll(/<input type="radio"[^>]*>/g)].map(m => m[0]);
  assert.equal(radios.length, 2);
  for (const r of radios) { assert.match(r, /name="sc_tm_bars"/); assert.match(r, /data-sc="teams\.memberBars" data-k="str"/); assert.match(r, /onchange="scInput\(this\)"/); }
  assert.match(radios[0], /value="self_and_leads" data-sc[^>]* checked/); assert.doesNotMatch(radios[1], / checked/);
  assert.match(h, /Recommended[^]*Safer:[^]*Everyone in the workspace[^]*people may compare and rank one another/);
  assert.match(h, /<legend>Who sees each person's bars on Teams<\/legend>/);
  c.SC.draft.teams.memberBars = 'everyone';
  h = c.scoringTeamsSettingsHtml(true, false);
  assert.match(h, /value="everyone"[^>]* checked disabled/);
  const calls = shell(c); c.scoringTeamsSettingsHtml(false, true);
  assert.ok(calls.sections.teams.opts.example, 'an example');
  assert.doesNotMatch(h, /scSaveClick/);
});

test('KPIs and OKRs: the lists in place, saved at once (no Save button); off, the section says so; the editor folds which tasks count, the baseline and the direction', () => {
  const c = page();
  c.WS.scoring.modules.kpi.on = true;
  vm.runInContext('SCO.owner=ME;SCO.data={on:true,objectives:[],metrics:[{id:"m1",kind:"kpi",title:"Approved assets",status:"active",source:"evidence",actual:3,target:10,unit:"assets",baseline:0,direction:"up",period:{},rule:{type:"approved_assets",scope:"matching",filter:{}},progress:{value:0.3,steps:[]}}]}', c);
  let h = c.scoringOutcomesSettingsHtml(false, true);
  assert.match(h, /id="scrOut"[^]*data-metric="m1"/); assert.match(h, /id="scoNewKpi"/);
  assert.match(h, /saved as soon as it is added or changed/);
  assert.match(h, /3 \/ 10 <span data-no-translate>assets<\/span>/);
  assert.match(h, /How this is worked out<\/summary><ul><li>Counts: Approved assets · every task/);
  assert.doesNotMatch(h, /scSaveClick/);
  const calls = shell(c);
  c.scoringOutcomesSettingsHtml(false, true);
  assert.ok(calls.sections.outcomes.opts.example); assert.equal(calls.sections.outcomes.opts.off, undefined);
  c.WS.scoring.modules.kpi.on = false;
  c.scoringOutcomesSettingsHtml(false, true);
  assert.match(calls.sections.outcomes.opts.off, /KPI and OKR are both off/);
  /* the editor */
  let modal = null;
  Object.assign(c, { openModal: (t, body) => { modal = body; }, activeTeams: () => [], liveProjects: () => [], allLabels: () => [], byId: (l, id) => l.find(x => x.id === id) });
  c.WS.scoring.modules.kpi.on = true; Object.assign(c, c.__real);
  c.scoMetricModal('kpi', null, null);
  const [basic, adv] = split(modal);
  for (const id of ['sco_title', 'sco_rule', 'sco_target', 'sco_unit', 'sco_start', 'sco_end', 'sco_owner', 'sco_status', 'sco_desc']) assert.ok(basic.includes('id="' + id + '"'), id + ' first');
  for (const id of ['sco_scope', 'sco_team', 'sco_project', 'sco_label', 'sco_dir', 'sco_base']) assert.ok(adv.includes('id="' + id + '"') && !basic.includes('id="' + id + '"'), id + ' under Advanced');
  assert.doesNotMatch(modal, /<details[^>]* open/, 'a new KPI: closed');
  c.SCO.data.metrics[0].direction = 'down';
  c.scoMetricModal('kpi', 'm1', null);
  assert.match(modal, /<details[^>]* open/, 'one counting down: open, so it is seen');
});

/* every word of a file, in the calls that show it */
function literals(js) {
  const out = new Set(), lit = /"((?:[^"\\]|\\.)*)"/g;
  /* a word compared with (kind==="kpi") is an id, not something shown */
  const take = arg => { for (const m of arg.matchAll(lit)) { if (/[=!]==?\s*$/.test(arg.slice(0, m.index))) continue; const s = JSON.parse('"' + m[1] + '"'); if (/[A-Za-z]/.test(s)) out.add(s); } };
  for (const m of js.matchAll(/\btr\(((?:[^()"]|"(?:[^"\\]|\\.)*")*)\)/g)) take(m[1]);
  for (const m of js.matchAll(/\b(?:openModal|confirmModal)\(((?:[^,"]|"(?:[^"\\]|\\.)*")*),/g)) take(m[1]);
  for (const m of js.matchAll(/\bfieldHtml\("[^"]*","((?:[^"\\]|\\.)*)"/g)) out.add(m[1]);
  for (const m of js.matchAll(/\bscoIconBtn\([^,]*,"((?:[^"\\]|\\.)*)"/g)) out.add(m[1]);
  for (const m of js.matchAll(/\bscoTook\(r,"((?:[^"\\]|\\.)*)"\)/g)) out.add(m[1]);
  for (const m of js.matchAll(/\bscoNumIn\("[^"]*",[^,()]*,"((?:[^"\\]|\\.)*)"\)/g)) out.add(m[1]);
  return out;
}
/* the words the page translates before these files: core.js's, and the Smart Scoring tab's (src/scoring-settings.js) */
function earlierIndonesian(c) {
  read('core.js').split(/\r?\n/).filter(l => /^(var UI_ID=\{|Object\.assign\(UI_ID,\{)/.test(l) && /\}\)?;\s*$/.test(l)).forEach(l => vm.runInContext(l.startsWith('var') ? l.replace(/^var UI_ID=/, 'Object.assign(UI_ID,').replace(/;\s*$/, ');') : l, c));
  const s = read('scoring-settings.js'), head = '(function(d){ Object.keys(d).forEach(function(k){ if(!(k in UI_ID)) UI_ID[k]=d[k]; }); })({', at = s.indexOf(head);
  vm.runInContext(s.slice(at, s.indexOf('});', at + head.length) + 3), c);
}
for (const file of ['scoring-assets.js', 'scoring-outcomes.js']) {
  test('every word of ' + file + ' has its Indonesian, with the same placeholders', () => {
    const js = script(file), c = { UI_ID: {}, UI_LANG: 'en', console, API: { on: false }, I: {} }; c.tr = x => x;
    vm.createContext(c); earlierIndonesian(c); vm.runInContext(js, c);
    const words = literals(js);
    if (file === 'scoring-outcomes.js') for (const map of ['SCO_RULE_LABEL', 'SCO_STATUS_LABEL', 'SCO_WHY', 'SCO_ACTION']) Object.values(vm.runInContext(map, c)).forEach(v => words.add(v));
    assert.ok(words.size > (file === 'scoring-assets.js' ? 20 : 120), 'the words were found (' + words.size + ')');
    const missing = [...words].filter(x => !(x in c.UI_ID));
    assert.deepEqual(missing, [], 'no Indonesian for: ' + missing.join(' | '));
    const marks = x => (String(x).match(/\{\w+\}/g) || []).sort().join(' ');
    for (const x of words) assert.equal(marks(c.UI_ID[x]), marks(x), 'the placeholders differ: ' + x);
  });
}
