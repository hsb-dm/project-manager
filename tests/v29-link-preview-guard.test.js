/* v29 — the link-preview fetch re-validates the resolved address at connect time.
   The guard functions live inside the messages module closure, so they are lifted out
   and executed for real here (a live socket is opened against a loopback listener). */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const vm = require('node:vm');

function loadGuards() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'server', 'messages.js'), 'utf8');
  const pick = name => { const i = src.indexOf('  const ' + name + ' = '); assert.ok(i >= 0, name); return src.slice(i, src.indexOf('\n', i)); };
  const code = [pick('privateIp'), pick('guardedLookup'), pick('pinnedFetch'), 'module.exports={privateIp,guardedLookup,pinnedFetch};'].join('\n');
  const ctx = { module: { exports: {} }, net: require('node:net'), dnsCb: require('node:dns'), http, https: require('node:https'), Readable: require('node:stream').Readable, Headers, Response, Error };
  vm.runInNewContext(code, ctx);
  return ctx.module.exports;
}

test('private and special-purpose addresses are refused', () => {
  const { privateIp } = loadGuards();
  for (const ip of ['127.0.0.1', '10.1.2.3', '172.20.0.1', '192.168.1.1', '169.254.169.254', '100.64.0.1', '0.0.0.0', '::1', '::ffff:127.0.0.1', '::ffff:10.0.0.1', 'fd00::1', 'fe80::1', '198.18.0.1', 'not-an-ip']) assert.equal(privateIp(ip), true, ip);
  for (const ip of ['140.82.114.4', '8.8.8.8', '2606:4700:4700::1111']) assert.equal(privateIp(ip), false, ip);
});

test('a hostname resolving to loopback is blocked at connect time (DNS rebinding)', async t => {
  const { pinnedFetch } = loadGuards();
  let hits = 0;
  const srv = http.createServer((q, s) => { hits++; s.end('<title>internal</title>'); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r)); t.after(() => srv.close());
  const port = srv.address().port;
  // "localhost" resolves to 127.0.0.1 / ::1 exactly like a rebinding domain would on the second lookup.
  await assert.rejects(pinnedFetch(new URL('http://localhost:' + port + '/'), undefined, {}), e => e.code === 'EBLOCKED');
  assert.equal(hits, 0, 'no request reached the internal listener');
});
