/* v37 — the front end is ~45 classic <script> files sharing one global scope. A function
   declared with the same name in two files silently replaces the earlier one. Two such
   collisions broke features (Drive links always rejected; task-list status opened the
   personal availability menu). This test fails on any new collision. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const src = path.join(__dirname, '..', 'src');
/* deliberate replacements: the later file is a superset of the earlier one. Since the page's scripts are one file
   (build.js, Oct 2026: a function declared at the top of a script is there from the start of it), the later one is
   the one from the start; nothing calls either while the page loads. */
const INTENDED = { aiGradient: ['ai.js', 'style-effects.js'], localizeVisibleText: ['core.js', 'i18n.js'], notifRows: ['core.js', 'enhance.js'] };

test('no two front-end files declare the same global function (except documented overrides)', () => {
  const seen = {};
  for (const f of fs.readdirSync(src).filter(x => x.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(src, f), 'utf8');
    for (const m of s.matchAll(/(?:^|\n)function ([A-Za-z_$][\w$]*)\s*\(/g)) (seen[m[1]] = seen[m[1]] || []).push(f);
  }
  const clashes = Object.entries(seen).filter(([k, v]) => v.length > 1 && !(INTENDED[k] && JSON.stringify(v.slice().sort()) === JSON.stringify(INTENDED[k].slice().sort())));
  assert.deepEqual(clashes, [], 'rename one of: ' + clashes.map(([k, v]) => k + ' (' + v.join(', ') + ')').join('; '));
});

test('every file in build.js exists and every front-end file is built', () => {
  const b = fs.readFileSync(path.join(__dirname, '..', 'build.js'), 'utf8');
  const parts = (b.match(/parts = \[([^\]]*)\]/) || [])[1].match(/"([^"]+)"/g).map(x => x.slice(1, -1));
  parts.forEach(p => assert.ok(fs.existsSync(path.join(src, p)), p));
  const js = fs.readdirSync(src).filter(x => x.endsWith('.js'));
  assert.deepEqual(js.filter(f => !parts.includes(f)), [], 'files in src/ that build.js never includes');
});
