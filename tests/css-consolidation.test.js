/* The CSS made cheaper and smaller without changing a pixel (performance stage 3, Oct 2026):
   - select mode's highlight keys on .bulk-selected, a class bulkMark (src/enhance.js) sets with the tick, in place of
     tr:has(.bulk-check input:checked), which had every DOM change on the page (a task panel tab switch beside the
     1,577-task List) check every row again;
   - no declaration is written where a later rule with the very same selector (same @media) declares it again: the
     earlier one could never win (hundreds were left from the layered files);
   - no rule is kept for a class or id the page's code never writes.
   Each change was checked with a computed-style snapshot of 54 scenes at 1366 and 390 px in light and dark: identical.
   In the browser: e2e/bulk-selected.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const ROOT = path.join(__dirname, '..');
const SRC = p => fs.readFileSync(path.join(ROOT, 'src', p), 'utf8').replace(/\r\n/g, '\n');
const FILES = ['head.html', 'refinements.css', 'v18.css', 'responsive.css', 'v38.css'];
const cssOf = f => { const s = SRC(f); return f === 'head.html' ? s.slice(s.indexOf('<style>') + 7, s.indexOf('</style>')) : s; };

/* a small CSS reader: rules with their selectors, declarations and @media/@supports/@container chain, in order */
function rulesOf(css) {
  const out = []; css = css.replace(/\/\*[\s\S]*?\*\//g, m => ' '.repeat(m.length));
  const skipStr = (i, q) => { i++; while (i < css.length && css[i] !== q) { if (css[i] === '\\') i++; i++; } return i + 1; };
  const scan = (i, stops) => { let d = 0; while (i < css.length) { const c = css[i]; if (c === '"' || c === "'") { i = skipStr(i, c); continue; } if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; else if (!d && stops.includes(c)) return i; i++; } return i; };
  const close = i => { let d = 0; while (i < css.length) { const c = css[i]; if (c === '"' || c === "'") { i = skipStr(i, c); continue; } if (c === '{') d++; else if (c === '}' && !--d) return i; i++; } return i; };
  const split = (t, sep) => { const o = []; let d = 0, cur = ''; for (const c of t) { if (c === '(' || c === '[') d++; else if (c === ')' || c === ']') d--; if (c === sep && !d) { o.push(cur); cur = ''; } else cur += c; } o.push(cur); return o; };
  const norm = s => s.replace(/\s+/g, ' ').replace(/\s*([>+~,])\s*/g, '$1').trim();
  (function walk(a, b, ctx) {
    let i = a;
    while (i < b) {
      while (i < b && /\s/.test(css[i])) i++; if (i >= b) break;
      if (css[i] === '@') { const s = scan(i, '{;'); const pre = css.slice(i, s).replace(/\s+/g, ''); if (css[s] === ';') { i = s + 1; continue; } const e = close(s); if (/^@(media|supports|container)/.test(pre)) walk(s + 1, e, ctx + pre); i = e + 1; continue; }
      const o = scan(i, '{'); if (o >= b) break; const e = close(o);
      const decls = split(css.slice(o + 1, e), ';').map(x => { const k = x.indexOf(':'); if (k < 0) return null; let v = x.slice(k + 1).trim(); const imp = /!\s*important\s*$/i.test(v); return { name: x.slice(0, k).trim().toLowerCase(), imp }; }).filter(x => x && x.name);
      out.push({ sels: split(css.slice(i, o), ',').map(norm).filter(Boolean), ctx, decls });
      i = e + 1;
    }
  })(0, css.length, '');
  return out;
}
const ALL = () => FILES.flatMap(f => rulesOf(cssOf(f)).map(r => Object.assign(r, { f })));

test('select mode: the highlight keys on .bulk-selected, set with the tick, not on :has(.bulk-check input:checked)', () => {
  const sels = ALL().flatMap(r => r.sels);
  assert.deepEqual(sels.filter(s => /:has\([^)]*(bulk-check|:checked)/.test(s) && /bulk/.test(s)), []);
  for (const s of ['.kcard.bulk-selectable.bulk-selected', '.tbl tr.bulk-selectable.bulk-selected>td', '.row.bulk-selectable.bulk-selected', 'table.tbl.lcol-tbl tr.bulk-selectable.bulk-selected', 'table.tbl.lcol-tbl tr.bulk-selectable.bulk-selected>td'])
    assert.ok(sels.includes(s), s);
  const enh = SRC('enhance.js'), tasks = SRC('tasks.js');
  assert.match(enh, /function bulkMark\(cb\)\{ var host=cb&&cb\.closest&&cb\.closest\("\.bulk-selectable"\); if\(host\) host\.classList\.toggle\("bulk-selected",!!cb\.checked\); \}/);
  /* every place a box's tick changes: its change (and the same task's other boxes), the rows drawn again, Select all */
  assert.match(enh, /forEach\(function\(x\)\{x\.checked=e\.target\.checked; bulkMark\(x\);\}\); bulkBar\(\); \}\); el\.classList\.add\("bulk-selectable"\); if\(ENH\.bulkSel\[id\]\) el\.classList\.add\("bulk-selected"\);/);
  assert.match(enh, /x\.classList\.remove\("bulk-selectable","bulk-selected"\)/);
  assert.match(tasks, /function bulkSelectAll\(\)\{ document\.querySelectorAll\("\.bulk-check input\[data-bulk-id\]"\)\.forEach\(function\(c\)\{ c\.checked=true; bulkMark\(c\);/);
  /* bulkMark itself */
  const fn = enh.match(/function bulkMark\(cb\)\{[^\n]*\}/)[0];
  const c = vm.createContext({}); vm.runInContext(fn, c);
  const host = { cls: new Set(), classList: { toggle(k, on) { if (on) host.cls.add(k); else host.cls.delete(k); } } };
  const box = checked => ({ checked, closest: s => (s === '.bulk-selectable' ? host : null) });
  c.bulkMark(box(true)); assert.ok(host.cls.has('bulk-selected'));
  c.bulkMark(box(false)); assert.ok(!host.cls.has('bulk-selected'));
  c.bulkMark({ checked: true, closest: () => null }); c.bulkMark(null);
});

test('the phone layouts key on classes the page draws, not on :has(): the List cards, the task rows, the label rows', () => {
  const css = FILES.map(cssOf).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  /* each had a subject that any change could reach (> *, :nth-child, td): with them a task panel tab switch beside
     the List restyled the whole screen on a phone (41 ms at 1x with 1,577 tasks, 4 ms without) */
  assert.doesNotMatch(css, /\.tbl:has\(td\.tcheck-col\)|\.tbl-wrap:has\(td\.tcheck-col\)|:not\(:has\(>\s*\.meta-grid\)\)|\.stage-edit:has\(>\s*input\[onchange/);
  /* the same elements, the same specificity: table.tbl.lcol-tbl (0,2,1) for .tbl:has(td.tcheck-col), div.tbl-wrap.lcol-wrap
     (0,2,1), .row.task-row.task-row-cells (0,3,0) for .row.task-row:not(:has(>.meta-grid)), div.stage-edit.label-edit (0,2,1) */
  const r = SRC('responsive.css');
  assert.ok((r.match(/table\.tbl\.lcol-tbl/g) || []).length >= 35);
  assert.ok((r.match(/\.row\.task-row\.task-row-cells/g) || []).length >= 19);
  assert.match(r, /div\.tbl-wrap\.lcol-wrap \{\s*overflow: visible;/);
  assert.match(SRC('v38.css'), /div\.stage-edit\.label-edit\{grid-template-columns:minmax\(0,1fr\) auto!important;row-gap:8px\}/);
  /* where they are drawn: the List is only drawn with rows (an empty one is a message), every row has its check cell */
  const tasks = SRC('tasks.js');
  assert.match(tasks, /if \(!list\.length\) return '<div class="panel">'\+emptyBox\(/);
  assert.match(tasks, /return '<div class="panel"><div class="tbl-wrap lcol-wrap"><table class="tbl tbl-fixed lcol-tbl'/);
  assert.match(tasks, /<td class="tcheck-col" onclick="event\.stopPropagation\(\)">'\+taskCheckBtn\(x\.id\)\+'<\/td>/);
  assert.match(SRC('core.js'), /var head='<div class="row task-row'\+\(opts\.fixedMeta\?'':' task-row-cells'\)\+/);
  assert.match(SRC('core.js'), /if\(opts\.fixedMeta\)\{[\s\S]{0,900}'<div class="r meta-grid">'/);
  assert.match(SRC('settings.js'), /'<div class="stage-edit label-edit" style="grid-template-columns:minmax\(0,1fr\) 150px 90px auto">'\s*\+ '<input '\+\(ed\?"":"disabled"\)\+' value="'\+attr\(l\.name\)\+'" onchange="renameLabel\(/);
  /* and no :has() rule left whose subject is "*" or a bare position (":nth-child(2)") anywhere after it */
  const bad = ALL().flatMap(x => x.sels).filter(s => { if (!/:has\(/.test(s)) return false; let d = 0, cur = '', last = ''; for (const ch of s) { if (ch === '(') d++; else if (ch === ')') d--; if (!d && /[\s>+~]/.test(ch)) { if (cur) last = cur; cur = ''; } else cur += ch; } if (cur) last = cur; return /^\*|^:(nth-|first-child|last-child|only-child)/.test(last); });
  assert.deepEqual(bad, []);
});

test('no declaration that can never win: none is declared again, at the same or a higher importance, by a later rule with the very same selector in the same or a wider @media', () => {
  const rules = ALL();
  assert.ok(rules.length > 4000, 'the CSS was read (' + rules.length + ' rules)');
  const bySel = new Map(); rules.forEach((r, i) => { r.i = i; r.sels.forEach(s => { if (!bySel.has(s)) bySel.set(s, []); bySel.get(s).push(r); }); });
  /* x applies wherever r does: no at-rule, the same chain, or a width-only @media whose range holds r's */
  const range = c => { const m = /^@media((?:\((?:min|max)-width:[\d.]+px\)(?:and)?)+)$/.exec(c); if (!m) return null; const o = { min: 0, max: Infinity }; for (const x of m[1].matchAll(/\((min|max)-width:([\d.]+)px\)/g)) { if (x[1] === 'min') o.min = Math.max(o.min, +x[2]); else o.max = Math.min(o.max, +x[2]); } return o; };
  const covers = (x, r) => { if (x.ctx === '' || x.ctx === r.ctx) return true; const a = range(x.ctx), b = range(r.ctx); return !!(a && b && a.min <= b.min && a.max >= b.max); };
  /* the task panel's Due field is being reworked on its own (Oct 2026): its rules are left to that change */
  const HANDS_OFF = new Set(['.task-date-read', '.due-day', '.task-date-read .due']);
  const dead = [];
  for (const r of rules) for (const d of r.decls) {
    if (/^-(webkit|moz|ms|o)-/.test(d.name) || r.sels.some(s => HANDS_OFF.has(s))) continue;
    const beaten = r.sels.every(s => (bySel.get(s) || []).some(x => x !== r && covers(x, r) && x.decls.some(d2 => d2.name === d.name && (x.i > r.i ? d2.imp >= d.imp : d2.imp && !d.imp))));
    if (beaten) dead.push(r.f + ' ' + (r.ctx || '') + ' ' + r.sels.join(',') + ' { ' + d.name + ' }');
  }
  assert.deepEqual(dead, []);
});

test('no rule for a class nothing draws (features that were removed: the AI generation history, the Drive quick steps, the dashboard drag handles, the gear radio…)', () => {
  const css = FILES.map(cssOf).join('\n').replace(/\/\*[\s\S]*?\*\//g, '');
  for (const k of ['ai-history-copy', 'ai-history-current', 'ai-history-item', 'ai-history-list', 'ai-history-actions', 'ai-generation-history', 'ai-canvas-hint', 'drive-quick-steps', 'drive-sq', 'dhandle', 'dwide', 'gear-radio', 'gear-check', 'ag-quota-pill', 'sticky-save', 'ai-setup-notice', 'zc-pending-banner', 'zc-pending-names', 'zc-readonly', 'exm-all', 'report-slide-actions', 'label-chip', 'g-1-2', 'g-3-2'])
    assert.ok(!new RegExp('[.#]' + k.replace(/[-]/g, '\\-') + (k.endsWith('-') ? '' : '(?![\\w-])')).test(css), k);
});
