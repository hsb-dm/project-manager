/* YouTube, Vimeo and Loom, for the browser tests (e2e/fixtures/link-stub.js hands them the providers' addresses;
   server/link-preview.js uses it in place of the network). It answers the addresses the server asks, as each provider
   answers them (checked against real public videos, 23 Oct 2026), and nothing else:
   - YouTube, https://www.youtube.com/oembed?format=json&url=… — an id starting "YtPub", or "YtSlo" (1.2 s late), is a
     public 16:9 video (200 × 113, thumbnail hqdefault.jpg, 480 × 360 with the picture letterboxed); "YtSrt" a Short,
     upright (113 × 200, hq2.jpg) when asked as /shorts/; "YtPrv" private (403 "Forbidden"); "YtNoE" not embeddable
     (401 "Unauthorized"); any other id no video (400 "Bad Request");
   - Vimeo, https://vimeo.com/api/oembed.json?url=…&width=1280 — a number starting 77 is public (1280 × 720, 1:35);
     one starting 78 is unlisted and limited to other sites: asked with its hash, the short answer without a title or
     a thumbnail (domain_status_code 403); one starting 79 fails as a name that does not resolve does (ENOTFOUND);
     anything else 404 "404 Not Found" (text/html);
   - Loom, https://www.loom.com/v1/oembed?url=… — an id starting "a11ce" is a public 4:3 recording (1280 × 960, 0:21)
     whose thumbnail comes as application/octet-stream, as Loom's CDN sends it; any other 404 "Not Found";
   - the thumbnails those name, on i.ytimg.com, i.vimeocdn.com and cdn.loom.com: PNGs drawn here, a scene for each.
   Any other address fails, as the test server has no network. */
const { png } = require("./figma-stub");

const later = ms => new Promise(r => setTimeout(r, ms));
const json = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const text = (status, body, type) => new Response(body, { status, headers: { "content-type": type } });
const picture = (buf, type) => new Response(buf, { status: 200, headers: { "content-type": type || "image/png", "content-length": String(buf.length) } });
const mix = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));

/* a sunset over hills, in a w × h picture (a YouTube video) */
const sunset = (w, h) => (x, y) => {
  const sky = mix([30, 58, 138], [249, 115, 22], Math.min(1, y / (h * 0.68)));
  const sun = (x - w * 0.62) ** 2 + (y - h * 0.6) ** 2 < (h * 0.15) ** 2 ? [253, 224, 71] : null;
  const hill1 = y > h * 0.62 + Math.sin(x / w * 5.5) * h * 0.08, hill2 = y > h * 0.8 + Math.sin(x / w * 9 + 1) * h * 0.05;
  return hill2 ? [17, 24, 39] : hill1 ? [55, 48, 107] : sun || sky;
};
/* a harbour at dawn (a Vimeo video) */
const harbour = (w, h) => (x, y) => {
  if (y < h * 0.58) {
    const sail = x > w * 0.42 && x < w * 0.52 && y > h * 0.22 && y < h * 0.56 && (x - w * 0.42) < (y - h * 0.22) * 0.35 * (w / h) * 0.9;
    return sail ? [255, 255, 255] : mix([14, 165, 233], [224, 242, 254], y / (h * 0.58));
  }
  const hull = x > w * 0.38 && x < w * 0.56 && y < h * 0.62;
  return hull ? [127, 29, 29] : mix([3, 105, 161], [8, 47, 73], (y - h * 0.58) / (h * 0.42));
};
/* a screen recording: an app window and the speaker's bubble (a Loom video) */
const screen = (w, h) => (x, y) => {
  if (y < h * 0.08) return x > w * 0.03 && x < w * 0.1 && y > h * 0.025 && y < h * 0.055 ? [248, 113, 113] : [229, 231, 235];
  if ((x - w * 0.12) ** 2 + (y - h * 0.82) ** 2 < (h * 0.11) ** 2) return (x - w * 0.12) ** 2 + (y - h * 0.79) ** 2 < (h * 0.04) ** 2 ? [254, 215, 170] : [98, 93, 245];
  if (x < w * 0.22) return [30, 27, 75];
  const card = (bx, by, bw, bh) => x > w * bx && x < w * (bx + bw) && y > h * by && y < h * (by + bh);
  if (card(0.27, 0.14, 0.66, 0.08)) return [17, 24, 39];
  if (card(0.27, 0.28, 0.31, 0.3) || card(0.62, 0.28, 0.31, 0.3)) return [255, 255, 255];
  if (card(0.27, 0.64, 0.66, 0.24)) return [237, 233, 254];
  return [243, 244, 246];
};
/* an upright frame with bars at the sides, inside a 4:3 picture (YouTube's hq2.jpg of a Short) */
const upright = (w, h, inner) => { const iw = Math.round(h * 9 / 16), x0 = Math.round((w - iw) / 2), f = inner(iw, h); return (x, y) => (x < x0 || x >= x0 + iw ? [0, 0, 0] : f(x - x0, y)); };
/* a 16:9 frame with bars above and below, inside a 4:3 picture (YouTube's hqdefault.jpg) */
const letterbox = (w, h, inner) => { const ih = Math.round(w * 9 / 16), y0 = Math.round((h - ih) / 2), f = inner(w, ih); return (x, y) => (y < y0 || y >= y0 + ih ? [0, 0, 0] : f(x, y - y0)); };

const YT_HQ = png(480, 360, letterbox(480, 360, sunset));
const YT_SHORT = png(480, 360, upright(480, 360, sunset));
const VIMEO = png(640, 360, harbour(640, 360));
const LOOM = png(640, 480, screen(640, 480));

const TITLES = [[/^YtPub/, "Brand film: Ramadan 30s"], [/^YtSlo/, "Product teaser cut 2"], [/^YtSrt/, "Behind the scenes #shorts"]];
const titleOf = id => (TITLES.find(t => t[0].test(id)) || [0, "Video " + id])[1];

async function youtube(u) {
  /* a picture is asked as watch?v= or /shorts/; a name with the link as it was written (youtu.be/, /live/ too) */
  const link = new URL(u.searchParams.get("url")), shorts = /^\/shorts\//.test(link.pathname);
  const id = link.hostname === "youtu.be" ? link.pathname.split("/")[1] : /^\/(shorts|live)\//.test(link.pathname) ? link.pathname.split("/")[2] : link.searchParams.get("v") || "";
  if (/^YtSlo/.test(id)) await later(1200);
  if (/^YtPrv/.test(id)) return text(403, "Forbidden", "application/json; charset=UTF-8");
  if (/^YtNoE/.test(id)) return text(401, "Unauthorized", "application/json; charset=UTF-8");
  if (!/^Yt(Pub|Slo|Srt)/.test(id)) return text(400, "Bad Request", "application/json; charset=UTF-8");
  const up = shorts && /^YtSrt/.test(id);
  return json(200, { title: titleOf(id), author_name: "ZenCrevia E2E", author_url: "https://www.youtube.com/@e2e", type: "video", height: up ? 200 : 113, width: up ? 113 : 200, version: "1.0",
    provider_name: "YouTube", provider_url: "https://www.youtube.com/", thumbnail_height: 360, thumbnail_width: 480, thumbnail_url: "https://i.ytimg.com/vi/" + id + (up ? "/hq2.jpg" : "/hqdefault.jpg"),
    html: '<iframe width="200" height="113" src="https://www.youtube.com/embed/' + id + '?feature=oembed"></iframe>' });
}
function vimeo(u) {
  const link = new URL(u.searchParams.get("url")), m = /^\/(\d+)(?:\/([0-9a-f]+))?$/.exec(link.pathname) || [];
  const id = m[1] || "", hash = m[2] || "";
  /* vimeo.com out of reach: its name did not resolve over the DNS of the machine this was checked on (23 Oct 2026) */
  if (/^79/.test(id)) return Promise.reject(Object.assign(new Error("getaddrinfo ENOTFOUND vimeo.com"), { code: "ENOTFOUND", hostname: "vimeo.com" }));
  if (/^77/.test(id)) return json(200, { type: "video", version: "1.0", provider_name: "Vimeo", provider_url: "https://vimeo.com/", title: "Harbour at dawn", author_name: "ZenCrevia E2E", is_plus: "0", account_type: "basic",
    html: '<iframe src="https://player.vimeo.com/video/' + id + (hash ? "?h=" + hash + "&amp;" : "?") + 'app_id=122963" width="1280" height="720"></iframe>', width: 1280, height: 720, duration: 95,
    thumbnail_url: "https://i.vimeocdn.com/video/e2e" + id + "-d_1280?region=us", thumbnail_width: 1280, thumbnail_height: 720, video_id: +id, uri: "/videos/" + id + (hash ? ":" + hash : "") });
  if (/^78/.test(id) && hash) return json(200, { type: "video", version: "1.0", provider_name: "Vimeo", provider_url: "https://vimeo.com/", html: '<iframe src="https://player.vimeo.com/video/' + id + "?h=" + hash + '&amp;app_id=122963"></iframe>', width: 426, height: 240, domain_status_code: 403, video_id: +id, uri: "/videos/" + id + ":" + hash });
  return text(404, "404 Not Found", "text/html; charset=UTF-8");
}
function loom(u) {
  const link = new URL(u.searchParams.get("url")), id = (/^\/share\/([0-9a-f]{32})$/.exec(link.pathname) || [])[1] || "";
  if (!/^a11ce/.test(id)) return text(404, "Not Found", "text/plain; charset=utf-8");
  return json(200, { type: "video", version: "1.0", html: '<iframe src="https://www.loom.com/embed/' + id + '" frameborder="0" width="1280" height="960" allowfullscreen></iframe>', height: 960, width: 1280,
    provider_name: "Loom", provider_url: "https://www.loom.com", thumbnail_height: 960, thumbnail_width: 1280, thumbnail_url: "https://cdn.loom.com/sessions/thumbnails/" + id + "-00001.jpg", duration: 21, title: "Walkthrough: the checkout flow", description: "e2e" });
}

async function fetch(url) {
  const u = new URL(url);
  if (u.hostname === "www.youtube.com" && u.pathname === "/oembed") return youtube(u);
  if (u.hostname === "vimeo.com" && u.pathname === "/api/oembed.json") return vimeo(u);
  if (u.hostname === "www.loom.com" && u.pathname === "/v1/oembed") return loom(u);
  if (u.hostname === "i.ytimg.com" && /^\/vi\/Yt[\w-]+\/hq2\.jpg$/.test(u.pathname)) return picture(YT_SHORT);
  if (u.hostname === "i.ytimg.com" && /^\/vi\/Yt[\w-]+\/hqdefault\.jpg$/.test(u.pathname)) { if (/YtSlo/.test(u.pathname)) await later(400); return picture(YT_HQ); }
  if (u.hostname === "i.vimeocdn.com" && /^\/video\/e2e77\d*-d_1280$/.test(u.pathname)) return picture(VIMEO);
  if (u.hostname === "cdn.loom.com" && /^\/sessions\/thumbnails\/a11ce[0-9a-f]+-00001\.jpg$/.test(u.pathname)) return picture(LOOM, "application/octet-stream");
  throw new Error("e2e: no network for " + u.hostname);
}
const HOSTS = ["www.youtube.com", "vimeo.com", "www.loom.com", "i.ytimg.com", "i.vimeocdn.com", "cdn.loom.com"];
module.exports = { fetch, HOSTS, pictures: { YT_HQ, YT_SHORT, VIMEO, LOOM } };
