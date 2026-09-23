const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Task Detail uses configurable Primary / More details / Hidden modes without changing the approved header',()=>{
  const core=read('src/core.js'),drawer=read('src/drawer.js'),settings=read('src/settings.js');
  assert.match(core,/displayMode:"primary"/);
  assert.match(core,/displayMode:"secondary"/);
  assert.match(core,/displayMode:"hidden"/);
  assert.match(settings,/setFieldMode/);
  assert.match(settings,/Hidden fields keep their data/);
  assert.match(drawer,/task-meta-primary/);
  assert.match(drawer,/task-meta-secondary/);
  assert.match(drawer,/aria-expanded/);
  assert.match(drawer,/var head='<div class="dr-top"/, 'the existing header construction remains the same entry point');
});

test('Task Detail keeps one responsive status control and compact dependencies',()=>{
  const drawer=read('src/drawer.js'),css=read('src/refinements.css');
  assert.match(drawer,/task-stage-rail/);
  assert.match(drawer,/task-stage-select/);
  assert.match(css,/\.task-stage-select\{display:none\}/);
  assert.match(css,/@container \(max-width:720px\).*\.task-stage-rail\{display:none\}.*\.task-stage-select\{display:inline-flex\}/s);
  assert.match(drawer,/dependency-empty/);
  assert.match(drawer,/No dependencies yet\./);
  assert.match(drawer,/Add context not covered by the brief/);
});

test('Task people/project fields reuse the shared searchable entity picker and dates are localized',()=>{
  const drawer=read('src/drawer.js'),picker=read('src/entity-picker.js');
  assert.match(drawer,/entityPicker\(\{kind:"person"/);
  assert.match(drawer,/entityPicker\(\{kind:"project"/);
  assert.match(picker,/teamText/);
  assert.match(drawer,/toLocaleDateString\(UI_LANG==="id"\?"id-ID":"en-US"/);
  assert.match(drawer,/name:"Deliverables"|tr\("deliverables"\)/);
});

test('Task metadata keeps Priority and Team visible, puts Tags last, and opens the full due-date target',()=>{
  const core=read('src/core.js'),drawer=read('src/drawer.js'),css=read('src/refinements.css');
  assert.match(core,/id:"prio"[^\n]+displayMode:"primary"/);
  assert.match(core,/id:"team"[^\n]+displayMode:"primary"/);
  assert.match(drawer,/if\(f\.id==="tags"\)\{tagsField=f;return;\}/);
  assert.match(drawer,/task-tags-bottom/);
  assert.match(drawer,/function taskOpenDate/);
  assert.match(drawer,/\.showPicker\(\)/);
  assert.match(css,/\.task-date-read\{[^}]*width:100%[^}]*min-height:38px/);
});

test('Priority and Team menus resolve options internally without serialized onclick arrays',()=>{
  const drawer=read('src/drawer.js'),css=read('src/refinements.css');
  assert.match(drawer,/function taskSelectOptions/);
  assert.match(drawer,/if\(kind==="prio"\)return PRIOS/);
  assert.match(drawer,/if\(kind==="team"\)return teamOpts\(true\)/);
  assert.match(drawer,/data-menu aria-haspopup="menu" onclick="taskSelectMenu\(this,/);
  assert.match(css,/\.task-read-value svg\{[^}]*opacity:\.62/);
  assert.doesNotMatch(drawer,/taskSelectMenu\(this,[^\n]+JSON\.stringify\(opts\)/);
  const source=drawer.match(/function taskSelectOptions[\s\S]*?(?=function taskProjectPicker)/)[0],seen=[];
  const context={PRIOS:[["low","Low"],["high","High"]],WS:{workflow:[],customFields:[]},teamOpts:()=>[["","No team"],["design","Design"]],byId:()=>null,tr:x=>x,fieldLabel:x=>x,ctxMenu:(a,h)=>seen.push(h),esc:x=>String(x),attr:x=>String(x)};
  vm.runInNewContext(source,context);
  context.taskSelectMenu({},'prio','high');
  context.taskSelectMenu({},'team','design');
  assert.match(seen[0],/taskSelectCommit\('prio','high'\)/);
  assert.match(seen[1],/taskSelectCommit\('team','design'\)/);
});

test('Task footer merges successful closed stages without changing stored historical status values',()=>{
  const drawer=read('src/drawer.js'),css=read('src/refinements.css');
  assert.match(drawer,/function taskFooterStages/);
  assert.match(drawer,/s\.kind==="closed"&&\["approved","delivered","done"\]/);
  assert.match(drawer,/name:tr\("Done"\)/);
  assert.match(drawer,/s\.ids\.indexOf\(tk\.status\)>=0/);
  assert.match(css,/\.task-stage-rail\{[^}]*flex-wrap:nowrap[^}]*overflow-x:auto/);
  assert.match(css,/\.task-stage-rail button\{[^}]*min-height:38px/);
  assert.match(css,/\.task-stage-rail button\{[^}]*white-space:nowrap/);
});

test('Free HTTPS links can be attached to Task assets and references',()=>{
  const core=read('src/core.js'),drawer=read('src/drawer.js');
  assert.match(drawer,/function attachTaskLinkModal/);
  assert.match(drawer,/function saveTaskLink/);
  assert.match(drawer,/F\(name,"document","link","Link",0,url\)/);
  assert.match(core,/link:\{l:"External link"/);
});

test('Messages link/media additions stay inside the existing Message reference flow',()=>{
  const messages=read('src/messages.js'),clipboard=read('src/clipboard.js'),server=read('server/messages.js');
  assert.match(messages,/\["messages","Chat"\],\["media","Media"\],\["files","Files"\],\["tasks","Tasks"\],\["links","Links"\]/);
  assert.match(messages,/function messageUrls/);
  assert.match(messages,/function msgStageFile/);
  assert.match(messages,/function msgAttachLink/);
  assert.match(messages,/onclick="msgAttachLink\(\)"/);
  assert.match(messages,/addEventListener\("drop"/);
  assert.match(clipboard,/files\.forEach\(msgStageFile\)/);
  assert.match(server,/const syncBodyRefs/);
  assert.match(server,/link_metadata_cache/);
  assert.match(server,/json_each\(m\.refs\)/);
  assert.doesNotMatch(server,/CREATE TABLE IF NOT EXISTS media/i);
});

test('Calendar see-more lists every calendar item and closes before opening a task',()=>{
  const tasks=read('src/tasks.js'),core=read('src/core.js'),css=read('src/refinements.css');
  assert.match(tasks,/CAL_AGENDA=byDay/);
  assert.match(tasks,/items\.map\(calAgendaRow\)/);
  assert.match(tasks,/if\(it\.type==="task"\) return taskRow/);
  assert.match(tasks,/function openCalendarTask\(id\)\{ closeModal\(\); openTask\(id\); \}/);
  assert.match(tasks,/openAction:"openCalendarTask/);
  assert.match(core,/var openAction=opts\.openAction\|\|/);
  assert.match(css,/\.cal-context-row:hover/);
});
