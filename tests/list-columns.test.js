/* Which of the List's columns show (src/list-columns.js): kept per person as listCols.hide — known keys only, each
   once, never Task; a column added later shows; a hidden column keeps its place when the shown ones are moved. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const KEYS = ['title', 'status', 'dependency', 'team', 'assignee', 'proj', 'prio', 'start', 'due', 'effort', 'tags'];
function page(keys) {
  const c = { prefs: {}, saves: 0, UI_ID: {}, PEOPLE: { u1: {} }, ME: 'u1', LIST_COL_W: { check: 40, drag: 28, title: 164, status: 116 } };
  c.LIST_COLS = (keys || KEYS).map(k => ({ k, l: k }));
  c.myPrefs = () => c.prefs; c.saveMyPrefs = () => { c.saves++; };
  c.colW = (m, k) => m[k] || 120; c.tr = s => s;
  c.document = { querySelector: () => null };
  vm.createContext(c);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'list-columns.js'), 'utf8').split('</script>')[0].replace('<script>', ''), c);
  return c;
}
const arr = x => Array.from(x);

test('what is hidden is read as known keys, each once, in the usual order, never Task', () => {
  const c = page();
  for (const [raw, want] of [
    [undefined, []], ['status', []], [{ status: 1 }, []], [null, []],
    [['tags', 'status', 'title', 'bogus', 'status', '<x>', 7], ['status', 'tags']],
  ]) { c.prefs.listCols = { hide: raw }; assert.deepEqual(arr(c.listColHidden()), want, JSON.stringify(raw)); }
  c.prefs.listCols = ['status']; assert.deepEqual(arr(c.listColHidden()), [], 'a list where the settings belong is ignored');
});

test('the shown columns follow the person\'s order; a column added later shows', () => {
  const c = page();
  c.prefs.listCols = { order: ['tags', 'title', 'status'], hide: ['status', 'due'] };
  assert.deepEqual(arr(c.listColShown()), ['tags', 'title', 'dependency', 'team', 'assignee', 'proj', 'prio', 'start', 'effort']);
  const later = page(KEYS.concat('reviewer'));
  later.prefs.listCols = { order: KEYS, hide: ['status'] };
  assert.ok(arr(later.listColShown()).includes('reviewer'));
  assert.equal(c.listColCustom(), true);
  c.prefs.listCols = { hide: ['tags'] }; assert.equal(c.listColCustom(), true, 'hiding alone counts, so Reset columns shows');
  c.prefs.listCols = { hide: ['title'] }; assert.equal(c.listColCustom(), false, 'Task cannot be hidden');
});

test('stored: only known keys other than Task; left out, what is hidden is kept; [] shows all', () => {
  const c = page();
  c.listColStore(KEYS, null, ['tags', 'title', 'zzz', 'status']);
  assert.deepEqual(JSON.parse(JSON.stringify(c.prefs.listCols)), { hide: ['status', 'tags'] });
  const moved = ['status'].concat(KEYS.filter(k => k !== 'status'));
  c.listColStore(moved, null);
  assert.deepEqual(JSON.parse(JSON.stringify(c.prefs.listCols)), { order: moved, hide: ['status', 'tags'] });
  c.listColStore(moved, null, []);
  assert.deepEqual(JSON.parse(JSON.stringify(c.prefs.listCols)), { order: moved });
  c.listColStore(null, null, []);
  assert.deepEqual(JSON.parse(JSON.stringify(c.prefs.listCols)), {});
  assert.equal(c.saves, 4);
});

test('moving the shown columns leaves each hidden one in its place', () => {
  const c = page(['title', 'status', 'dependency', 'team', 'assignee']);
  c.prefs.listCols = { hide: ['status', 'assignee'] };
  assert.deepEqual(arr(c.listColWithShown(['team', 'title', 'dependency'])), ['team', 'status', 'title', 'dependency', 'assignee']);
  assert.deepEqual(arr(c.listColWithShown(['title', 'dependency', 'team'])), ['title', 'status', 'dependency', 'team', 'assignee']);
});
