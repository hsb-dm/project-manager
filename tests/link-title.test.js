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
