/* Assets produced, per person — in the workbook and the deck, counted one way.

   A task's "Assets produced" is credited to whoever uploaded its versions, in proportion; only
   when no version was uploaded does it fall to the assignee, and then it is marked as estimated.
   The Workload sheet carries produced, delivered and how it was credited; the workload slide
   carries the number under each name. */
const test = require('node:test'), assert = require('node:assert/strict'), fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');

function load() {
  const m = { weeks: ['Sep 1', 'Sep 8'], created: [1, 1], completed: [1, 1], overdue: [0, 0], avgDays: [1, 1], revisionRate: [0, 0], approvalHrs: [1, 1], byTeam: [], totalCompleted: 2, totalCreated: 2, openNow: 1, overdueNow: 0, inReview: 0, avgCompletion: 1, liveRevRate: 0, approvalRate: 0, avgApproval: 1, utilization: 25, asg: 10, cap: 40 };
  const d = { m, stages: [], projects: [], people: [], overdue: [], upcoming: [], review: [] };
  const ctx = { TextEncoder, Uint8Array, console, Date, UI_LANG: 'en', WS: { name: 'Studio', logo: 'S', theme: { accent: '#204FDD', secondary: '#C5F448' }, customFields: [] }, S: { range: 2 }, ME: 'ana', ASSETS: [], ASSET_FOLDERS: [], tr: s => s, iso: n => '2026-09-0' + (n + 1), dueDate: () => 'Sep 4', dueTxt: () => 'today', first: v => v, person: id => ({ name: id }), inkFor: () => '#fff', teamMembers: () => [], byId: () => null, assetCount: t => t.assetCount || 0, assetsProduced: () => 0, assetLinks: () => [], isClosed: t => !!t.done, assigneesOf: t => t.assignees || [] };
  vm.createContext(ctx);
  for (const file of ['report-template.js', 'report-layout.js', 'export.js']) vm.runInContext(fs.readFileSync(path.join(__dirname, '../src', file), 'utf8').replace(/^<script>\s*/, '').replace(/<\/script>\s*$/, ''), ctx);
  ctx.reportData = () => d; ctx.reportTasks = () => []; ctx.exportTasks = () => []; ctx.EXPORT = { from: 0, to: 7, weeks: 2, include: {} };
  return { ctx, d };
}
function unzip(bytes) { const buf = Buffer.from(bytes), files = {}; for (let i = 0; i < buf.length && buf.readUInt32LE(i) === 0x04034b50;) { const size = buf.readUInt32LE(i + 18), n = buf.readUInt16LE(i + 26), extra = buf.readUInt16LE(i + 28), start = i + 30 + n + extra; files[buf.subarray(i + 30, i + 30 + n).toString()] = buf.subarray(start, start + size).toString(); i = start + size; } return files; }

test('a person is credited with the assets of the versions they uploaded, and only estimated without one', () => {
  const { ctx } = load();
  const banner = { id: 'T1', assetCount: 6, done: true, assignees: ['ana'], versions: [{ by: 'ana' }, { by: 'ana' }, { by: 'budi' }] };
  const story = { id: 'T2', assetCount: 3, done: false, assignees: ['ana'], versions: [] };
  const ana = ctx.personAssets('ana', [banner, story]), budi = ctx.personAssets('budi', [banner, story]);
  assert.equal(ana.produced, 7, '4 of the banner, by upload, and the 3 of a task nobody uploaded to');
  assert.equal(ana.delivered, 4, 'only the finished task counts as delivered');
  assert.equal(ana.attributed, true, 'part of it is an estimate, and says so');
  assert.equal(budi.produced, 2); assert.equal(budi.delivered, 2); assert.equal(budi.attributed, false);
  /* an assignee who uploaded nothing is not credited for someone else's uploads */
  assert.equal(ctx.personAssets('cici', [Object.assign({}, banner, { assignees: ['cici'] })]).produced, 0);
});

test('the Workload sheet and the workload slide show each person\'s assets', () => {
  const { ctx, d } = load();
  d.people = [
    { id: 'ana', name: 'Ana Putri', role: 'Designer', team: 'Brand', cap: 40, assigned: 10, open: 1, review: 0, overdue: 0, assetsProduced: 7, assetsDelivered: 4, assetsAttributed: true, assignedTotal: 2, completed: 1, completionRate: 50, projectsInvolved: 1, topProjects: [], approvalRate: null, revisionRate: null },
    { id: 'budi', name: 'Budi Santoso', role: 'Illustrator', team: 'Brand', cap: 40, assigned: 5, open: 0, review: 0, overdue: 0, assetsProduced: 2, assetsDelivered: 2, assetsAttributed: false, assignedTotal: 1, completed: 1, completionRate: 100, projectsInvolved: 1, topProjects: [], approvalRate: null, revisionRate: null },
  ];
  const book = unzip(ctx.buildXLSX());
  const sheet = Object.entries(book).find(([n, x]) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n) && x.includes('Asset credit'));
  assert.ok(sheet, 'the Workload sheet has the asset columns');
  const xml = sheet[1];
  for (const h of ['Assets produced', 'Assets delivered', 'Asset credit']) assert.ok(xml.includes('>' + h + '<'), h);
  assert.ok(xml.includes('Estimated from the assignee') && xml.includes('From version uploads'));
  const row = name => (xml.match(new RegExp('<row [^>]*>(?:(?!</row>).)*' + name + '(?:(?!</row>).)*</row>')) || [''])[0];
  assert.match(row('Ana Putri'), /<v>7<\/v>.*<v>4<\/v>/, 'produced, then delivered');
  assert.match(row('Budi Santoso'), /<v>2<\/v>.*<v>2<\/v>/);

  const deck = unzip(ctx.buildPPTX());
  const slides = Object.entries(deck).filter(([n]) => /^ppt\/slides\/slide\d+\.xml$/.test(n)).map(([, x]) => x).join('');
  assert.ok(slides.includes('Designer · 7* assets produced'), 'under the name on the workload slide, marked as estimated');
  assert.ok(slides.includes('Illustrator · 2 assets produced'));
});
