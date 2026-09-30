/* Public legal pages at /privacy and /terms.

   Google will not let an OAuth app leave "Testing" without a privacy policy and terms of service
   that anyone can open — no sign-in, no redirect to a login screen. So these deliberately sit
   outside the app shell and outside the session check: they are plain HTML from legal/, with a few
   values filled in.

   Set COS_LEGAL_ENTITY, COS_LEGAL_CONTACT and COS_LEGAL_JURISDICTION to match your organisation.
   Without them the pages still render, using the app's own hostname for the contact address, so a
   fresh install never serves a broken page.

   The name, logo initials, accent colour and corner radius follow the workspace's own settings, so
   renaming the workspace in the dashboard renames these pages too. COS_LEGAL_ENTITY overrides it
   where the legal entity differs from the workspace name. */
const fs = require("fs"), path = require("path");
const DIR = path.join(__dirname, "..", "LEGAL", "public");
const PAGES = { "/privacy": "privacy.html", "/terms": "terms.html" };
const DEFAULTS = { name: "ZenCrevia", logo: "ZC", accent: "#2F5BFF", radius: "round" };
const RADII = ["sharp", "medium", "round"];
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
/* One cheap row. Anything unreadable falls back rather than failing a public page, and the accent
   is checked against a hex pattern before it can reach a stylesheet. */
function branding(db) {
  const out = Object.assign({}, DEFAULTS);
  try {
    const w = db && db.prepare("SELECT name, logo, theme FROM workspaces ORDER BY rowid LIMIT 1").get();
    if (!w) return out;
    if (w.name) out.name = String(w.name).trim().slice(0, 80) || out.name;
    if (w.logo) out.logo = String(w.logo).trim().slice(0, 4) || out.logo;
    let theme = {}; try { theme = JSON.parse(w.theme || "{}") || {}; } catch {}
    if (/^#[0-9a-fA-F]{6}$/.test(String(theme.accent || ""))) out.accent = theme.accent;
    if (RADII.indexOf(String(theme.radius)) >= 0) out.radius = theme.radius;
  } catch {}
  return out;
}
function values(req, db) {
  const b = branding(db);
  return {
    /* an explicit legal entity wins; otherwise the workspace names itself */
    ENTITY: String(process.env.COS_LEGAL_ENTITY || b.name).trim() || b.name,
    LOGO: b.logo,
    ACCENT: b.accent,
    RADIUS: b.radius,
    CONTACT: String(process.env.COS_LEGAL_CONTACT || ("privacy@" + hostOf(req))).trim(),
    JURISDICTION: String(process.env.COS_LEGAL_JURISDICTION || "Indonesia").trim() || "Indonesia",
    APP_URL: appUrl(req)
  };
}
/* Substituted values land inside HTML text and href attributes, so they are escaped. Nobody should
   be able to turn a misconfigured environment variable into markup. */
const esc = s => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

function render(pathname, req, db) {
  const file = PAGES[pathname];
  if (!file) return null;
  const v = values(req, db), key = pathname + "|" + JSON.stringify(v);
  const hit = cache.get(key);
  if (hit) return hit;
  let html = fs.readFileSync(path.join(DIR, file), "utf8");
  /* STYLE is our own stylesheet from disk, so it goes in as CSS; every other value could come
     from the environment or the database and is escaped. */
  html = html.replace(/\{\{STYLE\}\}/g, () => stylesheet(v));
  html = html.replace(/\{\{(ENTITY|CONTACT|JURISDICTION|APP_URL|LOGO|ACCENT|RADIUS)\}\}/g, (m, k) => esc(v[k]));
  cache.set(key, html);
  return html;
}
function stylesheet(v) {
  return fs.readFileSync(path.join(DIR, "style.css"), "utf8").replace(/\{\{ACCENT\}\}/g, v.ACCENT);
}
function serve(req, res, pathname, applyHeaders, db) {
  const html = render(pathname, req, db);
  if (html == null) return false;
  if (applyHeaders) applyHeaders(res);
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "public, max-age=300" });
  res.end(req.method === "HEAD" ? "" : html);
  return true;
}
module.exports = { PAGES, serve, render, _values: values, _branding: branding };
