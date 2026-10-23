/* Figma, for the browser tests (e2e/serve.js sets COS_LINK_FETCH_STUB to this file; server/link-preview.js uses it
   in place of the network). It answers the two addresses the server asks Figma for, as Figma answers them (checked
   against a real public file, Oct 2026), and nothing else:
   - https://www.figma.com/api/oembed?url=… — a file whose key starts "FgPub" or "FgSlow" (1.2 s late) is public, with
     a thumbnail; any other key is private: 404 {"error":true,"status":404,"message":"Not found."}. As Figma does, a
     link without www (or in capitals) is 400 "expected the url host to be a figma host", http is 400 "expected the
     url scheme to be 'https'" and a community link 400 "Not a Figma URL" (server/oembed-links.js);
   - https://api-cdn.figma.com/resize/thumbnails/e2e-<key>… — the thumbnail, a PNG drawn here (800 × 448, a layout of
     coloured blocks, so the screenshots show something like a design).
   Any other address fails, as the test server has no network. */
const zlib = require("zlib");

function png(w, h, paint) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const c = paint(x, y), i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = c[0]; raw[i + 1] = c[1]; raw[i + 2] = c[2]; } }
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type, "latin1"), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(td) >>> 0); return Buffer.concat([len, td, crc]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const inBox = (x, y, b) => x >= b[0] && y >= b[1] && x < b[0] + b[2] && y < b[1] + b[3];
const BLOCKS = [
  [[0, 0, 800, 448], [244, 246, 251]],
  [[40, 36, 720, 52], [255, 255, 255]], [[56, 54, 120, 16], [30, 64, 175]], [[600, 52, 140, 20], [124, 58, 237]],
  [[40, 112, 430, 296], [37, 99, 235]], [[72, 150, 300, 30], [255, 255, 255]], [[72, 196, 220, 16], [191, 219, 254]], [[72, 330, 150, 44], [250, 204, 21]],
  [[494, 112, 266, 140], [236, 72, 153]], [[494, 268, 266, 140], [16, 185, 129]], [[518, 300, 120, 18], [255, 255, 255]]
];
const THUMB = png(800, 448, (x, y) => { let c = BLOCKS[0][1]; for (const b of BLOCKS) if (inBox(x, y, b[0])) c = b[1]; return c; });
/* the file's name, by the start of its key (a test may add digits to make a key of its own) */
const NAMES = [[/^FgPubHero/, "Hero Banner Q4"], [/^FgSlowKv/, "KV Ramadan"]];
const nameOf = key => (NAMES.find(n => n[0].test(key)) || [0, key])[1];
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const later = ms => new Promise(r => setTimeout(r, ms));

async function fetch(url) {
  const u = new URL(url);
  if (u.hostname === "www.figma.com" && u.pathname === "/api/oembed") {
    const asked = String(u.searchParams.get("url") || ""), link = new URL(asked), key = (link.pathname.match(/^\/\w+\/([A-Za-z0-9]+)/) || [])[1] || "";
    if (!/^https:/i.test(asked)) return json(400, { error: true, message: "Error: expected the url scheme to be 'https'", status: 400 });
    if (!/^https:\/\/www\.figma\.com\//.test(asked)) return json(400, { error: true, message: "Error: expected the url host to be a figma host", status: 400 });
    if (/^\/community\//.test(link.pathname)) return json(400, { error: true, message: "Not a Figma URL", status: 400 });
    if (/^FgSlow/.test(key)) await later(1200);
    if (!/^Fg(Pub|Slow)/.test(key)) return json(404, { error: true, status: 404, message: "Not found." });
    return json(200, { version: "1.0", type: "rich", title: nameOf(key), key, url: link.href + "?", provider_name: "Figma", provider_url: "https://www.figma.com", cache_age: 3600, width: 800, height: 450,
      thumbnail_url: "https://api-cdn.figma.com/resize/thumbnails/e2e-" + key + "?expiration=1792972800&signature=e2e&height=448&bucket=figma-alpha", thumbnail_width: 800, thumbnail_height: 448 });
  }
  if (u.hostname === "api-cdn.figma.com" && /^\/resize\/thumbnails\/e2e-/.test(u.pathname)) {
    if (/e2e-FgSlow/.test(u.pathname)) await later(400);
    return new Response(THUMB, { status: 200, headers: { "content-type": "image/png", "content-length": String(THUMB.length) } });
  }
  throw new Error("e2e: no network for " + u.hostname);
}
/* png: the drawing, for e2e/fixtures/video-stub.js's thumbnails too */
module.exports = { fetch, THUMB, png };
