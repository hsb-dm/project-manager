/* An emoji pasted as a picture (Gmail, Google Chat, WhatsApp Web, X, Slack put them on the clipboard that way) is
   the emoji itself in a description, not a framed picture on a line of its own (src/desc-emoji.js). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
function page() { const c = { URL, location: { href: 'https://app.example/' } }; vm.createContext(c); vm.runInContext(fs.readFileSync(path.join(__dirname, '..', 'src', 'desc-emoji.js'), 'utf8').replace(/<\/?script>/g, ''), c); return c; }
const NOTO = 'https://fonts.gstatic.com/s/e/notoemoji/15.0/2705/72.png';

test('what counts as an emoji picture', () => {
  const { descEmojiOf: e } = page();
  for (const x of ['✅', '❗', '👍🏽', '🇮🇩', '1️⃣', '👨‍👩‍👧', '✅ ✅']) assert.equal(e(x, NOTO), x, x);
  assert.equal(e(':white_check_mark:', 'https://a.slack-edge.com/production-standard-emoji-assets/14.0/apple-medium/2705.png'), ':white_check_mark:', 'Slack');
  for (const x of ['', 'Banner', 'Q4 hero.png', '1', '2026', '#', 'Logo ✅ final']) assert.equal(e(x, NOTO), '', 'not an emoji: ' + x);
  assert.equal(e(':party:', 'https://cdn.example/pic.png'), '', 'a name, from a host that is not an emoji one');
});

test('stored before: an emoji picture alone on a line goes back onto the line of its words', () => {
  const { descEmojiLines: fix } = page();
  const md = 'Slide 5\n![✅](' + NOTO + ')\nBisa ambil posisi Buy atau Sell\n![❗](https://fonts.gstatic.com/s/e/notoemoji/15.0/2757/72.png)\n\nTrading tetap punya risiko.';
  assert.equal(fix(md), 'Slide 5\n✅ Bisa ambil posisi Buy atau Sell\n❗\n\nTrading tetap punya risiko.');
  assert.equal(fix('Di sini ![👍](' + NOTO + ') ya'), 'Di sini 👍 ya', 'within a line');
  /* a real picture stays */
  const pic = 'Moodboard\n![Hero banner](zc-att:att_123 =50%)\nNext line';
  assert.equal(fix(pic), pic);
  assert.equal(fix(fix(md)), fix(md), 'stable');
});
