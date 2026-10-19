/* Kinds of work, the workspace's own (Oct 2026; shared/scoring-engine.js kindMatch / kindOf / kindPick / kindOfTask,
   shared/scoring-settings.js `kinds`, server/scoring.js, src/scoring-kinds.js; docs/SMART-SCORING.md §11). A kind is
   found from keywords in the title — plain words, never patterns, whole words in any case, English or Indonesian, a
   final * for longer forms — in the list's order, a switched-off kind never; a kind chosen on the task by hand wins.
   The built-in keywords find what the old title patterns found on real titles, except where those patterns found a
   word inside another one ("promotion" was a video). The settings keep every kind's numbers and only theirs; the server
   gives a new kind its id, drops a task's kind that is not one, and sends the tasks of a deleted kind back to their
   title's (audited). Calculate, the asset points and the AI read the same kind. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os');
const { spawn } = require('node:child_process');
const E = require('../shared/scoring-engine');
const S = require('../shared/scoring-settings');
const { calculate } = require('../server/scoring');
const AI = require('../server/scoring-ai').pure;
const root = path.join(__dirname, '..');

/* the workspace's settings with a kind of its own, "Podcast" */
const POD = { id: 'k_pod', name: 'Podcast', nameId: 'Siniar', keywords: ['podcast', 'siniar'], active: true };
const withPodcast = (extra) => S.normalizeSettings(Object.assign({ kinds: S.defaults().kinds.concat([POD]), hours: { templates: { k_pod: { perUnit: 3 } } }, assets: { perKind: { k_pod: 2 } } }, extra || {}));

test('keywords are whole words or phrases in any case, English or Indonesian; a final * takes longer forms', () => {
  const kinds = [{ id: 'a', keywords: ['copy', 'key visual', 'video*', 'siniar', 'Ünïcödé'] }];
  const k = t => E.kindOf(t, kinds);
  assert.equal(k('Copy for Ramadan'), 'a'); assert.equal(k('COPY'), 'a', 'any case');
  assert.equal(k('Copywriter brief'), null, '"copy" is never found inside "copywriter"');
  assert.equal(k('Hard-copy proofs'), 'a', 'a hyphen is a word edge');
  assert.equal(k('Key  Visual Imlek'), 'a', 'a phrase, spaces collapsed');
  assert.equal(k('Keyvisual'), null, 'a phrase is not its words run together');
  assert.equal(k('Videografi event'), 'a', 'video* finds videografi'); assert.equal(k('Videos'), 'a');
  assert.equal(k('Promotional video'), 'a'); assert.equal(k('Aivideo'), null, 'a * never reaches inside a word');
  assert.equal(k('Siniar HSB eps 4'), 'a', 'Indonesian'); assert.equal(k('Siniarnya'), null, 'whole words: siniar is not siniarnya');
  assert.equal(k('ünïcödé title'), 'a', 'Unicode, any case');
  assert.equal(k(''), null); assert.equal(k(null), null); assert.equal(k(undefined), null);
  assert.deepEqual(E.kindMatch('Podcast episode 12', withPodcast()), { id: 'k_pod', keyword: 'podcast' }, 'which keyword found it');
});

test('the kinds are tried in their order; a kind switched off is never found; a kind chosen by hand always wins', () => {
  const kinds = [{ id: 'carousel', keywords: ['carousel*'] }, { id: 'feed', keywords: ['instagram*', 'post'] }];
  assert.equal(E.kindOf('Instagram carousel', kinds), 'carousel', 'the first kind in the list, not the first word');
  assert.equal(E.kindOf('Instagram carousel', kinds.slice().reverse()), 'feed', 'the order is the admin\'s');
  assert.equal(E.kindOf('Instagram carousel', [Object.assign({ active: false }, kinds[0]), kinds[1]]), 'feed', 'switched off: skipped');
  assert.equal(E.kindOf('Carousel', [Object.assign({ active: false }, kinds[0])]), null);
  const s = withPodcast();
  assert.equal(E.kindOfTask({ title: 'Feed post Monday', meta: { kind: 'k_pod' } }, s.kinds), 'k_pod', 'chosen by hand beats the title');
  assert.equal(E.kindOfTask({ title: 'Feed post Monday', meta: { kind: 'made_up' } }, s.kinds), 'feed', 'a kind that is not one: the title');
  const off = s.kinds.map(k => (k.id === 'k_pod' ? Object.assign({}, k, { active: false }) : k));
  assert.equal(E.kindPick({ meta: { kind: 'k_pod' } }, off), null, 'a kind switched off is not chosen');
  assert.equal(E.kindOfTask({ title: 'Podcast eps 1', meta: { kind: 'k_pod' } }, off), null);
  assert.equal(E.kindOfTask({ title: 'Feed post' }), 'feed', 'without a list: the engine\'s built-ins');
  assert.equal(E.kindOf('Podcast eps 1', s), 'k_pod', 'the whole settings object works too');
});

test('a keyword is text, never a pattern: no injection, no runaway matching', () => {
  assert.equal(E.kindKeyword('.*'), '', 'no letter or digit: not a keyword');
  assert.equal(E.kindKeyword('  Key   Visual* '), 'key visual*');
  assert.equal(E.kindKeyword('ad*'), 'ad', 'a * needs 3 letters before it');
  assert.equal(E.kindKeyword('a*b'), 'ab', 'a * only at the end');
  assert.equal(E.kindKeyword('x'.repeat(41)), '', 'longer than 40 characters: not a keyword'); assert.equal(E.kindKeyword(7), '');
  const kinds = [{ id: 'x', keywords: ['(a+)+', '.*', '[a-z]', 'c++', 'a|b'] }];
  assert.equal(E.kindOf('anything at all', kinds), null, '".*" matches nothing but itself');
  assert.equal(E.kindOf('use (a+)+ here', kinds), 'x', '(a+)+ is looked for as written');
  assert.equal(E.kindOf('learn c++ fast', kinds), 'x'); assert.equal(E.kindOf('a or b', kinds), null, '| is not an or');
  const t0 = Date.now(); E.kindOf('a'.repeat(5000) + '!', [{ id: 'y', keywords: ['(a+)+$', 'a'.repeat(39) + '*'] }]);
  assert.ok(Date.now() - t0 < 200, 'no catastrophic backtracking');
});

/* the old title patterns (until Oct 2026), kept here to hold the built-in keywords to the same answers */
const OLD = [['carousel', /carousel|karosel/], ['story', /\bstor(y|ies)\b|insta ?story|ig ?story/], ['reels', /\breels?\b|tiktok|\bshorts\b|short video|video pendek/],
  ['video', /video|motion|animation|animasi/], ['kv', /\bkv\b|key ?visual/], ['resize', /resize|adaptasi|adaptation|turunan/],
  ['feed', /\bfeeds?\b|\bposts?\b|posting|\bkonten\b|instagram|facebook|linkedin|social media|sosmed|media sosial/], ['poster', /poster|flyer|leaflet|brosur|brochure|pamflet/],
  ['banner', /banner|\bads?\b|iklan|billboard|baliho|spanduk/], ['copy', /copywriting|\bcopy\b|caption|naskah|script|artikel|article|\bblog\b/],
  ['deck', /\bdeck\b|presentation|presentasi|\bppt\b|pitch/], ['logo', /\blogo\b|branding|brand identity|identitas brand/], ['web', /landing ?page|website|web ?page|halaman web/], ['email', /\bemail\b|newsletter|\bedm\b/]];
const oldKind = t => { const s = String(t || '').toLowerCase(); for (const [id, re] of OLD) if (re.test(s)) return id; return null; };
const REAL = ['Carousel 5 slides promo Oktober', 'Carousels for Q4 education', 'Instagram carousel: 7 slides on risk', 'Karosel IG tips investasi pemula', 'IG Story polling saham favorit',
  'Instastory countdown webinar', 'Insta story x3', 'Stories template set', 'Story highlight covers', 'Reel 30s market recap', 'Reels Ramadan series (4 episodes)', 'TikTok 15s teaser — HSB Pro 2.0',
  'TikToks for the campaign', 'YouTube Shorts market wrap', 'Short videos for Eid', 'Video pendek tips trading', 'Video testimonial nasabah', 'Videografi event gathering', 'Motion graphics for the app launch',
  'Motiongraphic penjelasan margin', 'Animation for the loading screen', 'Animasi karakter maskot', 'Videotron Sudirman 10 detik', 'KV Hari Raya', 'Key visual Imlek', 'Keyvisual kampanye literasi',
  'Key visuals for the roadshow', 'Resize KV ke 8 ukuran', 'Resized banners for partners', 'Adaptasi materi ke format portrait', 'Adaptations of the hero visual', 'Turunan KV untuk sosmed',
  'Feed IG edukasi', 'Feeds for the week', 'Post Instagram hari Kartini', 'Posts for Independence Day', 'Postingan IG promo cashback', 'Konten edukasi saham', 'Facebook ads retargeting',
  'LinkedIn article on market outlook', 'Social media calendar November', 'Sosmed plan Desember', 'Materi media sosial Agustus', 'Posters for the branch', 'Flyer acara edukasi', 'Leaflets for the booth',
  'Brosur cetak 1000 eksemplar', 'Brochure trifold', 'Pamflet promo', 'Banners for the mobile app', 'Display ads Google', 'Ad copy Google Ads', 'Iklan radio 30 detik', 'Iklannya untuk majalah',
  'Materi periklanan Q4', 'Billboards Jakarta', 'Baliho literasi', 'Spanduk HUT RI', 'Copywriting landing page', 'Copy deck', 'Captions for the carousel', 'Naskah podcast', 'Scripts for TikTok',
  'Artikel SEO 1500 kata', 'Articles for the website', 'Blog post on dividends', 'Sales deck update', 'Presentations for the roadshow', 'Presentasi internal Q4', 'PPT onboarding', 'Pitchdeck partnership',
  'Logo HUT 25', 'Branding guideline', 'Rebranding HSB Syariah', 'Co-branding with Bank X', 'Brand identity for the new product', 'Identitas brand anak usaha', 'Landing pages for the campaign',
  'Landingpage webinar', 'Website redesign', 'Webpage karier', 'Halaman web promo', 'Email blast promo', 'Newsletters Q4', 'EDM Ramadan', 'Weekly creative sync', 'Rapat koordinasi', 'Infografis saham',
  'Thumbnail YouTube', 'Photoshoot produk', 'Standee cabang', 'X-banner booth', 'Backdrop roadshow 3x2m', 'Ad-hoc request', 'Tiktok shop banner', 'Video call script', 'Webinar deck template — education series',
  'Branch TV loop — market hours', 'Feed post Ramadan (5 sizes)', 'Feed post Ramadan (copy)', 'Konten feed Ramadan', '  feed   POST for ramadan '];
test('the built-in keywords find the kinds the old title patterns found, on real titles (the demo\'s and ours)', () => {
  const demo = fs.readFileSync(path.join(root, 'shared', 'demo-data.js'), 'utf8');
  const titles = REAL.concat([...demo.matchAll(/title\s*:\s*["']([^"'\n]{3,140})["']/g)].map(m => m[1]));
  assert.ok(titles.length > 120, titles.length + ' titles');
  for (const t of titles) assert.equal(E.kindOf(t), oldKind(t), JSON.stringify(t));
  /* where the old patterns found a word inside another one, the kind is no longer made up */
  for (const [t, was, now] of [['Promotion banner Ramadan', 'video', 'banner'], ['Emotional brand film', 'video', null], ['Transcript webinar', 'copy', null]]) {
    assert.equal(oldKind(t), was, t); assert.equal(E.kindOf(t), now, t);
  }
});

test('the settings keep the kinds: built-ins never removed, the admin\'s own with their numbers, nothing else', () => {
  const d = S.normalizeSettings({});
  assert.deepEqual(d.kinds.map(k => k.id), E.KIND_IDS, 'the 14 built-ins, in their order');
  assert.ok(d.kinds.every((k, i) => k.builtIn && k.active && k.order === i));
  assert.deepEqual(d.kinds.find(k => k.id === 'feed').keywords, E.KINDS.find(k => k.id === 'feed').keywords.slice());
  assert.deepEqual(S.DEFAULTS.kinds, d.kinds);
  const s = withPodcast();
  assert.deepEqual(s.kinds[14], { id: 'k_pod', name: 'Podcast', nameId: 'Siniar', keywords: ['podcast', 'siniar'], builtIn: false, active: true, order: 14 });
  assert.deepEqual(s.hours.templates.k_pod, { perUnit: 3, low: 1.5, high: 4.5, nextUnitFactor: 0.5 }, 'low and high from the first hours until typed');
  assert.equal(s.assets.perKind.k_pod, 2);
  assert.deepEqual(S.normalizeSettings(s), s, 'normalizing twice changes nothing');
  /* a new kind with no hours typed has none (as a kind not recognised), and a kind not recognised's points */
  const bare = S.normalizeSettings({ kinds: d.kinds.concat([{ id: 'k_new', name: 'Workshop' }]), assets: { unknownKind: 0.5 } });
  assert.equal(bare.hours.templates.k_new, undefined); assert.equal(bare.assets.perKind.k_new, 0.5);
  /* numbers of kinds that are not there, ids that are not ids, a second copy, a nameless kind: dropped */
  const odd = S.normalizeSettings({ kinds: [{ id: 'feed', name: 'Instagram feed', keywords: 'ig feed, feed*', active: false }, { id: 'feed', name: 'twice' }, { id: 'Bad Id!', name: 'x' }, { id: 'k_x' }, { id: 'carousel', name: '' }, 'x'],
    hours: { templates: { made_up: { perUnit: 3 }, k_x: { perUnit: 2 } } }, assets: { perKind: { made_up: 4 } } });
  assert.deepEqual(odd.kinds.slice(0, 2).map(k => [k.id, k.name, k.active]), [['feed', 'Instagram feed', false], ['carousel', 'carousel', true]], 'given first, a built-in\'s empty name is its own');
  assert.deepEqual(odd.kinds[0].keywords, ['ig feed', 'feed*'], 'a comma-separated text works');
  assert.equal(odd.kinds.length, 14, 'the built-ins left out come back; nothing else');
  assert.deepEqual(Object.keys(odd.hours.templates).sort(), E.KIND_IDS.slice().sort()); assert.equal('made_up' in odd.assets.perKind, false);
  /* the limits: 50 kinds, 40 keywords, 40 characters */
  const many = S.normalizeSettings({ kinds: d.kinds.concat(Array.from({ length: 60 }, (_, i) => ({ id: 'k_' + i, name: 'Kind ' + i + ' ' + 'x'.repeat(60), keywords: Array.from({ length: 50 }, (_, j) => 'w' + j) }))) });
  assert.equal(many.kinds.length, 50); assert.ok(many.kinds.every(k => k.keywords.length <= 40 && Array.from(k.name).length <= 40));
  /* removing a kind removes its numbers */
  const gone = S.normalizeSettings(Object.assign({}, s, { kinds: s.kinds.filter(k => k.id !== 'k_pod') }));
  assert.equal('k_pod' in gone.hours.templates, false); assert.equal('k_pod' in gone.assets.perKind, false);
  /* the history: kinds by id, a moved kind's order, a kind added whole */
  const moved = S.normalizeSettings(Object.assign({}, s, { kinds: [s.kinds[1], s.kinds[0]].concat(s.kinds.slice(2)).map((k, i) => Object.assign({}, k, { order: i })) }));
  assert.deepEqual(S.diffSettings(s, moved).map(c => c.path), ['kinds.carousel.order', 'kinds.story.order']);
  assert.deepEqual(S.diffSettings(d, s).map(c => c.path), ['assets.perKind.k_pod', 'hours.templates.k_pod', 'kinds.k_pod']);
  assert.deepEqual(S.diffSettings(s, Object.assign({}, s, { kinds: s.kinds.map(k => k.id === 'feed' ? Object.assign({}, k, { keywords: ['feed'] }) : k) })).map(c => c.path), ['kinds.feed.keywords']);
});

test('Calculate counts a kind of the workspace\'s own with its own hours, and a kind chosen by hand before the title\'s', () => {
  const s = withPodcast();
  const hours = (task, inputs) => calculate(s, task, { module: 'hours', inputs }, { openDeps: 0 });
  const r = hours({ title: 'Siniar HSB eps 4', assetCount: 1 });
  assert.deepEqual([r.value, r.final, r.inputs.kind, r.inputs.kindSource], [3, 3, 'k_pod', 'title']);
  const p = hours({ title: 'Feed post Monday', assetCount: 1, meta: { kind: 'k_pod' } });
  assert.deepEqual([p.value, p.inputs.kind, p.inputs.kindSource], [3, 'k_pod', 'picked'], 'the kind chosen on the task, not feed');
  assert.equal(hours({ title: 'Feed post Monday', meta: { kind: 'k_pod' } }, { kind: 'feed' }).value, 2, 'corrected in Calculate');
  assert.throws(() => hours({ title: 'x' }, { kind: 'made_up' }), /Unknown kind of work/);
  const off = S.normalizeSettings(Object.assign({}, s, { kinds: s.kinds.map(k => k.id === 'feed' ? Object.assign({}, k, { active: false }) : k) }));
  assert.equal(calculate(off, { title: 'Feed post Monday' }, { module: 'hours' }, {}).inputs.kind, null, 'a switched-off kind is not found');
  assert.throws(() => calculate(off, { title: 'x' }, { module: 'hours', inputs: { kind: 'feed' } }, {}), /Unknown kind of work/, 'nor chosen');
  /* a new kind with no hours yet: no number made up */
  const bare = S.normalizeSettings({ kinds: S.defaults().kinds.concat([{ id: 'k_new', name: 'Workshop', keywords: ['workshop'] }]) });
  assert.deepEqual([calculate(bare, { title: 'Workshop day' }, { module: 'hours' }, {}).value, calculate(bare, { title: 'Workshop day' }, { module: 'hours' }, {}).reason], [null, 'no_template']);
});

test('asset points and the AI read the workspace\'s kinds: its own points, its active kinds only', () => {
  const s = withPodcast();
  assert.equal(E.assetPoints(s.assets, { kind: E.kindOfTask({ title: 'Siniar eps 5' }, s.kinds), split: { a: 3 } }).total, 6, '3 × 2 points');
  const v = E.validateAi({ kind: 'k_pod', hours: 3 }, s);
  assert.equal(v.value.kind, 'k_pod', 'a kind of the workspace\'s own');
  const off = S.normalizeSettings(Object.assign({}, s, { kinds: s.kinds.map(k => k.id === 'k_pod' || k.id === 'feed' ? Object.assign({}, k, { active: false }) : k) }));
  assert.equal(E.validateAi({ kind: 'k_pod', hours: 3 }, off).value.kind, undefined, 'switched off: not a kind the AI may name');
  assert.equal(E.validateAi({ kind: 'feed', hours: 3 }, off).value.kind, undefined);
  const input = { title: 'Siniar eps 5', kind: 'k_pod', kindPicked: false, assetCount: 1, labels: [], briefFields: [], description: '' };
  const pr = AI.buildPrompt(input, [], s, 'en').user;
  assert.match(pr, /k_pod \(Podcast\) 1\.5–4\.5 h, each next at 50%/, 'the yardstick: its hours');
  assert.match(pr, /Kind of work the title names: k_pod/);
  assert.match(AI.buildPrompt(Object.assign({}, input, { kindPicked: true }), [], s, 'en').user, /Kind of work chosen on the task: k_pod/);
  const offPr = AI.buildPrompt(input, [], off, 'en').user;
  assert.doesNotMatch(offPr, /feed \(feed post\)|k_pod \(Podcast\)/, 'a switched-off kind is not offered'); assert.doesNotMatch(offPr, /<one of: [^>]*(k_pod|feed)/);
  /* the AI cache key changes only when the kind was chosen by hand */
  const base = { title: 'Feed post', labels: [] };
  assert.equal(E.inputHash(base), E.inputHash(Object.assign({}, base, { kind: null })));
  assert.notEqual(E.inputHash(base), E.inputHash(Object.assign({}, base, { kind: 'k_pod' })));
});

/* ---------- on the real server ---------- */
function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-kinds-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Kinds!Admin2345678', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'kinds-of-work-secret-key-longer-than-32-chars!!', COS_BACKUP_KEY: 'kinds-of-work-backup-key-longer-than-32-chars!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0' }) });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 15000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const json = async (m, p, b, c) => { const r = await req(m, p, b, c); const t = await r.text(); assert.ok(r.ok, m + ' ' + p + ': ' + r.status + ' ' + t); return JSON.parse(t); };
  const r = await req('POST', '/api/auth/login', { email: 'admin@zencrevia.demo', password: 'Kinds!Admin2345678' }); assert.equal(r.status, 200, await r.clone().text());
  const admin = r.headers.get('set-cookie').split(';')[0], boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const s = { req, json, admin, boot, stop }; at.servers.push(s); return s;
}
async function setScoring(s, change) {
  const cur = (await s.json('GET', '/api/scoring/settings', undefined, s.admin)).settings, next = JSON.parse(JSON.stringify(cur));
  change(next);
  return (await s.json('PUT', '/api/scoring/settings', { settings: next, configVersion: cur.configVersion }, s.admin)).settings;
}

test('the server: a new kind gets its id, a task keeps only a kind there is, Calculate and the asset points use it, and a deleted kind sends its tasks back', { timeout: 90000 }, async t => {
  const s = await start(place(t));
  /* a kind added with the page's own id gets the server's, its hours and points moved along */
  let set = await setScoring(s, x => { x.kinds.push({ id: 'k_page1234', name: 'Podcast', keywords: 'podcast, siniar' }); x.hours.templates.k_page1234 = { perUnit: 3 }; x.assets.perKind.k_page1234 = 2; });
  const pod = set.kinds.find(k => k.name === 'Podcast');
  assert.match(pod.id, /^k_[a-z0-9]+$/); assert.notEqual(pod.id, 'k_page1234');
  assert.deepEqual([set.hours.templates[pod.id].perUnit, set.assets.perKind[pod.id], 'k_page1234' in set.hours.templates], [3, 2, false]);
  const again = await setScoring(s, x => { x.kinds.find(k => k.id === pod.id).keywords.push('siniar*'); });
  assert.equal(again.kinds.find(k => k.name === 'Podcast').id, pod.id, 'a kind already saved keeps its id');
  /* meta.kind on create and save: an active kind, else dropped */
  const st = s.boot.ws.workflow, closed = st.find(x => x.kind === 'closed' && x.id !== 'declined').id, me = s.boot.me.id;
  const mk = async (title, meta, status) => s.json('POST', '/api/tasks', { title, status: status || st[1].id, prio: 'medium', assignee: me, assignees: [me], reviewer: me, reviewers: [me], meta }, s.admin);
  const a = await mk('Episode recording', { kind: pod.id }), b = await mk('Episode recording two', { kind: 'made_up' });
  assert.equal(a.meta.kind, pod.id); assert.equal(b.meta.kind, undefined, 'not a kind: dropped on create');
  const put = async (task, kind) => s.json('PUT', '/api/tasks/' + task.id, Object.assign({}, task, { meta: Object.assign({}, task.meta, { kind }) }), s.admin);
  assert.equal((await put(b, 'carousel')).meta.kind, 'carousel');
  assert.equal((await put(b, '<script>')).meta.kind, undefined, 'dropped on save');
  /* switched off: a task that has it keeps it, a new choice of it is refused */
  await setScoring(s, x => { x.kinds.find(k => k.id === 'carousel').active = false; });
  const c = await put(b, 'carousel'); assert.equal(c.meta.kind, undefined, 'a switched-off kind is not chosen');
  const a2 = await s.json('GET', '/api/tasks/' + a.id, undefined, s.admin);
  await setScoring(s, x => { x.kinds.find(k => k.id === pod.id).active = false; });
  assert.equal((await put(a2, pod.id)).meta.kind, pod.id, 'the one it already had stays chosen');
  await setScoring(s, x => { x.kinds.forEach(k => { k.active = true; }); x.enabled = true; x.modules.assets.on = true; });
  /* Calculate: the kind chosen by hand, with its own hours */
  const calc = await s.json('POST', '/api/tasks/' + a.id + '/scoring/calculate', { module: 'hours' }, s.admin);
  assert.deepEqual([calc.result.value, calc.result.inputs.kind, calc.result.inputs.kindSource], [3, pod.id, 'picked']);
  assert.equal(calc.context.kind, pod.id); assert.equal(calc.context.kindPicked, true);
  /* the asset points: a finished task named for it, 3 assets × 2 points */
  const done = await mk('Siniar HSB eps 4', { assetSplit: { [me]: 3 } }, closed);
  const ap = await s.json('GET', '/api/scoring/assets?from=' + new Date(Date.now() - 864e5).toISOString().slice(0, 10), undefined, s.admin);
  const mine = ap.people.find(p => p.userId === me);
  assert.deepEqual(mine.byKind[pod.id], { assets: 3, points: 6 });
  /* deleted: the task that chose it goes back to its title's kind, audited */
  set = await setScoring(s, x => { x.kinds = x.kinds.filter(k => k.id !== pod.id); });
  assert.equal(set.kinds.some(k => k.id === pod.id), false); assert.equal(pod.id in set.hours.templates, false);
  const back = await s.json('GET', '/api/tasks/' + a.id, undefined, s.admin);
  assert.equal(back.meta.kind, undefined);
  const view = await s.json('GET', '/api/tasks/' + a.id + '/scoring', undefined, s.admin);
  assert.ok(view.audit.some(x => x.action === 'kind_fallback' && x.module === 'kinds'), 'in the task\'s history');
  const hist = (await s.json('GET', '/api/scoring/settings', undefined, s.admin)).audit[0];
  assert.ok(hist.diff.some(c => c.path === 'kinds.' + pod.id && c.to === null)); assert.deepEqual(hist.fallback, { [pod.id]: [a.id] });
  for (const x of [a, b, done]) await s.req('DELETE', '/api/tasks/' + x.id, undefined, s.admin);
});
