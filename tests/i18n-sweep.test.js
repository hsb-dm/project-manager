/* English left in the Indonesian interface (the sweep of 23 Oct 2026). The personal tick had no Indonesian at all
   ("3 checked", "Clear checks", "Mark as checked"), a comment's audience chip said "visible", and some 200 texts the
   code already passed to tr() had no words in any UI_ID block, so they showed in English. This file holds the words
   the sweep settled and the guard that a text given to tr() has its Indonesian. The screens themselves are checked
   by e2e/indonesian-strings.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const build = require('../build.js');
const root = path.join(__dirname, '..');
const dict = build.served().dict.dict;

test('the personal tick speaks Indonesian: centang, dicentang (docs/GLOSSARY-ID.md)', () => {
  assert.equal(dict['checked'], 'dicentang');
  assert.equal(dict['Clear checks'], 'Hapus centang');
  assert.equal(dict['Mark as checked'], 'Tandai dicentang');
  assert.match(dict['Checked — click to clear'], /^Dicentang — /);
  const glossary = fs.readFileSync(path.join(root, 'docs', 'GLOSSARY-ID.md'), 'utf8');
  assert.match(glossary, /\| check[^|]*\|[^|]*centang/, 'the glossary names the term');
});

test("a comment's audience chip says what the Internal / Stakeholder-visible switch says", () => {
  assert.ok(dict['Stakeholder-visible'], 'the switch has its words');
  assert.equal(dict['visible'], dict['Stakeholder-visible'].toLowerCase(), 'the chip is the switch, written small');
  assert.equal(dict['internal'], dict['Internal'].toLowerCase());
  const drawer = fs.readFileSync(path.join(root, 'src', 'drawer.js'), 'utf8');
  assert.match(drawer, /I\.eye\+tr\("visible"\)/, 'the chip is drawn through tr()');
  assert.match(drawer, /I\.lock\+tr\("internal"\)/);
});

/* Every tr("…") written in src/ has its Indonesian. A text that is the same in Indonesian is still given, to itself
   ("internal": "internal"), so a missing one is always a mistake. The one exception is v38.js's Drive hint, whose
   English carries escaped quotes into the page; v38.js is not edited by hand. */
const SAME_EXCEPT = new Set(['choose the folder with \\"Choose folder in Google Drive\\" (Google only lets the app see folders picked there).']);
function trLiterals() {
  const out = [];
  for (const file of fs.readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.js'))) {
    const s = fs.readFileSync(path.join(root, 'src', file), 'utf8');
    const re = /\btr\(\s*(?:"((?:[^"\\\n]|\\.)*)"|'((?:[^'\\\n]|\\.)*)')\s*\)/g; let m;
    while ((m = re.exec(s))) {
      const raw = m[1] != null ? m[1] : m[2];
      let text; try { text = JSON.parse('"' + raw.replace(/\\'/g, "'").replace(/(^|[^\\])"/g, '$1\\"') + '"'); } catch (e) { text = raw; }
      if (!/[a-z]{3}/i.test(text)) continue;
      out.push({ text, at: file + ':' + (s.slice(0, m.index).split('\n').length) });
    }
  }
  return out;
}
test('every text the code passes to tr() has Indonesian words', () => {
  const lits = trLiterals();
  assert.ok(lits.length > 2000, 'the literals are found (' + lits.length + ')');
  const missing = lits.filter(l => !(l.text in dict) && !SAME_EXCEPT.has(l.text));
  assert.deepEqual(missing.map(l => l.at + ' ' + JSON.stringify(l.text)), [],
    'Give each its Indonesian in its module\'s UI_ID block (docs/GLOSSARY-ID.md); a text that is the same in Indonesian is given to itself.');
});
