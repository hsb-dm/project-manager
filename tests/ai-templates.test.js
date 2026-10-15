/* AI Hub templates from the canvas (Oct 2026): a role with save_ai_templates saves a canvas as a template for everyone;
   its maker changes or removes it, an admin any (built-ins too); pictures become stored files; a workspace save no
   longer sends the list back over someone else's template. The browser lays the workspace's list over the built-ins. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), os = require('node:os'), vm = require('node:vm');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8').replace(/<\/?script>/g, '');
const PNG = 'data:image/png;base64,' + fs.readFileSync(path.join(root, 'e2e/fixtures/red.png')).toString('base64');

function hub() {
  const noop = () => {};
  const c = { UI_ID: {}, WS: { brand: {}, theme: {}, ai: {} }, API: { on: true }, ME: 'u1', console, setTimeout, window: { addEventListener: noop }, localStorage: { getItem: () => null, setItem: noop },
    document: { addEventListener: noop, getElementById: () => null, querySelector: () => null, querySelectorAll: () => [], createElement: () => ({ style: {}, getContext: () => null, addEventListener: noop }), head: { appendChild: noop }, body: { appendChild: noop } },
    clone: x => JSON.parse(JSON.stringify(x)), byId: (l, id) => (l || []).find(x => x.id === id), tr: x => x, toast: noop, renderScreen: noop, aiHistoryBefore: noop, aiSelectedModelCan: () => true,
    canI: { manageWorkspace: () => false }, has: () => false };
  vm.createContext(c);
  ['src/ai.js', 'src/brand-characters.js', 'src/brand-fonts.js', 'src/ai-templates.js'].forEach(f => vm.runInContext(read(f), c, { filename: f }));
  return c;
}

test('the workspace\'s templates are laid over the built-ins: changed in place, removed stay gone, new ones after', () => {
  const c = hub(), ids = () => Array.from(c.aiPromptTemplates(), t => t.id), first = c.AI_PROMPT_DEFAULT[0].id, second = c.AI_PROMPT_DEFAULT[1].id;
  assert.deepEqual(ids(), Array.from(c.AI_PROMPT_DEFAULT, t => t.id), 'nothing saved: the built-ins');
  c.WS.ai.promptTemplates = [{ id: 'p_mine', name: 'Mine', owner: 'u2' }, { id: first, name: 'Changed by an admin' }, { id: second, deleted: true }, { id: 'p_old', name: 'An older preset' }];
  const list = c.aiPromptTemplates();
  assert.equal(list[0].name, 'Changed by an admin', 'in its place');
  assert.ok(!ids().includes(second), 'a removed built-in stays gone');
  assert.deepEqual(ids().slice(-2), ['p_mine', 'p_old'], 'the workspace\'s own after the built-ins');
  /* who may change what */
  c.has = cap => cap === 'save_ai_templates';
  assert.equal(c.aiTemplateCanEdit({ id: 'p_mine', owner: 'u1' }), true, 'their own');
  assert.equal(c.aiTemplateCanEdit({ id: 'p_x', owner: 'u2' }), false, 'someone else\'s');
  assert.equal(c.aiTemplateCanEdit(c.AI_PROMPT_DEFAULT[2]), false, 'a built-in');
  c.canI.manageWorkspace = () => true; assert.equal(c.aiTemplateCanEdit(c.AI_PROMPT_DEFAULT[2]), true, 'an admin: any');
  /* the canvas as a template: its whole document, without the member's own reference picture or the editor's state */
  c.aiApplyTemplate('p_feed_engage'); c.AIF.reference = PNG; c.AIF.extraLayers = [{ id: 'pic', type: 'image', src: PNG }];
  const t = c.aiTemplateFromCanvas('From the canvas');
  assert.equal(t.layout, 'poster'); assert.equal(t.ctaRadius, 50); assert.equal(t.ctaStroke, true); assert.match(t.disclaimerText, /BAPPEBTI/);
  assert.equal(t.editorFields.reference, undefined); assert.equal(t.editorFields.selectedLayer, undefined); assert.equal(t.editorFields.template, undefined);
  assert.equal(t.editorFields.extraLayers[0].src, PNG);
  /* opened, then its brief changed: it is still the template being worked on */
  c.aiSetBrief('A new brief'); assert.equal(c.AIF.template, ''); assert.equal(c.aiTemplateOpen().id, 'p_feed_engage');
});

test('without a server, removing a built-in remembers it and saving keeps what was removed', () => {
  const c = { WS: { ai: { promptTemplates: [{ id: 'p_gone', deleted: true }] } }, require: () => true, clone: x => JSON.parse(JSON.stringify(x)), closeModal() {}, saveWS() {}, renderScreen() {},
    aiPromptTemplates: () => [{ id: 'p_keep', name: 'Keep', brief: 'b' }], val: id => (id === 'pt_name' ? 'Keep' : ''), document: { getElementById: () => null }, byId: (l, id) => (l || []).find(x => x.id === id), confirmModal: (a, b, fn) => fn() };
  vm.createContext(c);
  const s = read('src/settings.js'); vm.runInContext(s.slice(s.indexOf('function savePromptTpl('), s.indexOf('function setChatTemplates(') > 0 ? s.indexOf('function setChatTemplates(') : s.indexOf('function delPromptTpl(') + 600), c);
  c.savePromptTpl('p_keep');
  assert.deepEqual(c.WS.ai.promptTemplates.map(t => t.id), ['p_keep', 'p_gone']);
  c.delPromptTpl('p_keep');
  assert.deepEqual(c.WS.ai.promptTemplates.map(t => [t.id, !!t.deleted]), [['p_gone', true], ['p_keep', true]]);
});

/* the real server */
function place(t) { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-tpl-')), servers = []; t.after(async () => { for (const s of servers) await s.stop(); fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); }); return { dir, servers }; }
async function start(at) {
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: at.dir, COS_ADMIN_PASSWORD: 'Tpl!Admin234567', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'tpl-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'tpl-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '1', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log', APP_URL: 'https://zen.hsb-test.dev' }) });
  const stop = async () => { if (child.exitCode === null && child.signalCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } };
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 10000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = async (e, pw) => { const r = await req('POST', '/api/auth/login', { email: e, password: pw }); assert.equal(r.status, 200, await r.clone().text()); return r.headers.get('set-cookie').split(';')[0]; };
  const admin = await login('admin@zencrevia.demo', 'Tpl!Admin234567');
  const as = async id => { await req('POST', '/api/members/' + id + '/password', { password: 'Member!Pass2345' }, admin); return login(id + '@zencrevia.demo', 'Member!Pass2345'); };
  const boot = await (await req('GET', '/api/bootstrap', undefined, admin)).json();
  const s = { req, admin, as, boot, stop }; at.servers.push(s); return s;
}
const tpl = extra => ({ template: Object.assign({ name: 'Testimonial', brief: 'Two people', layout: 'poster', size: 'feed34', textColor: '#D4FA00', ctaColor: 'red', editorFields: { headline: 'Hi', extraLayers: [{ id: 'pic', type: 'image', src: PNG }], reference: PNG, logoImg: PNG } }, extra || {}) });

test('a role with the permission saves templates for everyone; the maker and an admin change them; pictures are files', { timeout: 60000 }, async t => {
  const s = await start(place(t));
  const ids = Object.keys(s.boot.people).filter(id => id !== 'admin' && s.boot.people[id].perm === 'member' && !s.boot.people[id].stakeholder);
  const [m1, m2] = [await s.as(ids[0]), await s.as(ids[1])], role = s.boot.roles.find(r => r.id === 'member');
  const stored = async () => (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws.ai.promptTemplates || [];
  /* without the permission: no */
  assert.equal((await s.req('POST', '/api/ai/templates', tpl(), m1)).status, 403);
  assert.equal((await s.req('PUT', '/api/roles/member', Object.assign({}, role, { permissions: role.permissions.concat(['save_ai_templates']) }), s.admin)).status, 200);
  /* with it: saved for everyone, with its maker, its pictures as files, the reference left out */
  let r = await s.req('POST', '/api/ai/templates', tpl(), m1); assert.equal(r.status, 200, await r.clone().text());
  const made = (await r.json()).id, saved = (await stored()).find(x => x.id === made);
  assert.equal(saved.owner, ids[0]); assert.equal(saved.textColor, '#D4FA00'); assert.equal(saved.ctaColor, undefined, 'not a colour: left out');
  assert.match(saved.editorFields.extraLayers[0].src, /^\/files\/[a-f0-9]{64}\.png$/); assert.match(saved.editorFields.logoImg, /^\/files\//);
  assert.equal(saved.editorFields.reference, undefined);
  /* the maker changes it; someone else may not; nobody but an admin touches a built-in */
  assert.equal((await s.req('PUT', '/api/ai/templates/' + made, tpl({ name: 'Testimonial v2' }), m1)).status, 200);
  assert.equal((await s.req('PUT', '/api/ai/templates/' + made, tpl({ name: 'Taken over' }), m2)).status, 403);
  assert.equal((await s.req('DELETE', '/api/ai/templates/' + made, undefined, m2)).status, 403);
  assert.equal((await s.req('PUT', '/api/ai/templates/p_feed_edu', tpl({ name: 'My feed' }), m1)).status, 403);
  assert.equal((await s.req('DELETE', '/api/ai/templates/p_feed_edu', undefined, m1)).status, 403);
  /* an admin changes someone's template (it stays theirs), changes a built-in and removes another */
  assert.equal((await s.req('PUT', '/api/ai/templates/' + made, tpl({ name: 'Checked by admin' }), s.admin)).status, 200);
  assert.equal((await s.req('PUT', '/api/ai/templates/p_feed_edu', tpl({ name: 'Feed, our way' }), s.admin)).status, 200);
  assert.equal((await s.req('DELETE', '/api/ai/templates/p_story_webinar', undefined, s.admin)).status, 200);
  let list = await stored();
  assert.equal(list.find(x => x.id === made).owner, ids[0]); assert.equal(list.find(x => x.id === made).name, 'Checked by admin');
  assert.equal(list.find(x => x.id === 'p_feed_edu').owner, undefined); assert.deepEqual(list.find(x => x.id === 'p_story_webinar'), { id: 'p_story_webinar', deleted: true });
  /* a workspace save no longer sends the list over it; only an explicit reset clears it */
  const ws = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws;
  assert.equal((await s.req('PUT', '/api/workspace', Object.assign({}, ws, { ai: Object.assign({}, ws.ai, { promptTemplates: [] }) }), s.admin)).status, 200);
  assert.equal((await stored()).length, list.length, 'kept');
  /* the maker removes their own */
  assert.equal((await s.req('DELETE', '/api/ai/templates/' + made, undefined, m1)).status, 200);
  assert.ok(!(await stored()).some(x => x.id === made));
  /* refused: a picture from elsewhere, a prototype key that goes nowhere, a template without a name */
  assert.equal((await s.req('POST', '/api/ai/templates', tpl({ editorFields: { extraLayers: [{ type: 'image', src: 'https://example.com/a.png' }] } }), m1)).status, 400);
  r = await s.req('POST', '/api/ai/templates', { template: JSON.parse('{"name":"Proto","editorFields":{"__proto__":{"polluted":true},"layerStyles":{"constructor":{"x":1}}}}') }, m1);
  assert.equal(r.status, 200); const proto = (await stored()).find(x => x.name === 'Proto');
  assert.deepEqual(Object.keys(proto.editorFields).sort(), ['layerStyles']); assert.deepEqual(proto.editorFields.layerStyles, {});
  assert.equal((await s.req('POST', '/api/ai/templates', tpl({ name: '  ' }), m1)).status, 400);
  /* "only me": kept for its maker alone, wherever the workspace is sent */
  r = await s.req('POST', '/api/ai/templates', tpl({ name: 'Just mine', private: true }), m1); assert.equal(r.status, 200, await r.clone().text());
  const mine = (await r.json()).id;
  const sees = async ck => ((await (await s.req('GET', '/api/bootstrap', undefined, ck)).json()).ws.ai.promptTemplates || []).some(x => x.id === mine);
  assert.equal(await sees(m1), true, 'its maker');
  assert.equal(await sees(m2), false, 'not someone else');
  assert.equal(await sees(s.admin), false, 'not even an admin');
  assert.ok(!((await (await s.req('GET', '/api/live/workspace', undefined, m2)).json()).ws.ai.promptTemplates || []).some(x => x.id === mine), 'nor in a live update');
  const ws3 = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws;
  const saved3 = await (await s.req('PUT', '/api/workspace', ws3, s.admin)).json();
  assert.ok(!(saved3.ai.promptTemplates || []).some(x => x.id === mine), 'nor in what a workspace save sends back');
  assert.ok(!(await (await s.req('POST', '/api/ai/templates', tpl({ name: 'Other' }), m2)).json()).promptTemplates.some(x => x.id === mine), 'nor in another member\'s save');
  /* an admin changing it does not make it everyone's; its maker can */
  assert.equal((await s.req('PUT', '/api/ai/templates/' + mine, tpl({ name: 'Just mine, checked' }), s.admin)).status, 200);
  assert.equal(await sees(m2), false);
  assert.equal((await s.req('PUT', '/api/ai/templates/' + mine, tpl({ name: 'Now for all' }), m1)).status, 200);
  assert.equal(await sees(m2), true, 'shared by its maker');
  /* a built-in is everyone's, whatever is asked */
  assert.equal((await s.req('PUT', '/api/ai/templates/p_feed_promo', tpl({ name: 'Promo', private: true }), s.admin)).status, 200);
  assert.equal(((await (await s.req('GET', '/api/bootstrap', undefined, m2)).json()).ws.ai.promptTemplates || []).find(x => x.id === 'p_feed_promo').private, undefined);
  /* the reset */
  const ws2 = (await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws;
  assert.equal((await s.req('PUT', '/api/workspace', Object.assign({}, ws2, { ai: Object.assign({}, ws2.ai, { promptTemplates: null, promptTemplatesReset: true }) }), s.admin)).status, 200);
  assert.equal((await (await s.req('GET', '/api/bootstrap', undefined, s.admin)).json()).ws.ai.promptTemplates, null);
});
