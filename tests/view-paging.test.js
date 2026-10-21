/* The List's and the Grid's pages (src/tasks.js, DRAWING ONLY WHAT CAN BE SEEN): 100 rows a page, 25 a group when
   grouped, each group paging on its own; the page kept for that view, sort, filter and group, back to page 1 when one
   of them changes, the last page when the tasks are fewer now; the pager's numbers (seven places at most, a gap for
   those skipped) and its range line in English and Indonesian, numbers written 1,526 / 1.526. Kanban and Timeline
   keep "Show 30 more" as they were. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'tasks.js'), 'utf8');

/* one top-level function's source, by its name (brace matching, quoted strings skipped) */
function fn(name) {
  const m = new RegExp('(^|\\n|[;}] *)function ' + name + '\\(').exec(src); assert.ok(m, 'function ' + name);
  let i = src.indexOf('{', m.index + m[0].length), depth = 0, q = null;
  for (; i < src.length; i++) { const c = src[i];
    if (q) { if (c === '\\') i++; else if (c === q) q = null; continue; }
    if (c === '"' || c === "'") q = c; else if (c === '{') depth++; else if (c === '}' && --depth === 0) break; }
  return src.slice(m.index + m[0].indexOf('function'), i + 1);
}
const NAMES = ['vpageHash', 'vpageViewKey', 'vpageSlot', 'vpageBegin', 'vpageGroup', 'vpageCountText', 'vpageBtnText', 'vpageNum', 'vpagePages',
  'vpageRangeText', 'vpageItems', 'vpageNumsHtml', 'vpagePagerHtml', 'vpageMoreHtml', 'vpageStore', 'vpageKeep', 'vpagePageOf', 'vpageSetPage'];
const vars = src.match(/var VPAGE_SIZE=[^\n]*\n/)[0] + src.match(/var VPAGE=\{[^\n]*\n/)[0];
const words = /\(function\(d\)\{ Object\.keys\(d\)\.forEach\(function\(k\)\{ if\(!\(k in UI_ID\)\) UI_ID\[k\]=d\[k\]; \}\); \}\)\(\{ "Show \{n\} more"[\s\S]*?\}\);/.exec(src);
assert.ok(words, 'the pager words for Indonesian, in src/tasks.js');

function page(lang) {
  const c = { UI_LANG: lang || 'en', UI_ID: {}, S: { screen: 'tasks', projectId: null, teamId: null, taskScope: 'all', sort: 'manual', sortDir: 1, group: '', filters: { status: '', tag: '' } },
    document: { querySelector: () => null }, esc: s => String(s), attr: s => String(s), task: id => ({ id }) };
  c.tr = s => c.UI_LANG === 'id' ? (c.UI_ID[s] || s) : s;
  c.fmt = (s, o) => s.replace(/\{(\w+)\}/g, (m, k) => o[k] !== undefined ? o[k] : m);
  vm.createContext(c);
  vm.runInContext(vars + NAMES.map(fn).join('\n') + '\n' + words[0], c);
  return c;
}
const tasks = n => Array.from({ length: n }, (_, i) => ({ id: 'T-' + (i + 1) }));
const row = t => '<tr data-id="' + t.id + '"></tr>';
const ids = html => (html.match(/data-id="([^"]+)"/g) || []).map(x => x.slice(9, -1));
const items = (c, p, n) => JSON.stringify(c.vpageItems(p, n));

test('100 rows a page; grouped, 25 of each group; one page has no pager', () => {
  const c = page();
  let r = c.vpageBegin('list'), g = c.vpageGroup(r, '', tasks(235), row);
  assert.deepEqual(ids(g.html), tasks(100).map(t => t.id));
  assert.match(c.vpageMoreHtml(g, 'tr', 13), /class="vpage-row vpager-row"[^>]*><td colspan="13"><nav class="vpager" aria-label="Pages">/);
  c.S.group = 'status';
  r = c.vpageBegin('list');
  const a = c.vpageGroup(r, 'g:todo', tasks(205), row), b = c.vpageGroup(r, 'g:done', tasks(25), row);
  assert.equal(ids(a.html).length, 25); assert.equal(ids(b.html).length, 25);
  assert.match(c.vpageMoreHtml(a, 'tr', 13, 'To Do'), /aria-label="Pages: To Do"/);
  assert.equal(c.vpageMoreHtml(b, 'tr', 13, 'Done'), '', 'a group that fits on one page has no pager');
  c.S.group = ''; r = c.vpageBegin('grid');
  assert.equal(ids(c.vpageGroup(r, '', tasks(150), row).html).length, 100, 'the Grid as the List');
});

test('each group keeps its own page; a redraw with the same view, sort, filter and group draws it again', () => {
  const c = page(); c.S.group = 'status';
  let r = c.vpageBegin('list'); c.vpageGroup(r, 'g:todo', tasks(205), row); c.vpageGroup(r, 'g:done', tasks(60), row);
  const R = c.VPAGE.roots[r];
  c.vpageSetPage(R.pkey, 'g:todo', 7); c.vpageSetPage(R.pkey, 'g:done', 2);
  r = c.vpageBegin('list');
  const a = c.vpageGroup(r, 'g:todo', tasks(205), row), b = c.vpageGroup(r, 'g:done', tasks(60), row);
  assert.equal(a.e.page, 7); assert.deepEqual(ids(a.html), tasks(205).slice(150, 175).map(t => t.id));
  assert.equal(b.e.page, 2); assert.deepEqual(ids(b.html), tasks(60).slice(25, 50).map(t => t.id));
  c.vpageSetPage(R.pkey, 'g:done', 1);
  assert.deepEqual(JSON.parse(JSON.stringify(c.S.vpage[R.pkey])), { 'g:todo': 7 }, 'page 1 is not stored');
});

test('another sort, filter, group or scope goes back to page 1; another view or screen does not', () => {
  const c = page();
  const pageNow = () => { const r = c.vpageBegin('list'); return c.vpageGroup(r, '', tasks(300), row).e.page; };
  const go3 = () => { const r = c.vpageBegin('list'); c.vpageSetPage(c.VPAGE.roots[r].pkey, '', 3); };
  pageNow(); go3();
  assert.equal(pageNow(), 3, 'the same List again');
  c.S.sort = 'due'; assert.equal(pageNow(), 1, 'another sort');
  go3(); c.S.sort = 'manual'; assert.equal(pageNow(), 1, 'and back: a change again');
  go3(); c.S.filters.tag = 'x'; assert.equal(pageNow(), 1, 'a filter');
  go3(); c.S.filters.tag = ''; assert.equal(pageNow(), 1, 'the filter taken off');
  go3(); c.S.taskScope = 'mine'; assert.equal(pageNow(), 1, 'the scope');
  go3(); c.S.group = 'status'; c.S.group = ''; assert.equal(pageNow(), 3, 'a group chosen and taken off before a redraw changes nothing');
  /* the Kanban drawn in between, another screen in between: the List comes back on its page */
  c.vpageBegin('kanban'); c.S.screen = 'projects'; c.S.projectId = 'p1'; c.vpageBegin('list'); c.S.screen = 'tasks'; c.S.projectId = null;
  assert.equal(pageNow(), 3);
  /* a refresh: nothing known of the last drawing yet, the stored page is used */
  const kept = c.S.vpage; const d = page(); d.S.vpage = kept;
  const r = d.vpageBegin('list'); assert.equal(d.vpageGroup(r, '', tasks(300), row).e.page, 3);
});

test('fewer tasks than the page needs: the last page, and it stays so', () => {
  const c = page(); c.S.group = 'status';
  let r = c.vpageBegin('list'); c.vpageGroup(r, 'g:todo', tasks(205), row); c.vpageSetPage(c.VPAGE.roots[r].pkey, 'g:todo', 9);
  r = c.vpageBegin('list'); let a = c.vpageGroup(r, 'g:todo', tasks(199), row);
  assert.equal(a.e.page, 8); assert.deepEqual(ids(a.html), tasks(199).slice(175).map(t => t.id));
  r = c.vpageBegin('list'); a = c.vpageGroup(r, 'g:todo', tasks(205), row);
  assert.equal(a.e.page, 8, 'the tasks back: the page kept is the one the person saw');
  r = c.vpageBegin('list'); a = c.vpageGroup(r, 'g:todo', tasks(10), row);
  assert.equal(a.e.page, 1); assert.equal(c.vpageMoreHtml(a, 'tr', 13, 'To Do'), '');
});

test('the numbers: every page up to seven, else seven places with a gap for those skipped', () => {
  const c = page();
  assert.equal(items(c, 1, 1), '[1]'); assert.equal(items(c, 2, 3), '[1,2,3]'); assert.equal(items(c, 4, 7), '[1,2,3,4,5,6,7]');
  assert.equal(items(c, 1, 16), '[1,2,3,4,5,[6,15],16]');
  assert.equal(items(c, 4, 16), '[1,2,3,4,5,[6,15],16]');
  assert.equal(items(c, 5, 16), '[1,[2,3],4,5,6,[7,15],16]');
  assert.equal(items(c, 12, 16), '[1,[2,10],11,12,13,[14,15],16]');
  assert.equal(items(c, 13, 16), '[1,[2,11],12,13,14,15,16]');
  assert.equal(items(c, 16, 16), '[1,[2,11],12,13,14,15,16]');
  for (let n = 1; n <= 40; n++) for (let p = 1; p <= n; p++) {
    const it = c.vpageItems(p, n); assert.ok(it.length === Math.min(7, n), n + '/' + p + ': seven places at most, always as many');
    assert.ok(it.indexOf(p) >= 0, 'the page shown is listed');
    const flat = []; it.forEach(x => { if (Array.isArray(x)) { assert.ok(x[1] > x[0], n + '/' + p + ': a gap stands for two pages or more, never one'); for (let k = x[0]; k <= x[1]; k++) flat.push(k); } else flat.push(x); });
    assert.deepEqual(flat, Array.from({ length: n }, (_, k) => k + 1), n + '/' + p + ': every page, once, in order');
  }
});

test('the pager: Prev and Next, the page shown marked, a gap goes to the middle of its pages; in Indonesian', () => {
  const c = page();
  const e = { list: tasks(1526), size: 100, page: 1 };
  let h = c.vpagePagerHtml(e, 'Pages');
  assert.match(h, /class="btn sm vpager-step vpager-prev" data-pg="0" disabled aria-label="Previous page"/);
  assert.match(h, /class="btn sm vpager-step vpager-next" data-pg="2" aria-label="Next page"/);
  assert.match(h, /class="vpager-num on" aria-current="page" data-pg="1" aria-label="Page 1"/);
  assert.match(h, /class="vpager-num vpager-gap" data-pg="10" aria-label="Pages 6–15: go to page 10"[^>]*>…</);
  assert.match(h, />Prev</); assert.match(h, />Next</);
  assert.match(h, /role="status">1–100 of 1,526</);
  e.page = 16; h = c.vpagePagerHtml(e, 'Pages');
  assert.match(h, /vpager-next" data-pg="17" disabled/); assert.match(h, />1,501–1,526 of 1,526</);
  const id = page('id'); e.page = 1;
  h = id.vpagePagerHtml(e, id.tr('Pages'));
  assert.match(h, /aria-label="Halaman"/); assert.match(h, />Sebelumnya</); assert.match(h, />Berikutnya</);
  assert.match(h, /aria-label="Halaman sebelumnya"/); assert.match(h, /aria-label="Halaman berikutnya"/); assert.match(h, /aria-label="Halaman 1"/);
  assert.match(h, /aria-label="Halaman 6–15: buka halaman 10"/);
  assert.match(h, /role="status">1–100 dari 1.526</);
  assert.equal(id.vpageNum(1526), '1.526'); assert.equal(c.vpageNum(1526), '1,526'); assert.equal(c.vpageNum(16), '16');
});

test('Kanban and Timeline keep "Show 30 more" as they were: a count kept, untouched by a sort that changes', () => {
  const c = page();
  let r = c.vpageBegin('kanban'), g = c.vpageGroup(r, 'todo', tasks(205), row);
  assert.equal(g.e.paged, undefined); assert.equal(ids(g.html).length, 30);
  assert.match(c.vpageMoreHtml(g, 'k'), /30 of 205 shown[\s\S]*Show 30 more/);
  c.vpageKeep(g.e.key, 60);
  c.S.sort = 'due'; c.vpageBegin('list'); c.S.sort = 'manual';
  r = c.vpageBegin('kanban'); g = c.vpageGroup(r, 'todo', tasks(205), row);
  assert.equal(ids(g.html).length, 60);
  r = c.vpageBegin('timeline'); g = c.vpageGroup(r, 'p:1', tasks(40), row);
  assert.equal(ids(g.html).length, 30); assert.match(c.vpageMoreHtml(g, 'tl', { cols: '', today: '' }), /Show 10 more/);
});
