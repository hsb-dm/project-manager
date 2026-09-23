const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Project description is read-first and exposes an explicit edit mode',()=>{
  const projects=read('src/projects.js'),css=read('src/refinements.css');
  assert.match(projects,/function projectDescriptionPanel/);
  assert.match(projects,/editing=ed&&S\.projectTextEdit===p\.id/);
  assert.match(projects,/project-description-view/);
  assert.match(projects,/onclick="beginProjectTextEdit/);
  assert.match(projects,/onclick="cancelProjectTextEdit\(\)"/);
  assert.match(css,/\.project-copy\{[^}]*white-space:pre-line/);
});

test('Project copy editor shows automatic progress and no manual slider',()=>{
  const projects=read('src/projects.js'),css=read('src/refinements.css');
  assert.doesNotMatch(projects,/id="pj_progress"/);
  assert.match(projects,/projectProgressInfo\(p\)/);
  assert.match(projects,/Automatic progress/);
  assert.match(projects,/p\.progress=projectProgress\(p\)/);
  assert.match(css,/\.project-progress-breakdown/);
  assert.match(projects,/S\.projectTextEdit=null; renderScreen\(false\)/);
});

test('Automatic project progress weighs effort at 60 percent and milestones at 40 percent',()=>{
  const core=read('src/core.js');
  const start=core.indexOf('function isSuccessfulTask');
  const end=core.indexOf('function person(',start);
  const context={TASKS:[],stageKind:id=>['approved','delivered','done','declined'].includes(id)?'closed':'work'};
  vm.createContext(context); vm.runInContext(core.slice(start,end),context);
  const project={id:'p1',status:'active',milestones:[{done:true},{done:false}]};
  const tasks=[
    {proj:'p1',status:'done',effort:6},
    {proj:'p1',status:'in_progress',effort:4},
    {proj:'p1',status:'declined',effort:100}
  ];
  const info=context.projectProgressInfo(project,tasks);
  assert.deepEqual(JSON.parse(JSON.stringify(info)),{value:56,taskPct:60,milestonePct:50,taskDone:1,taskTotal:2,doneEffort:6,totalEffort:10,milestoneDone:1,milestoneTotal:2});
  assert.equal(context.projectProgress({...project,milestones:[]},tasks),60);
  assert.equal(context.projectProgress(project,[]),50);
  assert.equal(context.projectProgress({id:'empty',status:'active',milestones:[]},[]),0);
  assert.equal(context.projectProgress({id:'empty',status:'done',milestones:[]},[]),100);
});

test('Project decision action sits in the panel header and the list owns the padded body',()=>{
  const enhance=read('src/enhance.js'),css=read('src/refinements.css');
  assert.match(enhance,/var action=canEdit\?'<button class="btn sm primary"/);
  assert.match(enhance,/return panel\(tr\("Decisions"\),l\.length,body,null,action,I\.check,"decisions-panel"\)/);
  assert.match(css,/\.decisions-panel \.panel-body\{padding:12px 16px 16px\}/);
});

test('Final asset rows open their task while external asset actions stay independent',()=>{
  const projects=read('src/projects.js'),css=read('src/refinements.css');
  assert.match(projects,/class="alink project-asset-row"[^>]*onclick="openTask/);
  assert.match(projects,/onclick="event\.stopPropagation\(\);openExternal/);
  assert.match(projects,/onclick="event\.stopPropagation\(\);openTask/);
  assert.match(css,/\.project-asset-row\{cursor:pointer/);
  assert.match(css,/\.project-asset-row:hover/);
});
