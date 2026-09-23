const model=require('../shared/gallery-model');const {uid,now}=require('./db');
/* v18 §62–102 role-based creation quota, filters and sort, enforced here
   (§96) inside one transaction (§97) so concurrent saves cannot overshoot. */
module.exports=function(db,ws,route,readAi){
 db.exec(`CREATE TABLE IF NOT EXISTS ai_gallery(id TEXT PRIMARY KEY,workspace_id TEXT NOT NULL,owner_id TEXT NOT NULL,name TEXT NOT NULL,tags TEXT NOT NULL,source_id TEXT,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,archived INTEGER NOT NULL DEFAULT 0,thumb TEXT NOT NULL,design TEXT NOT NULL);CREATE INDEX IF NOT EXISTS ai_gallery_workspace ON ai_gallery(workspace_id,updated_at);CREATE TABLE IF NOT EXISTS ai_gallery_favorites(workspace_id TEXT NOT NULL,item_id TEXT NOT NULL,user_id TEXT NOT NULL,PRIMARY KEY(workspace_id,item_id,user_id));`);
 const cols=db.prepare('PRAGMA table_info(ai_gallery)').all().map(c=>c.name);
 if(!cols.includes('notes'))db.exec("ALTER TABLE ai_gallery ADD COLUMN notes TEXT NOT NULL DEFAULT ''");
 if(!cols.includes('creator_role_id'))db.exec("ALTER TABLE ai_gallery ADD COLUMN creator_role_id TEXT");
 if(!cols.includes('file_type'))db.exec("ALTER TABLE ai_gallery ADD COLUMN file_type TEXT NOT NULL DEFAULT 'design'");
 if(!cols.includes('tool_id'))db.exec("ALTER TABLE ai_gallery ADD COLUMN tool_id TEXT NOT NULL DEFAULT 'template_composer'");
 if(!cols.includes('source_task_id'))db.exec("ALTER TABLE ai_gallery ADD COLUMN source_task_id TEXT");
 if(!cols.includes('source_task_title'))db.exec("ALTER TABLE ai_gallery ADD COLUMN source_task_title TEXT NOT NULL DEFAULT ''");
 db.exec('CREATE INDEX IF NOT EXISTS ai_gallery_owner ON ai_gallery(workspace_id,owner_id,archived)');
 const aiSettings=()=>{try{return (typeof readAi==='function'?readAi():null)||{};}catch(e){return {};}};
 const roleTable=()=>aiSettings().galleryRoleQuota||{};
 const countsArchived=()=>{const g=(aiSettings().policy||{}).gallery||{};return g.archivedCountsTowardQuota===undefined?true:!!g.archivedCountsTowardQuota;};
 const usedBy=id=>db.prepare('SELECT count(*) n FROM ai_gallery WHERE workspace_id=? AND owner_id=?'+(countsArchived()?'':' AND archived=0')).get(ws,id).n;
 const usageOf=u=>model.usage(usedBy(u.id),model.roleLimit(u,roleTable()));
 const error=(code,message)=>{const e=new Error(message);e.status=code;throw e;};
 const requireView=u=>{if(!model.canView(u))error(403,'Your role cannot view AI Gallery.');};
 const meta=r=>({id:r.id,ownerId:r.owner_id,name:r.name,notes:r.notes||'',tags:JSON.parse(r.tags),sourceId:r.source_id,createdAt:r.created_at,updatedAt:r.updated_at,revision:r.revision,archived:!!r.archived,thumb:r.thumb,favorite:!!r.favorite,creatorRoleId:r.creator_role_id||null,fileType:r.file_type||'design',toolId:r.tool_id||'template_composer',sourceTaskId:r.source_task_id||null,sourceTaskTitle:r.source_task_title||''});
 const get=(u,id)=>{const r=db.prepare('SELECT * FROM ai_gallery WHERE workspace_id=? AND id=?').get(ws,id);if(!r)error(404,'Gallery design not found.');if(r.archived&&!model.canManage(u,meta(r)))error(404,'Gallery design not found.');return r;};
 const create=(u,b,source)=>{if(!model.canCreate(u))error(403,'Your role can view AI Gallery but cannot save designs.');const d=model.normalise(b,aiSettings().policy),id=uid('gallery'),at=now();
  /* §96/§97 quota check and insert happen in one IMMEDIATE transaction so two
     simultaneous saves at 99/100 cannot both succeed. */
  const run=()=>{const lim=model.roleLimit(u,roleTable());if(!lim.unlimited){const used=usedBy(u.id);if(lim.limit===0)error(403,'Your role cannot create AI Gallery items.');if(used>=lim.limit){const e=new Error('GalleryQuotaExceeded: you have used all '+lim.limit+' Gallery items available for your role.');e.status=429;e.code='GalleryQuotaExceeded';throw e;}}
   db.prepare('INSERT INTO ai_gallery(id,workspace_id,owner_id,name,tags,source_id,created_at,updated_at,revision,archived,thumb,design,notes,creator_role_id,file_type,tool_id,source_task_id,source_task_title) VALUES(?,?,?,?,?,?,?,?,1,0,?,?,?,?,?,?,?,?)').run(id,ws,u.id,d.name,JSON.stringify(d.tags),source||null,at,at,d.thumb,JSON.stringify({fields:d.fields,image:d.image}),d.notes,u.role||null,d.fileType,d.toolId,d.sourceTaskId,d.sourceTaskTitle);};
  /* node:sqlite has no transaction() helper: BEGIN IMMEDIATE takes the write lock before the count */
  db.exec('BEGIN IMMEDIATE');try{run();db.exec('COMMIT');}catch(e){db.exec('ROLLBACK');throw e;}return meta(get(u,id));};
 const dateFrom=k=>{const n=new Date();if(k==='today')return new Date(n.getFullYear(),n.getMonth(),n.getDate()).toISOString();if(k==='7d')return new Date(n-7*864e5).toISOString();if(k==='30d')return new Date(n-30*864e5).toISOString();if(k==='month')return new Date(n.getFullYear(),n.getMonth(),1).toISOString();return null;};
 const SORTS={newest:'g.created_at DESC',oldest:'g.created_at ASC',updated:'g.updated_at DESC',az:'g.name COLLATE NOCASE ASC',za:'g.name COLLATE NOCASE DESC',favorited:'fav_count DESC, g.updated_at DESC'};
 /* §88 / §93 usage endpoints: the member's own, and the admin dashboard. */
 route('GET','/api/ai/gallery/usage/me',u=>{requireView(u);return usageOf(u);});
 route('GET','/api/ai/gallery/usage',u=>{if(!(u.caps||{}).manage_workspace&&u.role!=='admin')error(403,'Only workspace administrators can see gallery usage.');const t=roleTable();return db.prepare('SELECT m.user_id id,m.role_id role FROM workspace_members m WHERE m.workspace_id=?').all(ws).map(m=>{const lim=model.roleLimit({role:m.role},t);return {id:m.id,role:m.role,...model.usage(usedBy(m.id),lim)};});});
 route('GET','/api/ai/gallery',(u,p,q)=>{requireView(u);const mode=q.mode||'all',search=(q.q||'').slice(0,120).toLowerCase(),offset=Math.max(0,Math.min(100000,parseInt(q.offset)||0)),status=mode==='archived'?'archived':(q.status||'active');let where='g.workspace_id=?',args=[ws];
  if(status==='archived'){where+=' AND g.archived=1';}else if(status!=='all'){where+=' AND g.archived=0';}
  if(mode==='mine'||q.createdBy==='me'||(status!=='active'&&!model.canManage(u,{ownerId:''}))){where+=' AND g.owner_id=?';args.push(u.id);}
  else if(q.createdBy&&q.createdBy!=='anyone'){if(!((u.caps||{}).view_all||(u.caps||{}).manage_workspace||u.role==='admin'))error(403,'Your role cannot filter by other members.');where+=' AND g.owner_id=?';args.push(String(q.createdBy).slice(0,60));}
  if(q.role){where+=' AND coalesce(g.creator_role_id,(SELECT role_id FROM workspace_members wm WHERE wm.user_id=g.owner_id AND wm.workspace_id=g.workspace_id))=?';args.push(String(q.role).slice(0,60));}
  if(q.fileType){where+=' AND g.file_type=?';args.push(String(q.fileType).slice(0,20));}
  if(q.tool){where+=' AND g.tool_id=?';args.push(String(q.tool).slice(0,40));}
  const from=dateFrom(q.date);if(from){where+=' AND g.created_at>=?';args.push(from);}
  if(search){where+=" AND instr(lower(g.name||' '||g.tags||' '||g.notes),?)>0";args.push(search);}
  if(mode==='favorites'||q.favorites){where+=' AND EXISTS(SELECT 1 FROM ai_gallery_favorites f WHERE f.workspace_id=g.workspace_id AND f.item_id=g.id AND f.user_id=?)';args.push(u.id);}
  const order=SORTS[q.sort]||SORTS.newest;const total=db.prepare('SELECT count(*) n FROM ai_gallery g WHERE '+where).get(...args).n;const rows=db.prepare('SELECT g.id,g.owner_id,g.name,g.notes,g.tags,g.source_id,g.created_at,g.updated_at,g.revision,g.archived,g.thumb,g.creator_role_id,g.file_type,g.tool_id,g.source_task_id,g.source_task_title,EXISTS(SELECT 1 FROM ai_gallery_favorites f WHERE f.item_id=g.id AND f.workspace_id=g.workspace_id AND f.user_id=?) favorite,(SELECT count(*) FROM ai_gallery_favorites f2 WHERE f2.item_id=g.id AND f2.workspace_id=g.workspace_id) fav_count FROM ai_gallery g WHERE '+where+' ORDER BY '+order+',g.id LIMIT 24 OFFSET ?').all(u.id,...args,offset);return {items:rows.map(meta),total};});
 route('GET','/api/ai/gallery/:id',(u,p)=>{requireView(u);const r=get(u,p.id);return {...meta(r),...JSON.parse(r.design)};});
 route('POST','/api/ai/gallery',(u,p,q,b)=>create(u,b,null));
 /* v16 §48/§64 — duplicating is its own capability, checked before the create
    path so a role that may copy but not publish is handled correctly. */
 route('POST','/api/ai/gallery/:id/duplicate',(u,p,q,b)=>{const r=get(u,p.id);if(r.archived)error(400,'Restore the design before making a copy.');if(!model.canDuplicate(u))error(403,'Your role cannot duplicate gallery designs.');return create(u,{...JSON.parse(r.design),thumb:r.thumb,tags:JSON.parse(r.tags),name:b.name,notes:b.notes===undefined?r.notes:b.notes},r.id);});
 route('PATCH','/api/ai/gallery/:id',(u,p,q,b)=>{const r=get(u,p.id);if(!model.canManage(u,meta(r)))error(403,'Only the owner or a workspace administrator can manage this design.');if(b.archived===false&&r.archived&&!countsArchived()){const lim=model.roleLimit({role:r.owner_id===u.id?u.role:(db.prepare('SELECT role_id FROM workspace_members WHERE user_id=? AND workspace_id=?').get(r.owner_id,ws)||{}).role_id},roleTable());if(!lim.unlimited&&usedBy(r.owner_id)>=lim.limit)error(429,'GalleryQuotaExceeded: restoring this design would exceed the Gallery limit. Delete another item first.');}if(b.revision!==r.revision)error(409,'This design changed. Refresh AI Gallery and try again.');let d={name:r.name,notes:r.notes||'',tags:JSON.parse(r.tags),thumb:r.thumb,...JSON.parse(r.design)};if(b.fields){if(!model.canCreate(u))error(403,'Your role cannot save designs.');d=model.normalise(b,aiSettings().policy);}else{if(b.name!==undefined){const name=String(b.name).trim();if(!name||name.length>120)error(400,'Enter a gallery name (1–120 characters).');d.name=name;}if(b.notes!==undefined)d.notes=String(b.notes||'').trim().slice(0,2000);if(b.tags!==undefined)d.tags=(Array.isArray(b.tags)?b.tags:[]).map(t=>String(t).trim().slice(0,30)).filter(Boolean).slice(0,8);}db.prepare('UPDATE ai_gallery SET name=?,tags=?,notes=?,thumb=?,design=?,archived=?,revision=revision+1,updated_at=? WHERE workspace_id=? AND id=? AND revision=?').run(d.name,JSON.stringify(d.tags),d.notes,d.thumb,JSON.stringify({fields:d.fields,image:d.image}),typeof b.archived==='boolean'?+b.archived:r.archived,now(),ws,p.id,r.revision);return meta(get(u,p.id));});
 route('POST','/api/ai/gallery/:id/favorite',(u,p,q,b)=>{requireView(u);get(u,p.id);if(b.favorite===true)db.prepare('INSERT OR IGNORE INTO ai_gallery_favorites VALUES(?,?,?)').run(ws,p.id,u.id);else db.prepare('DELETE FROM ai_gallery_favorites WHERE workspace_id=? AND item_id=? AND user_id=?').run(ws,p.id,u.id);return {favorite:b.favorite===true};});
};
