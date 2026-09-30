/* The public privacy policy and terms (server/legal.js). Google will not let an OAuth app leave
   "Testing" without these, and it checks them from a signed-out browser — so the properties worth
   guarding are that they render completely, say what Google requires, and cannot be turned into
   markup by a misconfigured environment variable. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");

function loadLegal(env) {
  const keep = {};
  ["COS_LEGAL_ENTITY", "COS_LEGAL_CONTACT", "COS_LEGAL_JURISDICTION", "APP_URL"].forEach(k => { keep[k] = process.env[k]; delete process.env[k]; });
  Object.assign(process.env, env || {});
  delete require.cache[require.resolve("../server/legal.js")];
  const mod = require("../server/legal.js");
  return { mod, restore: () => { ["COS_LEGAL_ENTITY", "COS_LEGAL_CONTACT", "COS_LEGAL_JURISDICTION", "APP_URL"].forEach(k => { if (keep[k] === undefined) delete process.env[k]; else process.env[k] = keep[k]; }); } };
}
const REQ = { headers: { host: "app.example.com" }, method: "GET" };

test("both pages render with nothing left unfilled", () => {
  const { mod, restore } = loadLegal({ APP_URL: "https://app.example.com" });
  try {
    for (const p of ["/privacy", "/terms"]) {
      const html = mod.render(p, REQ);
      assert.ok(html && html.length > 2000, p + " rendered");
      assert.ok(!html.includes("{{"), p + " has no placeholder left");
      assert.match(html, /<\/html>/);
    }
  } finally { restore(); }
});

test("the privacy policy makes the disclosures Google looks for", () => {
  const { mod, restore } = loadLegal({ APP_URL: "https://app.example.com" });
  try {
    const html = mod.render("/privacy", REQ);
    /* the Limited Use pledge is the sentence Google's review actually looks for */
    assert.match(html, /Limited Use/);
    assert.match(html, /Google API Services User Data Policy/);
    assert.match(html, /drive\.file/, "names the exact scope requested");
    assert.match(html, /myaccount\.google\.com\/permissions/, "tells people how to revoke");
    assert.match(html, /not use Google user data for advertising|tidak memakai data pengguna Google untuk iklan/);
    assert.match(html, /train generalised artificial-intelligence models|melatih model kecerdasan artifisial umum/);
    /* both languages are present on the one page */
    assert.match(html, /lang="en"/);
    assert.match(html, /lang="id"/);
    assert.match(html, /Kebijakan ini menjelaskan/);
  } finally { restore(); }
});

test("the terms cover the third-party and termination points the policy refers to", () => {
  const { mod, restore } = loadLegal({ APP_URL: "https://app.example.com" });
  try {
    const html = mod.render("/terms", REQ);
    assert.match(html, /Google Drive/);
    assert.match(html, /href="\/privacy"/, "links back to the policy");
    assert.match(html, /Governing law/);
    assert.match(html, /Indonesia/, "falls back to a real jurisdiction");
    assert.match(html, /Ketentuan ini mengatur penggunaan Anda/);
  } finally { restore(); }
});

test("organisation details come from the environment", () => {
  const { mod, restore } = loadLegal({ COS_LEGAL_ENTITY: "PT Contoh Kreatif", COS_LEGAL_CONTACT: "legal@contoh.id", COS_LEGAL_JURISDICTION: "the Republic of Indonesia", APP_URL: "https://studio.contoh.id" });
  try {
    const html = mod.render("/terms", REQ);
    assert.match(html, /PT Contoh Kreatif/);
    assert.match(html, /legal@contoh\.id/);
    assert.match(html, /the Republic of Indonesia/);
    assert.match(html, /https:\/\/studio\.contoh\.id/);
    assert.ok(!html.includes("privacy@app.example.com"), "the fallback address is not left behind");
  } finally { restore(); }
});

test("without configuration the pages still render a usable address", () => {
  const { mod, restore } = loadLegal({});
  try {
    const html = mod.render("/privacy", REQ);
    assert.match(html, /privacy@app\.example\.com/, "derived from the request host");
    assert.match(html, /ZenCrevia/);
    assert.ok(!html.includes("{{"));
  } finally { restore(); }
});

test("a value from the environment cannot become markup", () => {
  const { mod, restore } = loadLegal({ COS_LEGAL_ENTITY: '<script>alert(1)</script>', COS_LEGAL_CONTACT: 'a"onmouseover="x', APP_URL: "https://app.example.com" });
  try {
    const html = mod.render("/privacy", REQ);
    assert.ok(!html.includes("<script>alert(1)</script>"), "no injected element");
    assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
    assert.ok(!html.includes('a"onmouseover="x'), "no attribute escape");
  } finally { restore(); }
});

test("an unknown path renders nothing rather than reading an arbitrary file", () => {
  const { mod, restore } = loadLegal({});
  try {
    assert.equal(mod.render("/nope", REQ), null);
    assert.equal(mod.render("/../server/gdrive.js", REQ), null);
  } finally { restore(); }
});

test("the server serves these before any session check", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
  const legalAt = src.indexOf("legal.PAGES[url.pathname]");
  const filesAt = src.indexOf("v39 uploaded images: signed-in users only");
  const shellAt = src.indexOf("v38.1 clean URLs");
  assert.ok(legalAt > 0, "the legal branch exists");
  assert.ok(legalAt < filesAt, "it comes before the signed-in file route");
  assert.ok(legalAt < shellAt, "and before the app-shell fallback that would swallow /privacy");
});

test("the sign-in screen links to both pages, because Google looks for them there", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "src", "auth.js"), "utf8");
  assert.match(src, /href="\/privacy"/);
  assert.match(src, /href="\/terms"/);
});
