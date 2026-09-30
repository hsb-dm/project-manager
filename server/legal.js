/* Public legal pages at /privacy and /terms.

   Google will not let an OAuth app leave "Testing" without a privacy policy and terms of service
   that anyone can open — no sign-in, no redirect to a login screen. So these deliberately sit
   outside the app shell and outside the session check: they are plain HTML from legal/, with a few
   values filled in.

   Set COS_LEGAL_ENTITY, COS_LEGAL_CONTACT and COS_LEGAL_JURISDICTION to match your organisation.
   Without them the pages still render, using the app's own hostname for the contact address, so a
   fresh install is never left serving a broken page. */
const fs = require("fs"), path = require("path");
const DIR = path.join(__dirname, "..", "legal");
const PAGES = { "/privacy": "privacy.html", "/terms": "terms.html" };
const cache = new Map();

function hostOf(req) {
  const fromEnv = String(process.env.APP_URL || "").trim();
  if (fromEnv) { try { return new URL(fromEnv).hostname; } catch {} }
  return String((req && req.headers && req.headers.host) || "localhost").split(":")[0];
}
function appUrl(req) {
  const fromEnv = String(process.env.APP_URL || "").trim().replace(/\/+$/, "");
  if (fromEnv) return fromEnv;
  const host = (req && req.headers && req.headers.host) || "localhost:3000";
  return (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http://" : "https://") + host;
}
function values(req) {
  return {
    ENTITY: String(process.env.COS_LEGAL_ENTITY || "ZenCrevia").trim() || "ZenCrevia",
    CONTACT: String(process.env.COS_LEGAL_CONTACT || ("privacy@" + hostOf(req))).trim(),
    JURISDICTION: String(process.env.COS_LEGAL_JURISDICTION || "Indonesia").trim() || "Indonesia",
    APP_URL: appUrl(req)
  };
}
/* Substituted values land inside HTML text and href attributes, so they are escaped. Nobody should
   be able to turn a misconfigured environment variable into markup. */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function render(pathname, req) {
  const file = PAGES[pathname];
  if (!file) return null;
  const v = values(req), key = pathname + "|" + JSON.stringify(v);
  const hit = cache.get(key);
  if (hit) return hit;
  let html = fs.readFileSync(path.join(DIR, file), "utf8");
  html = html.replace(/\{\{(ENTITY|CONTACT|JURISDICTION|APP_URL)\}\}/g, (m, k) => esc(v[k]));
  cache.set(key, html);
  return html;
}
function serve(req, res, pathname, applyHeaders) {
  const html = render(pathname, req);
  if (html == null) return false;
  if (applyHeaders) applyHeaders(res);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" });
  res.end(req.method === "HEAD" ? "" : html);
  return true;
}
module.exports = { PAGES, serve, render, _values: values };
