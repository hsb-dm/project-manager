/* The task panel over a big List, made cheap (performance stage 1, Oct 2026), checked as the page runs it:
   - no :has() rule whose subject is "*" (".content:has(>.ai-studio)>*" restyled the whole screen on every change in the
     task panel: about 200 ms a tab switch with 1,577 tasks); the AI Hub's desktop layout keys on .ai-hub-page instead,
     set exactly while #content has the Hub's .ai-studio as a child (aiHubPageSync, src/ai.js), and the floating buttons
     hide by body.aichat-open in place of body:has(.aichat.open);
   - the screen is its own stacking context (isolation), except on Messages, so typing in the task panel no longer
     repaints the List;
   - markRead draws the menu again only when something was unread (every task opened calls it);
   - the Scoring & Intelligence panel draws from its cache and asks again in the background, drawing the answer only
     when it differs; folded, its body is not built;
   - the KPI/OKR row of the task open in the panel is asked for once each time it is opened, and on a live change to it.
   In the browser: e2e/drawer-perf.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const SRC = p => fs.readFileSync(path.join(__dirname, '..', 'src', p), 'utf8');
const script = p => { const s = SRC(p); return s.slice(s.indexOf('<script>') + 8, s.lastIndexOf('</script>')); };

/* every selector of the page's CSS: the style sheets and the <style> blocks the scripts carry */
function selectors() {
  const files = fs.readdirSync(path.join(__dirname, '..', 'src')).filter(f => /\.(css|html|js)$/.test(f));
  const out = [];
  for (const f of files) {
    let css = SRC(f);
    if (!/\.css$/.test(f)) css = [...css.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map(m => m[1]).join('\n') + [...css.matchAll(/textContent\s*=\s*(["'])((?:\\.|(?!\1).)*)\1/g)].map(m => m[2]).join('\n');
    css = css.replace(/\/\*[\s\S]*?\*\//g, '');
    for (const m of css.matchAll(/([^{}]+)\{/g)) {
      const list = m[1].trim(); if (!list || /^@/.test(list)) continue;
      let depth = 0, cur = '';
      for (const ch of list) { if (ch === '(') depth++; if (ch === ')') depth--; if (ch === ',' && !depth) { out.push({ f, sel: cur.trim() }); cur = ''; } else cur += ch; }
      if (cur.trim()) out.push({ f, sel: cur.trim() });
    }
  }
  return out;
}
/* a selector's compounds, outside parentheses: ".a:has(>.b) > *" → [".a:has(>.b)", "*"] */
function compounds(sel) { const out = []; let depth = 0, cur = ''; for (const ch of sel) { if (ch === '(') depth++; else if (ch === ')') depth--; if (!depth && /[\s>+~]/.test(ch)) { if (cur) out.push(cur); cur = ''; } else cur += ch; } if (cur) out.push(cur); return out; }
const subject = sel => compounds(sel).pop() || '';

test('no :has() rule makes every child of what it tests its subject (":has(…) > *")', () => {
  const all = selectors();
  assert.ok(all.length > 3000, 'the CSS was read (' + all.length + ' selectors)');
  const bad = all.filter(x => { const c = compounds(x.sel); return c.length > 1 && /^\*(?:::?[\w-]+)?$/.test(c[c.length - 1]) && /:has\(/.test(c[c.length - 2]); });
  assert.deepEqual(bad.map(x => x.f + ': ' + x.sel), []);
  /* the AI Hub's desktop layout: the same three rules, on the class, with the same specificity */
  const v38 = SRC('v38.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(v38, /:has\(\s*>\s*\.ai-studio\)/);
  assert.match(v38, /@media \(min-width:1181px\) and \(min-height:620px\)\{\s*\.content\.ai-hub-page\{height:calc\(100dvh - var\(--topbar-h\)\);[^}]*overflow:hidden;display:flex;flex-direction:column;gap:12px\}\s*\.content\.ai-hub-page>\*\{flex:none;margin-top:0;margin-bottom:0\}\s*\.content\.ai-hub-page>\.ai-studio\{flex:1 1 auto;min-height:0;align-items:stretch;grid-template-rows:minmax\(0,1fr\)\}/);
  /* the floating buttons: by a class of the body, not by searching the page for the open AI panel */
  assert.deepEqual(all.filter(x => /:has\(\.aichat/.test(x.sel)).map(x => x.f + ': ' + x.sel), []);
  assert.match(SRC('head.html'), /body\.aichat-open \.aifab\{display:none\}/);
  assert.match(SRC('v18.css'), /body\.auth \.msgfab,body\.aichat-open \.msgfab\{display:none!important\}/);
  assert.match(SRC('ai.js'), /document\.body\.classList\.toggle\("aichat-open", !!el && !!AI_CHAT\.open\);\s*if \(!el\) return;/);
});

test('the screen behind the task panel is its own stacking context, except on Messages', () => {
  const css = SRC('refinements.css').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.match(css, /(^|[}\s])body:not\(\[data-screen="messages"\]\) #content\{isolation:isolate\}/);
  /* nothing that would move a fixed menu or clip a popover: no transform, will-change or contain on the screen */
  const onContent = selectors().filter(x => /(^|[\s>])(#content|\.content|#appScroll|\.app-scroll|#appShell|\.app-shell)$/.test(subject(x.sel)));
  const decl = new Set(); for (const f of ['head.html', 'refinements.css', 'v18.css', 'responsive.css', 'v38.css']) for (const m of SRC(f).replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^{}]*)\}/g)) { if (m[1].split(',').some(s => onContent.some(o => o.sel === s.trim()))) decl.add(m[2]); }
  assert.ok(decl.size > 3, 'the rules on the screen were read');
  for (const d of decl) assert.doesNotMatch(d, /(^|;)\s*(will-change|contain|transform|filter|perspective)\s*:/, 'nothing that makes #content a containing block: ' + d);
});

test('the AI Hub layout class is on #content exactly while .ai-studio is one of its children', () => {
  const js = script('ai.js'), at = js.indexOf('function aiHubPageSync(');
  assert.ok(at > 0, 'aiHubPageSync is there');
  const fn = js.slice(at, js.indexOf('\n(function(){', at));
  const cls = new Set(), content = { children: [], classList: { contains: k => cls.has(k), toggle: (k, on) => { if (on) cls.add(k); else cls.delete(k); } } };
  const kid = c => ({ classList: { contains: k => k === c } });
  const c = { document: { getElementById: id => id === 'content' ? content : null } }; vm.createContext(c); vm.runInContext(fn, c);
  content.children = [kid('pagehead'), kid('ai-studio')]; c.aiHubPageSync(); assert.ok(cls.has('ai-hub-page'), 'the Hub is drawn');
  content.children = [kid('pagehead'), kid('panel')]; c.aiHubPageSync(); assert.ok(!cls.has('ai-hub-page'), 'a search or another screen took its place');
  content.children = [kid('authwrap')]; c.aiHubPageSync(); assert.ok(!cls.has('ai-hub-page'));
  /* the Hub sets it as it draws, and #content's children are watched for every other way out */
  assert.match(js, /document\.getElementById\("content"\)\.innerHTML=h; aiHubPageSync\(\);/);
  assert.match(js, /new MutationObserver\(aiHubPageSync\)\.observe\(c,\{childList:true\}\)/);
});

test('opening a task draws the menu again only when one of its notifications was unread', () => {
  const core = SRC('core.js'), at = core.indexOf('function markRead(t)');
  const calls = { nav: 0, dot: 0, post: [] };
  const c = { NOTIFS: [{ t: 'T-1', read: true }, { t: 'T-2', read: false }, { t: 'T-2', read: false }], API: { on: true },
    syncNotifDot: () => calls.dot++, renderNav: () => calls.nav++, apiFetch: (m, p, b) => { calls.post.push(b.entityId); return Promise.resolve({}); } };
  vm.createContext(c); vm.runInContext(core.slice(at, core.indexOf('\n', at)), c);
  c.markRead('T-1'); c.markRead('T-9');
  assert.equal(calls.nav, 0, 'nothing unread: the menu is not drawn again');
  assert.deepEqual(calls.post, []);
  c.markRead('T-2');
  assert.equal(calls.nav, 1); assert.deepEqual(calls.post, ['T-2']); assert.ok(c.NOTIFS.every(n => n.read));
  c.markRead('T-2'); assert.equal(calls.nav, 1, 'read already');
  assert.equal(calls.dot, 4, 'the badge is checked each time, as before');
});

/* src/scoring-panel.js, run as the page runs it (as tests/scoring-panel.test.js does) */
function panel(over) {
  const Engine = require('../shared/scoring-engine.js'), Settings = require('../shared/scoring-settings.js');
  const c = Object.assign({ UI_ID: {}, UI_LANG: 'en', console, ScoringEngine: Engine, ScoringSettings: Settings, I: { lock: '', gauge: '', chevd: '', clock: '', sparkle: '' } }, over || {});
  c.tr = s => s; c.window = c; vm.createContext(c); vm.runInContext(script('scoring-panel.js'), c); return c;
}
const flush = () => new Promise(r => setImmediate(r));
test('the scoring panel is drawn from its cache and asked for again in the background; the same answer draws nothing again', async () => {
  const tasks = { 'T-1': { id: 'T-1', effort: 3, assetCount: 5 } };
  let answer = { taskId: 'T-1', rows: { hours: { value: 6, status: 'draft', rev: 3 } }, audit: [], can: { edit: true } }, gets = 0;
  const c = panel({ task: id => tasks[id], API: { on: true }, assetCount: t => +t.assetCount || 0, scoringModuleOn: () => true,
    apiFetch: (m, p) => { if (m === 'GET') gets++; return Promise.resolve(JSON.parse(JSON.stringify(answer))); } });
  let paints = 0; c.scrPaint = () => { paints++; };
  await c.scrLoad(tasks['T-1']); await flush();
  assert.equal(gets, 1); assert.equal(paints, 1, 'the first answer is drawn');
  assert.equal(c.SCR.cache['T-1'].rows.hours.finalValue, 6);
  /* the task opened again: the same answer — nothing is drawn again */
  await c.scrLoad(tasks['T-1']); await flush();
  assert.equal(gets, 2, 'asked again in the background'); assert.equal(paints, 1, 'the same answer draws nothing');
  /* someone changed it: only then the panel is drawn again */
  answer = Object.assign({}, answer, { rows: { hours: { value: 8, status: 'draft', rev: 4 } } });
  await c.scrLoad(tasks['T-1']); await flush();
  assert.equal(paints, 2); assert.equal(c.SCR.cache['T-1'].rows.hours.finalValue, 8); assert.equal(tasks['T-1'].scoring.hours.finalValue, 8);
  /* a write answered with the whole view: the next answer is drawn even if it equals the one before the write */
  c.scrStore('T-1', { rows: { hours: { value: 9, status: 'draft', rev: 5 } } });
  answer = Object.assign({}, answer, { rows: { hours: { value: 9, status: 'draft', rev: 5 } } });
  await c.scrLoad(tasks['T-1']); await flush(); assert.equal(paints, 3);
  await c.scrLoad(tasks['T-1']); await flush(); assert.equal(paints, 3);
  /* a failed ask, then the same answer: drawn, so the error line goes */
  const ok = c.apiFetch; c.apiFetch = () => Promise.reject(new Error('offline'));
  await c.scrLoad(tasks['T-1']); await flush(); assert.equal(paints, 4); assert.ok(c.SCR.err['T-1']);
  c.apiFetch = ok; await c.scrLoad(tasks['T-1']); await flush(); assert.equal(paints, 5); assert.ok(!c.SCR.err['T-1']);
});

test('folded, the scoring panel does not build its body (nor the rows other modules add to it)', () => {
  const tasks = { 'T-1': { id: 'T-1', effort: 3, assetCount: 5 } }, prefs = { scoringPanelOpen: false };
  const c = panel({ task: id => tasks[id], API: { on: true }, assetCount: t => +t.assetCount || 0, scoringModuleOn: () => true, myPrefs: () => prefs, attr: s => String(s) });
  let built = 0; c.scrBodyHtml = () => { built++; return '<div class="scr-row">rows</div>'; };
  const folded = c.scrPanelHtml(tasks['T-1'], '');
  assert.equal(built, 0); assert.match(folded, /<div class="scr-body"><\/div><\/section>$/); assert.doesNotMatch(folded, /scr-panel open/);
  prefs.scoringPanelOpen = true;
  const open = c.scrPanelHtml(tasks['T-1'], '');
  assert.equal(built, 1); assert.match(open, /<div class="scr-body"><div class="scr-row">rows<\/div><\/div><\/section>$/); assert.match(open, /scr-panel open/);
  /* the hash covers what is drawn, so the answer's redraw compares like with like */
  const h = s => s.match(/data-scr-h="([^"]+)"/)[1]; assert.notEqual(h(folded), h(open));
});

/* src/scoring-outcomes.js, run as the page runs it */
function outcomes() {
  const st = { gets: 0, now: 1e12, timers: [], es: [] };
  class FakeES { constructor(u) { this.u = u; this.l = []; st.es.push(this); } addEventListener(t, f) { if (t === 'message') this.l.push(f); } }
  class FakeDate extends Date { static now() { return st.now; } }
  const rows = new Set();
  const c = { UI_ID: {}, UI_LANG: 'en', console, I: {}, API: { on: true }, ME: 'u1', S: { drawerTask: null }, Date: FakeDate,
    scoringOn: () => true, scoringModuleOn: () => true, scoringStakeholder: () => false, canI: {}, attr: s => String(s), esc: s => String(s), jsq: s => JSON.stringify(s),
    CSS: { escape: s => s }, closeDrawer: () => { c.S.drawerTask = null; },
    document: { querySelector: sel => { const m = sel.match(/data-out-task="([^"]+)"/); return m && rows.has(m[1]) ? {} : null; }, querySelectorAll: () => [] },
    setTimeout: (f, ms) => { st.timers.push(f); return st.timers.length; }, clearTimeout: () => {},
    apiFetch: (m, p) => { if (m === 'GET' && /\/outcomes$/.test(p)) st.gets++; return Promise.resolve({ items: [], can: {} }); } };
  c.window = c; c.EventSource = FakeES; c.tr = s => s;
  vm.createContext(c); vm.runInContext(script('scoring-outcomes.js'), c);
  const run = () => { const t = st.timers.splice(0); t.forEach(f => f()); };
  const live = id => { const es = new c.EventSource('/api/messages/stream'); es.l.forEach(f => f({ data: JSON.stringify({ type: 'task_changed', id, updatedAt: 'x', by: 'u2' }) })); run(); };
  return { c, st, rows, run, live };
}
test('the KPI/OKR row of the task open in the panel is asked for once each time it is opened, and on a live change', async () => {
  const { c, st, rows, run, live } = outcomes(), tk = { id: 'T-1' };
  c.S.drawerTask = 'T-1';
  c.scoringOutcomesRowHtml(tk); run(); await flush();
  assert.equal(st.gets, 1, 'asked for as the task is opened');
  rows.add('T-1');
  /* redrawn again and again, long after: nothing more is asked */
  for (let i = 0; i < 3; i++) { st.now += 6000; c.scoringOutcomesRowHtml(tk); run(); await flush(); }
  assert.equal(st.gets, 1, 'a redraw asks nothing');
  /* a colleague's change to the task (or a save of our own): asked again */
  live('T-1'); await flush(); assert.equal(st.gets, 2);
  live('T-2'); await flush(); assert.equal(st.gets, 2, 'another task: nothing');
  /* closed and opened again: asked once more */
  c.closeDrawer(); rows.delete('T-1'); c.S.drawerTask = 'T-1';
  c.scoringOutcomesRowHtml(tk); run(); await flush(); assert.equal(st.gets, 3);
  c.scoringOutcomesRowHtml(tk); run(); await flush(); assert.equal(st.gets, 3);
  /* the panel on another tab when the change comes: asked the next time the row is drawn */
  live('T-1'); await flush(); assert.equal(st.gets, 3);
  c.scoringOutcomesRowHtml(tk); run(); await flush(); assert.equal(st.gets, 4);
  /* a row drawn for a task that is not the one open keeps its own rule: as it appears, then at most every 5 s */
  c.S.drawerTask = 'T-1'; const other = { id: 'T-7' };
  c.scoringOutcomesRowHtml(other); run(); await flush(); assert.equal(st.gets, 5);
  rows.add('T-7'); c.scoringOutcomesRowHtml(other); run(); await flush(); assert.equal(st.gets, 5);
  st.now += 6000; c.scoringOutcomesRowHtml(other); run(); await flush(); assert.equal(st.gets, 6);
});
