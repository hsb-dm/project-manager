/* A YouTube, Vimeo or Loom video's picture, shown before its player (Oct 2026, server/link-preview.js,
   shared/link-providers.js, src/version-preview.js), as a Figma file's already was (tests/figma-preview.test.js).
   The providers are stand-ins here (the fetch is injected): nothing leaves the machine. The replies are the shapes
   each provider gave for real public videos on 23 Oct 2026 (server/link-preview.js has them).
   - which links are videos, and their ids: every form of link, the tricky ones, and what is refused;
   - the oEmbed asked from the id alone; the thumbnail only from the provider's own picture hosts;
   - what the page is told: the player's shape, the length, private for a video the provider will not describe;
   - how long it is kept: 7 days, private an hour, a failure 10 minutes; each provider's own budget;
   - the table shared with Figma, the stored length added to a table that had none, and the browser tests' stand-in. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const crypto = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const LP = require('../server/link-preview');
const LINKS = require('../shared/link-providers');
const P = LP.pure;
const ROOT = path.join(__dirname, '..');

/* ---------- stand-ins for the providers ---------- */
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10]), Buffer.from('JFIF'), Buffer.alloc(40, 9)]);
const enc = encodeURIComponent;
const YT_OE = (id, shorts) => 'https://www.youtube.com/oembed?format=json&url=' + enc(shorts ? 'https://www.youtube.com/shorts/' + id : 'https://www.youtube.com/watch?v=' + id);
const YT_TH = (id, shorts) => 'https://i.ytimg.com/vi/' + id + (shorts ? '/hq2.jpg' : '/hqdefault.jpg');
const VM_OE = (id, hash) => 'https://vimeo.com/api/oembed.json?url=' + enc('https://vimeo.com/' + id + (hash ? '/' + hash : '')) + '&width=1280';
const VM_TH = id => 'https://i.vimeocdn.com/video/' + id + '-abc-d_960?region=us';
const LM_OE = id => 'https://www.loom.com/v1/oembed?url=' + enc('https://www.loom.com/share/' + id);
const LM_TH = id => 'https://cdn.loom.com/sessions/thumbnails/' + id + '-00001.jpg';
const YT = 'dQw4w9WgXcQ', SHORT = 'pVRefGmQDJM', VM = '1084537', LM = '0281766fa2d04bb788eaf19e65135184';
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const text = (status, body, type) => new Response(body, { status, headers: { 'content-type': type } });
const pic = (buf, type) => new Response(buf, { status: 200, headers: { 'content-type': type || 'image/jpeg', 'content-length': String(buf.length) } });
const moved = to => new Response(null, { status: 302, headers: { location: to } });
/* what each said for a real public video (23 Oct 2026), the long fields cut */
const ytReply = (id, extra) => Object.assign({ title: 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)', author_name: 'Rick Astley', author_url: 'https://www.youtube.com/@RickAstleyYT', type: 'video', height: 113, width: 200, version: '1.0', provider_name: 'YouTube', provider_url: 'https://www.youtube.com/', thumbnail_height: 360, thumbnail_width: 480, thumbnail_url: YT_TH(id), html: '<iframe src="https://www.youtube.com/embed/' + id + '?feature=oembed"></iframe>' }, extra || {});
const vmReply = (id, extra) => Object.assign({ type: 'video', version: '1.0', provider_name: 'Vimeo', provider_url: 'https://vimeo.com/', title: 'Big Buck Bunny', author_name: 'Blender', is_plus: '0', account_type: 'basic', html: '<iframe src="https://player.vimeo.com/video/' + id + '?app_id=122963"></iframe>', width: 1280, height: 720, duration: 597, thumbnail_url: VM_TH(id), thumbnail_width: 960, thumbnail_height: 540, video_id: +id, uri: '/videos/' + id }, extra || {});
const lmReply = (id, extra) => Object.assign({ type: 'video', version: '1.0', html: '<iframe src="https://www.loom.com/embed/' + id + '"></iframe>', height: 960, width: 1280, provider_name: 'Loom', provider_url: 'https://www.loom.com', thumbnail_height: 960, thumbnail_width: 1280, thumbnail_url: LM_TH(id), duration: 21, title: 'Check out loom.com', description: 'Testing' }, extra || {});
/* routes: exact address -> (init) => Response; anything else 404. Every address asked for is in .asked */
function net(routes) {
  const asked = [];
  const f = async (url, init) => { asked.push(url); const h = routes[url]; return h ? h(init) : text(404, 'Not Found', 'text/plain'); };
  f.asked = asked; return f;
}
const publicVideos = () => ({
  [YT_OE(YT)]: () => json(200, ytReply(YT)), [YT_TH(YT)]: () => pic(JPEG),
  [YT_OE(SHORT, true)]: () => json(200, ytReply(SHORT, { width: 113, height: 200, thumbnail_url: YT_TH(SHORT, true), title: 'How to Write Clearly' })), [YT_TH(SHORT, true)]: () => pic(JPEG),
  [VM_OE(VM)]: () => json(200, vmReply(VM)), [VM_TH(VM)]: () => pic(JPEG),
  /* Loom's CDN calls its JPEG application/octet-stream */
  [LM_OE(LM)]: () => json(200, lmReply(LM)), [LM_TH(LM)]: () => pic(JPEG, 'application/octet-stream')
});
function setup(fetch, o) {
  o = o || {};
  const db = o.db || new DatabaseSync(':memory:'), clock = { t: Date.parse('2026-10-23T08:00:00Z') }, stored = [];
  const store = buf => { stored.push(buf); return '/files/' + crypto.createHash('sha256').update(buf).digest('hex') + '.jpg'; };
  const svc = LP.create(db, { fetch, now: () => clock.t, store, limits: o.limits });
  const get = (url, opt) => svc.get((opt && opt.user) === undefined ? 'u1' : opt.user, url, !!(opt && opt.refresh));
  return { db, clock, stored, svc, get };
}
const pick = (o, keys) => Object.fromEntries(keys.map(k => [k, o[k]]));

/* ---------- which links are videos, and their ids ---------- */
test('every form of a YouTube link gives its 11-character id; a Short is a Short', () => {
  const ok = [
    ['https://www.youtube.com/watch?v=' + YT, YT, false], ['https://youtube.com/watch?v=' + YT + '&t=42s&list=PL1', YT, false], ['https://m.youtube.com/watch?v=' + YT + '&feature=share', YT, false],
    ['https://www.youtube.com/watch/?v=' + YT, YT, false], ['https://youtu.be/' + YT, YT, false], ['https://youtu.be/' + YT + '?si=AbCdEf123&t=5', YT, false], ['https://youtu.be/' + YT + '/', YT, false],
    ['https://www.youtube.com/shorts/' + SHORT, SHORT, true], ['https://youtube.com/shorts/' + SHORT + '?feature=share', SHORT, true], ['https://m.youtube.com/shorts/' + SHORT, SHORT, true],
    ['https://www.youtube.com/embed/' + YT + '?start=10', YT, false], ['https://www.youtube.com/live/' + YT + '?si=x', YT, false], ['https://WWW.YouTube.com/watch?v=a-b_C1d2E3f', 'a-b_C1d2E3f', false]
  ];
  for (const [link, id, shorts] of ok) {
    const p = LINKS.parse(link);
    assert.deepEqual(pick(p || {}, ['provider', 'id', 'shorts', 'key']), { provider: 'youtube', id, shorts, key: (shorts ? 'shorts/' : '') + id }, link);
  }
});
test('Vimeo: the number, and an unlisted video\'s hash after it or as ?h=; Loom: the 32 hex digits, whatever follows', () => {
  assert.deepEqual(pick(LINKS.parse('https://vimeo.com/' + VM), ['provider', 'id', 'hash', 'key']), { provider: 'vimeo', id: VM, hash: null, key: VM });
  assert.deepEqual(pick(LINKS.parse('https://vimeo.com/508864124/fcbbcc92fa'), ['id', 'hash', 'key']), { id: '508864124', hash: 'fcbbcc92fa', key: '508864124/fcbbcc92fa' });
  assert.deepEqual(pick(LINKS.parse('https://www.vimeo.com/508864124?h=fcbbcc92fa&share=copy'), ['id', 'hash', 'key']), { id: '508864124', hash: 'fcbbcc92fa', key: '508864124/fcbbcc92fa' });
  assert.equal(LINKS.parse('https://vimeo.com/508864124/fcbbcc92fa/').key, '508864124/fcbbcc92fa');
  for (const link of ['https://www.loom.com/share/' + LM, 'https://loom.com/share/' + LM + '?sid=0f1e2d3c-aaaa', 'https://www.loom.com/embed/' + LM + '?hide_owner=true', 'https://www.loom.com/share/' + LM + '/',
    'https://www.loom.com/share/Brand-review-round-2-' + LM + '?sid=4f1b2c3d-1111#t=12', 'https://www.loom.com/share/' + LM + '#t=5'])
    assert.deepEqual(pick(LINKS.parse(link) || {}, ['provider', 'id', 'key']), { provider: 'loom', id: LM, key: LM }, link);
  /* an id in capitals, as Loom takes it: asked as written, kept under its small letters */
  assert.deepEqual(pick(LINKS.parse('https://www.loom.com/share/' + LM.toUpperCase()), ['id', 'key']), { id: LM.toUpperCase(), key: LM });
  /* a name may be read for an http link; a picture is asked only for https */
  assert.equal(LINKS.parse('http://youtu.be/' + YT), null);
  assert.equal(LINKS.parse('http://youtu.be/' + YT, { http: true }).id, YT);
});
test('an id of the wrong form, or a link anywhere but the provider, is no video', () => {
  for (const bad of [
    'https://www.youtube.com/watch?v=dQw4w9WgXc', 'https://www.youtube.com/watch?v=dQw4w9WgXcQQ', 'https://www.youtube.com/watch?v=dQw4w9W%3CXcQ', 'https://www.youtube.com/watch?v=', 'https://www.youtube.com/watch',
    'https://youtu.be/dQw4w9WgXc', 'https://youtu.be/' + YT + '/more', 'https://youtu.be/', 'https://www.youtube.com/shorts/' + SHORT + '/x', 'https://www.youtube.com/attribution_link?v=' + YT, 'https://www.youtube.com/@channel',
    'https://www.youtube.com/playlist?list=PL1', 'https://music.youtube.com/watch?v=' + YT, 'https://www.youtube-nocookie.com/embed/' + YT, 'http://www.youtube.com/watch?v=' + YT, 'https://www.youtube.com.evil.test/watch?v=' + YT,
    'https://notyoutube.com/watch?v=' + YT, 'https://u:p@www.youtube.com/watch?v=' + YT, 'https://www.youtube.com:8443/watch?v=' + YT, 'https://youtu.be.evil.test/' + YT,
    'https://vimeo.com/abc', 'https://vimeo.com/1234567890123', 'https://vimeo.com/123/notahash', 'https://vimeo.com/123?h=zz99', 'https://vimeo.com/123/abc', 'https://vimeo.com/channels/staffpicks/123', 'https://player.vimeo.com/video/123',
    'https://vimeo.com.evil.test/123', 'http://vimeo.com/123',
    'https://www.loom.com/share/0123456789abcdef', 'https://www.loom.com/share/' + LM.slice(1), 'https://www.loom.com/share/' + LM + 'a', 'https://www.loom.com/share/' + LM + '/extra', 'https://www.loom.com/share/folder/abc', 'https://www.loom.com/share/' + LM.slice(0, 31) + 'g',
    'https://www.loom.com/looms/' + LM, 'https://cdn.loom.com/share/' + LM, 'https://www.loom.com.evil.test/share/' + LM,
    'javascript:alert(1)', 'data:text/html,x', '', 'https://example.org/watch?v=' + YT])
    assert.equal(LINKS.parse(bad), null, bad);
});
test('each provider is asked about the video by its id alone', () => {
  const oe = link => P.oembedUrl(LINKS.parse(link));
  assert.equal(oe('https://youtu.be/' + YT + '?si=secret&t=5'), YT_OE(YT));
  assert.equal(oe('https://m.youtube.com/watch?v=' + YT + '&list=PL1&index=3#x'), YT_OE(YT));
  assert.equal(oe('https://youtube.com/shorts/' + SHORT + '?feature=share'), YT_OE(SHORT, true), 'a Short as a Short, for its upright shape');
  assert.equal(oe('https://vimeo.com/508864124?h=fcbbcc92fa&share=copy'), VM_OE('508864124', 'fcbbcc92fa'));
  assert.equal(oe('https://loom.com/share/' + LM + '?sid=secret'), LM_OE(LM));
  /* Figma's row of the same table, unchanged */
  assert.equal(oe('https://figma.com/design/ABC123/x?node-id=1-2'), 'https://www.figma.com/api/oembed?url=' + enc('https://www.figma.com/design/ABC123'));
});

/* ---------- where requests may go ---------- */
test('only the provider\'s own hosts: its oEmbed, and its picture hosts', () => {
  const ok = { youtube: [['oembed', 'https://www.youtube.com/oembed?x'], ['thumb', 'https://i.ytimg.com/vi/x/hqdefault.jpg'], ['thumb', 'https://i9.ytimg.com/vi/x/hq2.jpg']],
    vimeo: [['oembed', 'https://vimeo.com/api/oembed.json?x'], ['thumb', 'https://i.vimeocdn.com/video/1-d_960']], loom: [['oembed', 'https://www.loom.com/v1/oembed?x'], ['thumb', 'https://cdn.loom.com/sessions/thumbnails/x.jpg']] };
  for (const [prov, list] of Object.entries(ok)) for (const [which, url] of list) assert.ok(P.allowedHop(url, which, prov), prov + ' ' + url);
  const bad = {
    youtube: [['oembed', 'https://youtube.com/oembed'], ['oembed', 'https://m.youtube.com/oembed'], ['thumb', 'https://img.youtube.com/vi/x/0.jpg'], ['thumb', 'https://ytimg.com/x'], ['thumb', 'https://i10.ytimg.com/x'], ['thumb', 'https://i.ytimg.com.evil.test/x'],
      ['thumb', 'http://i.ytimg.com/x'], ['thumb', 'https://i.ytimg.com:444/x'], ['thumb', 'https://u@i.ytimg.com/x'], ['thumb', 'https://yt3.ggpht.com/x'], ['thumb', 'https://i.vimeocdn.com/x'], ['thumb', 'https://i.ytimg.com./x']],
    vimeo: [['oembed', 'https://www.vimeo.com/api/oembed.json'], ['oembed', 'https://player.vimeo.com/x'], ['thumb', 'https://f.vimeocdn.com/p/x.png'], ['thumb', 'https://vimeocdn.com/x'], ['thumb', 'https://i.vimeocdn.com.evil.test/x'], ['thumb', 'https://cdn.loom.com/x']],
    loom: [['oembed', 'https://loom.com/v1/oembed'], ['thumb', 'https://loom.com/x.jpg'], ['thumb', 'https://www.loom.com/x.jpg'], ['thumb', 'https://cdn.loom.com.evil.test/x'], ['thumb', 'https://cdn-cf-east.loom.com/x'], ['thumb', 'http://cdn.loom.com/x'], ['thumb', 'https://169.254.169.254/x']]
  };
  for (const [prov, list] of Object.entries(bad)) for (const [which, url] of list) assert.equal(P.allowedHop(url, which, prov), null, prov + ' ' + url);
  /* a provider's name it does not have is Figma's row: the default */
  assert.ok(P.allowedHop('https://api-cdn.figma.com/x', 'thumb'));
});
test('a thumbnail_url anywhere but the provider\'s picture hosts is never asked for', async () => {
  for (const evil of ['https://i.vimeocdn.com/video/1-d_960', 'http://i.ytimg.com/vi/x/hqdefault.jpg', 'https://169.254.169.254/latest/meta-data/', 'https://i.ytimg.com.evil.test/x.jpg', 'https://localhost/x.jpg', 'javascript:alert(1)']) {
    const f = net({ [YT_OE(YT)]: () => json(200, ytReply(YT, { thumbnail_url: evil })) }), s = setup(f);
    const r = await s.get('https://youtu.be/' + YT);
    assert.deepEqual(f.asked, [YT_OE(YT)], evil); assert.equal(s.stored.length, 0); assert.equal(r.thumb, null); assert.equal(r.unavailable, true, evil);
  }
});
test('redirects only within the provider\'s picture hosts, at most 3', async () => {
  let f = net({ [VM_OE(VM)]: () => json(200, vmReply(VM)), [VM_TH(VM)]: () => moved('https://i.vimeocdn.com/video/2'), 'https://i.vimeocdn.com/video/2': () => pic(JPEG) }), s = setup(f);
  assert.ok((await s.get('https://vimeo.com/' + VM)).thumb);
  for (const to of ['https://f.vimeocdn.com/x.jpg', 'http://i.vimeocdn.com/x', 'https://evil.example/x.jpg', 'https://i.ytimg.com/vi/x/hqdefault.jpg']) {
    f = net({ [VM_OE(VM)]: () => json(200, vmReply(VM)), [VM_TH(VM)]: () => moved(to) }); s = setup(f);
    assert.equal((await s.get('https://vimeo.com/' + VM)).thumb, null, to); assert.equal(f.asked.length, 2, to);
  }
  /* YouTube's oEmbed moved off www.youtube.com: refused */
  f = net({ [YT_OE(YT)]: () => moved('https://youtube.com/oembed?x') }); s = setup(f);
  assert.equal((await s.get('https://youtu.be/' + YT)).unavailable, true); assert.equal(f.asked.length, 1);
});

/* ---------- what the page is told ---------- */
test('a public video: the oEmbed, then its picture, kept here; the player\'s shape; the length when the provider says it', async () => {
  const f = net(publicVideos()), s = setup(f);
  const keys = ['provider', 'key', 'title', 'width', 'height', 'private', 'unavailable', 'duration'];
  const yt = await s.get('https://youtu.be/' + YT + '?si=x');
  assert.deepEqual(pick(yt, keys), { provider: 'youtube', key: YT, title: 'Rick Astley - Never Gonna Give You Up (Official Video) (4K Remaster)', width: 200, height: 113, private: false, unavailable: false, duration: undefined });
  assert.ok(!('duration' in yt) && !('nodeId' in yt), 'YouTube says no length; nodeId is Figma\'s');
  assert.match(yt.thumb, /^\/files\/[a-f0-9]{64}\.jpg$/); assert.match(yt.fetchedAt, /^2026-10-23T08:00:00/);
  const short = await s.get('https://www.youtube.com/shorts/' + SHORT);
  assert.deepEqual(pick(short, ['key', 'width', 'height']), { key: 'shorts/' + SHORT, width: 113, height: 200 }, 'upright: the player\'s shape, not the 480 × 360 thumbnail\'s');
  const vm = await s.get('https://vimeo.com/' + VM);
  assert.deepEqual(pick(vm, keys), { provider: 'vimeo', key: VM, title: 'Big Buck Bunny', width: 1280, height: 720, private: false, unavailable: false, duration: 597 });
  const lm = await s.get('https://www.loom.com/share/' + LM + '?sid=abc');
  assert.deepEqual(pick(lm, keys), { provider: 'loom', key: LM, title: 'Check out loom.com', width: 1280, height: 960, private: false, unavailable: false, duration: 21 });
  assert.deepEqual(f.asked, [YT_OE(YT), YT_TH(YT), YT_OE(SHORT, true), YT_TH(SHORT, true), VM_OE(VM), VM_TH(VM), LM_OE(LM), LM_TH(LM)]);
  assert.equal(s.stored.length, 4);
});
test('a picture by its bytes: octet-stream only from Loom, never HTML or SVG', async () => {
  const cases = [
    ['youtube', 'https://youtu.be/' + YT, { [YT_OE(YT)]: () => json(200, ytReply(YT)) }, YT_TH(YT)],
    ['loom', 'https://www.loom.com/share/' + LM, { [LM_OE(LM)]: () => json(200, lmReply(LM)) }, LM_TH(LM)]
  ];
  for (const [prov, link, routes, th] of cases) {
    for (const [body, type, ok] of [[JPEG, 'image/jpeg', true], [JPEG, 'application/octet-stream', prov === 'loom'], [Buffer.from('<html>sign in</html>'), 'application/octet-stream', false], [Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), 'image/svg+xml', false], [JPEG, 'text/html', false]]) {
      const s = setup(net(Object.assign({ [th]: () => pic(body, type) }, routes)));
      const r = await s.get(link);
      assert.equal(!!r.thumb, ok, prov + ' ' + type); assert.equal(s.stored.length, ok ? 1 : 0);
    }
  }
});
test('a private, unlisted-without-hash or unknown video: private, no picture, only the oEmbed asked', async () => {
  const cases = [
    /* YouTube: private 403, embedding turned off 401, no such video 400 */
    ['https://www.youtube.com/watch?v=yZIXLfi8CZQ', YT_OE('yZIXLfi8CZQ'), () => text(403, 'Forbidden', 'application/json; charset=UTF-8')],
    ['https://www.youtube.com/watch?v=MeJVWBSsPAY', YT_OE('MeJVWBSsPAY'), () => text(401, 'Unauthorized', 'application/json; charset=UTF-8')],
    ['https://www.youtube.com/watch?v=aaaaaaaaaaa', YT_OE('aaaaaaaaaaa'), () => text(400, 'Bad Request', 'application/json; charset=UTF-8')],
    /* Vimeo: unlisted asked without its hash, or private: 404 */
    ['https://vimeo.com/508864124', VM_OE('508864124'), () => text(404, '404 Not Found', 'text/html; charset=UTF-8')],
    /* Vimeo: unlisted and limited to other sites, asked with its hash: an answer without a title or a thumbnail */
    ['https://vimeo.com/508864124/fcbbcc92fa', VM_OE('508864124', 'fcbbcc92fa'), () => json(200, { type: 'video', version: '1.0', provider_name: 'Vimeo', provider_url: 'https://vimeo.com/', html: '<iframe></iframe>', width: 426, height: 240, domain_status_code: 403, video_id: 508864124, uri: '/videos/508864124:fcbbcc92fa' })],
    ['https://www.loom.com/share/' + '0'.repeat(32), LM_OE('0'.repeat(32)), () => text(404, 'Not Found', 'text/plain; charset=utf-8')]
  ];
  for (const [link, oe, reply] of cases) {
    const f = net({ [oe]: reply }), s = setup(f);
    const r = await s.get(link);
    assert.deepEqual(pick(r, ['private', 'unavailable', 'thumb', 'width', 'height', 'title']), { private: true, unavailable: false, thumb: null, width: null, height: null, title: '' }, link);
    assert.deepEqual(f.asked, [oe], link); assert.equal(s.stored.length, 0);
  }
  /* a provider down is not private: unavailable, asked again in 10 minutes */
  const f = net({ [YT_OE(YT)]: () => text(503, 'x', 'text/plain') }), s = setup(f);
  assert.deepEqual(pick(await s.get('https://youtu.be/' + YT), ['private', 'unavailable']), { private: false, unavailable: true });
});

/* ---------- how long, and how often ---------- */
test('a video\'s picture is kept 7 days; then the old one at once and a new one behind it', async () => {
  let n = 0; const pics = [JPEG, Buffer.concat([JPEG, Buffer.from([1, 2, 3])])];
  const f = net({ [YT_OE(YT)]: () => json(200, ytReply(YT)), [YT_TH(YT)]: () => pic(pics[Math.min(n++, 1)]) }), s = setup(f);
  const first = await s.get('https://youtu.be/' + YT);
  s.clock.t += 7 * 86400e3 - 1000;
  assert.equal((await s.get('https://www.youtube.com/watch?v=' + YT)).thumb, first.thumb); assert.equal(f.asked.length, 2, 'six days and more: still kept');
  s.clock.t += 2000;
  assert.equal((await s.get('https://m.youtube.com/watch?v=' + YT)).thumb, first.thumb, 'past 7 days: the old one, at once');
  await s.svc.inflight.get('youtube:' + YT);
  assert.equal(f.asked.length, 4);
  assert.notEqual((await s.get('https://youtu.be/' + YT)).thumb, first.thumb);
  assert.equal(LP.PROVIDERS.youtube.okMs, 7 * 86400e3); assert.equal(LP.PROVIDERS.vimeo.okMs, 7 * 86400e3); assert.equal(LP.PROVIDERS.loom.okMs, 7 * 86400e3);
  assert.equal(LP.PROVIDERS.figma.okMs, 6 * 3600e3, 'Figma keeps its 6 hours');
});
test('private is asked again after an hour, a failure after 10 minutes keeping the old picture', async () => {
  let state = 'private';
  const f = net({ [VM_OE(VM)]: () => (state === 'private' ? text(404, '404 Not Found', 'text/html') : state === 'down' ? text(500, 'x', 'text/plain') : json(200, vmReply(VM))), [VM_TH(VM)]: () => pic(JPEG) }), s = setup(f);
  assert.equal((await s.get('https://vimeo.com/' + VM)).private, true);
  s.clock.t += 59 * 60e3; assert.equal((await s.get('https://vimeo.com/' + VM)).private, true); assert.equal(f.asked.length, 1);
  state = 'public'; s.clock.t += 2 * 60e3;
  const ok = await s.get('https://vimeo.com/' + VM); assert.ok(ok.thumb); assert.equal(ok.duration, 597); assert.equal(f.asked.length, 3);
  state = 'down'; s.clock.t += 7 * 86400e3 + 1;
  assert.equal((await s.get('https://vimeo.com/' + VM)).thumb, ok.thumb); await s.svc.inflight.get('vimeo:' + VM);
  assert.equal(f.asked.length, 4);
  s.clock.t += 9 * 60e3; const kept = await s.get('https://vimeo.com/' + VM);
  assert.equal(kept.thumb, ok.thumb); assert.equal(kept.duration, 597, 'the length kept with the picture'); assert.equal(f.asked.length, 4);
  s.clock.t += 2 * 60e3; await s.get('https://vimeo.com/' + VM); await s.svc.inflight.get('vimeo:' + VM); assert.equal(f.asked.length, 5, 'asked again after 10 minutes');
});
test('one fetch per video however many ask at once; each provider has its own budget; a YouTube id is not a Figma key', async () => {
  let release; const gate = new Promise(r => { release = r; });
  let f = net(Object.assign(publicVideos(), { [YT_OE(YT)]: async () => { await gate; return json(200, ytReply(YT)); } })), s = setup(f);
  const all = Promise.all(['https://youtu.be/' + YT, 'https://www.youtube.com/watch?v=' + YT, 'https://m.youtube.com/watch?v=' + YT + '&t=1'].map((u, i) => s.get(u, { user: 'u' + i })));
  await new Promise(r => setTimeout(r, 10)); release();
  const out = await all;
  assert.equal(f.asked.length, 2); assert.ok(out.every(r => r.thumb && r.thumb === out[0].thumb));
  /* 12 YouTube videos for one person this minute: the 13th waits, Vimeo and Loom are still asked */
  const routes = publicVideos(); const ids = [];
  for (let i = 0; i < 13; i++) { const id = 'Budget' + String(i).padStart(5, '0'); ids.push(id); routes[YT_OE(id)] = () => json(200, ytReply(id)); routes[YT_TH(id)] = () => pic(JPEG); }
  f = net(routes); s = setup(f);
  const yts = []; for (const id of ids) yts.push(await s.get('https://youtu.be/' + id, { user: 'busy' }));
  assert.equal(yts.filter(r => r.thumb).length, 12); assert.equal(yts[12].unavailable, true);
  assert.ok((await s.get('https://vimeo.com/' + VM, { user: 'busy' })).thumb); assert.ok((await s.get('https://www.loom.com/share/' + LM, { user: 'busy' })).thumb);
  /* the same letters as a Figma key and as a YouTube id: two links, two rows */
  const g = net({ [YT_OE(YT)]: () => json(200, ytReply(YT)), [YT_TH(YT)]: () => pic(JPEG) }), t = setup(g);
  const fig = await t.get('https://www.figma.com/design/' + YT + '/Name'), vid = await t.get('https://youtu.be/' + YT);
  assert.equal(fig.provider, 'figma'); assert.equal(fig.private, true); assert.equal(vid.provider, 'youtube'); assert.ok(vid.thumb);
  assert.equal(t.svc.read(YT).status, 'private'); assert.equal(t.svc.read(YT, 'youtube').status, 'ok');
});
test('only a Figma file or a YouTube, Vimeo or Loom video; signed-in members only', async () => {
  const { get } = setup(net({}));
  await assert.rejects(get('https://youtu.be/' + YT, { user: null }), e => e.status === 401);
  for (const url of ['https://player.vimeo.com/video/' + VM, 'https://www.loom.com/share/0123456789abcdef', 'https://www.youtube.com/watch?v=short', 'https://drive.google.com/file/d/abc/view', 'http://youtu.be/' + YT, 'https://i.ytimg.com/vi/' + YT + '/hqdefault.jpg'])
    await assert.rejects(get(url), e => e.status === 400 && /YouTube, Vimeo or Loom/.test(e.message), url);
});

/* ---------- the table, and the browser tests' stand-in ---------- */
test('a table from before videos (no length column) gains one, and keeps its Figma rows', async () => {
  const db = new DatabaseSync(':memory:');
  db.exec("CREATE TABLE link_previews (provider TEXT NOT NULL, file_key TEXT NOT NULL, title TEXT DEFAULT '', thumb TEXT, width INTEGER, height INTEGER, status TEXT NOT NULL, reason TEXT, fetched_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, PRIMARY KEY(provider, file_key))");
  const at = Date.parse('2026-10-23T08:00:00Z');
  db.prepare("INSERT INTO link_previews VALUES('figma','ABC123','Hero','/files/x.webp',800,448,'ok',NULL,?,?)").run(at, at + 3600e3);
  const s = setup(net(publicVideos()), { db });
  assert.ok(db.prepare('PRAGMA table_info(link_previews)').all().some(c => c.name === 'duration'));
  assert.equal((await s.get('https://www.figma.com/design/ABC123/Hero')).thumb, '/files/x.webp');
  assert.equal((await s.get('https://vimeo.com/' + VM)).duration, 597);
  setup(net({}), { db }); /* created again: the column is not added twice */
});
test('one link check for the page, the pictures and the names: shared/link-providers.js, through server/oembed-links.js', async () => {
  const build = require('../build'), fs = require('node:fs'), links = require('../server/oembed-links');
  const order = build.pageSources().scripts.map(s => s.file);
  assert.ok(order.indexOf('shared/link-providers.js') >= 0 && order.indexOf('shared/link-providers.js') < order.indexOf('src/version-preview.js'));
  assert.match(fs.readFileSync(path.join(ROOT, 'src', 'version-preview.js'), 'utf8'), /function lpParse\(url\)\{ return typeof LinkProviders!=="undefined"\?LinkProviders\.parse\(url\):null; \}/);
  assert.match(fs.readFileSync(path.join(ROOT, 'server', 'oembed-links.js'), 'utf8'), /require\("\.\.\/shared\/link-providers"\)/);
  assert.equal(P.parseLink, links.parseLink); assert.equal(links.parseLink, LINKS.parse, 'the picture route checks a link with the shared check');
  /* the picture's oEmbed address is the helper's, from the id alone */
  for (const link of ['https://youtu.be/' + YT + '?si=x', 'https://youtube.com/shorts/' + SHORT, 'https://vimeo.com/508864124?h=fcbbcc92fa', 'https://www.loom.com/share/Title-' + LM + '?sid=1'])
    assert.equal(P.oembedUrl(LINKS.parse(link)), links.pictureOembedUrl(LINKS.parse(link)), link);
  /* a name: the same check decides, the link sent as YouTube and Vimeo take it (as written), Loom's rebuilt */
  assert.equal(links.oembedFor('https://youtu.be/' + YT + '?si=x'), 'https://www.youtube.com/oembed?format=json&url=' + enc('https://youtu.be/' + YT + '?si=x'));
  assert.equal(links.oembedFor('https://www.loom.com/share/Title-' + LM + '#t=5'), LM_OE(LM));
  for (const bad of ['https://youtu.be/dQw4w9WgXc', 'https://www.youtube.com/watch?v=dQw4w9WgXcQQ', 'https://www.youtube.com/embed/' + YT, 'https://vimeo.com/123/notahash', 'https://www.loom.com/share/0123456789abcdef'])
    assert.equal(links.oembedFor(bad), null, bad);
});
test('a provider out of reach (its name does not resolve): unavailable, not private, asked again in 10 minutes, never waited on', async () => {
  /* vimeo.com did not resolve over this machine's DNS (23 Oct 2026): the guarded fetch fails at once, as here */
  const dns = () => Promise.reject(Object.assign(new Error('getaddrinfo ENOTFOUND vimeo.com'), { code: 'ENOTFOUND' }));
  let down = true;
  const f = net({ [VM_OE(VM)]: () => (down ? dns() : json(200, vmReply(VM))), [VM_TH(VM)]: () => pic(JPEG) }), s = setup(f);
  const t0 = Date.now(), r = await s.get('https://vimeo.com/' + VM);
  assert.ok(Date.now() - t0 < 1000, 'answered at once');
  assert.deepEqual(pick(r, ['provider', 'thumb', 'private', 'unavailable']), { provider: 'vimeo', thumb: null, private: false, unavailable: true });
  assert.equal(s.svc.read(VM, 'vimeo').reason, 'network');
  s.clock.t += 9 * 60e3; await s.get('https://vimeo.com/' + VM); assert.equal(f.asked.length, 1, 'not asked again within 10 minutes');
  down = false; s.clock.t += 2 * 60e3;
  const back = await s.get('https://vimeo.com/' + VM); assert.ok(back.thumb); assert.equal(f.asked.length, 3);
  /* a name that never answers: given up on after the time limit, the same */
  const hang = net({ [YT_OE(YT)]: init => new Promise((res, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted')))) }), h = setup(hang, { limits: { timeoutMs: 50 } });
  assert.equal((await h.get('https://youtu.be/' + YT)).unavailable, true); assert.equal(h.svc.read(YT, 'youtube').reason, 'timeout');
});
test('the browser tests\' stand-in answers for the providers from e2e/ only', async () => {
  const stub = LP.stubFrom('e2e/fixtures/link-stub.js', ROOT);
  assert.equal(typeof stub, 'function');
  const s = setup(stub);
  const yt = await s.get('https://youtu.be/YtPub000001');
  assert.equal(yt.title, 'Brand film: Ramadan 30s'); assert.ok(yt.thumb);
  assert.deepEqual(pick(await s.get('https://youtube.com/shorts/YtSrt000001'), ['width', 'height']), { width: 113, height: 200 });
  assert.equal((await s.get('https://www.youtube.com/watch?v=YtPrv000001')).private, true);
  assert.equal((await s.get('https://vimeo.com/7700001/abcdef1234')).duration, 95);
  assert.equal((await s.get('https://vimeo.com/7800001/abcdef1234')).private, true);
  assert.deepEqual(pick(await s.get('https://vimeo.com/7900001'), ['private', 'unavailable']), { private: false, unavailable: true }, 'vimeo.com out of reach');
  assert.equal((await s.get('https://www.loom.com/share/a11ce' + '0'.repeat(27))).height, 960, 'Loom\'s octet-stream picture taken');
  assert.equal((await s.get('https://www.figma.com/design/FgPubHero9/Hero')).title, 'Hero Banner Q4', 'Figma still answered');
  await assert.rejects(stub('https://example.org/'), /no network/);
  assert.equal(LP.stubFrom('e2e/../server/db.js', ROOT), null);
});
