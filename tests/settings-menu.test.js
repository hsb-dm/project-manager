const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const source=fs.readFileSync(path.join(__dirname,'../src/settings.js'),'utf8');
const helper=source.slice(source.indexOf('function enableHorizontalDrag('),source.indexOf('\nfunction renderSettings('));
function setup(overflow){
 const ctx={};vm.createContext(ctx);vm.runInContext(helper,ctx);
 const handlers={},capture=new Set();
 const el={dataset:{},scrollWidth:overflow?900:200,clientWidth:200,scrollLeft:0,classList:{add(){},remove(){}},addEventListener(name,fn){(handlers[name]||=[]).push(fn);},setPointerCapture(id){capture.add(id);},hasPointerCapture(id){return capture.has(id);},releasePointerCapture(id){capture.delete(id);}};
 ctx.enableHorizontalDrag(el);
 const emit=(name,props={})=>{const e={pointerId:1,pointerType:'mouse',button:0,buttons:1,clientX:100,clientY:20,detail:1,type:name,preventDefault(){this.prevented=true;},stopPropagation(){this.stopped=true;},...props};(handlers[name]||[]).forEach(fn=>fn(e));return e;};
 return {el,capture,emit};
}
test('ordinary menu clicks retain their button target, with or without overflow',()=>{
 for(const overflow of [false,true]){const {capture,emit}=setup(overflow);emit('pointerdown');assert.equal(capture.size,0);emit('pointerup',{buttons:0});assert.equal(emit('click').prevented,undefined);}
});
test('only an actual horizontal drag captures and suppresses its release click',()=>{
 const {el,capture,emit}=setup(true);emit('pointerdown');emit('pointermove',{clientX:98});assert.equal(capture.size,0);emit('pointermove',{clientX:50});assert.equal(capture.size,1);assert.equal(el.scrollLeft,50);emit('pointerup',{clientX:50,buttons:0});assert.equal(capture.size,0);assert.equal(emit('click').prevented,true);
 emit('pointerdown');emit('pointerup',{buttons:0});assert.equal(emit('click').prevented,undefined);assert.equal(emit('click',{detail:0}).prevented,undefined);
});
