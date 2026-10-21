/* Loaded into a test server with `node --require tests/perf-probe.js` (tests/perf-stage1.test.js). Not a test file
   itself (no .test.js). It changes nothing the server does; it says on stderr, one line each:
   - "PROBE sync-zlib <function> <bytes>": a synchronous compression of 64 KB or more (the page, a large reply);
   - "PROBE end <path> <characters>": a reply ended, and how many characters JSON.stringify wrote since the last one. */
const zlib = require('node:zlib');
const http = require('node:http');
const BIG = 64 * 1024;
for (const name of ['gzipSync', 'brotliCompressSync', 'deflateSync']) {
  const orig = zlib[name];
  zlib[name] = function (buf) { const n = buf && buf.length; if (n >= BIG) process.stderr.write('PROBE sync-zlib ' + name + ' ' + n + '\n'); return orig.apply(this, arguments); };
}
const stringify = JSON.stringify;
let chars = 0;
JSON.stringify = function () { const out = stringify.apply(JSON, arguments); if (typeof out === 'string') chars += out.length; return out; };
const end = http.ServerResponse.prototype.end;
http.ServerResponse.prototype.end = function () {
  const url = this.req && this.req.url ? String(this.req.url).split('?')[0] : '?';
  process.stderr.write('PROBE end ' + url + ' ' + chars + '\n'); chars = 0;
  return end.apply(this, arguments);
};
