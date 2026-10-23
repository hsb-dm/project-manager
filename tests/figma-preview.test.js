/* A Figma file's picture, shown before Figma's viewer (Oct 2026, server/link-preview.js, src/version-preview.js).
   Figma is a stand-in here (the fetch is injected): nothing leaves the machine. What may be fetched and nothing else —
   Figma's oEmbed, built from a figma.com file link's kind and key; the thumbnail it names, on figma.com or a subdomain;
   https, no user name, no port, redirects by hand to the same hosts, at most 3; 5 MB for the picture counted as it
   arrives, 10 seconds; a picture by its bytes. What is kept and for how long: 6 hours, a private file 1 hour, a failure
   10 minutes keeping the old picture, Refresh preview at most once a minute, one fetch per file at a time. Who may ask:
   signed-in members, 60 a minute each, Figma asked at most 30 times a minute. The real server's wiring: the end. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const LP = require('../server/link-preview');
const P = LP.pure;
const ROOT = path.join(__dirname, '..');

/* ---------- a stand-in for Figma ---------- */
const KEY = 'xt8O9mFeLl46C5InWwoMrN';
const OEMBED = key => 'https://www.figma.com/api/oembed?url=' + encodeURIComponent('https://www.figma.com/design/' + key);
const THUMB = key => 'https://api-cdn.figma.com/resize/thumbnails/' + key + '?expiration=1792972800&signature=abc&height=448&bucket=figma-alpha';
const WEBP = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x10, 0, 0, 0]), Buffer.from('WEBPVP8X'), Buffer.alloc(40, 7)]);
const json = (status, body, headers) => new Response(JSON.stringify(body), { status, headers: Object.assign({ 'content-type': 'application/json' }, headers || {}) });
const pic = (buf, type, headers) => new Response(buf, { status: 200, headers: Object.assign({ 'content-type': type || 'image/webp', 'content-length': String(buf.length) }, headers || {}) });
const moved = to => new Response(null, { status: 302, headers: { location: to } });
/* what Figma's oEmbed said for a real public file (23 Oct 2026), for another key */
const reply = (key, extra) => Object.assign({ version: '1.0', type: 'rich', title: 'Twenty', key, url: 'https://www.figma.com/design/' + key + '/Twenty?', provider_name: 'Figma', provider_url: 'https://www.figma.com', cache_age: 3600, width: 800, height: 450, html: '<iframe src="https://embed.figma.com/design/' + key + '"></iframe>', folder_name: 'App', thumbnail_url: THUMB(key), thumbnail_height: 448, thumbnail_width: 800 }, extra || {});
/* routes: exact address -> (init) => Response; anything else 404. Every address asked for is in .asked */
function figma(routes) {
  const asked = [], inits = [];
  const f = async (url, init) => { asked.push(url); inits.push(init); const h = routes[url]; return h ? h(init) : json(404, { error: true, status: 404, message: 'Not found.' }); };
  f.asked = asked; f.inits = inits; return f;
}
const publicFile = key => ({ [OEMBED(key)]: () => json(200, reply(key)), [THUMB(key)]: () => pic(WEBP) });
function setup(fetch, o) {
  o = o || {};
  const db = new DatabaseSync(':memory:'), clock = { t: Date.parse('2026-10-23T08:00:00Z') }, stored = [];
  const store = buf => { stored.push(buf); return '/files/' + require('crypto').createHash('sha256').update(buf).digest('hex') + '.webp'; };
  const svc = LP.create(db, { fetch, now: () => clock.t, store, limits: o.limits });
  const get = (url, opt) => svc.get((opt && opt.user) === undefined ? 'u1' : opt.user, url, !!(opt && opt.refresh));
  return { db, clock, stored, svc, get };
}
const link = (key, rest) => 'https://www.figma.com/design/' + key + (rest === undefined ? '/Hero-Banner-Q4' : rest);

/* ---------- which links are Figma file links ---------- */
test('a Figma file link is read for its kind, key, node-id and name; anything else is not one', () => {
  assert.deepEqual(P.parseFigmaLink('https://www.figma.com/design/' + KEY + '/Hero-Banner_Q4?node-id=12-345&t=abc'), { kind: 'design', key: KEY, nodeId: '12-345', name: 'Hero Banner Q4' });
  assert.deepEqual(P.parseFigmaLink('https://figma.com/file/ABC123'), { kind: 'file', key: 'ABC123', nodeId: null, name: '' });
  for (const k of ['file', 'design', 'proto', 'board', 'slides', 'make', 'deck']) assert.equal(P.parseFigmaLink('https://www.figma.com/' + k + '/ABC123/x').kind, k);
  assert.equal(P.parseFigmaLink('https://www.figma.com/design/ABC123/x?node-id=1:2').nodeId, '1:2');
  assert.equal(P.parseFigmaLink('https://www.figma.com/design/ABC123/x?node-id=%3Cscript%3E').nodeId, null, 'a node-id is letters, digits, - : ; _');
  assert.equal(P.parseFigmaLink('https://www.figma.com/design/ABC123/%F0%9F%93%B1APPMS_Banner').name, String.fromCodePoint(0x1F4F1) + 'APPMS Banner');
  for (const bad of ['http://www.figma.com/design/ABC123/x', 'https://www.figma.com.evil.test/design/ABC123/x', 'https://evilfigma.com/design/ABC123/x', 'https://embed.figma.com/design/ABC123/x',
    'https://user:pw@www.figma.com/design/ABC123/x', 'https://www.figma.com:8443/design/ABC123/x', 'https://www.figma.com/community/file/1035203688168086460', 'https://www.figma.com/files/team/1',
    'https://www.figma.com/design/../x', 'https://www.figma.com/design/A', 'https://www.figma.com/design/ABC-123/x', 'https://www.figma.com/api/oembed?url=x', 'javascript:alert(1)', 'data:text/html,x', '', 'https://www.figma.com/design/' + 'A'.repeat(129)])
    assert.equal(P.parseFigmaLink(bad), null, bad);
});
test('Figma is asked about the file by its kind and key alone, always on www.figma.com', () => {
  assert.equal(P.oembedUrl(P.parseFigmaLink('https://figma.com/design/' + KEY + '/Name?node-id=1-2&t=secret#x')), OEMBED(KEY));
  assert.equal(P.oembedUrl(P.parseFigmaLink('https://www.figma.com/proto/' + KEY + '/x')), 'https://www.figma.com/api/oembed?url=' + encodeURIComponent('https://www.figma.com/proto/' + KEY));
});
test('requests go only to Figma: the oEmbed on www.figma.com, the picture on figma.com or a subdomain, https, no user name, no port', () => {
  assert.ok(P.allowedHop(OEMBED(KEY), 'oembed'));
  assert.equal(P.allowedHop('https://api-cdn.figma.com/x', 'oembed'), null, 'the oEmbed is www.figma.com');
  for (const ok of ['https://api-cdn.figma.com/resize/thumbnails/x?y=1', 'https://s3-alpha-sig.figma.com/thumbnails/x', 'https://figma.com/x', 'https://www.figma.com/x']) assert.ok(P.allowedHop(ok, 'thumb'), ok);
  for (const bad of ['http://api-cdn.figma.com/x', 'https://api-cdn.figma.com:8443/x', 'https://u@api-cdn.figma.com/x', 'https://api-cdn.figma.com.evil.test/x', 'https://evil-figma.com/x', 'https://notfigma.com/x',
    'https://169.254.169.254/latest/meta-data', 'https://127.0.0.1/x', 'https://[::1]/x', 'https://localhost/x', 'https://figma-alpha-api.s3.us-west-2.amazonaws.com/x', 'https://api-cdn.figma.com./x', 'file:///etc/passwd', 'ftp://figma.com/x', 'nonsense'])
    assert.equal(P.allowedHop(bad, 'thumb'), null, bad);
  assert.equal(P.allowedHop('https://www.figma.com/x', 'other'), null);
});

/* ---------- a public file, a private one ---------- */
test('a public file: Figma is asked twice — its oEmbed, then its picture — and the picture is kept on this server', async () => {
  const f = figma(publicFile(KEY)), { get, stored } = setup(f);
  const r = await get(link(KEY, '/Hero-Banner-Q4?node-id=7-62'));
  assert.deepEqual(f.asked, [OEMBED(KEY), THUMB(KEY)]);
  assert.equal(stored.length, 1); assert.deepEqual(stored[0], WEBP);
  assert.match(r.thumb, /^\/files\/[a-f0-9]{64}\.webp$/);
  assert.deepEqual({ provider: r.provider, title: r.title, width: r.width, height: r.height, nodeId: r.nodeId, private: r.private, unavailable: r.unavailable }, { provider: 'figma', title: 'Twenty', width: 800, height: 448, nodeId: '7-62', private: false, unavailable: false });
  /* nothing but a plain GET: no redirect followed for it, no credentials */
  for (const i of f.inits) { assert.equal(i.redirect, 'manual'); assert.equal(i.credentials, 'omit'); assert.equal(i.method, 'GET'); assert.ok(!i.headers.cookie && !i.headers.authorization); }
});
test('a private file (Not found): no picture, the name from its link, and only the oEmbed was asked', async () => {
  const f = figma({}), { get, stored } = setup(f);
  const r = await get(link('Priv4te99', '/Moodboard-Draft'));
  assert.deepEqual(f.asked, [OEMBED('Priv4te99')]);
  assert.equal(stored.length, 0);
  assert.equal(r.private, true); assert.equal(r.thumb, null); assert.equal(r.title, 'Moodboard Draft'); assert.equal(r.unavailable, false);
});
test('a file Figma describes without a thumbnail is shown as private, with its real name', async () => {
  const f = figma({ [OEMBED(KEY)]: () => json(200, reply(KEY, { thumbnail_url: undefined, title: 'KV <b>Ramadan</b>' })) }), { get } = setup(f);
  const r = await get(link(KEY));
  assert.equal(r.private, true); assert.equal(r.title, 'KV Ramadan'); assert.equal(f.asked.length, 1);
});

/* ---------- not an open proxy ---------- */
test('a thumbnail_url anywhere but Figma is never asked for', async () => {
  for (const evil of ['http://169.254.169.254/latest/meta-data/', 'https://evil.example/x.png', 'https://api-cdn.figma.com.evil.test/x', 'http://api-cdn.figma.com/x', 'https://api-cdn.figma.com:444/x', 'https://u:p@api-cdn.figma.com/x', 'https://localhost/x', 'javascript:alert(1)']) {
    const f = figma({ [OEMBED(KEY)]: () => json(200, reply(KEY, { thumbnail_url: evil })) }), { get, stored } = setup(f);
    const r = await get(link(KEY));
    assert.deepEqual(f.asked, [OEMBED(KEY)], evil);
    assert.equal(stored.length, 0); assert.equal(r.thumb, null); assert.equal(r.unavailable, true, evil);
  }
});
test('redirects are followed by hand, only to Figma, at most 3', async () => {
  /* within Figma: followed */
  let f = figma({ [OEMBED(KEY)]: () => json(200, reply(KEY)), [THUMB(KEY)]: () => moved('https://s3-alpha.figma.com/t/1'), 'https://s3-alpha.figma.com/t/1': () => pic(WEBP) }), s = setup(f);
  assert.ok((await s.get(link(KEY))).thumb); assert.deepEqual(f.asked.slice(1), [THUMB(KEY), 'https://s3-alpha.figma.com/t/1']);
  /* anywhere else, or to http: refused, and not asked */
  for (const to of ['http://169.254.169.254/latest', 'https://evil.example/a.webp', 'http://api-cdn.figma.com/x', '//evil.example/x']) {
    f = figma({ [OEMBED(KEY)]: () => json(200, reply(KEY)), [THUMB(KEY)]: () => moved(to) }); s = setup(f);
    const r = await s.get(link(KEY));
    assert.equal(r.thumb, null, to); assert.equal(f.asked.length, 2, to);
  }
  /* the oEmbed redirected off www.figma.com: refused */
  f = figma({ [OEMBED(KEY)]: () => moved('https://api-cdn.figma.com/oembed') }); s = setup(f);
  assert.equal((await s.get(link(KEY))).unavailable, true); assert.equal(f.asked.length, 1);
  /* four hops: refused at the fourth */
  const hops = { [OEMBED(KEY)]: () => json(200, reply(KEY)), [THUMB(KEY)]: () => moved('https://a.figma.com/1') };
  for (let i = 1; i <= 4; i++) hops['https://a.figma.com/' + i] = () => moved('https://a.figma.com/' + (i + 1));
  f = figma(hops); s = setup(f);
  assert.equal((await s.get(link(KEY))).thumb, null); assert.equal(f.asked.length, 5, 'the oEmbed, the picture and 3 redirects');
});
test('5 MB at most, counted as it arrives; a picture by its bytes', async () => {
  const lim = { thumbBytes: 1000 };
  /* said too large */
  let f = figma({ [OEMBED(KEY)]: () => json(200, reply(KEY)), [THUMB(KEY)]: () => pic(Buffer.alloc(10), 'image/webp', { 'content-length': '6000000' }) }), s = setup(f);
  assert.equal((await s.get(link(KEY))).thumb, null);
  /* too large without saying so: stopped while it arrives */
  let pulled = 0;
  const endless = () => new Response(new ReadableStream({ pull(c) { pulled++; c.enqueue(new Uint8Array(400)); if (pulled > 50) c.close(); } }), { status: 200, headers: { 'content-type': 'image/webp' } });
  f = figma({ [OEMBED(KEY)]: () => json(200, reply(KEY)), [THUMB(KEY)]: endless }); s = setup(f, { limits: lim });
  assert.equal((await s.get(link(KEY))).thumb, null); assert.ok(pulled < 10, 'stopped after ' + pulled + ' pieces');
  /* the 5 MB limit itself */
  assert.equal(LP.LIMITS.thumbBytes, 5 * 1024 * 1024); assert.equal(LP.LIMITS.timeoutMs, 10000); assert.equal(LP.LIMITS.redirects, 3);
  /* not a picture, whatever it is called; an SVG is not taken either */
  for (const [body, type] of [[Buffer.from('<html><body>sign in</body></html>'), 'image/webp'], [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml'], [WEBP, 'text/html']]) {
    f = figma({ [OEMBED(KEY)]: () => json(200, reply(KEY)), [THUMB(KEY)]: () => pic(body, type) }); s = setup(f);
    const r = await s.get(link(KEY)); assert.equal(r.thumb, null, type); assert.equal(s.stored.length, 0);
  }
  /* an oEmbed reply over 256 KB, or not JSON */
  f = figma({ [OEMBED(KEY)]: () => json(200, reply(KEY, { html: 'x'.repeat(300 * 1024) })) }); s = setup(f);
  assert.equal((await s.get(link(KEY))).unavailable, true); assert.equal(f.asked.length, 1);
  f = figma({ [OEMBED(KEY)]: () => new Response('<!doctype html>', { status: 200 }) }); s = setup(f);
  assert.equal((await s.get(link(KEY))).unavailable, true);
});
test('10 seconds at most: a Figma that does not answer is given up on', { timeout: 5000 }, async () => {
  const f = figma({ [OEMBED(KEY)]: init => new Promise((resolve, reject) => { init.signal.addEventListener('abort', () => reject(new Error('aborted'))); }) });
  const s = setup(f, { limits: { timeoutMs: 60 } }), t0 = Date.now();
  const r = await s.get(link(KEY));
  assert.equal(r.unavailable, true); assert.ok(Date.now() - t0 < 2000);
  assert.equal(s.svc.read(KEY).reason, 'timeout');
  assert.ok(f.inits[0].signal.aborted, 'the request itself is aborted');
});

/* ---------- what is kept, and for how long ---------- */
test('kept 6 hours by file key: other links to the same file, with or without node-id, ask Figma nothing', async () => {
  const f = figma(publicFile(KEY)), s = setup(f);
  const a = await s.get(link(KEY));
  const b = await s.get('https://figma.com/file/' + KEY + '/Other-Name?node-id=1-2');
  assert.equal(f.asked.length, 2); assert.equal(b.thumb, a.thumb); assert.equal(b.nodeId, '1-2');
  s.clock.t += 6 * 3600e3 - 1000; await s.get(link(KEY)); assert.equal(f.asked.length, 2, 'still fresh');
});
test('after 6 hours the old picture shows at once and a new one is fetched behind it', async () => {
  let n = 0; const pics = [WEBP, Buffer.concat([WEBP, Buffer.from([1, 2, 3])])];
  const f = figma({ [OEMBED(KEY)]: () => json(200, reply(KEY)), [THUMB(KEY)]: () => pic(pics[Math.min(n++, 1)]) }), s = setup(f);
  const first = await s.get(link(KEY));
  s.clock.t += 6 * 3600e3 + 1000;
  const again = await s.get(link(KEY));
  assert.equal(again.thumb, first.thumb, 'the old one, at once');
  await s.svc.inflight.get(KEY);
  assert.equal(f.asked.length, 4);
  const next = await s.get(link(KEY));
  assert.notEqual(next.thumb, first.thumb); assert.equal(f.asked.length, 4);
});
test('a private file is asked again after an hour; a failure after 10 minutes, keeping the old picture', async () => {
  let open = false, down = false;
  const f = figma({ [OEMBED(KEY)]: () => (down ? json(503, {}) : open ? json(200, reply(KEY)) : json(404, { error: true, status: 404, message: 'Not found.' })), [THUMB(KEY)]: () => pic(WEBP) }), s = setup(f);
  assert.equal((await s.get(link(KEY))).private, true);
  s.clock.t += 59 * 60e3; assert.equal((await s.get(link(KEY))).private, true); assert.equal(f.asked.length, 1);
  open = true; s.clock.t += 2 * 60e3;
  const ok = await s.get(link(KEY)); assert.ok(ok.thumb); assert.equal(f.asked.length, 3);
  /* Figma down when the 6 hours are over: the picture stays, asked again in 10 minutes */
  down = true; s.clock.t += 6 * 3600e3 + 1;
  assert.equal((await s.get(link(KEY))).thumb, ok.thumb); await s.svc.inflight.get(KEY);
  assert.equal(f.asked.length, 4);
  s.clock.t += 9 * 60e3; assert.equal((await s.get(link(KEY))).thumb, ok.thumb); assert.equal(f.asked.length, 4);
  /* a failure with no picture yet: unavailable, asked again in 10 minutes */
  const g = figma({ [OEMBED('Other1')]: () => json(500, {}) }), t = setup(g);
  assert.equal((await t.get(link('Other1'))).unavailable, true);
  t.clock.t += 5 * 60e3; await t.get(link('Other1')); assert.equal(g.asked.length, 1);
  t.clock.t += 6 * 60e3; await t.get(link('Other1')); assert.equal(g.asked.length, 2);
});
test('Refresh preview asks Figma at once, but not twice within a minute', async () => {
  const f = figma(publicFile(KEY)), s = setup(f);
  await s.get(link(KEY));
  s.clock.t += 30e3; await s.get(link(KEY), { refresh: true }); assert.equal(f.asked.length, 2, 'within the minute: kept');
  s.clock.t += 31e3; await s.get(link(KEY), { refresh: true }); assert.equal(f.asked.length, 4, 'asked again');
});
test('one fetch for a file however many ask at once', async () => {
  let release; const gate = new Promise(r => { release = r; });
  const f = figma({ [OEMBED(KEY)]: async () => { await gate; return json(200, reply(KEY)); }, [THUMB(KEY)]: () => pic(WEBP) }), s = setup(f);
  const all = Promise.all([s.get(link(KEY), { user: 'u1' }), s.get(link(KEY), { user: 'u2' }), s.get(link(KEY, '/x?node-id=1-2'), { user: 'u3' })]);
  await new Promise(r => setTimeout(r, 10)); release();
  const out = await all;
  assert.equal(f.asked.length, 2); assert.ok(out.every(r => r.thumb === out[0].thumb && r.thumb));
});

/* ---------- who may ask, and how often ---------- */
test('signed-in members only; a Figma file link only', async () => {
  const { get } = setup(figma({}));
  await assert.rejects(get(link(KEY), { user: null }), e => e.status === 401);
  for (const url of ['https://example.org/x', 'https://drive.google.com/file/d/abc/view', 'http://www.figma.com/design/ABC123/x', 'https://www.figma.com.evil.test/design/ABC123/x', 'http://169.254.169.254/latest', 'file:///etc/passwd', ''])
    await assert.rejects(get(url), e => e.status === 400, url);
});
test('60 asks a minute per person; Figma asked at most 30 times a minute for everyone and 12 for one person', async () => {
  const routes = {}; for (let i = 0; i < 40; i++) Object.assign(routes, publicFile('Key' + i));
  const f = figma(routes), s = setup(f);
  for (let i = 0; i < 60; i++) await s.get(link(KEY), { user: 'busy' });
  await assert.rejects(s.get(link(KEY), { user: 'busy' }), e => e.status === 429);
  /* one person: 12 files from Figma, then "unavailable" without asking */
  s.clock.t += 60e3;
  const asked0 = f.asked.length;
  const mine = []; for (let i = 0; i < 14; i++) mine.push(await s.get(link('Key' + i), { user: 'u9' }));
  assert.equal(mine.filter(r => r.thumb).length, 12); assert.ok(mine.slice(12).every(r => r.unavailable && !r.thumb)); assert.equal(f.asked.length - asked0, 24);
  /* everyone: 30 a minute (6 people, 6 new files each: 30 are looked up, 6 wait for the next minute) */
  s.clock.t += 60e3;
  const g = {}; for (let i = 0; i < 36; i++) Object.assign(g, publicFile('All' + i));
  const f2 = figma(g), t = setup(f2), out = [];
  for (let i = 0; i < 36; i++) out.push(await t.get(link('All' + i), { user: 'p' + (i % 6) }));
  assert.equal(out.filter(r => r.thumb).length, 30); assert.equal(f2.asked.length, 60);
  assert.ok(out.filter(r => !r.thumb).every(r => r.unavailable));
  /* the next minute they are looked up */
  t.clock.t += 60e3; assert.ok((await t.get(link('All35'), { user: 'p5' })).thumb);
});

/* ---------- the real server's wiring ---------- */
test('the browser tests\' stand-in is taken only from e2e/, and answers like Figma', async () => {
  assert.equal(LP.stubFrom('', ROOT), null);
  for (const bad of ['server/db.js', path.join(ROOT, 'server', 'db.js'), 'e2e/../server/db.js', path.join(require('os').tmpdir(), 'x.js'), 'e2e/fixtures/red.png'])
    assert.equal(LP.stubFrom(bad, ROOT), null, bad);
  const stub = LP.stubFrom('e2e/fixtures/figma-stub.js', ROOT);
  assert.equal(typeof stub, 'function');
  const s = setup(stub), r = await s.get('https://www.figma.com/design/FgPubHero123/Hero-Banner');
  assert.ok(r.thumb); assert.equal(r.title, 'Hero Banner Q4'); assert.equal(require('../server/uploads').imageKind(s.stored[0]), 'image/png');
  assert.equal((await s.get('https://www.figma.com/design/ABC123/Banner')).private, true);
  await assert.rejects(stub('https://example.org/'), /no network/);
});
test('the server registers GET /api/link-preview behind the session, through the guarded fetch', async () => {
  const src = fs.readFileSync(path.join(ROOT, 'server', 'server.js'), 'utf8');
  assert.match(src, /linkPreviewLib\.register\(db, \{ route, fetch: linkPreviewLib\.stubFrom\(process\.env\.COS_LINK_FETCH_STUB, path\.join\(__dirname, "\.\."\)\) \|\| chat\.guardedFetch \}\)/);
  const open = src.match(/const OPEN = new Set\(\[([^\]]*)\]\)/)[1];
  assert.ok(!/link-preview/.test(open), 'not an open route');
  const routes = []; LP.register(new DatabaseSync(':memory:'), { route: (m, p, h) => routes.push({ m, p, h }), fetch: figma({}) });
  assert.deepEqual(routes.map(r => r.m + ' ' + r.p), ['GET /api/link-preview']);
  await assert.rejects(Promise.resolve().then(() => routes[0].h(null, {}, { url: link(KEY) })), e => e.status === 401);
  /* the network under it: a name that leads to this machine is refused when it connects */
  const chat = require('../server/messages')(new DatabaseSync(':memory:'), 'ws1', () => {}, {});
  await assert.rejects(chat.guardedFetch('https://localhost:9/x', { headers: {} }), e => e.code === 'EBLOCKED');
});
