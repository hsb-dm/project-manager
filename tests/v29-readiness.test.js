/* v29 readiness — behavioural tests against a real production-mode server process.
   Unlike most UI tests in this folder these do not grep source; they make HTTP calls. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const zlib = require('node:zlib');
const { spawn } = require('node:child_process');

const root = path.join(__dirname, '..');

async function startServer(t, extraEnv) {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-v29-'));
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], {
    cwd: root,
    env: Object.assign({}, process.env, {
      NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp,
      COS_ADMIN_PASSWORD: 'Readiness!Admin234', COS_ADMIN_EMAIL: 'ops@zencrevia.test', COS_ADMIN_NAME: 'Rina Operasional',
      COS_SECRET_KEY: 'v29-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'v29-backup-key-longer-than-32-characters!!',
      COS_ALLOW_REGISTRATION: '0', COS_BACKUP_INTERVAL_HOURS: '', COS_SEED_DEMO: ''
    }, extraEnv || {})
  });
  t.after(async () => {
    if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); }
    fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
  });
  let out = '';
  const port = await new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('server did not start: ' + out)), 8000);
    child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(timer); resolve(+m[1]); } });
    child.stderr.on('data', d => { out += d; });
    child.once('exit', c => { clearTimeout(timer); reject(new Error('exited ' + c + ': ' + out)); });
  });
  const base = 'http://127.0.0.1:' + port;
  const req = (method, p, body, cookie, headers) => fetch(base + p, { method, headers: Object.assign({ 'content-type': 'application/json', origin: base }, cookie ? { cookie } : {}, headers || {}), body: body === undefined ? undefined : JSON.stringify(body) });
  const login = async (email, password) => { const r = await req('POST', '/api/auth/login', { email, password }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  return { base, req, login, temp, output: () => out };
}

test('clean production install: no demo data, configured admin, one-time setup', { timeout: 20000 }, async t => {
  const s = await startServer(t);
  assert.match(s.output(), /clean ZenCrevia workspace/);
  const admin = await s.login('ops@zencrevia.test', 'Readiness!Admin234');
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, admin)).json();
  assert.deepEqual(Object.keys(boot.people), ['admin']);
  assert.equal(boot.people.admin.name, 'Rina Operasional');
  assert.equal(boot.tasks.length, 0);
  assert.equal(boot.projects.length, 0);
  assert.equal(boot.teams.length, 0);
  assert.equal(boot.assets.length, 0);
  assert.ok(Array.isArray(boot.ws.workflow) && boot.ws.workflow.length > 3, 'workflow configuration is kept');
  const demo = await s.req('POST', '/api/auth/login', { email: 'admin@zencrevia.demo', password: 'Readiness!Admin234' });
  assert.equal(demo.status, 401);
});

test('app shell is compressed, cacheable by ETag, and small', { timeout: 90000 }, async t => {
  const s = await startServer(t);
  /* Since performance stage 3 (Oct 2026) the page is a few KB of HTML, and its code, its style sheet and the Indonesian
     dictionary are files of their own under /assets/, named after their content (build.js, tests/built-page.js): the
     page revalidates at every visit (no-cache), its files are kept a year without asking (immutable). What a visit
     downloads is the page and those files, so the limits below — the same numbers as before — apply to their total,
     the dictionary included (what someone reading Indonesian downloads; someone reading English is spared it). */
  const built = require('./built-page').builtPage();
  const r = await fetch(s.base + '/', { headers: { 'accept-encoding': 'br, gzip' } });
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('content-encoding'), 'br');
  assert.equal(r.headers.get('cache-control'), 'no-cache');
  const etag = r.headers.get('etag'); assert.ok(etag);
  const body = Buffer.from(await r.arrayBuffer());
  assert.ok(body.equals(built.raw.html), 'it is the page, byte for byte (fetch decodes it)');
  let wire = Number(r.headers.get('content-length'));
  /* each file: first sent at once (brotli quality 5 for a large one), then — when the server's background compression
     at quality 11 is done — smaller: what every later visit gets (server/delivery.js). The smaller copy must still be
     the file. The script is large enough that its first copy is always the quick one. */
  for (const k of ['js', 'css', 'i18n']) {
    const url = s.base + '/assets/' + built.names[k], get = () => fetch(url, { headers: { 'accept-encoding': 'br, gzip' } });
    const a = await get(); assert.equal(a.status, 200, k); assert.equal(a.headers.get('content-encoding'), 'br', k);
    assert.equal(a.headers.get('cache-control'), 'public, max-age=31536000, immutable', k + ' is kept a year without asking');
    assert.match(a.headers.get('etag'), /^"[\w-]{27}"$/, k + ': a strong ETag, the SHA-1 of the file');
    const first = Number(a.headers.get('content-length')); await a.arrayBuffer();
    let size = first, last = null, same = 0;
    for (let i = 0; i < 240 && (k === 'js' ? size >= first : same < 8); i++) {
      await new Promise(res => setTimeout(res, 250));
      const again = await get(); last = Buffer.from(await again.arrayBuffer());
      const n = Number(again.headers.get('content-length')); same = n === size ? same + 1 : 0; size = n;
    }
    if (k === 'js') assert.ok(size < first, 'the background compression sends less than the first copy (' + size + ' vs ' + first + ')');
    assert.ok(last.equals(built.raw[k]), k + ': and it is the file, byte for byte');
    assert.equal((await fetch(url, { headers: { 'if-none-match': a.headers.get('etag') } })).status, 304, k);
    wire += size;
  }
  /* 700 → 760 KB (October 2026): AI Hub's poster look, brand characters and fonts, templates saved from the canvas
     (for everyone or oneself), the screen-fitting layout and extra permissions for one person took the compressed
     shell 2 KB past 700 KB (about 702 KB). */
  /* 760 → 860 KB (October 2026): Smart Scoring — its shared engine and settings, the Settings tab and the room for its
     task panel, time log, KPI/OKR and analytics still to come — and pasted writing that keeps its format took the
     compressed shell to about 760 KB (778,518 bytes). With all of Smart Scoring in (its task panel, time log, asset
     points, KPIs and OKRs, analytics, efficiency bonus and AI suggestions) it is about 826 KB, under this limit.
     Since 20 October 2026 the server sends it at brotli quality 11 once compressed in the background: about 790 KB
     for a page that is 858 KB at quality 9. */
  /* 3.6 MB and 860 KB unchanged (October 2026, performance stage 3): the page and its files together, as above —
     about 3.13 MB, about 690 KB compressed at quality 11 (the page alone was 3.16 MB, 671 KB: one file compresses a
     little better than four). Someone reading English downloads all but the dictionary: about 2.80 MB, 599 KB. */
  assert.ok(wire < 860 * 1024, 'compressed shell and its files under 860 KB, got ' + wire);
  const html = Buffer.concat([built.raw.html, built.raw.js, built.raw.css, built.raw.i18n]);
  /* 2.2 → 2.4 MB (October 2026): the comment toolbar, @mentions, the simplified Assets & versions
     tab and named Drive links took the shell 14 KB past 2.2 MB. What is downloaded is the
     compressed size above — about 520 KB of its 700 KB — which is unchanged as a limit.
     2.4 → 2.5 MB (October 2026): progress notes, personal themes and an editable, reorderable checklist
     took it 400 bytes past 2.4 MB; compressed it is about 560 KB, the 700 KB limit unchanged.
     2.5 → 2.6 MB (October 2026): people, tasks and projects as chips in the writing and in comments, and the
     compact task panel took it 3 KB past 2.5 MB; compressed it is about 584 KB, the 700 KB limit unchanged.
     2.6 → 2.7 MB (October 2026): estimated hours filled in from finished work, Mine / All on the Home cards and
     the fuller AI snapshot took it 5 KB past 2.6 MB; compressed it is about 616 KB, the 700 KB limit unchanged.
     2.7 → 2.8 MB (October 2026): project discussions, capsules for named links while writing, announcement e-mails
     and each person's choice of notifications took it 2 KB past 2.7 MB; compressed it is about 625 KB, the 700 KB
     limit unchanged.
     2.8 → 3.0 MB (October 2026): the AI Hub work above took it 9 KB past 2.8 MB; compressed it is about 702 KB. */
  /* 3.0 → 3.4 MB (October 2026): Smart Scoring and pasted writing that keeps its format, as above (about 3.02 MB; with
     all of Smart Scoring in, about 3.32 MB). */
  /* 3.4 → 3.5 MB (October 2026): the Tasks List's columns, moved and sized by each person (src/list-columns.js), took
     it 8 KB past 3.4 MB (about 3.41 MB); compressed it grew 4 KB, to about 800 KB, the 860 KB limit unchanged. */
  /* 3.5 → 3.6 MB (October 2026): choosing which List columns show, the styled Kind of work dropdown and the team's
     context for the AI took it 3 KB past 3.5 MB (about 3.503 MB); compressed it is about 804 KB at quality 11, the
     860 KB limit unchanged. */
  assert.ok(html.length < 3.6 * 1024 * 1024, 'uncompressed shell and its files under 3.6 MB, got ' + html.length);
  const again = await fetch(s.base + '/', { headers: { 'if-none-match': etag } });
  assert.equal(again.status, 304);
  for (const p of ['/', '/assets/' + built.names.js]) {
    const gz = await new Promise((res, rej) => require('node:http').get(s.base + p, { headers: { 'accept-encoding': 'gzip' } }, m => { const c = []; m.on('data', d => c.push(d)); m.on('end', () => res({ enc: m.headers['content-encoding'], body: Buffer.concat(c) })); m.on('error', rej); }));
    assert.equal(gz.enc, 'gzip', p);
    assert.ok(zlib.gunzipSync(gz.body).equals(p === '/' ? built.raw.html : built.raw.js), p);
  }
  for (const p of ['/package.json', '/server/server.js', '/data/creative-os.db', '/.env.example', '/README.md']) assert.equal((await fetch(s.base + p)).status, 404, p);
});

test('notification sound is a real, small, audio-only MP3', () => {
  const mp3 = fs.readFileSync(path.join(root, 'src', 'sounds', 'zen-chime.mp3'));
  assert.ok(mp3.length < 16 * 1024, 'chime under 16 KB');
  const id3 = mp3.subarray(0, 3).toString() === 'ID3';
  let off = 0; if (id3) off = 10 + ((mp3[6] & 0x7f) << 21 | (mp3[7] & 0x7f) << 14 | (mp3[8] & 0x7f) << 7 | (mp3[9] & 0x7f));
  assert.equal(mp3[off], 0xFF, 'MPEG audio frame sync');
  assert.equal((mp3[off + 1] & 0xE0), 0xE0, 'MPEG audio frame sync');
  assert.equal((mp3[off + 1] >> 1) & 0x3, 1, 'Layer III');
  assert.notEqual(mp3.readUInt32BE(0), 0x000001BA, 'not an MPEG program stream');
  /* Oct 2026: the served page plays it as a file of its own (public/assets/, kept a year by the browser); the standalone file carries it inside.
     The page's code, which names it, is a file of its own too (tests/built-page.js). */
  const html = require('./built-page').builtPage().code;
  const url = (html.match(/"(\/assets\/zen-chime\.[0-9a-f]{10}\.mp3)"/) || [])[1];
  assert.ok(url && fs.readFileSync(path.join(root, 'public', url)).equals(mp3), 'the served page plays the new chime');
  assert.ok(fs.readFileSync(path.join(root, 'dist', 'creative-os-standalone.html'), 'utf8').includes('data:audio/mpeg;base64,' + mp3.toString('base64')), 'the standalone file inlines it');
});

test('authorization and validation hardening', { timeout: 20000 }, async t => {
  const s = await startServer(t);
  const admin = await s.login('ops@zencrevia.test', 'Readiness!Admin234');
  // create a member and a task
  let r = await s.req('POST', '/api/members', { id: 'mira', name: 'Mira Member', email: 'mira@zencrevia.test', perm: 'member', teams: [] }, admin); assert.equal(r.status, 200, await r.clone().text());
  assert.equal((await s.req('POST', '/api/members', { name: '' }, admin)).status, 400);
  assert.equal((await s.req('POST', '/api/members', { name: 'Dup', email: 'mira@zencrevia.test' }, admin)).status, 409);
  assert.equal((await s.req('POST', '/api/members/mira/password', { password: 'Member!Pass23456' }, admin)).status, 200);
  const mira = await s.login('mira@zencrevia.test', 'Member!Pass23456');
  const task = await (await s.req('POST', '/api/tasks', { title: 'Readiness task', status: 'backlog' }, admin)).json();

  // partial member edits merge instead of crashing, and never escalate
  r = await s.req('PUT', '/api/members/mira', { name: 'Mira M.' }, mira); assert.equal(r.status, 200, await r.clone().text());
  r = await s.req('PUT', '/api/members/mira', { perm: 'admin' }, mira); assert.equal(r.status, 200);
  assert.equal((await (await s.req('GET', '/api/bootstrap', undefined, admin)).json()).people.mira.perm, 'member');

  // saved views: validated, owner-only
  assert.equal((await s.req('POST', '/api/views', {}, admin)).status, 400);
  r = await s.req('POST', '/api/views', { id: 'sv_ops', name: 'Ops view', type: 'list' }, admin); assert.equal(r.status, 200);
  assert.equal((await s.req('PUT', '/api/views/sv_ops', { name: 'hijacked', type: 'list' }, mira)).status, 404);
  await s.req('POST', '/api/views', { id: 'sv_ops', name: 'hijacked', type: 'list' }, mira);
  const views = await (await s.req('GET', '/api/bootstrap', undefined, admin)).json();
  assert.equal(views.savedViews.find(v => v.id === 'sv_ops').name, 'Ops view');

  // notifications: known kind, real entity, bounded, rate limited
  assert.equal((await s.req('POST', '/api/notifications', { k: 'mention', t: 'NOPE-1', recipients: ['admin'] }, mira)).status, 404);
  assert.equal((await s.req('POST', '/api/notifications', { k: 'phish', t: task.id, recipients: ['admin'] }, mira)).status, 400);
  assert.equal((await s.req('POST', '/api/notifications', { k: 'mention', t: task.id, recipients: Array.from({ length: 30 }, (_, i) => 'u' + i) }, mira)).status, 400);
  assert.equal((await s.req('POST', '/api/notifications', { k: 'mention', t: task.id, recipients: ['admin'] }, mira)).status, 200);
  let limited = false; for (let i = 0; i < 70 && !limited; i++) limited = (await s.req('POST', '/api/notifications', { k: 'mention', t: task.id, recipients: ['admin'] }, mira)).status === 429;
  assert.ok(limited, 'per-sender notification rate limit');

  // test email: admin only, no filesystem path leak
  assert.equal((await s.req('POST', '/api/mail/test', {}, mira)).status, 403);
  const mail = await (await s.req('POST', '/api/mail/test', {}, admin)).json();
  assert.ok(!String(mail.result && mail.result.file).includes(path.sep), 'basename only');

  // deactivate keeps work, blocks sign-in
  assert.equal((await s.req('POST', '/api/members/mira/active', { active: false }, admin)).status, 200);
  assert.equal((await s.req('GET', '/api/bootstrap', undefined, mira)).status, 401);
  assert.equal((await s.req('POST', '/api/auth/login', { email: 'mira@zencrevia.test', password: 'Member!Pass23456' })).status, 401);
});

test('backup schedule follows the dashboard setting; environment override is reported', { timeout: 20000 }, async t => {
  const s = await startServer(t);
  const admin = await s.login('ops@zencrevia.test', 'Readiness!Admin234');
  let d = await (await s.req('GET', '/api/backups', undefined, admin)).json();
  assert.equal(d.schedule.source, 'default'); assert.equal(d.schedule.intervalHours, 24);
  await s.req('PUT', '/api/backups/settings', { auto: 'weekly', keep: 10 }, admin);
  d = await (await s.req('GET', '/api/backups', undefined, admin)).json();
  assert.deepEqual([d.schedule.source, d.schedule.intervalHours], ['dashboard', 168]);
  await s.req('PUT', '/api/backups/settings', { auto: 'off' }, admin);
  d = await (await s.req('GET', '/api/backups', undefined, admin)).json();
  assert.equal(d.schedule.intervalHours, 0);
});

test('backup schedule environment override', { timeout: 20000 }, async t => {
  const s = await startServer(t, { COS_BACKUP_INTERVAL_HOURS: '6' });
  const admin = await s.login('ops@zencrevia.test', 'Readiness!Admin234');
  await s.req('PUT', '/api/backups/settings', { auto: 'off' }, admin);
  const d = await (await s.req('GET', '/api/backups', undefined, admin)).json();
  assert.deepEqual([d.schedule.source, d.schedule.intervalHours], ['environment', 6]);
});

test('demo seed stays available on request', { timeout: 20000 }, async t => {
  const s = await startServer(t, { COS_SEED_DEMO: '1', COS_ADMIN_EMAIL: '' });
  const admin = await s.login('admin@zencrevia.demo', 'Readiness!Admin234');
  const boot = await (await s.req('GET', '/api/bootstrap', undefined, admin)).json();
  assert.ok(boot.tasks.length > 10); assert.ok(Object.keys(boot.people).length > 5);
});
