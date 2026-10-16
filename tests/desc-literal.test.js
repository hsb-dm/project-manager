/* What is typed is what is shown (src/desc-literal.js): a typed character Markdown would read as formatting is written
   with a backslash before it, only where it would change something, and shown as itself; readers of the plain text
   drop the backslashes. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function page() { const c = {}; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'desc-literal.js'), 'utf8').replace(/<\/?script>/g, ''), c); return c; }

test('only what Markdown would read as formatting is escaped', () => {
  const { dlLiteral: lit } = page();
  const cases = [
    ['5 * 3 * 2 = 30', '5 \\* 3 \\* 2 = 30'],
    ['**not bold**', '\\*\\*not bold\\*\\*'],
    ['file_name_v2', 'file_name_v2'],
    ['_not italic_', '\\_not italic\\_'],
    ['~approx~', '~approx~'],
    ['~~not struck~~', '\\~\\~not struck\\~\\~'],
    ['`not code`', '\\`not code\\`'],
    ['[label](x)', '[label\\](x)'],
    ['[DRAFT] final', '[DRAFT] final'],
    ['# not a heading', '\\# not a heading'],
    ['Tag #promo', 'Tag #promo'],
    ['- not a list', '\\- not a list'],
    ['a - b', 'a - b'],
    ['1. not numbered', '1\\. not numbered'],
    ['Version 1.2', 'Version 1.2'],
    ['> not a quote', '\\> not a quote'],
    ['3 > 2', '3 > 2'],
    ['C:\\Users\\hsb', 'C:\\Users\\hsb'],
    ['a \\* star', 'a \\\\\\* star'],
    ['---', '\\---'],
    ['Emoji ✅ 中文 العربية € ≥', 'Emoji ✅ 中文 العربية € ≥'],
  ];
  for (const [typed, md] of cases) assert.equal(lit(typed), md, typed);
});

test('the plain text drops the escapes again', () => {
  const { dlLiteral: lit, descPlainText: plain } = page();
  for (const t of ['5 * 3 * 2 = 30', '_x_ and **y**', '# h', '1. n', '> q', 'C:\\Users\\hsb', 'a \\* star', '[a](b)', 'Emoji ✅']) assert.equal(plain(lit(t)), t, t);
  /* Markdown a person wrote with the toolbar is left as it is */
  assert.equal(plain('**bold** and *it*'), '**bold** and *it*');
  assert.equal(plain(null), '');
});
