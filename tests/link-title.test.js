/* GET /api/links/title — the name of a Google Drive / Docs link, read from the page Google serves
   for a link shared with "anyone with the link".

   These tests do not reach Google: they seed the cache with what Google's pages carry (a public
   folder's title, a private link's sign-in title) and check what the route makes of it, and that
   it refuses to become a fetcher for anything that is not Google. Whether Google still puts the
   name in the title is the one thing only a real link can confirm. */
const test = require('node:test');
const assert = require('node:assert/strict');
const { DatabaseSync } = require('node:sqlite');

function setup(deps) {
  const db = new DatabaseSync(':memory:');
  const routes = [];
  require('../server/messages')(db, 'ws1', (method, pattern, handler) => routes.push({ method, pattern, handler }), deps || {});
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

/* ---------- the address each oEmbed is asked at (server/oembed-links.js) ----------
   A stand-in for the five services (deps.linkFetch, so nothing leaves the machine) that answers as they did when asked
   with curl on 23 Oct 2026: Figma refuses a link without www ("expected the url host to be a figma host"), http and a
   community link; Loom refuses a fragment or a slash straight after the id; Miro refuses www.miro.com. Every address
   asked is kept, so each test checks what was sent, not only what came back. */
const FIGMA_KEY = 'xt8O9mFeLl46C5InWwoMrN', LOOM_ID = '0281766fa2d04bb788eaf19e65135184', MIRO_ID = 'uXjVPZH3NrA=';
function services() {
  const asked = [];
  const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  const f = async (url, init) => {
    asked.push(url);
    assert.equal(init.redirect, 'manual'); assert.equal(init.method, 'GET');
    const u = new URL(url), link = String(u.searchParams.get('url') || '');
    if (u.origin + u.pathname === 'https://www.figma.com/api/oembed') {
      if (!/^https:\/\//.test(link)) return json(400, { error: true, message: "Error: expected the url scheme to be 'https'", status: 400 });
      if (!/^https:\/\/www\.figma\.com\//.test(link)) return json(400, { error: true, message: 'Error: expected the url host to be a figma host', status: 400 });
      if (/\/community\//.test(link)) return json(400, { error: true, message: 'Not a Figma URL', status: 400 });
      return json(200, { type: 'rich', title: 'Twenty', provider_name: 'Figma' });
    }
    if (u.origin + u.pathname === 'https://www.loom.com/v1/oembed') return /\/share\/(?:[^/]*-)?[0-9a-f]{32}(\?[^#]*)?$/i.test(link) ? json(200, { type: 'video', title: 'Check out loom.com' }) : new Response('Bad Request', { status: 400 });
    if (u.origin + u.pathname === 'https://miro.com/api/v1/oembed') return /^https?:\/\/miro\.com\/app\/board\//.test(link) ? json(200, { type: 'rich', title: 'Miro embed example' }) : json(400, { error: { message: "The required 'url' query parameter is invalid. Check the URL, and make sure it's valid", code: 400 } });
    if (u.origin + u.pathname === 'https://www.youtube.com/oembed') return json(200, { type: 'video', title: 'Never Gonna Give You Up' });
    if (u.origin + u.pathname === 'https://vimeo.com/api/oembed.json') return json(200, { type: 'video', title: 'Big Buck Bunny' });
    throw new Error('no network for ' + u.hostname);
  };
  f.asked = asked; return f;
}
const askedLink = endpoint => new URL(endpoint).searchParams.get('url');

test('a Figma link without www is asked about at www.figma.com, as Figma accepts it, and gets its name', async () => {
  const fetch = services(), { call } = setup({ linkFetch: fetch });
  const cases = [
    ['https://figma.com/design/' + FIGMA_KEY + '/Twenty', 'https://www.figma.com/design/' + FIGMA_KEY + '/Twenty'],
    ['https://figma.com/design/' + FIGMA_KEY + '/Twenty?node-id=12-345&t=AbC123-0#frame', 'https://www.figma.com/design/' + FIGMA_KEY + '/Twenty?node-id=12-345'],
    ['http://figma.com/file/' + FIGMA_KEY, 'https://www.figma.com/file/' + FIGMA_KEY],
    ['www.figma.com/proto/' + FIGMA_KEY + '/Twenty?node-id=%3Cx%3E', 'https://www.figma.com/proto/' + FIGMA_KEY + '/Twenty'],
    ['https://FIGMA.COM/design/' + FIGMA_KEY + '/branch/BrAnCh42/Twenty', 'https://www.figma.com/design/' + FIGMA_KEY + '/branch/BrAnCh42/Twenty']
  ];
  for (const [link, sent] of cases) {
    const before = fetch.asked.length;
    assert.deepEqual(await call(link), { title: 'Twenty' }, link);
    assert.equal(fetch.asked.length, before + 1, 'one request: ' + link);
    const endpoint = fetch.asked[before];
    assert.equal(endpoint, 'https://www.figma.com/api/oembed?url=' + encodeURIComponent(sent), link);
    assert.equal(askedLink(endpoint), sent);
  }
  for (const k of ['file', 'design', 'proto', 'board', 'slides', 'make', 'deck']) {
    const { call: c } = setup({ linkFetch: fetch });
    assert.deepEqual(await c('https://figma.com/' + k + '/' + FIGMA_KEY + '/Twenty'), { title: 'Twenty' }, k);
    assert.equal(askedLink(fetch.asked[fetch.asked.length - 1]), 'https://www.figma.com/' + k + '/' + FIGMA_KEY + '/Twenty');
  }
});

test('a Figma link whose key is not one, or a community file, is refused before anything is fetched', async () => {
  const fetch = services(), { call } = setup({ linkFetch: fetch });
  for (const url of ['https://figma.com/design/ABC-123/x', 'https://figma.com/design/A/x', 'https://www.figma.com/design/' + 'A'.repeat(129) + '/x', 'https://figma.com/design/ab_cd/x',
    'https://figma.com/design/%3Cscript%3E/x', 'https://figma.com:8443/design/' + FIGMA_KEY + '/x', 'https://figma.com/community/file/1035203688168086460/material-3-design-kit',
    'https://www.figma.com/community/file/1035203688168086460', 'https://figma.com/files/team/1', 'https://embed.figma.com/design/' + FIGMA_KEY + '/x']) {
    await assert.rejects(call(url), e => e.status === 400, 'refused: ' + url);
  }
  assert.deepEqual(fetch.asked, [], 'nothing was fetched');
});

test('Loom and Miro links are rebuilt as their oEmbed accepts them; an id that is not one is refused', async () => {
  const fetch = services(), { call } = setup({ linkFetch: fetch });
  const cases = [
    ['https://loom.com/share/' + LOOM_ID + '#t=5', 'https://www.loom.com/share/' + LOOM_ID, 'Check out loom.com'],
    ['https://www.loom.com/share/' + LOOM_ID + '/', 'https://www.loom.com/share/' + LOOM_ID, 'Check out loom.com'],
    ['https://www.loom.com/share/Brand-review-round-2-' + LOOM_ID + '?sid=4f1b2c3d-1111#t=12', 'https://www.loom.com/share/' + LOOM_ID, 'Check out loom.com'],
    ['https://www.miro.com/app/board/' + MIRO_ID + '/?share_link_id=123456789012', 'https://miro.com/app/board/' + MIRO_ID + '/', 'Miro embed example'],
    ['https://miro.com/app/board/uXjVPZH3NrA%3D/?moveToWidget=3458764512345678901&cot=14#x', 'https://miro.com/app/board/' + MIRO_ID + '/', 'Miro embed example'],
    ['http://miro.com/app/board/o9J_lJibmS4=', 'https://miro.com/app/board/o9J_lJibmS4=/', 'Miro embed example']
  ];
  for (const [link, sent, title] of cases) {
    const before = fetch.asked.length;
    assert.deepEqual(await call(link), { title }, link);
    assert.equal(askedLink(fetch.asked[before]), sent, link);
  }
  const n = fetch.asked.length;
  for (const url of ['https://www.loom.com/share/folder/abc', 'https://www.loom.com/share/123', 'https://www.loom.com/share/' + LOOM_ID + '/extra', 'https://www.loom.com/share/' + LOOM_ID.slice(1) + 'g',
    'https://miro.com/app/board/', 'https://www.miro.com/app/board/a%2Fb/', 'https://miro.com/app/board/' + MIRO_ID + '/extra', 'https://miro.com/app/board/<x>/'])
    await assert.rejects(call(url), e => e.status === 400, 'refused: ' + url);
  assert.equal(fetch.asked.length, n, 'nothing was fetched for them');
});

test('YouTube and Vimeo take the forms people paste as they are written', async () => {
  const fetch = services(), { call } = setup({ linkFetch: fetch });
  for (const link of ['https://m.youtube.com/watch?v=dQw4w9WgXcQ&feature=share', 'https://youtu.be/dQw4w9WgXcQ?si=Xy3_abcDEF12&t=42', 'https://youtube.com/shorts/tPEE9ZwTmy0?si=Xy3_abcDEF12', 'https://www.youtube.com/live/4xDzrJKXOOY']) {
    const before = fetch.asked.length;
    assert.deepEqual(await call(link), { title: 'Never Gonna Give You Up' }, link);
    assert.equal(fetch.asked[before], 'https://www.youtube.com/oembed?format=json&url=' + encodeURIComponent(link), link);
  }
  for (const link of ['https://vimeo.com/1084537#t=30s', 'https://www.vimeo.com/1084537/0123456789?share=copy']) {
    const before = fetch.asked.length;
    assert.deepEqual(await call(link), { title: 'Big Buck Bunny' }, link);
    assert.equal(fetch.asked[before], 'https://vimeo.com/api/oembed.json?url=' + encodeURIComponent(link), link);
  }
  for (const url of ['https://youtu.be/', 'https://www.youtube.com/embed/dQw4w9WgXcQ', 'https://vimeo.com/channels/staffpicks']) await assert.rejects(call(url), e => e.status === 400, 'refused: ' + url);
});

test('a name and a picture come from the same Figma link check (server/oembed-links.js)', () => {
  const links = require('../server/oembed-links'), LP = require('../server/link-preview');
  assert.equal(LP.pure.parseFigmaLink, links.parseFigmaLink, 'link-preview checks a link with the shared helper');
  const p = links.parseFigmaLink('https://figma.com/design/' + FIGMA_KEY + '/Twenty?node-id=1-2');
  assert.equal(LP.pure.oembedUrl(p), links.figmaOembedUrl(p, false));
  assert.equal(askedLink(LP.pure.oembedUrl(p)), 'https://www.figma.com/design/' + FIGMA_KEY, 'a picture: the kind and key alone');
  assert.equal(askedLink(links.oembedFor('https://figma.com/design/' + FIGMA_KEY + '/Twenty?node-id=1-2')), 'https://www.figma.com/design/' + FIGMA_KEY + '/Twenty?node-id=1-2', 'a name: the path and node-id too');
  assert.equal(links.parseFigmaLink('http://www.figma.com/design/' + FIGMA_KEY), null, 'a picture is asked only for an https link');
});

test('without a stand-in the name is fetched through the guarded fetch, as before', () => {
  const src = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'server', 'messages.js'), 'utf8');
  assert.match(src, /const oembedHop = linkFetch \? [^\n]* : safeTarget;/);
  assert.match(src, /const oembedGet = linkFetch \? [^\n]* : pinnedFetch;/);
  assert.match(src, /const linkFetch = deps && typeof deps\.linkFetch === 'function' \? deps\.linkFetch : null;/);
});
