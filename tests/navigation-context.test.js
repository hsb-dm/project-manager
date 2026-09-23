const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.join(__dirname,'..'),read=p=>fs.readFileSync(path.join(root,p),'utf8');

test('Project, team, and person detail headers share the contextual Back control',()=>{
  const enhance=read('src/enhance.js'),css=read('src/refinements.css');
  assert.match(enhance,/S\.screen==="projects"&&S\.projectId/);
  assert.match(enhance,/S\.screen==="teams"&&S\.teamId/);
  assert.match(enhance,/S\.screen==="team"&&S\.memberId/);
  assert.match(enhance,/navBackButton\(S\.screen==="projects"\?"projects":"teams"\)/);
  assert.match(css,/\.nav-context-back>span\{[^}]*text-overflow:ellipsis/);
  assert.match(css,/\.nav-context-back\{[^}]*margin-left:-8px/);
});

test('Router captures detail origins and restores full view state and scroll',()=>{
  const core=read('src/core.js');
  assert.match(core,/var NAV_CONTEXT=\[\]/);
  assert.match(core,/function navSnapshot\(\).*state:state,scroll:appScrollTop\(\)/);
  assert.match(core,/function navRestore\(snap\).*S=clone\(snap\.state\)/);
  assert.match(core,/appScrollTop\(snap\.scroll\|\|0\)/);
  assert.match(core,/function go\(screen,sub,navOpts\)/);
  assert.match(core,/targetKey&&!navOpts\.skipContext&&targetKey!==currentKey/);
  assert.match(core,/NAV_CONTEXT\.push\(navSnapshot\(\)\)/);
});

test('Back labels reflect the real source and direct links use safe fallbacks',()=>{
  const core=read('src/core.js'),enhance=read('src/enhance.js');
  for(const label of ['Home','My Tasks','Calendar','Projects','Teams','Messages','Analytics']) assert.match(core,new RegExp(label));
  assert.match(core,/if\(state\.search\) return tr\("Search"\)/);
  assert.match(enhance,/entityOpen\(type,id,sub,\{direct:true\}\)/);
  assert.match(enhance,/go=function\(screen,sub,navOpts\)\{ _go\(screen,sub,navOpts\)/);
});

test('Contextual Back restores calendar state, supports nested team details, and falls back for direct links',()=>{
  const core=read('src/core.js'),start=core.indexOf('var NAV_CONTEXT=[];'),end=core.indexOf('function renderScreen',start);
  let scroll=275,rendered=0;
  const classList={contains:()=>false,toggle:()=>{},remove:()=>{}};
  const elements={searchInput:{value:''},nav:{classList},drawer:{classList,setAttribute:()=>{}},overlay:{classList},sheet:{classList}};
  const context={
    S:{screen:'calendar',search:'',calMode:'week',calMonth:8,calYear:2026,calDay:23,calScope:'all',filters:{team:'design'},projectId:null,teamId:null,memberId:null},
    PEOPLE:{zein:{name:'Zein'}},I:{back:'←'},_searchTimer:null,
    document:{body:{classList},getElementById:id=>elements[id]||{classList}},
    clone:o=>JSON.parse(JSON.stringify(o)),appScrollTop:y=>y===undefined?scroll:(scroll=y),project:id=>id==='p1'?{name:'Launch'}:null,team:id=>id==='design'?{name:'Design'}:null,
    tr:x=>x,esc:x=>x,clearTimeout:()=>{},closePops:()=>{},closeModal:()=>{},renderNav:()=>{},renderScreen:()=>{rendered++},messagesBadgeSync:()=>{},requestAnimationFrame:fn=>fn(),
    emptyTaskFilters:()=>({}),homeKpiKind:()=>null,rememberScroll:()=>{},restoreScroll:()=>{},WorkspaceQuest:undefined
  };
  vm.createContext(context); vm.runInContext(core.slice(start,end),context);

  context.go('projects','p1');
  assert.equal(context.navBackLabel('projects'),'Calendar');
  assert.equal(context.NAV_CONTEXT.length,1);
  context.navBack('projects');
  assert.equal(context.S.screen,'calendar');
  assert.equal(context.S.calMode,'week');
  assert.equal(context.S.filters.team,'design');
  assert.equal(scroll,275);

  context.S.screen='teams'; context.S.teamId=null;
  context.go('teams','design'); context.go('team','zein');
  assert.equal(context.navBackLabel('teams'),'Design');
  context.navBack('teams');
  assert.equal(context.S.screen,'teams'); assert.equal(context.S.teamId,'design');
  assert.equal(context.navBackLabel('teams'),'Teams');
  context.navBack('teams');
  assert.equal(context.S.screen,'teams'); assert.equal(context.S.teamId,null);

  context.S.screen='home'; context.go('projects','p1',{direct:true});
  assert.equal(context.NAV_CONTEXT.length,0);
  context.navBack('projects');
  assert.equal(context.S.screen,'projects'); assert.equal(context.S.projectId,null);
  assert.ok(rendered>=6);
});
