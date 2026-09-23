const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {spawn} = require('node:child_process');

test('production server starts secure, authenticates, backs up, and blocks unsafe features', {timeout:15000}, async t => {
  const root = path.join(__dirname, '..');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-server-'));
  const password = 'Production!Admin234';
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], {
    cwd: root,
    env: {...process.env, NODE_ENV:'production', PORT:'0', COS_DATA_DIR:temp, COS_ADMIN_PASSWORD:password, COS_ADMIN_EMAIL:'ops@zencrevia.test', COS_SEED_DEMO:'',
      COS_SECRET_KEY:'integration-secret-key-longer-than-32-characters', COS_BACKUP_KEY:'integration-backup-key-longer-than-32-characters',
      COS_ALLOW_REGISTRATION:'0', COS_ALLOW_IMPERSONATION:'0', COS_BACKUP_INTERVAL_HOURS:'0'}
  });
  t.after(async () => { if (child.exitCode===null) { child.kill(); await new Promise(resolve=>child.once('exit',resolve)); } if (path.dirname(temp)===os.tmpdir()&&path.basename(temp).startsWith('zencrevia-server-')) fs.rmSync(temp,{recursive:true,force:true,maxRetries:5,retryDelay:100}); });
  let output='';
  const port = await new Promise((resolve,reject) => {
    const timer=setTimeout(()=>reject(new Error('server did not start: '+output)),8000);
    child.stdout.on('data',d=>{ output+=d; const m=output.match(/localhost:(\d+)/); if(m){clearTimeout(timer);resolve(+m[1]);} });
    child.stderr.on('data',d=>{output+=d;}); child.once('exit',code=>{clearTimeout(timer);reject(new Error('server exited '+code+': '+output));});
  });
  const base='http://127.0.0.1:'+port, origin=base;
  const get=path=>fetch(base+path);
  const post=(path,body,cookie)=>fetch(base+path,{method:'POST',headers:{'content-type':'application/json',origin,...(cookie?{cookie}: {})},body:JSON.stringify(body||{})});

  const health=await get('/api/health'); assert.equal(health.status,200); assert.deepEqual(await health.json(),{ok:true,service:'zencrevia'});
  assert.equal(health.headers.get('x-frame-options'),'DENY'); assert.match(health.headers.get('content-security-policy'),/frame-ancestors 'none'/);
  const status=await (await get('/api/auth/status')).json(); assert.equal(status.workspace,'ZenCrevia'); assert.equal(status.allowRegistration,false);

  const cross=await fetch(base+'/api/auth/login',{method:'POST',headers:{'content-type':'application/json',origin:'https://evil.example'},body:'{}'}); assert.equal(cross.status,403);
  const login=await post('/api/auth/login',{email:'ops@zencrevia.test',password}); assert.equal(login.status,200);
  const cookie=login.headers.get('set-cookie').split(';')[0]; assert.match(login.headers.get('set-cookie'),/HttpOnly/); assert.match(login.headers.get('set-cookie'),/Secure/);
  assert.equal((await get('/api/ai/gallery')).status,401);
  const gallery=await post('/api/ai/gallery',{name:'Server gallery',fields:{headline:'Editable on server',extraLayers:[]}},cookie);assert.equal(gallery.status,200);const savedGallery=await gallery.json();
  const galleryRead=await fetch(base+'/api/ai/gallery/'+savedGallery.id,{headers:{cookie}});assert.equal(galleryRead.status,200);assert.equal((await galleryRead.json()).fields.headline,'Editable on server');
  const gallerySearch=await fetch(base+'/api/ai/gallery?q=Server',{headers:{cookie}});assert.equal((await gallerySearch.json()).total,1);
  const backup=await post('/api/backups',{},cookie); assert.equal(backup.status,200); const backupJson=await backup.json(); assert.equal(backupJson.encrypted,true);
  const listed=await fetch(base+'/api/backups',{headers:{cookie}}); assert.equal(listed.status,200); assert.equal((await listed.json()).backups.length,1);
  const restored=await post('/api/backups/'+encodeURIComponent(backupJson.name)+'/restore',{confirm:backupJson.name},cookie);
  const restoredText=await restored.text(); assert.equal(restored.status,200,restoredText);
  const restoredJson=JSON.parse(restoredText); assert.equal(restoredJson.ok,true); assert.equal(restoredJson.restartRequired,false); assert.ok(restoredJson.safetyBackup);
  const afterRestore=await fetch(base+'/api/backups',{headers:{cookie}}); assert.equal(afterRestore.status,200); assert.ok((await afterRestore.json()).backups.length>=2);
  assert.equal((await post('/api/reset',{},cookie)).status,403);
  /* v38: external AI is allowed by default; without a stored key the route still refuses */ assert.equal((await post('/api/ai/chat',{messages:[{role:'user',content:'hello'}]},cookie)).status,400);
  const log=fs.readFileSync(path.join(temp,'security.log'),'utf8'); assert.ok(!log.includes(password));
});
