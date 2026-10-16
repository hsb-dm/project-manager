/* Pasted writing keeps the format it came with (src/desc-format.js). Plain text that carries formatting marks is that
   formatting when it is pasted: Markdown (ChatGPT's and Claude's Copy, a .md file) or WhatsApp, told apart by what only
   Markdown writes. A mark counts only where it opens and closes words, so ordinary text is never formatted, and text
   with nothing to format is left to the browser (""). Underline is kept as <u>…</u>; x² and H₂O are their characters.
   The HTML side (Docs, Word, web pages) needs a page: e2e/paste-format.spec.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function page() {
  const c = {
    esc: s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
    descLinkHtml: (u, t) => '<a href="' + u + '">' + (t || u) + '</a>'
  };
  vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'desc-format.js'), 'utf8').replace(/<\/?script>/g, ''), c); return c;
}

test('ordinary text is never formatted, and with nothing to format the browser pastes it', () => {
  const { descMarkedTextHtml: h } = page();
  for (const t of ['5 * 3 * 2', 'file_name_v2', '2*3*4', 'a*b*c', 'Pasted: 2 * 4 * 6 and # tag', 'Diskon 50%* syarat', 'Tag #promo and a - b',
    'https://drive.google.com/drive/folders/abc', 'Version 1.2 and 3 > 2', 'C:\\Users\\hsb', '**bold**then', 'x **y**z', '', '\n\n'])
    assert.equal(h(t), '', JSON.stringify(t));
});

test('which marks: Markdown when the text has something only Markdown writes, WhatsApp otherwise', () => {
  const { dfIsMarkdown: md, descMarkedTextHtml: h } = page();
  for (const t of ['**a**', '__a__', '~~a~~', '## Brief', 'see [x](https://e.com)', 'a\n```\ncode\n```']) assert.equal(md(t), true, t);
  for (const t of ['*a*', '_a_', '~a~', '```mono```', '- a\n- b', '#tag', '5 ** 2']) assert.equal(md(t), false, t);
  /* one *x*, two readings */
  assert.equal(h('*PROMO*'), '<strong>PROMO</strong>', 'WhatsApp: bold');
  assert.equal(h('*x* and **y**'), '<em>x</em> and <strong>y</strong>', 'Markdown: italic');
});

test('WhatsApp: *bold*, _italic_, ~strike~, ```mono```, lists and quotes', () => {
  const { descMarkedTextHtml: h } = page();
  assert.equal(h('*PROMO MERDEKA*\n_berlaku sampai 17 Agustus_\n~harga lama~ jadi 5 * 3\n- poin satu\n- poin dua\n1. langkah\n> kutipan'),
    '<div><strong>PROMO MERDEKA</strong></div><div><em>berlaku sampai 17 Agustus</em></div><div><del>harga lama</del> jadi 5 * 3</div>'
    + '<ul><li>poin satu</li><li>poin dua</li></ul><ol><li>langkah</li></ol><blockquote>kutipan</blockquote>');
  assert.equal(h('```mono``` and `code`'), '<code>mono</code> and <code>code</code>');
  assert.equal(h('(*ok*), _*bold italic*_'), '(<strong>ok</strong>), <em><strong>bold italic</strong></em>');
  assert.equal(h('*a* \\* b'), '<strong>a</strong> \\* b', 'no escapes in WhatsApp: a backslash is a backslash');
  assert.equal(h('* one\n* two'), '<ul><li>one</li><li>two</li></ul>');
});

test('Markdown: emphasis, headings, lists, quotes, links, code, a line, escapes', () => {
  const { descMarkedTextHtml: h } = page();
  assert.equal(h('**a** and *b*'), '<strong>a</strong> and <em>b</em>');
  assert.equal(h('## Brief\n**Tebal** dan *miring* dan ~~coret~~ dan `kode`\n- satu\n+ dua\n1. pertama\n2) kedua\n> kutipan\nLink [di sini](https://example.com/a)'),
    '<h4>Brief</h4><div><strong>Tebal</strong> dan <em>miring</em> dan <del>coret</del> dan <code>kode</code></div><ul><li>satu</li><li>dua</li></ul>'
    + '<ol><li>pertama</li><li>kedua</li></ol><blockquote>kutipan</blockquote><div>Link <a href="https://example.com/a">di sini</a></div>');
  assert.equal(h('# One\n### Three\n#### Four'), '<h3>One</h3><h5>Three</h5><h5>Four</h5>', '#, ##, ### are the editor\'s three levels');
  assert.equal(h('***both*** and __strong__ and _em_'), '<strong><em>both</em></strong> and <strong>strong</strong> and <em>em</em>');
  assert.equal(h('*a **b** c*'), '<em>a <strong>b</strong> c</em>');
  assert.equal(h('**x** snake_case_name and 2*3*4'), '<strong>x</strong> snake_case_name and 2*3*4');
  assert.equal(h('**x** and 5 \\* 3 and \\_y\\_'), '<strong>x</strong> and 5 * 3 and _y_', 'an escape is the character');
  assert.equal(h('**x** C:\\Users\\hsb'), '<strong>x</strong> C:\\Users\\hsb', 'a backslash before a letter stays');
  assert.equal(h('# T\n---\n***'), '<h3>T</h3><hr><hr>');
  assert.equal(h('```js\nif (a) { *x*; }\n# not a heading\n```\n**after**'), '<pre><code>if (a) { *x*; }\n# not a heading</code></pre><div><strong>after</strong></div>');
  assert.equal(h('[a link](https://e.com/x)'), '<a href="https://e.com/x">a link</a>', 'one line goes into the line');
});

test('what is in the text stays text: HTML, addresses, code, empty lines', () => {
  const { descMarkedTextHtml: h } = page();
  assert.equal(h('*<b>x</b>* & "q"'), '<strong>&lt;b&gt;x&lt;/b&gt;</strong> &amp; &quot;q&quot;');
  assert.equal(h('*see* https://x.com/_a_/b*c*'), '<strong>see</strong> https://x.com/_a_/b*c*', 'an address is never formatted');
  assert.equal(h('use `a*b*c` *now*'), 'use <code>a*b*c</code> <strong>now</strong>');
  assert.equal(h('*a*\n\n*b*\n'), '<div><strong>a</strong></div><div><br></div><div><strong>b</strong></div>', 'an empty line stays, the last line break goes');
  assert.equal(h('*a*\r\n*b*'), '<div><strong>a</strong></div><div><strong>b</strong></div>');
});

test('underline in the text, read back; superscript and subscript characters', () => {
  const { dfUnderlineIn: u, dfScript: s } = page();
  assert.equal(u('a &lt;u&gt;x&lt;/u&gt; b'), 'a <u>x</u> b');
  assert.equal(u('&lt;u&gt;**x**&lt;/u&gt; and &lt;u&gt;`c`&lt;/u&gt;'), '<u>**x**</u> and <u>`c`</u>');
  for (const keep of ['`&lt;u&gt;in code&lt;/u&gt;`', '&lt;u&gt;&lt;/u&gt;', '&lt;u&gt;never closed', 'a &lt;/u&gt; b', '\uE10Fu&gt;typed\uE10F/u&gt;'])
    assert.equal(u(keep), keep, keep);
  assert.equal(s('2', true), '²'); assert.equal(s('n+1', true), 'ⁿ⁺¹'); assert.equal(s('(-3)', true), '⁽⁻³⁾'); assert.equal(s('2', false), '₂');
  for (const [t, up] of [['abc', true], ['x', false], ['', true], ['2a', true]]) assert.equal(s(t, up), '', t);
});
