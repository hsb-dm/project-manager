/* A mail server, Google or a model that fails is answered with 424, never 502/504 (Oct 2026).
   Cloudflare puts its own HTML page in place of an origin's 502 or 504, so the reason was lost: testing a Gmail
   SMTP login that was refused showed "The server could not be reached (502). It may be restarting" — not
   "535 Username and Password not accepted". */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const os = require('node:os');
const { spawn } = require('node:child_process');
const root = path.join(__dirname, '..');

test('no route answers a failure elsewhere with 502 or 504', () => {
  for (const f of fs.readdirSync(path.join(root, 'server')).filter(f => f.endsWith('.js'))) {
    const src = fs.readFileSync(path.join(root, 'server', f), 'utf8');
    assert.doesNotMatch(src, /(HttpError|\berr)\(\s*50[24]\b/, f + ': Cloudflare hides an origin 502/504 behind its own page');
  }
});

/* an SMTP server that greets, offers AUTH and refuses the login, as Gmail does with a wrong app password */
function refusingSmtp() {
  return new Promise(res => {
    const srv = net.createServer(c => {
      c.write('220 fake.test ESMTP\r\n');
      let buf = '';
      c.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
        if (/^EHLO/i.test(line)) c.write('250-fake.test\r\n250 AUTH PLAIN LOGIN\r\n');
        else if (/^AUTH/i.test(line)) c.write('535 5.7.8 Username and Password not accepted\r\n');
        else if (/^QUIT/i.test(line)) { c.write('221 bye\r\n'); c.end(); }
        else c.write('250 ok\r\n'); } });
      c.on('error', () => {});
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

test('a refused SMTP login comes back as 424 with the mail server\'s reason', { timeout: 30000 }, async t => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-upstream-'));
  const smtp = await refusingSmtp();
  const child = spawn(process.execPath, ['--no-warnings', 'server/server.js'], { cwd: root, env: Object.assign({}, process.env, { NODE_ENV: 'production', PORT: '0', COS_DATA_DIR: temp, COS_ADMIN_PASSWORD: 'Upstream!Admin23456', COS_ADMIN_EMAIL: 'admin@zencrevia.demo', COS_SECRET_KEY: 'upstream-secret-key-longer-than-32-characters!!', COS_BACKUP_KEY: 'upstream-backup-key-longer-than-32-characters!!', COS_SEED_DEMO: '0', COS_BACKUP_INTERVAL_HOURS: '0', COS_MAIL_TRANSPORT: 'log' }) });
  t.after(async () => { smtp.close(); if (child.exitCode === null) { child.kill(); await new Promise(r => child.once('exit', r)); } fs.rmSync(temp, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 }); });
  let out = ''; const port = await new Promise((res, rej) => { const tm = setTimeout(() => rej(new Error(out)), 8000); child.stdout.on('data', d => { out += d; const m = out.match(/localhost:(\d+)/); if (m) { clearTimeout(tm); res(+m[1]); } }); child.stderr.on('data', d => out += d); child.once('exit', c => { clearTimeout(tm); rej(new Error('exit ' + c + out)); }); });
  const base = 'http://127.0.0.1:' + port;
  const req = (m, p, b, c) => fetch(base + p, { method: m, headers: Object.assign({ 'content-type': 'application/json', origin: base }, c ? { cookie: c } : {}), body: b === undefined ? undefined : JSON.stringify(b) });
  const login = await req('POST', '/api/auth/login', { email: 'admin@zencrevia.demo', password: 'Upstream!Admin23456' });
  assert.equal(login.status, 200, await login.clone().text());
  const admin = login.headers.get('set-cookie').split(';')[0];
  const form = { host: '127.0.0.1', port: smtp.address().port, secure: false, user: 'someone@gmail.com', pass: 'wrong-app-password', fromEmail: 'someone@gmail.com' };
  for (const route of ['/api/mail/smtp/test', '/api/mail/smtp/send-test']) {
    const r = await req('POST', route, Object.assign({ to: 'admin@zencrevia.demo' }, form), admin);
    assert.equal(r.status, 424, route + ': ' + (await r.clone().text()));
    const j = await r.json();
    assert.match(j.error, /535 5\.7\.8 Username and Password not accepted/, route + ': the mail server\'s own words reach the admin');
  }
});
