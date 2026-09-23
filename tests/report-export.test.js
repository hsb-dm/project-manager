const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
function fixture(){
 const m={weeks:['Sep 1','Sep 8'],created:[4,2],completed:[1,2],overdue:[0,1],avgDays:[1,2],revisionRate:[0,.5],approvalHrs:[1,2],byTeam:[],totalCompleted:3,totalCreated:6,openNow:2,overdueNow:1,inReview:1,avgCompletion:1.5,liveRevRate:50,approvalRate:75,avgApproval:2,utilization:50,asg:20,cap:40};
 const d={m,stages:[],projects:[],people:[],overdue:[],upcoming:[],review:[]};
 const ctx={TextEncoder,Uint8Array,console,Date,UI_LANG:'en',WS:{name:'Test & Studio',logo:'T',theme:{accent:'#204FDD',secondary:'#C5F448'},customFields:[]},S:{range:2},ME:'u',ASSETS:[],ASSET_FOLDERS:[],tr:s=>s,iso:n=>'2026-09-'+String(n+4).padStart(2,'0'),dueDate:()=> 'Sep 4',dueTxt:()=> 'today',first:v=>v,person:()=>({name:'Tester'}),inkFor:()=> '#fff',teamMembers:()=>[],byId:()=>null,assetCount:()=>0,assetsProduced:()=>0,assetLinks:()=>[],isClosed:()=>false};
 vm.createContext(ctx);for(const file of ['report-template.js','report-layout.js','export.js'])vm.runInContext(fs.readFileSync(path.join(__dirname,'../src',file),'utf8').replace(/^<script>\s*/,'').replace(/<\/script>\s*$/,''),ctx);
 ctx.reportData=()=>d;ctx.reportTasks=()=>[];ctx.exportTasks=()=>[];ctx.EXPORT={from:0,to:7,weeks:2,include:{}};return {ctx,d,m};
}
function unzip(bytes){const buf=Buffer.from(bytes),files={};for(let i=0;i<buf.length&&buf.readUInt32LE(i)===0x04034b50;){const size=buf.readUInt32LE(i+18),n=buf.readUInt16LE(i+26),extra=buf.readUInt16LE(i+28),start=i+30+n+extra;files[buf.subarray(i+30,i+30+n).toString()]=buf.subarray(start,start+size).toString();i=start+size;}return files;}
test('PPT cards and paginated large lists remain inside every slide and retain all report items',()=>{
 const {ctx,d,m}=fixture();d.stages=Array.from({length:30},(_,i)=>({name:'Stage '+i,kind:'work',n:i%7}));
 d.projects=Array.from({length:22},(_,i)=>({name:'Project item '+i,owner:'Tester',status:'active',open:i,overdue:0,due:'2026-09-12',progress:50}));
 d.people=Array.from({length:23},(_,i)=>({name:'Person item '+i,role:'Designer',assigned:3.5,cap:40}));
 m.byTeam=Array.from({length:18},(_,i)=>({id:'team'+i,name:'Team item '+i,capacity:40,assigned:10,utilization:25,open:1}));
 d.upcoming=Array.from({length:21},(_,i)=>({id:'TaskItem'+i,title:'Example task',assignee:'Tester',due:0}));
 m.weeks=Array.from({length:26},(_,i)=>'Week '+i);m.created=m.weeks.map(()=>5);m.completed=m.weeks.map(()=>3);
 const files=unzip(ctx.buildPPTX()),slides=Object.entries(files).filter(([name])=>/^ppt\/slides\/slide\d+\.xml$/.test(name));assert.ok(slides.length>15);
 for(const [name,xml] of slides)for(const match of xml.matchAll(/<a:xfrm><a:off x="(-?\d+)" y="(-?\d+)"\/><a:ext cx="(-?\d+)" cy="(-?\d+)"\/>/g)){const [x,y,w,h]=match.slice(1).map(Number);assert.ok(Math.min(x,y,w,h)>=0&&x+w<=12192000&&y+h<=6858000,`${name} has an off-slide shape`);}
 const all=slides.map(([,xml])=>xml).join('');for(const item of [...d.projects,...d.people,...m.byTeam,...d.stages])assert.ok(all.includes(item.name),item.name);for(const item of d.upcoming)assert.ok(all.includes(item.id+'  '),item.id);
 const second=files['ppt/slides/slide2.xml'];assert.equal((second.match(/Assets/g)||[]).length,3);assert.ok(second.includes('Asset links'));
});
test('Excel stores dates and fractional effort as numbers, preserves literal text, and uses real percentages',()=>{
 const {ctx}=fixture();const rows=[['Name','Role','Team','Capacity','Assigned','Utilization'],['=SUM(A1:A2)','Designer','A',40,3.5,50]];
 const result=ctx.reportDetailXml('workload','Workload',rows,[25,20,20,15,15,18],'Summary');assert.match(result,/<c r="E5"[^>]*><v>3.5<\/v>/);assert.match(result,/<c r="F5"[^>]*><v>0.5<\/v>/);assert.match(result,/<c r="A5"[^>]*t="inlineStr"/);assert.match(result,/<autoFilter ref="A4:F5"/);assert.match(result,/ySplit="4"/);
 assert.equal(ctx.xlDate('2026-09-04'),46269);assert.equal(ctx.xlDate(''), '');
});
test('Summary charts and formulas are self-contained when optional sheets are omitted',()=>{
 const {ctx}=fixture();ctx.EXPORT.include={tasks:false,taskassets:false,projects:false,teams:false,workload:false,weekly:false,pipeline:false,assets:false};
 const files=unzip(ctx.buildXLSX());assert.ok(files['xl/charts/chart1.xml']);assert.ok(files['xl/charts/chart2.xml']);assert.equal(Object.keys(files).filter(n=>/^xl\/worksheets\/sheet\d.xml$/.test(n)).length,1);assert.match(files['xl/worksheets/sheet1.xml'],/<f>F50<\/f><v>0.5<\/v>/);assert.match(files['xl/charts/chart1.xml'],/&apos;Summary|\x27Summary\x27/);assert.ok(!files['xl/charts/chart1.xml'].includes('Weekly'));
 const summary=files['xl/worksheets/sheet1.xml'];assert.ok(summary.includes('<mergeCell ref="A50:E50"/>'),'Source labels have a wide column');assert.ok(summary.includes('<mergeCell ref="F50:G50"/>'),'Source values have their own column');assert.match(summary,/<row r="50" ht="(?:36|[4-9]\d)"/);assert.ok(summary.includes('<c r="F50" s="'+ctx.REPORT_TEMPLATE.ids.ratioStripe+'"><v>0.5</v>'),'Source percentage has a native percent format');assert.ok(files['xl/charts/chart1.xml'].includes('$D$66:$D$67'),'Created chart points to the relocated weekly values');assert.ok(files['xl/charts/chart2.xml'].includes('$M$47'),'Team chart points to the wide source value column');
 ctx.EXPORT.include.summary=false;ctx.EXPORT.include.tasks=true;const tasksOnly=unzip(ctx.buildXLSX());assert.equal(tasksOnly['xl/charts/chart1.xml'],undefined);assert.ok(!tasksOnly['xl/worksheets/sheet1.xml'].includes('<hyperlinks>'));
});
