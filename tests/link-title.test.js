/* GET /api/links/title — the name of a Google Drive / Docs link, read from the page Google serves
   for a link shared with "anyone with the link".

   These tests do not reach Google: they seed the cache with what Google's pages carry (a public
   folder's title, a private link's sign-in title) and check what the route makes of it, and that
   it refuses to become a fetcher for anything that is not Google. Whether Google still puts the
   name in the title is the one thing only a real link can confirm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

function setup() {
  const db = new DatabaseSync(':memory:');
  const routes = [];
  require('../server/messages')(db, 'ws1', (method, pattern, handler) => routes.push({ method, pattern, handler }), {});
  const r = routes.find(x => x.method === 'GET' && x.pattern === '/api/links/title');
  assert.ok(r, 'the route exists');
  const call = url => Promise.resolve().then(() => r.handler({ id: 'u1', role: 'member', caps: {} }, {}, { url }));
  const seed = (url, title, status) => db.prepare("INSERT INTO link_metadata_cache(normalized_url,hostname,title,description,favicon_url,image_url,status,fetched_at,expires_at) VALUES(?,?,?,'','','',?,?,?)")
    .run(url, new URL(url).hostname, title, status || 'ok', new Date().toISOString(), new Date(Date.now() + 3600e3).toISOString());
  return { call, seed };
}

test('a shared folder gives its own name, without the "- Google Drive" Google adds', async () => {
  const { call, seed } = setup();
  const url = 'https://drive.google.com/drive/folders/1AbCdEfGh';
  seed(url, 'Q4 Campaign - Google Drive');
  assert.deepEqual(await call(url), { title: 'Q4 Campaign' });
});

test('Docs, Sheets and Slides lose their suffix too', async () => {
  const { call, seed } = setup();
  const cases = [
    ['https://docs.google.com/document/d/1x', 'Brief v2 - Google Docs', 'Brief v2'],
    ['https://docs.google.com/spreadsheets/d/1y', 'Budget – Google Sheets', 'Budget'],
    ['https://docs.google.com/presentation/d/1z', 'Pitch deck - Google Slides', 'Pitch deck']
  ];
  for (const [url, raw, want] of cases) { seed(url, raw); assert.deepEqual(await call(url), { title: want }, raw); }
});

/* Google writes its own product name after the dash in the reader's language — these two are what
   it actually returned to a request from Indonesia. */
test('the "- Google …" ending is dropped in any language', async () => {
  const { call, seed } = setup();
  const cases = [
    ['https://docs.google.com/spreadsheets/d/2a', 'Example Spreadsheet - Google Spreadsheet', 'Example Spreadsheet'],
    ['https://docs.google.com/document/d/2b', 'Docs API Quickstart - Google Dokumen', 'Docs API Quickstart'],
    ['https://drive.google.com/drive/folders/2c', 'datasets - Google Drive', 'datasets'],
    ['https://drive.google.com/drive/folders/2d', 'Q4 – Final banners - Google Drive', 'Q4 – Final banners']
  ];
  for (const [url, raw, want] of cases) { seed(url, raw); assert.deepEqual(await call(url), { title: want }, raw); }
});

test('a private link answers with no name, never "Sign in"', async () => {
  const { call, seed } = setup();
  for (const [i, raw] of ['Sign in - Google Accounts', 'Google Drive: Sign-in', 'Google Drive', 'Masuk - Akun Google'].entries()) {
    const url = 'https://drive.google.com/drive/folders/private' + i;
    seed(url, raw);
    assert.deepEqual(await call(url), { title: '' }, raw);
  }
});

test('a link that could not be read is remembered as having no name', async () => {
  const { call, seed } = setup();
  const url = 'https://drive.google.com/drive/folders/gone';
  seed(url, '', 'blocked');
  assert.deepEqual(await call(url), { title: '' });
});

test('it will not fetch anything that is not Google Drive or Docs', async () => {
  const { call } = setup();
  for (const url of ['https://example.org/x', 'http://169.254.169.254/latest/meta-data', 'https://drive.google.com.evil.test/a', 'https://accounts.google.com/x', 'file:///etc/passwd', '']) {
    await assert.rejects(call(url), e => e.status === 400, 'refused: ' + url);
  }
});

/* Figma, YouTube, Vimeo, Loom and Miro are named by their own oEmbed (Oct 2026): a Figma link shows its file's name,
   not only the words in its address. Only their file, video and board addresses are looked up. */
test('a Figma file, a YouTube video: their own names; the service name alone is no name', async () => {
  const { call, seed } = setup();
  const figma = 'https://www.figma.com/design/AbCdEf123456/KV-Insurance';
  seed(figma, 'Key Visual — Insurance Q4');
  assert.deepEqual(await call(figma), { title: 'Key Visual — Insurance Q4' });
  const yt = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
  seed(yt, 'Brand film 2026');
  assert.deepEqual(await call(yt), { title: 'Brand film 2026' });
  const bare = 'https://www.figma.com/file/ZzYy987/Untitled';
  seed(bare, 'Figma');
  assert.deepEqual(await call(bare), { title: '' }, 'the service name alone');
});

test('only their files, videos and boards are looked up — not any page on those hosts', async () => {
  const { call } = setup();
  for (const url of ['https://www.figma.com/community/file/123', 'https://www.figma.com/pricing', 'https://www.youtube.com/@channel', 'https://miro.com/pricing', 'https://www.figma.com.evil.test/design/a/b']) {
    await assert.rejects(call(url), e => e.status === 400, 'refused: ' + url);
  }
});
