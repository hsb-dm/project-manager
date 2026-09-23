(function(root){
const SAFETY_MAX_LAYERS=500;
const fail=(message,status=400)=>{const e=new Error(message);e.status=status;throw e;};
const cap=(u,key)=>!!u&&(u.role==='admin'||!!(u.caps||{})[key]);
/* v16 §48 — the Gallery has its own capabilities. `upload_file` and
   `manage_assets` are still accepted as a fallback so a workspace whose roles
   predate this change keeps working (§80 migration), but they are no longer
   the primary check: being able to attach a file to a task should not by
   itself grant publishing to the shared Gallery. */
const legacyProxy=u=>cap(u,'upload_file')||cap(u,'manage_assets');
const canView=u=>cap(u,'view_ai_gallery')||cap(u,'manage_workspace')||legacyProxy(u);
const canCreate=u=>cap(u,'publish_ai_gallery')||cap(u,'manage_workspace')||legacyProxy(u);
const canDuplicate=u=>cap(u,'duplicate_ai_gallery')||canCreate(u);
const canManage=(u,item)=>cap(u,'manage_all_ai_gallery')||cap(u,'manage_workspace')
  ||((cap(u,'manage_own_ai_gallery')||canCreate(u))&&item.ownerId===u.id);
const image=v=>{if(!v)return '';if(typeof v!=='string'||!/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/]+=*$/.test(v)||v.length>8000000)fail('Gallery images must be embedded PNG, JPEG or WebP (max 6 MB).');return v;};
const fieldsAllowed=('brief prompt model size layout headline sub cta badge style negative disclaimer disclaimerText customW customH template background textColor canvasBg accentColor badgeColor ctaColor logoPosition logoText logoImg logoHidden safeUnit safeLocked safeTop safeRight safeBottom safeLeft safeExpanded offsetUnit headlineFont headlineScale subFont subScale badgeScale ctaScale logoScale disclaimerScale textAlign textX textY ctaRadius ctaStroke ctaStrokeWidth ctaStrokeColor panels showSafeZones editMode layerStyles layerPositions extraLayers layerMeta layerOrder layerScales protectText textProtectionPadding hideGenerated styleMode guides showGuides snapGuides').split(' ');
function normalise(b,policy){if(!b||typeof b!=='object'||Array.isArray(b))fail('Missing editable design.');const name=String(b.name||'').trim();if(!name||name.length>120)fail('Enter a gallery name (1–120 characters).');const fields={};if(!b.fields||typeof b.fields!=='object'||Array.isArray(b.fields))fail('Missing editable design.');fieldsAllowed.forEach(k=>{if(Object.hasOwn(b.fields,k))fields[k]=b.fields[k];});
 const json=JSON.stringify(fields,(key,value)=>{if(['__proto__','prototype','constructor'].includes(key)||/api.?key|token|password|secret/i.test(key))fail('Credentials cannot be saved in AI Gallery.');if(typeof value==='number'&&!Number.isFinite(value))fail('Invalid design value.');return value;});if(json.length>9500000)fail('This design is too large for AI Gallery.',413);const clean=JSON.parse(json);clean.logoImg=image(clean.logoImg);clean.selectedLayer='canvas';clean.selectedLayers=[];
 if(clean.extraLayers&&!Array.isArray(clean.extraLayers))fail('Invalid layers.');
 /* v17 §P0-6 — the business layer limit is workspace policy, passed in by the
    caller (server: the stored policy; standalone: effectiveAiPolicy()). The
    bare number here is only the hard system safety ceiling. */
 const maxLayers=Number(policy&&policy.hub&&policy.hub.maxLayers)||SAFETY_MAX_LAYERS;
 if((clean.extraLayers||[]).length>maxLayers)fail('This design exceeds the workspace layer limit of '+maxLayers+'.');
 if((clean.extraLayers||[]).length>SAFETY_MAX_LAYERS)fail('Invalid layers.');const ids=new Set();(clean.extraLayers||[]).forEach(x=>{if(!x||!['text','image','shape'].includes(x.type)||!/^[-\w]+$/.test(x.id))fail('Invalid gallery layer.');if(ids.has(x.id))fail('Invalid gallery layer.');ids.add(x.id);if(x.type==='image')x.src=image(x.src);});
 if(clean.guides!==undefined){if(!Array.isArray(clean.guides)||clean.guides.length>100)fail('Invalid guides.');const gids=new Set();clean.guides=clean.guides.map(g=>{if(!g||!/^[-\w]+$/.test(g.id)||gids.has(g.id)||!['x','y'].includes(g.axis)||!Number.isFinite(g.position)||g.position<0||g.position>100000)fail('Invalid guide.');gids.add(g.id);return {id:g.id,axis:g.axis,position:g.position};});}
 const tags=(Array.isArray(b.tags)?b.tags:[]).map(t=>String(t).trim().slice(0,30)).filter(Boolean).slice(0,8);
 /* v18 §89 item ownership/filter metadata. creatorRoleId is only a historical
    label for filtering — authorization always uses the CURRENT role. */
 const FILE_TYPES=['image','design','video','document','audio','other'];
 const fileType=FILE_TYPES.includes(b.fileType)?b.fileType:'design';
 const toolId=/^[-\w]{1,40}$/.test(String(b.toolId||''))?String(b.toolId):'template_composer';
 const sourceTaskId=/^[-\w]{1,40}$/.test(String(b.sourceTaskId||''))?String(b.sourceTaskId):null;
 return {name,tags,notes:String(b.notes||'').trim().slice(0,2000),fields:clean,image:image(b.image),thumb:image(b.thumb),fileType,toolId,sourceTaskId,sourceTaskTitle:String(b.sourceTaskTitle||'').trim().slice(0,160),creatorRoleId:/^[-\w]{1,40}$/.test(String(b.creatorRoleId||''))?String(b.creatorRoleId):null};
}
/* v18 §64–68 the role quota, shared by server and standalone so both sides
   compute the same number. `table` is WS.ai.galleryRoleQuota (may be empty). */
const DEFAULT_ROLE_QUOTA={admin:'unlimited',creative_lead:500,team_lead:250,member:100,viewer:0};
const roleLimit=(user,table)=>{const roles=[user.role||'member'].concat(user.extraRoles||[]);if(roles.includes('admin'))return {limit:Infinity,unlimited:true,roleId:'admin'};let best=-1,bestRole=roles[0];roles.forEach(r=>{let q=(table||{})[r];if(q===undefined)q=DEFAULT_ROLE_QUOTA[r]!==undefined?DEFAULT_ROLE_QUOTA[r]:DEFAULT_ROLE_QUOTA.member;if(q==='unlimited'){best=Infinity;bestRole=r;}else if(best!==Infinity&&Number(q)>best){best=Number(q);bestRole=r;}});if(best<0)best=0;return {limit:best,unlimited:best===Infinity,roleId:bestRole};};
const usage=(used,lim)=>({used,limit:lim.unlimited?null:lim.limit,unlimited:lim.unlimited,remaining:lim.unlimited?null:Math.max(0,lim.limit-used),percentage:lim.unlimited?0:lim.limit===0?100:Math.round(used/lim.limit*100),over:!lim.unlimited&&used>lim.limit});
const model={canCreate,canManage,canView,canDuplicate,normalise,image,roleLimit,usage,DEFAULT_ROLE_QUOTA};if(typeof module!=='undefined'&&module.exports)module.exports=model;else root.GalleryModel=model;
})(typeof window!=='undefined'?window:this);
