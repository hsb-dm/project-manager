/* How every notification email is built: a layout Outlook and Gmail draw the same way (tables, no flex),
   the dashboard's logo inside the message, ZenCrevia only in the footer, and the details spam filters look
   at — quoted-printable text, a Message-ID and EHLO name with real domains, plain or properly encoded headers. */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zencrevia-mail-format-'));
Object.assign(process.env, { COS_DATA_DIR: temp, COS_MAIL_TRANSPORT: 'log', MAIL_FROM: 'HSB Investasi <team@hsb.example.com>', APP_URL: 'https://app.hsb.example.com' });
delete process.env.COS_MAIL_FORCE_LOG; delete process.env.MAIL_REPLY_TO;
const mailer = require('../server/mailer.js');
const { readMail, qpDecode } = require('./mail-text');
test.after(() => fs.rmSync(temp, { recursive: true, force: true }));

const PNG1 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const headers = raw => raw.split('\r\n\r\n')[0];
const part = (raw, type) => { const m = new RegExp('Content-Type: ' + type + '; charset=UTF-8\\r\\nContent-Transfer-Encoding: (\\S+)\\r\\n\\r\\n([\\s\\S]*?)\\r\\n--').exec(raw); return m && { enc: m[1], body: qpDecode(m[2]) }; };
const note = { to: 'rina@example.com', subject: '[HSB Investasi] Dimas assigned you a task', text: 'Hi Rina, Dimas assigned you "Launch poster".', meta: { Task: 'Launch poster' }, link: 'https://app.hsb.example.com/tasks?task=t1-launch-poster', workspace: 'HSB Investasi' };

test('an email reads well in Outlook and Gmail: tables, the dashboard logo inside it, ZenCrevia in the footer', async () => {
  mailer.setBrand(() => ({ name: 'HSB Investasi', logo: 'HSB', logoImg: 'data:image/png;base64,' + PNG1, accent: '#0f121a' }));
  const raw = fs.readFileSync((await mailer.send(note)).file, 'utf8');
  const h = headers(raw);
  assert.match(h, /^From: "HSB Investasi" <team@hsb\.example\.com>$/m);
  assert.match(h, /^Subject: \[HSB Investasi\] Dimas assigned you a task$/m, 'a plain ASCII subject is written as it is');
  assert.match(h, /^Message-ID: <[a-z0-9.]+@hsb\.example\.com>$/m, 'the Message-ID carries the sender\'s domain');
  assert.match(h, /^Date: .* \+0000$/m);
  assert.match(h, /^Auto-Submitted: auto-generated$/m);
  assert.doesNotMatch(h, /^Reply-To:/m, 'no Reply-To when none is set');
  /* text is quoted-printable, never base64 */
  const html = part(raw, 'text/html'), text = part(raw, 'text/plain');
  assert.equal(html.enc, 'quoted-printable'); assert.equal(text.enc, 'quoted-printable');
  raw.split('\r\n\r\n').slice(1).join('\r\n\r\n').split('\r\n').forEach(l => assert.ok(l.length <= 76, 'a body line of ' + l.length + ': ' + l.slice(0, 40)));
  /* the logo travels inside the message and the HTML points at it */
  const cid = (raw.match(/^Content-ID: <([^>]+)>$/m) || [])[1];
  assert.ok(cid && cid.endsWith('@hsb.example.com'), 'an inline logo part: ' + cid);
  assert.match(raw, /Content-Type: multipart\/related; type="text\/html"/);
  assert.ok(html.body.includes('src="cid:' + cid + '"'), 'the header shows the inline logo');
  const img = raw.split('Content-ID: <' + cid + '>')[1].split('\r\n\r\n')[1].split('\r\n--')[0].replace(/\s+/g, '');
  assert.equal(img, PNG1, 'the logo is the dashboard\'s image, unchanged');
  /* Word (Outlook) draws none of these */
  assert.doesNotMatch(html.body, /display:\s*flex|[;"]gap:|data:image/);
  /* the workspace heads the email; ZenCrevia is only small print at the bottom */
  const top = html.body.split('<h1')[0];
  assert.ok(top.includes('HSB Investasi'), 'the workspace name heads the email');
  assert.ok(!/ZenCrevia/.test(top.split('<body')[1]), 'no ZenCrevia in the header');
  assert.match(html.body, /<h1[^>]*>Dimas assigned you a task<\/h1>/, 'the heading drops the [workspace] prefix');
  /* the footer centred, a sentence a line; ZenCrevia apart beneath it, centred too */
  assert.match(html.body, /<td align="center"[^>]*font-size:11px[^>]*text-align:center">You receive this because you are involved in this work\.<br>Change email preferences in Settings → Notifications\.<\/td><\/tr>\s*<tr><td align="center" style="padding:14px[^>]*text-align:center">ZenCrevia<\/td><\/tr>/, 'the footer centred, ZenCrevia apart');
  assert.ok(text.body.replace(/\r\n/g, '\n').includes('You receive this because you are involved in this work.\nChange email preferences in Settings → Notifications.\n\nZenCrevia'), 'the plain-text footer the same way');
  /* the button is a cell in the accent colour, white text on a dark accent */
  assert.match(html.body, /<td bgcolor="#0f121a"[^>]*><a href="https:\/\/app\.hsb\.example\.com\/tasks\?task=t1-launch-poster"[^>]*color:#FFFFFF/);
  /* the plain-text part says what the HTML says */
  ['HSB Investasi', 'Dimas assigned you a task', 'Launch poster', 'Open in ZenCrevia: https://app.hsb.example.com/tasks?task=t1-launch-poster', 'You receive this because', 'ZenCrevia'].forEach(s => assert.ok(text.body.includes(s), 'text part has ' + s));
});

test('a logo no mail client shows (SVG) becomes the initials badge in the accent colour', async () => {
  mailer.setBrand(() => ({ name: 'HSB Investasi', logo: 'HSB', logoImg: 'data:image/svg+xml;base64,PHN2Zy8+', accent: '#C6F24E' }));
  const raw = fs.readFileSync((await mailer.send(note)).file, 'utf8');
  assert.doesNotMatch(raw, /multipart\/related|Content-ID:/, 'no image part');
  const html = part(raw, 'text/html').body;
  assert.match(html, /<td [^>]*bgcolor="#C6F24E"[^>]*color:#111214[^>]*>HSB<\/td>/, 'the initials, dark on a light accent');
  /* a wide logo keeps its shape */
  const wide = Buffer.from(PNG1, 'base64'); wide.writeUInt32BE(400, 16); wide.writeUInt32BE(100, 20);
  mailer.setBrand(() => ({ name: 'HSB Investasi', logoImg: 'data:image/png;base64,' + wide.toString('base64') }));
  const raw2 = fs.readFileSync((await mailer.send(note)).file, 'utf8');
  assert.match(part(raw2, 'text/html').body, /<img src="cid:[^"]+" width="160" height="40"/);
});

test('headers: non-ASCII is encoded in short words, a line break cannot add a header, Reply-To only when valid', async () => {
  mailer.setBrand(() => ({ name: 'Studio, Kréatif' }));
  const subject = '[Studio, Kréatif] Désain poster “Ramadan” — revisi ke-2 untuk klien yang namanya cukup panjang sekali 🎉';
  const conf = { transport: 'log', from: 'Studio, Kréatif <team@studio.example.com>', replyTo: 'halo@studio.example.com', smtp: {} };
  let raw = fs.readFileSync((await mailer.sendWith(conf, Object.assign({}, note, { subject, workspace: 'Studio, Kréatif' }))).file, 'utf8');
  let h = headers(raw);
  assert.equal(readMail(raw).subject, subject, 'the subject reads back exactly');
  (h.match(/=\?UTF-8\?B\?[^?]*\?=/g) || []).forEach(w => assert.ok(w.length <= 75, 'an encoded word of ' + w.length));
  assert.match(h, /^From: =\?UTF-8\?B\?[^?]+\?= <team@studio\.example\.com>$/m, 'a name with a comma and an accent stays one address');
  assert.match(h, /^Reply-To: halo@studio\.example\.com$/m);
  h.split('\r\n').forEach(l => assert.ok(l.length <= 998));
  /* CR/LF in a subject or Reply-To stays on its line */
  raw = fs.readFileSync((await mailer.sendWith(Object.assign({}, conf, { replyTo: 'x@y.example.com\r\nBcc: spy@evil.example.com' }), Object.assign({}, note, { subject: 'Hi\r\nBcc: spy@evil.example.com' }))).file, 'utf8');
  h = headers(raw);
  assert.doesNotMatch(h, /^Bcc:/m);
  assert.doesNotMatch(h, /^Reply-To:/m, 'an invalid Reply-To is left out');
  assert.match(h, /^Subject: Hi Bcc: spy@evil\.example\.com$/m);
});

test('the client greets the SMTP server with the app\'s host name, and the message arrives whole', async () => {
  mailer.setBrand(() => ({ name: 'HSB Investasi', logo: 'HSB', logoImg: 'data:image/png;base64,' + PNG1 }));
  const seen = { ehlo: [], data: '' };
  const srv = net.createServer(c => {
    c.write('220 fake.test ESMTP\r\n'); let buf = '', data = false;
    c.on('data', d => { buf += d; let i; while ((i = buf.indexOf('\r\n')) >= 0) { const line = buf.slice(0, i); buf = buf.slice(i + 2);
      if (data) { if (line === '.') { data = false; c.write('250 queued\r\n'); } else seen.data += line + '\r\n'; continue; }
      if (/^EHLO/i.test(line)) { seen.ehlo.push(line); c.write('250-fake.test\r\n250 8BITMIME\r\n'); }
      else if (/^DATA/i.test(line)) { data = true; c.write('354 go on\r\n'); }
      else if (/^QUIT/i.test(line)) { c.write('221 bye\r\n'); c.end(); }
      else c.write('250 ok\r\n'); } });
    c.on('error', () => {});
  });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  try {
    await mailer.verifySmtp({ host: '127.0.0.1', port: srv.address().port, secure: false });
    await mailer.sendWith({ transport: 'smtp', from: 'HSB Investasi <team@hsb.example.com>', smtp: { host: '127.0.0.1', port: srv.address().port, secure: false } }, note);
  } finally { srv.close(); }
  assert.deepEqual(seen.ehlo, ['EHLO app.hsb.example.com', 'EHLO app.hsb.example.com']);
  const got = readMail(seen.data.replace(/^\.\./gm, '.'));
  assert.equal(got.subject, note.subject);
  assert.ok(got.text.includes('Open in ZenCrevia: ' + note.link));
});
