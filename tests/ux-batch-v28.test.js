const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),{DatabaseSync}=require('node:sqlite');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Knowledge stores bilingual page content and durable manageable folders',()=>{
  const d=new DatabaseSync(':memory:');d.exec(read('db/schema.sql'));
  d.exec("INSERT INTO users(id,name,email) VALUES('u','User','u@x.io');INSERT INTO workspaces(id,name) VALUES('ws','Workspace')");
  const sz=require('../server/serialize');
  sz.writeKnowledgeFolder(d,'ws',{id:'kf',name:'Design SOP',nameId:'SOP Desain',sort:1});
  sz.writePage(d,'ws',{id:'k',folder:'Design SOP',title:'Review etiquette',body:'English',translations:{id:{folder:'SOP Desain',title:'Etika review',body:'Indonesia'}},by:'u'});
  assert.equal(sz.readKnowledgeFolders(d,'ws')[0].nameId,'SOP Desain');
  assert.equal(sz.readKnowledge(d,'ws')[0].translations.id.title,'Etika review');
  const ui=read('src/knowledge.js');
  assert.match(ui,/Search folders/);assert.match(ui,/Add new folder/);assert.match(ui,/deleteKnowledgeFolder/);assert.match(ui,/kb-bi-grid/);
});

test('Chat recognizes internal task/project links and routes inferred images to Media',()=>{
  const m=read('src/messages.js'),g=read('src/gdrive.js');
  assert.match(m,/internalEntityFromUrl/);assert.match(m,/p\.resourceType==="task"\|\|p\.resourceType==="project"/);
  assert.match(m,/function msgRefMediaKind/);assert.match(m,/png\|jpe\?g\|gif\|webp/);
  assert.match(m,/forceDrive:!!msgMediaKind/);assert.match(g,/opts\.forceDrive&&gdReady\(\)/);
  assert.match(m,/msg-quick-label/);
});

test('Calendar labels rerender their active state and mobile/select refinements are scoped',()=>{
  const core=read('src/core.js'),tasks=read('src/tasks.js'),enh=read('src/enhance.js'),css=read('src/refinements.css');
  assert.match(core,/function toggleChipLabels[\s\S]*renderScreen\(false\)/);
  assert.match(tasks,/aria-pressed/);assert.match(tasks,/Hide labels/);
  assert.match(enh,/function bulkSurface/);assert.match(enh,/\["kanban","list","grid","calendar","timeline"\]/);assert.match(enh,/\["board","list","grid","calendar","timeline"\]/);assert.doesNotMatch(enh,/document\.querySelectorAll\('#content \[onclick\*="openTask\("\]'/);
  assert.match(enh,/\.chip\[data-id\]/);assert.match(enh,/\.tl-row\[data-id\]/);assert.match(tasks,/class="chip[\s\S]*data-id=/);assert.match(tasks,/class="tl-row" data-id=/);
  assert.match(tasks,/calendarMobileControls/);assert.match(css,/\.calendar-mobile-controls/);
  assert.match(css,/\.cal-grid \.chip-eyebrow/);assert.match(css,/\.task-close/);assert.match(css,/\.tl-row\.group \.tl-bar\{display:none\}/);
});

test('Mobile work surfaces keep stable headers, fixed chat and working account access',()=>{
  const core=read('src/core.js'),messages=read('src/messages.js'),projects=read('src/projects.js'),gallery=read('src/ai-gallery.js'),css=read('src/refinements.css');
  assert.match(core,/function openMobileAccount/);/* v30: mobile sheet opens My profile; the topbar avatar keeps the full account menu */assert.match(core,/go\(\\'team\\',ME\)">'\+I\.user\+'<span>My profile/);
  assert.match(messages,/msg-new-floating/);assert.match(messages,/msg-new-conv/);assert.match(messages,/msg-timeline-wrap/);assert.match(messages,/msg-new-chat-icon/);
  assert.match(projects,/project-pagehead/);assert.match(projects,/project-new-task/);
  assert.match(gallery,/ag-pagehead/);assert.match(css,/\.content:has\(\.msg-layout\)/);
  assert.match(css,/\.msg-quick \.btn\{[^}]*width:38px!important[^}]*height:38px!important[^}]*min-height:38px!important[^}]*aspect-ratio:1\/1[^}]*border-radius:50%!important/);
  assert.match(css,/#aiCanvas\.ai-zoom-viewport\{height:300px!important/);assert.match(css,/grid-auto-rows:minmax\(76px,76px\)/);
});

test('Teams expose PowerPoint plus done-this-month and produced-assets KPIs',()=>{
  const t=read('src/teams.js');assert.match(t,/exportModal\(\\'ppt\\'\)/);assert.match(t,/teamDoneThisMonth/);assert.match(t,/Done this month/);assert.match(t,/Assets produced/);
});
