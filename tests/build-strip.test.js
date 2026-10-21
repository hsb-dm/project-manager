/* Comments out of the served page (build-strip.js, Oct 2026): what is removed is only comments — never a string,
   a template, a regular expression or CSS that happens to hold slash-star — and every script still compiles. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const root = path.join(__dirname, '..');
const { stripJs, stripCss, stripHtml } = require('../build-strip.js');

test('JavaScript: comments go, the lines that held only a comment with them', () => {
  assert.equal(stripJs('var a = 1; // note\nvar b = 2;'), 'var a = 1;\nvar b = 2;');
  assert.equal(stripJs('\n// a whole line\nvar a;\n  /* a block */\nvar b;\n/* two\n   lines */\nvar c;'), '\nvar a;\nvar b;\nvar c;');
  assert.equal(stripJs('/* the file opens with one */\nvar a;'), 'var a;');
  assert.equal(stripJs('a; /* never closed'), 'a;');
});

test('JavaScript: strings and templates keep slash-star, star-slash and //', () => {
  const keep = ['var t = "image/*", u = \'*/*\', v = "http://x//y", w = "a\\"/*b*/";', 'var n = `a/*b*/${`in/*ner*/${y}`}//d`;'];
  keep.forEach(s => assert.equal(stripJs(s + ' // gone'), s));
  assert.equal(stripJs('var s = `a${x/* c */+1}b`;'), 'var s = `a${x +1}b`;', 'a comment inside ${ } is code, and goes');
});

test('JavaScript: regular expressions are told from divisions', () => {
  /* each holds a slash-star or a star-slash: read as a division, the rest of the line would be a comment */
  const regexes = ['var r = /\\/\\*/g, q = /[/*]+/, w = /a\\/\\/b/;', 'function f(s){ return /^a\\/*b$/.test(s); }', 'if (ok) /x\\/*y/.test(s) && go();',
    'if (a) { b(); }\n/re\\/*x/.test(s);', 'f(x => /a\\/*b/.test(x));', 'var m = s.replace(/\\*\\*([^*]+)\\*\\*/g, "$1");', 'x = typeof /a\\/*/;', 'case 1: /\\*/.test(s);'];
  regexes.forEach(s => assert.equal(stripJs(s + ' // gone'), s));
  /* each a division: read as a regular expression, the comment after it would stay or code would go */
  assert.equal(stripJs('var x = a / 2 /* half */ + b / 4;'), 'var x = a / 2 + b / 4;');
  assert.equal(stripJs('var y = (a + b) / 2 /* mean */ / c;'), 'var y = (a + b) / 2 / c;');
  assert.equal(stripJs('var z = o.return / 2 /* a property, not the keyword */ / k;'), 'var z = o.return / 2 / k;');
  assert.equal(stripJs('var w = x++ / 2 /* c */ / k; a /= 2; // c'), 'var w = x++ / 2 / k; a /= 2;');
  assert.equal(stripJs('var v = a[i] / 2 /* c */ / k, u = a?.b / 2 /* c */ / k;'), 'var v = a[i] / 2 / k, u = a?.b / 2 / k;');
});

test('JavaScript: a comment becomes the space or the line break it stood for', () => {
  assert.equal(stripJs('a/**/b'), 'a b');
  assert.equal(stripJs('a+/**/+b'), 'a+ +b', 'never a++b');
  assert.equal(stripJs('f(/**/)'), 'f()');
  assert.equal(stripJs('[1/**/,2]'), '[1,2]');
  assert.equal(stripJs('return /* spans\n lines */ x;'), 'return\nx;', 'a line break after return is kept: it returns nothing');
  assert.equal(stripJs('x /* one line */ y'), 'x y');
});

test('CSS: comments go, strings and url() keep theirs, the two sides of a comment stay apart', () => {
  assert.equal(stripCss('a{color:red/* c */}'), 'a{color:red}');
  assert.equal(stripCss('/* head */\n.a{}\n  /* line */\n.b{}'), '.a{}\n.b{}');
  assert.equal(stripCss('.a /* x */ .b{}'), '.a .b{}');
  assert.equal(stripCss('.a /* x */.b{}'), '.a .b{}', 'the space before it was a descendant combinator');
  assert.equal(stripCss('.a/* x */.b{border:1px/* x */solid}'), '.a/**/.b{border:1px/**/solid}', 'never .a.b-into-one or 1pxsolid');
  const keep = 'a{background:url(data:image/svg+xml,a/*b*/c);content:"/* no */";quotes:\'*/\'}';
  assert.equal(stripCss(keep + '/* c */'), keep);
});

test('HTML: only <script> (JavaScript) and <style> are read', () => {
  assert.equal(stripHtml('<style>/* a */.x{}</style><script>/* b */var x;</script><script type="application/json">{"a":"/* keep */"}</script><p>/* text */ // too</p><!-- kept -->'),
    '<style>.x{}</style><script>var x;</script><script type="application/json">{"a":"/* keep */"}</script><p>/* text */ // too</p><!-- kept -->');
});

test('the built page: no comments of src/ left, everything else as written, every script compiles', () => {
  const page = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  for (const m of page.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) new vm.Script(m[1]);
  /* src/'s comments are gone … */
  for (const gone of ['THE LAST VIEW, KEPT (Oct 2026)', 'v41 storage shim', 'TOKENS — workspace theme']) assert.ok(!page.includes(gone), gone);
  /* … shared/* goes in exactly as written (tests/scoring-engine.test.js compares the engine byte for byte) … */
  assert.ok(page.includes('SMART SCORING ENGINE (Oct 2026)'));
  /* … and what holds slash-star in src/ is still there, unchanged */
  for (const kept of ['"image/*"', '"*/*"', '"image/*,.pdf,.psd,.ai,.mp4,.mov"', '/\\*\\*([^*]+)\\*\\*/g', '/\\*([^*]+)\\*/g', '/(^|[^*])\\*([^*\\n]+)\\*/g', '/\\*\\*\\s*\\*\\*/g', '/\\*\\*[^\\s*][^\\n]*?\\*\\*/', '/^(Today|Hari ini),\\s*/']) assert.ok(page.includes(kept), kept);
  assert.ok(page.includes('function routeApply('), 'names are kept as they are');
});
