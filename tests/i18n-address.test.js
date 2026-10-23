/* The interface addresses the reader as Anda (Oct 2026, the owner's decision; docs/GLOSSARY-ID.md, "Addressing the
   reader"). Every Indonesian text that spoke to the reader with kamu or a -mu suffix was rewritten ("task-mu" ->
   "task Anda", "akunmu" -> "akun Anda", "kepadamu" -> "kepada Anda"), and this keeps them from coming back: in the
   dictionary the page loads (as the sources build it and as public/assets/ has it), in the Indonesian written in code
   (notifications, the Workspace Quest, the assistant's local answers, the server's push texts, the offline page) and
   in the user and admin manuals. Only two things keep kamu, neither of them speaking to the reader: the words the AI
   uses to recognise an Indonesian question (people type kamu), and the copy of a sample poster in src/ai.js. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const build = require('../build.js');
const { builtPage } = require('./built-page.js');
const root = path.join(__dirname, '..');

/* words that end in "mu" without being the suffix */
const NOT_SUFFIX = new Set(['temu', 'bertemu', 'ketemu', 'ilmu', 'tamu', 'jamu']);
/* kamu / dirimu, an English word with -mu ("task-mu"), and any other word ending in mu ("akunmu", "kepadamu") */
const FORM = /(?<![\p{L}\p{N}_])([\p{L}\p{N}_][\p{L}\p{N}_-]*mu|[Kk]amu)(?![\p{L}\p{N}_])/gu;
function addressed(text) {
  const found = [];
  for (const m of String(text).matchAll(FORM)) if (!NOT_SUFFIX.has(m[1].toLowerCase())) found.push(m[1]);
  return found;
}
/* what may keep kamu, exactly as it is written; each must still be there */
const KEEP = {
  'src/ai.js': ['|saya|kami|kamu|anda|', 'cek DM kamu buat tau alasannya'],
  'server/server.js': ['|saya|kami|kamu|anda|']
};

test('the finder sees kamu and every -mu form, and leaves words that only contain mu alone', () => {
  assert.deepEqual(addressed('Kamu bisa membuka task-mu; akunmu, Peranmu, kepadamu, menyebutmu, dirimu, @kamu, Google Drive-mu'),
    ['Kamu', 'task-mu', 'akunmu', 'Peranmu', 'kepadamu', 'menyebutmu', 'dirimu', 'kamu', 'Drive-mu']);
  assert.deepEqual(addressed('Mulai muat semua yang umum, musim, jumlah, muncul, bertemu, ditemukan, ilmu, tamu, semuanya, Anda, untuk Anda'), []);
});

function dictionaryProblems(dict) {
  const bad = [];
  for (const [en, id] of Object.entries(dict)) {
    const forms = addressed(id);
    if (forms.length) bad.push(JSON.stringify(en) + ' → ' + JSON.stringify(id) + ' (' + forms.join(', ') + ')');
    /* Anda is always written with a capital A (a lower-case anda in a hyphenated placeholder, domain-anda, is not the word) */
    if (/(?<![\p{L}-])anda(?!\p{L})/u.test(id)) bad.push(JSON.stringify(en) + ' → ' + JSON.stringify(id) + ' (anda, lower case)');
  }
  return bad;
}

test('the dictionary the sources build addresses the reader as Anda, never kamu or -mu', () => {
  const dict = build.served().dict.dict;
  assert.deepEqual(dictionaryProblems(dict), []);
  /* the standard wordings */
  assert.equal(dict['you'], 'Anda');
  assert.equal(dict['(you)'], '(Anda)');
  assert.equal(dict['Only you'], 'Hanya Anda');
  assert.equal(dict['Your role cannot create tasks.'], 'Peran Anda tidak dapat membuat task.');
  assert.equal(dict['waiting for your review'], 'menunggu review Anda');
  assert.equal(dict['No tasks assigned to you'], 'Belum ada task untuk Anda');
  assert.equal(dict['Editing your comment'], 'Mengedit komentar Anda');
  assert.equal(dict['Per conversation you can still pick All / Mentions only / Mute.'], 'Per percakapan, Anda tetap bisa memilih Semua / Hanya mention / Bisukan.');
  /* the reader speaking about their own things keeps saya */
  assert.equal(dict['My Tasks'], 'Task saya');
  assert.equal(dict['Only me'], 'Hanya saya');
  assert.equal(dict['Reviewer'], 'Reviewer');
});

test('the dictionary public/assets serves has no kamu or -mu either (run node build.js after changing a UI_ID block)', () => {
  assert.deepEqual(dictionaryProblems(builtPage().dict), []);
});

test('the Indonesian written in code and the manuals address the reader as Anda', () => {
  const files = [].concat(
    fs.readdirSync(path.join(root, 'src')).filter(f => /\.(js|html)$/.test(f)).map(f => 'src/' + f),
    fs.readdirSync(path.join(root, 'shared')).filter(f => /\.js$/.test(f)).map(f => 'shared/' + f),
    fs.readdirSync(path.join(root, 'server')).filter(f => /\.js$/.test(f)).map(f => 'server/' + f),
    ['public/offline.html', 'docs/USER-MANUAL.md', 'docs/ADMIN-OPS.md']);
  const bad = [];
  for (const f of files) {
    let text = fs.readFileSync(path.join(root, f), 'utf8');
    for (const keep of KEEP[f] || []) {
      assert.ok(text.includes(keep), f + ' still has ' + JSON.stringify(keep) + ' (update KEEP if it moved)');
      text = text.split(keep).join('');
    }
    for (const m of text.matchAll(FORM)) {
      if (NOT_SUFFIX.has(m[1].toLowerCase())) continue;
      const line = text.slice(0, m.index).split('\n').length;
      bad.push(f + ':' + line + ' ' + m[1] + ' … ' + text.slice(Math.max(0, m.index - 50), m.index + m[1].length + 30).replace(/\s+/g, ' '));
    }
  }
  assert.deepEqual(bad, [], 'write "Anda" instead (docs/GLOSSARY-ID.md, "Addressing the reader")');
});

test('the notifications, the offline page and the server speak to the reader as Anda', () => {
  const core = fs.readFileSync(path.join(root, 'src', 'core.js'), 'utf8');
  assert.match(core, /assigned:"\{who\} menugaskan “\{t\}” kepada Anda"/);
  assert.match(core, /reviewer:"\{who\} meminta Anda me-review “\{t\}”"/);
  assert.match(core, /chat_dm:"\{who\} mengirimi Anda pesan"/);
  const server = fs.readFileSync(path.join(root, 'server', 'server.js'), 'utf8');
  assert.match(server, /assigned: "\{who\} menugaskan “\{t\}” kepada Anda\."/);
  assert.match(server, / menyebut Anda di /);
  assert.match(fs.readFileSync(path.join(root, 'public', 'offline.html'), 'utf8'), /Anda sedang offline/);
});

test('the AI still recognises an Indonesian question that says kamu', () => {
  for (const f of ['src/ai.js', 'server/server.js']) {
    const text = fs.readFileSync(path.join(root, f), 'utf8');
    const m = text.match(/\/\\b\((apa\|yang\|[^)]*)\)/);
    assert.ok(m, f + ' has its language words');
    const words = m[1].split('|');
    assert.ok(words.includes('kamu') && words.includes('anda'), f + ': ' + m[1].slice(0, 80));
  }
});
