/* The page as build.js writes it, for the tests that read it (Oct 2026, performance stage 3): public/index.html, a
   few KB of HTML, and the files it names under public/assets/ — its script (app.<hash>.js: every script of the page,
   in its order), its style sheet (app.<hash>.css) and the Indonesian dictionary (i18n-id.<hash>.json), which the
   browser downloads along with it. code is what used to be the page's inline scripts, css its <style> elements. */
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

function builtPage() {
  const html = fs.readFileSync(path.join(root, 'public', 'index.html'), 'utf8');
  const name = (re, what) => { const m = html.match(re); if (!m) throw new Error('public/index.html names no ' + what + ' — run node build.js'); return m[1]; };
  const names = {
    js: name(/<script src="\/assets\/(app\.[0-9a-f]{10}\.js)"><\/script>/, 'script'),
    css: name(/<link rel="stylesheet" href="\/assets\/(app\.[0-9a-f]{10}\.css)">/, 'style sheet'),
    i18n: name(/"\/assets\/(i18n-id\.[0-9a-f]{10}\.json)"/, 'Indonesian dictionary')
  };
  const raw = { html: Buffer.from(html) };
  Object.keys(names).forEach(k => { raw[k] = fs.readFileSync(path.join(root, 'public', 'assets', names[k])); });
  return { html, names, raw, code: raw.js.toString('utf8'), css: raw.css.toString('utf8'), dict: JSON.parse(raw.i18n.toString('utf8')) };
}
/* one file's script inside the page's script, exactly as it went in (the build writes ";/* <file> *\/" before each) */
function scriptOf(code, file) {
  const mark = ';/* ' + file + ' */\n', at = code.indexOf(mark);
  if (at < 0 || code.indexOf(mark, at + 1) >= 0) return null;
  const start = at + mark.length, end = code.indexOf('\n;/* ', start);
  return code.slice(start, end < 0 ? code.length - 1 : end);
}
module.exports = { builtPage, scriptOf, root };
