const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const core=fs.readFileSync(path.join(__dirname,'../src/core.js'),'utf8'),ai=fs.readFileSync(path.join(__dirname,'../src/ai.js'),'utf8');
function timers(){const callbacks=new Map();let id=0;return {setTimeout(fn){callbacks.set(++id,fn);return id},clearTimeout(k){callbacks.delete(k)},flush(){const all=[...callbacks.values()];callbacks.clear();all.forEach(fn=>fn())},size(){return callbacks.size}}}
test('rapid search input renders only the final query and clearing cancels pending work',()=>{
 const clock=timers(),input={value:''};let renders=0,clears=0;
 const ctx={...clock,S:{search:''},document:{getElementById(){return input}},renderSearch(){renders++},renderScreen(){clears++}};vm.createContext(ctx);vm.runInContext(core.slice(core.indexOf('var _searchTimer='),core.indexOf('function renderSearch()')),ctx);
 for(const q of ['a','as','asset']){input.value=q;ctx.scheduleSearch(q)}assert.equal(renders,0);assert.equal(clock.size(),1);clock.flush();assert.equal(renders,1);assert.equal(ctx.S.search,'asset');
 input.value='other';ctx.scheduleSearch('other');input.value='';ctx.scheduleSearch('');clock.flush();assert.equal(ctx.S.search,'');assert.equal(renders,1);assert.equal(clears,1);
 input.value='stale';ctx.scheduleSearch('stale');input.value='';clock.flush();assert.equal(renders,1,'A cleared navigation search cannot render an old query');
});
test('AI preview avoids composing a missing canvas and immediate work cancels the queued redraw',()=>{
 const clock=timers();let mounted=false,compositions=0;const ctx={...clock,document:{getElementById(){return mounted?{}:null}},aiCompose(){compositions++}};vm.createContext(ctx);vm.runInContext(ai.slice(ai.indexOf('var _aiPreviewT='),ai.indexOf('function aiDownload()')),ctx);
 ctx.aiPreviewSoon();clock.flush();assert.equal(compositions,0);mounted=true;ctx.aiPreviewSoon();ctx.aiPreview();clock.flush();assert.equal(compositions,1);
});
test('unchanged custom fonts preserve their stylesheet instead of reassigning its URL',()=>{
 let href='',writes=0;const link={getAttribute(){return href},set href(v){writes++;href=v},remove(){}};
 const ctx={WS:{theme:{customFonts:['Inter']}},window:{},document:{documentElement:{style:{setProperty(){},removeProperty(){}},setAttribute(){}},getElementById(){return link}},inkFor(){return '#fff'}};
 vm.createContext(ctx);vm.runInContext(core.slice(core.indexOf('function applyTheme()'),core.indexOf('function inkFor(')),ctx);
 ctx.applyTheme();ctx.applyTheme();ctx.applyTheme();assert.equal(writes,1);ctx.WS.theme.customFonts=['Poppins'];ctx.applyTheme();assert.equal(writes,2);
});
