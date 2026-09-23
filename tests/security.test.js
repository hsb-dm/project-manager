const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const {DatabaseSync} = require('node:sqlite');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-security-'));
process.env.NODE_ENV = 'production';
process.env.COS_DATA_DIR = temp;
process.env.COS_BACKUP_DIR = path.join(temp, 'backups');
process.env.COS_SECRET_KEY = 'unit-test-secret-key-that-is-at-least-32-chars';
process.env.COS_BACKUP_KEY = 'different-unit-test-backup-key-at-least-32-chars';
process.env.COS_SECURE_COOKIE = '1';

const auth = require('../server/auth');
const secrets = require('../server/secrets');
const security = require('../server/security');
const backup = require('../server/backup');

test.after(() => {
  if (path.dirname(temp) === os.tmpdir() && path.basename(temp).startsWith('zencrevia-security-')) fs.rmSync(temp, {recursive:true, force:true});
});

test('password, cookie, and session storage use the hardened defaults', () => {
  assert.match(auth.passwordProblem('short'), /12/);
  assert.match(auth.passwordProblem('alllowercasecharacters'), /three/);
  assert.equal(auth.passwordProblem('Longer!Password9'), '');
  assert.match(auth.cookieHeader('token', new Date(Date.now()+60000).toISOString()), /HttpOnly/);
  assert.match(auth.cookieHeader('token', new Date(Date.now()+60000).toISOString()), /SameSite=Lax/);
  assert.match(auth.cookieHeader('token', new Date(Date.now()+60000).toISOString()), /Secure/);

  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE users(id TEXT PRIMARY KEY,is_active INTEGER,last_login_at TEXT); CREATE TABLE sessions(id TEXT PRIMARY KEY,user_id TEXT,user_agent TEXT,expires_at TEXT);');
  db.prepare('INSERT INTO users(id,is_active) VALUES (?,1)').run('u1');
  const created = auth.createSession(db, 'u1', 'test');
  const stored = db.prepare('SELECT id FROM sessions').get().id;
  assert.notEqual(stored, created.id);
  assert.match(stored, /^sha256:/);
  assert.equal(auth.sessionUser(db, created.id), 'u1');
  auth.destroySession(db, created.id);
  assert.equal(db.prepare('SELECT count(*) n FROM sessions').get().n, 0);
  db.close();
});

test('provider secrets and database backups are encrypted and verifiable', () => {
  const value = 'provider-key-do-not-store-as-plain-text';
  const encrypted = secrets.encrypt(value);
  assert.match(encrypted, /^enc:v1:/);
  assert.ok(!encrypted.includes(value));
  assert.equal(secrets.decrypt(encrypted), value);

  const db = new DatabaseSync(':memory:');
  db.exec('CREATE TABLE sample(id INTEGER PRIMARY KEY,value TEXT); INSERT INTO sample(value) VALUES (\'safe\');');
  const result = backup.create(db);
  const raw = fs.readFileSync(path.join(process.env.COS_BACKUP_DIR, result.name));
  assert.equal(raw.subarray(0,4).toString(), 'ZCV1');
  assert.ok(!raw.includes(Buffer.from('safe')));
  assert.equal(result.encrypted, true);
  assert.ok(result.tables >= 1);
  db.close();

  const destination=path.join(temp,'restore-target.db'), old=new DatabaseSync(destination);
  old.exec('CREATE TABLE old_data(value TEXT); INSERT INTO old_data VALUES (\'previous\');'); old.close();
  process.env.COS_CONFIRM_RESTORE='YES';
  const restored=backup.restore(path.join(process.env.COS_BACKUP_DIR,result.name),destination);
  assert.ok(restored.previous&&fs.existsSync(restored.previous));
  const check=new DatabaseSync(destination,{readOnly:true}); assert.equal(check.prepare('SELECT value FROM sample').get().value,'safe'); check.close();
});

test('repeated failed login attempts are throttled', () => {
  const ip = 'test-' + Date.now(), email = 'person@example.com';
  for (let i=0; i<5; i++) security.loginResult(ip, email, false);
  const status = security.loginStatus(ip, email);
  assert.equal(status.allowed, false);
  assert.ok(status.retryAfter > 0);
  security.loginResult(ip, email, true);
  assert.equal(security.loginStatus(ip, email).allowed, true);
});

test('unsafe cross-origin requests are rejected and browser protections are applied', () => {
  assert.throws(() => security.requireSameOrigin({method:'POST', headers:{host:'zencrevia.example', origin:'https://evil.example'}}), /origin is not allowed/);
  assert.throws(() => security.requireSameOrigin({method:'POST', headers:{host:'zencrevia.example'}}), /origin is required/);
  const headers = {};
  security.applyHeaders({setHeader(k,v){headers[k]=v;}});
  assert.equal(headers['X-Frame-Options'], 'DENY');
  assert.match(headers['Content-Security-Policy'], /frame-ancestors 'none'/);
  assert.match(headers['Strict-Transport-Security'], /max-age=/);
});

test('task ids are restricted before storage and are not interpolated into task handlers', () => {
  for (const id of ['T-1','T_abc123','task.release:2','A.b-c_d']) assert.equal(security.validTaskId(id), true);
  for (const id of ['',"T-1');alert(1);//",'T 1','../T-1','<img>','T\\1','x'.repeat(81)]) assert.equal(security.validTaskId(id), false);
  const server = fs.readFileSync(path.join(__dirname, '../server/server.js'), 'utf8');
  const tasks = fs.readFileSync(path.join(__dirname, '../src/tasks.js'), 'utf8');
  assert.match(server, /security\.validTaskId\(b\.id\)/);
  assert.match(tasks, /data-id="'\+attr\(tk\.id\)\+'"/);
  assert.match(tasks, /openTask\(taskIdFrom\(this\)\)/);
  assert.doesNotMatch(tasks, /openTask\(\\'"\+(?:tk|x|t)\.id/);
});

test('tag picker invokes function callbacks without dynamic code evaluation', () => {
  const source = fs.readFileSync(path.join(__dirname, '../src/tag-picker.js'), 'utf8');
  assert.doesNotMatch(source, /new Function|\beval\s*\(/);
  assert.match(source, /typeof st\.onchange==="function"/);
  assert.match(source, /st\.onchange\(st\.values\.slice\(\),id\)/);
  for (const file of ['assets.js','drawer.js','tasks.js']) {
    const client = fs.readFileSync(path.join(__dirname, '../src', file), 'utf8');
    assert.doesNotMatch(client, /tagPicker\([^\n]+,["'][^"']*\bvalue\b/);
  }
});

test('Google Drive sharing is private unless explicitly enabled', () => {
  const demo = require('../shared/demo-data');
  const drive = demo.cloud.find(x => x.id === 'gdrive');
  const source = fs.readFileSync(path.join(__dirname, '../src/gdrive.js'), 'utf8');
  assert.equal(drive.config.publicLinks, false);
  assert.match(source, /cfg\.publicLinks!==true/);
  assert.doesNotMatch(source, /cfg\.publicLinks!==false/);
});
