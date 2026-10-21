const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/i18n.js'),'utf8').replace(/^<script>/,'').replace(/<\/script>\s*$/,'');
function setup(){
 const ctx={UI_ID:{Settings:'Pengaturan'},UI_LANG:'id',PEOPLE:{},PROJECTS:[],TEAMS:[],KNOWLEDGE:[],WS:{},CREATIVE_OS_DEMO:require('../shared/demo-data.js'),NodeFilter:{SHOW_TEXT:4}};
 ctx.tr=s=>ctx.UI_LANG==='id'?(ctx.UI_ID[s]||s):s;
 /* a walker over the root's text nodes; like the browser's, it leaves out a text node whose element the filter rejects */
 ctx.walks=0;
 ctx.document={createTreeWalker(root,show,filter){ctx.walks++;let i=0;return {nextNode(){while(i<root.nodes.length){const n=root.nodes[i++];if(filter&&n.parentElement&&filter(n.parentElement)===2)continue;return n}return null}}}};
 vm.createContext(ctx);vm.runInContext(source,ctx);return ctx;
}
function root(text,protectedText=false,attrs={}){
 const hit=selector=>protectedText&&selector.includes('[data-no-translate]');
 const el={nodeType:1,tagName:'SPAN',closest(selector){return hit(selector)?this:null},matches(selector){return hit(selector)},getAttribute(k){return attrs[k]??null},setAttribute(k,v){attrs[k]=v}};
 const node={nodeType:3,nodeValue:text,parentElement:el};return {nodes:[node],querySelectorAll(){return [el]},attrs};
}
test('nothing is walked while only English has been shown, and Indonesian shown once is put back afterwards',()=>{
 const ctx=setup();ctx.UI_LANG='en';const r=root('  Settings  ',false,{title:'Settings'});
 ctx.localizeVisibleText(r);assert.equal(ctx.walks,0,'English text is already English');assert.equal(r.nodes[0].nodeValue,'  Settings  ');
 ctx.UI_LANG='id';ctx.localizeVisibleText(r);assert.equal(r.nodes[0].nodeValue,'  Pengaturan  ');assert.equal(r.attrs.title,'Pengaturan');
 ctx.UI_LANG='en';ctx.localizeVisibleText(r);assert.equal(r.nodes[0].nodeValue,'  Settings  ');assert.equal(r.attrs.title,'Settings');assert.equal(ctx.walks,2);
});
test('an option naming a project, team, page or label is left as written; the others are translated',()=>{
 const ctx=setup();ctx.UI_ID.Review='Peninjauan';ctx.PROJECTS.push({id:'Review'});
 const mk=(value,text)=>{const sel={nodeType:1,tagName:'SELECT',getAttribute(){return null}};const el={nodeType:1,tagName:'OPTION',value,parentElement:sel,closest(){return null},matches(){return false},getAttribute(){return null}};return {nodeType:3,nodeValue:text,parentElement:el};};
 const a=mk('Review','Review'),b=mk('x','Review');ctx.localizeVisibleText({nodes:[a,b],querySelectorAll(){return []}});
 assert.equal(a.nodeValue,'Review','the project named Review stays');assert.equal(b.nodeValue,'Peninjauan');
});
test('static text and hints restore after EN–ID–EN without replacing user content',()=>{
 const ctx=setup(),r=root('  Settings  ',false,{title:'Settings',placeholder:'Designer'}),saved=root('Settings',true);
 ctx.localizeVisibleText(r);ctx.localizeVisibleText(saved);assert.equal(r.nodes[0].nodeValue,'  Pengaturan  ');assert.equal(r.attrs.placeholder,'Desainer');assert.equal(saved.nodes[0].nodeValue,'Settings');
 ctx.localizeVisibleText(r);ctx.UI_LANG='en';ctx.localizeVisibleText(r);assert.equal(r.nodes[0].nodeValue,'  Settings  ');assert.equal(r.attrs.title,'Settings');assert.equal(r.attrs.placeholder,'Designer');
 // A later UI update becomes the new source, rather than restoring stale text.
 ctx.UI_LANG='id';r.nodes[0].nodeValue='Review';ctx.localizeVisibleText(r);assert.equal(r.nodes[0].nodeValue,'Peninjauan');ctx.UI_LANG='en';ctx.localizeVisibleText(r);assert.equal(r.nodes[0].nodeValue,'Review');
});
test('counts use natural plurals and Indonesian metadata without changing technical values',()=>{
 const ctx=setup();assert.equal(ctx.uiDynamicText('· 9 of 9 shown'),'· 9 dari 9 ditampilkan');assert.equal(ctx.uiDynamicText('1 member · 3 open'),'1 anggota · 3 belum selesai');assert.equal(ctx.uiDynamicText('134h assigned of 272h capacity'),'134 jam teralokasi dari 272 jam kapasitas');assert.equal(ctx.uiDynamicText('manage_workspace'),'manage_workspace');
 ctx.UI_LANG='en';assert.equal(ctx.uiCount(1,'member','members'),'1 member');assert.equal(ctx.uiCount(2,'member','members'),'2 members');
});
test('built-in role descriptions translate while edited descriptions remain intact',()=>{
 const ctx=setup();assert.equal(ctx.roleDescription({id:'admin',description:'Full workspace access'}),'Akses penuh ke ruang kerja');assert.equal(ctx.roleDescription({id:'admin',description:'Settings'}),'Settings');
});
test('Indonesian settings navigation keeps the menu-layout label concise',()=>{
 const core=fs.readFileSync(path.join(__dirname,'../src/core.js'),'utf8'),head=fs.readFileSync(path.join(__dirname,'../src/head.html'),'utf8');
 assert.match(core,/"Menu & home layout":"Menu & tata letak"/);
 assert.match(head,/\.snav button\{[^}]*white-space:nowrap/);
});
