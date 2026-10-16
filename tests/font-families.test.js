/* A font, then its style (Oct 2026): a brand font's files are grouped by the family their names say, each keeping
   its own name (src/brand-fonts.js), and the workspace's Google fonts follow with the weights Google has. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'font-families.js'), 'utf8').replace(/<\/?script>/g, '');

function page(uploaded, workspace) {
  const c = { UI_ID: {}, tr: s => s, esc: s => String(s), attr: s => String(s), WS: { brand: {} }, console,
    aiUploadedFonts: () => uploaded.map((name, i) => ({ id: 'f' + i, name, url: '/files/' + 'a'.repeat(64) + '.ttf' })),
    aiWorkspaceFonts: () => workspace.concat(uploaded) };
  vm.createContext(c); vm.runInContext(src, c); return c;
}

test('a font file\'s name says its family and its style', () => {
  const { fontFaceParts: p } = page([], []);
  const say = n => { const x = p(n); return [x.family, x.label, x.weight, x.italic]; };
  assert.deepEqual(say('Stolzl Regular'), ['Stolzl', 'Regular', 400, false]);
  assert.deepEqual(say('Stolzl Book'), ['Stolzl', 'Book', 350, false]);
  assert.deepEqual(say('Stolzl Thin'), ['Stolzl', 'Thin', 100, false]);
  assert.deepEqual(say('Gilroy Black Italic'), ['Gilroy', 'Black Italic', 900, true]);
  assert.deepEqual(say('Gilroy Extra Bold'), ['Gilroy', 'Extra Bold', 800, false], 'two words');
  assert.deepEqual(say('Gilroy SemiBold'), ['Gilroy', 'SemiBold', 600, false], 'one word');
  assert.deepEqual(say('Inter Italic'), ['Inter', 'Italic', 400, true]);
  assert.deepEqual(say('Brand Display'), ['Brand Display', 'Regular', 400, false], 'no style in the name: a family of its own');
  assert.deepEqual(say('Bold'), ['Bold', 'Regular', 400, false], 'a style word alone is a name');
});

test('the families: brand fonts grouped first, each style its own file, then the workspace\'s', () => {
  const c = page(['Stolzl Bold', 'Stolzl Regular', 'Stolzl Light', 'Stolzl Book', 'Gilroy Black Italic', 'Gilroy Black'], ['Poppins', 'Inter']);
  const fams = Array.from(c.fontFamilies(), f => [f.name, f.brand, Array.from(f.styles, s => s.label)]);
  assert.deepEqual(fams.slice(0, 2), [['Stolzl', true, ['Light', 'Book', 'Regular', 'Bold']], ['Gilroy', true, ['Black', 'Black Italic']]]);
  assert.deepEqual(fams.slice(2).map(f => [f[0], f[1]]), [['Poppins', false], ['Inter', false]], 'an uploaded file is not listed again on its own');
  /* a stored font name is found again: a brand file by its own name, a Google font with the weight nearest */
  const f = c.fontFind('Stolzl Light', 700);
  assert.equal(f.fam.name, 'Stolzl'); assert.equal(f.style.value, 'Stolzl Light');
  const g = c.fontFind('Poppins', 640);
  assert.equal(g.fam.name, 'Poppins'); assert.equal(g.style.weight, 700, 'without a browser: Regular and Bold are what is known');
  assert.equal(c.fontFind('Removed Font', 400).missing, true, 'a font no longer listed is kept, not lost');
});
