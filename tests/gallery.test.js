const test=require('node:test'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite'),factory=require('../server/gallery'),model=require('../shared/gallery-model');
const owner={id:'alice',role:'member',caps:{upload_file:true}},peer={id:'bob',role:'member',caps:{upload_file:true}},viewer={id:'eve',role:'viewer',caps:{view_ai_gallery:true}},admin={id:'boss',role:'admin',caps:{}};
const pixel='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
function setup(){const db=new DatabaseSync(':memory:'),routes={};factory(db,'ws',(m,p,h)=>routes[m+' '+p]=h);return {db,call:(m,p,u=owner,params={},body={},query={})=>routes[m+' /api/ai/gallery'+p](u,params,query,body)};}
const design=()=>({name:'Campaign',ownerId:'spoof',tags:[' brand ','social'],fields:{headline:'Original',layerMeta:{headline:{rotation:20,opacity:75}},extraLayers:[{id:'shape1',type:'shape',w:35,h:10}],apiKey:'not-shared',reference:'not-shared'},thumb:pixel,image:pixel});
const status=n=>e=>e.status===n;
test('gallery read endpoints reject roles without Gallery access',()=>{const {db,call}=setup(),x=call('POST','',owner,{},design()),blocked={id:'blocked',role:'custom',caps:{}};assert.throws(()=>call('GET','',blocked),status(403));assert.throws(()=>call('GET','/usage/me',blocked),status(403));assert.throws(()=>call('GET','/:id',blocked,{id:x.id}),status(403));assert.throws(()=>call('POST','/:id/favorite',blocked,{id:x.id},{favorite:true}),status(403));db.close();});
test('gallery ownership is server assigned, viewer can read/favorite but cannot create or duplicate',()=>{const {db,call}=setup(),x=call('POST','',owner,{},design());assert.equal(x.ownerId,'alice');assert.equal(call('GET','',viewer).total,1);assert.throws(()=>call('POST','',viewer,{},design()),status(403));assert.throws(()=>call('POST','/:id/duplicate',viewer,{id:x.id},{name:'Copy'}),status(403));call('POST','/:id/favorite',viewer,{id:x.id},{favorite:true});assert.equal(call('GET','',viewer,{}, {},{mode:'favorites'}).total,1);assert.equal(call('GET','',owner,{}, {},{mode:'favorites'}).total,0);const saved=call('GET','/:id',viewer,{id:x.id});assert.equal(saved.fields.apiKey,undefined);assert.equal(saved.fields.reference,undefined);db.close();});
test('gallery duplication preserves editable design and leaves original unchanged after copy editing',()=>{const {db,call}=setup(),x=call('POST','',owner,{},design()),y=call('POST','/:id/duplicate',peer,{id:x.id},{name:'Bob campaign',ownerId:'alice'});assert.equal(y.ownerId,'bob');assert.equal(y.sourceId,x.id);let copy=call('GET','/:id',peer,{id:y.id});assert.equal(copy.fields.layerMeta.headline.rotation,20);copy.fields.headline='Bob edit';call('PATCH','/:id',peer,{id:y.id},{...copy,revision:1});assert.equal(call('GET','/:id',peer,{id:x.id}).fields.headline,'Original');assert.equal(call('GET','/:id',peer,{id:y.id}).fields.headline,'Bob edit');assert.throws(()=>call('PATCH','/:id',peer,{id:x.id},{revision:1,name:'Stolen'}),status(403));assert.throws(()=>call('PATCH','/:id',peer,{id:y.id},{revision:1,name:'Old edit'}),status(409));db.close();});
test('gallery archive and restore respect ownership and administrator permissions',()=>{const {db,call}=setup(),x=call('POST','',owner,{},design());call('PATCH','/:id',admin,{id:x.id},{revision:1,name:'Approved campaign',archived:true});assert.equal(call('GET','',peer).total,0);assert.equal(call('GET','',peer,{}, {},{mode:'archived'}).total,0);assert.equal(call('GET','',owner,{}, {},{mode:'archived'}).total,1);assert.throws(()=>call('GET','/:id',peer,{id:x.id}),status(404));assert.throws(()=>call('POST','/:id/duplicate',owner,{id:x.id},{name:'Copy'}),status(400));call('PATCH','/:id',admin,{id:x.id},{revision:2,archived:false});assert.equal(call('GET','',viewer).items[0].name,'Approved campaign');db.close();});
test('gallery never reads or mutates items from another workspace',()=>{const {db,call}=setup(),x=call('POST','',owner,{},design()),other={};factory(db,'another',(m,p,h)=>other[m+' '+p]=h);assert.equal(other['GET /api/ai/gallery'](admin,{},{}).total,0);assert.throws(()=>other['GET /api/ai/gallery/:id'](admin,{id:x.id}),status(404));assert.throws(()=>other['PATCH /api/ai/gallery/:id'](admin,{id:x.id},{},{revision:1,name:'Cross workspace'}),status(404));db.close();});
test('gallery list paginates, searches tags, and does not transfer editable payloads',()=>{const {db,call}=setup();for(let i=0;i<26;i++)call('POST','',owner,{}, {...design(),name:'Campaign '+i});assert.equal(call('GET','',viewer).items.length,24);assert.equal(call('GET','',viewer,{}, {},{offset:'24'}).items.length,2);assert.equal(call('GET','',viewer,{}, {},{q:'brand'}).total,26);assert.equal(call('GET','',viewer,{}, {},{q:'absent'}).total,0);assert.equal(call('GET','',viewer).items[0].fields,undefined);db.close();});
test('gallery rejects unsafe images, malformed layers, nested credentials and prototype keys',()=>{for(const image of ['https://host/image.png','data:image/svg+xml;base64,PHN2Zz4=','javascript:alert(1)'])assert.throws(()=>model.normalise({...design(),image}),status(400));assert.throws(()=>model.normalise({...design(),fields:{extraLayers:[{id:"x');bad()",type:'text'}]}}),status(400));assert.throws(()=>model.normalise({...design(),fields:{layerStyles:{headline:{apiKey:'secret'}}}}),status(400));assert.throws(()=>model.normalise({...design(),fields:JSON.parse('{"layerMeta":{"__proto__":{"visible":true}}}')}),status(400));assert.throws(()=>model.normalise({...design(),name:' '}),status(400));assert.throws(()=>model.normalise({...design(),fields:{extraLayers:Array.from({length:101},()=>({id:'x',type:'shape'}))}}),status(400));});
test('gallery notes survive archive, are searchable, and can change on a copy without altering original',()=>{const {db,call}=setup(),x=call('POST','',owner,{}, {...design(),notes:'Prompt: blue background\nUse for launch.'});assert.equal(call('GET','',viewer,{}, {},{q:'launch'}).total,1);const y=call('POST','/:id/duplicate',peer,{id:x.id},{name:'New draft',notes:'Changed to green'});assert.equal(y.notes,'Changed to green');assert.equal(call('GET','/:id',peer,{id:x.id}).notes,'Prompt: blue background\nUse for launch.');call('PATCH','/:id',owner,{id:x.id},{revision:1,archived:true});assert.equal(call('GET','/:id',owner,{id:x.id}).notes,'Prompt: blue background\nUse for launch.');assert.throws(()=>call('PATCH','/:id',viewer,{id:y.id},{revision:1,notes:'No'}),status(403));assert.equal(model.normalise({...design(),notes:'x'.repeat(3000)}).notes.length,2000);db.close();});

/* v16 §48/§49/§80 — the Gallery has its own capabilities. */
test('gallery permissions are dedicated, not borrowed from file upload', () => {
  const model = require('../shared/gallery-model.js');
  const U = caps => ({ id: 'u1', role: 'member', caps });

  /* the new capabilities work on their own */
  assert.equal(model.canCreate(U({ publish_ai_gallery: true })), true);
  assert.equal(model.canView(U({ view_ai_gallery: true })), true);
  assert.equal(model.canDuplicate(U({ duplicate_ai_gallery: true })), true);

  /* a role that may only VIEW cannot publish or duplicate — the old behaviour
     leaked publishing to anyone who could attach a file to a task */
  const viewer = U({ view_ai_gallery: true });
  assert.equal(model.canCreate(viewer), false);
  assert.equal(model.canDuplicate(viewer), false);
  assert.equal(model.canManage(viewer, { ownerId: 'u1' }), false);

  /* owners manage their own, and only their own */
  const owner = U({ publish_ai_gallery: true, manage_own_ai_gallery: true });
  assert.equal(model.canManage(owner, { ownerId: 'u1' }), true);
  assert.equal(model.canManage(owner, { ownerId: 'someone-else' }), false);

  /* manage_all reaches every design */
  assert.equal(model.canManage(U({ manage_all_ai_gallery: true }), { ownerId: 'someone-else' }), true);

  /* §80 a legacy role that predates this change keeps working */
  assert.equal(model.canCreate(U({ upload_file: true })), true);
  assert.equal(model.canView(U({ manage_assets: true })), true);

  /* nothing at all means nothing */
  assert.equal(model.canCreate(U({})), false);
  assert.equal(model.canView(U({})), false);
  /* admin always passes */
  assert.equal(model.canManage({ id: 'a', role: 'admin', caps: {} }, { ownerId: 'x' }), true);
});

/* v16 §8 — admin-configurable never means unlimited. */
test('AI limits are clamped to the system hard caps', () => {
  const fs = require('node:fs'), vm = require('node:vm'), path = require('node:path');
  const src = fs.readFileSync(path.join(__dirname, '../src/ai-policy.js'), 'utf8').replace(/<\/?script>/g, '');
  const ctx = { WS: {}, tr: x => x, localStorage: { getItem: () => null, setItem() {} }, console };
  vm.createContext(ctx); vm.runInContext(src, ctx);

  /* defaults come through untouched */
  assert.equal(ctx.effectiveAiPolicy().hub.maxLayers, 40);
  assert.equal(ctx.effectiveAiPolicy().gallery.maxDesignsPerUser, 30);

  /* an admin can lower a limit */
  ctx.WS.ai = { policy: { hub: { maxLayers: 12 } } };
  assert.equal(ctx.effectiveAiPolicy().hub.maxLayers, 12);

  /* ...but never raise it past the system cap */
  ctx.WS.ai = { policy: { hub: { maxLayers: 99999, maxImageLayers: 9999, maxCanvasWidth: 100000 },
                          gallery: { maxDesignsPerUser: 99999, maxDesignMB: 9999 } } };
  const p = ctx.effectiveAiPolicy();
  assert.equal(p.hub.maxLayers, ctx.SYSTEM_AI_LIMITS.MAX_LAYERS);
  assert.equal(p.hub.maxImageLayers, ctx.SYSTEM_AI_LIMITS.MAX_IMAGE_LAYERS);
  assert.equal(p.hub.maxCanvasWidth, ctx.SYSTEM_AI_LIMITS.MAX_CANVAS);
  assert.equal(p.gallery.maxDesignsPerUser, ctx.SYSTEM_AI_LIMITS.MAX_DESIGNS_PER_USER);
  assert.equal(p.gallery.maxDesignMB, ctx.SYSTEM_AI_LIMITS.MAX_DESIGN_BYTES / 1048576);

  /* garbage falls back to the recommended default rather than to 0 */
  ctx.WS.ai = { policy: { hub: { maxLayers: 'nonsense' } } };
  assert.equal(ctx.effectiveAiPolicy().hub.maxLayers, 40);

  /* §53 a legacy design over the limit blocks additions but is not "broken" */
  ctx.WS.ai = { policy: { hub: { maxLayers: 2 } } };
  ctx.AIF = { extraLayers: [{ id: 'a' }, { id: 'b' }, { id: 'c' }, { id: 'd' }] };
  const r = ctx.aiCanAddLayers(1);
  assert.equal(r.ok, false);
  assert.equal(r.legacy, true);
  assert.match(r.message, /keep editing/);
  assert.equal(ctx.aiIsLegacyOverLimit(), true);
});
