#!/usr/bin/env node
// Concatenates src/* into public/index.html (served by the API) and dist/creative-os-standalone.html (works offline in demo mode).
const fs = require("fs"); const path = require("path"); const crypto = require("crypto");
const { stripHtml, stripCss } = require("./build-strip");
const parts = ["head.html", "body.html", "core.js", "auth.js", "gdrive.js", "image-optimize.js", "dashboard.js", "tasks.js", "drawer.js", "projects.js", "teams.js", "assets.js", "knowledge.js", "ai.js", "ai-expand.js", "analytics.js", "ai-policy.js", "entity-picker.js", "brand-icons.js", "ai-chat-actions.js", "ai-brief.js", "brand-characters.js", "brand-fonts.js", "ai-templates.js", "ai-hub-layout.js", "notify-delivery.js", "emoji.js", "messages.js", "tag-picker.js", "settings.js", "ai-admin.js", "admin-ops.js", "import-snapshot.js", "report-template.js", "report-layout.js", "export.js", "i18n.js", "studio-editor.js", "canvas-controls.js", "canvas-sharpen.js", "font-families.js", "ai-layout-map.js", "multi-selection.js", "ai-gallery.js", "studio-actions.js", "canvas-navigation.js", "canvas-guides.js", "style-effects.js", "onboarding-refinements.js", "ai-properties.js", "enhance.js", "clipboard.js", "v29.js", "v33.js", "v34.js", "v35.js", "v38.js", "paste-image.js", "mobile.js", "comment-attach.js", "comment-mention.js", "link-tab.js", "version-preview.js", "link-chips.js", "assets-tab.js", "drive-deletion.js", "gdrive-shared.js", "legal-settings.js", "storage-settings.js", "gdrive-picker.js", "custom-emoji.js", "progress-note.js", "desc-links.js", "desc-emoji.js", "desc-format.js", "personal-theme.js", "task-draft.js", "similar-task.js", "effort-estimate.js", "ref-chips.js", "desc-literal.js", "signup-approval.js", "project-discussion.js", "announcements.js", "notif-choices.js", "settings-access.js", "cap-grants.js", "scoring-core.js", "scoring-settings.js", "scoring-assets.js", "scoring-panel.js", "scoring-awards.js", "scoring-time.js", "scoring-analytics.js", "scoring-teams.js", "scoring-outcomes.js", "scoring-kinds.js", "live-redraw.js", "view-memory.js", "list-columns.js", "new-version.js", "ai-chat-models.js", "pwa.js", "boot.js"];
const ROOT = __dirname, SRC = path.join(ROOT, "src"), SHARED = path.join(ROOT, "shared"), PUBLIC = path.join(ROOT, "public");
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");
const lf = s => s.replace(/\r\n/g, "\n");
const hashOf = buf => crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);

/* Two pages from the same sources (Oct 2026, performance stage 2). The served page (public/index.html) is the one a
   visit downloads, and the server sends everything else it needs as files of their own; the standalone file
   (dist/creative-os-standalone.html) must open from a disk on its own, so it carries all of it inside. The
   standalone file is the served page with exactly these swaps (standaloneFrom), nothing else:
   - the Google Drive logo, the English flag and the notification chime: files under /assets/ named after their
     content (the server keeps them a year: a new file is a new name), or data: addresses inside the file. The
     Indonesian flag, 152 bytes, is inside both: a request of its own would cost more than it;
   - the demo workspace: the served page carries only the settings the app starts from before the server answers
     (its workspace, workflow, brief templates, fields, tags, roles) and the knowledge pages and roles it compares
     with to show their Indonesian text; the whole workspace (shared/demo-data.js) is a file of its own, read only by
     a page served without an API (a static host), which opens in demo mode. The standalone file carries it whole;
   - Poppins: served by the app (src/fonts.css, public/fonts/, the first weight preloaded) or the Google Fonts link. */
const ASSETS = [
  { mark: "__GOOGLE_DRIVE_LOGO_DATA__", src: ["google-drive-logo.webp"], type: "image/webp" },
  { mark: "__FLAG_EN_DATA__", src: ["flag-en.webp"], type: "image/webp" },
  { mark: "__ZEN_SOUND_DATA__", src: ["sounds", "zen-chime.mp3"], type: "audio/mpeg" }
].map(a => {
  const buf = fs.readFileSync(path.join(SRC, ...a.src)), base = path.basename(a.src[a.src.length - 1]), ext = path.extname(base);
  const name = base.slice(0, -ext.length) + "." + hashOf(buf) + ext;
  return Object.assign(a, { buf, name, url: "/assets/" + name, data: "data:" + a.type + ";base64," + buf.toString("base64") });
});
const FLAG_ID = "data:image/webp;base64," + fs.readFileSync(path.join(SRC, "flag-id.webp")).toString("base64");

const DEMO_SOURCE = lf(read(SHARED, "demo-data.js"));
const DEMO_FILE = { name: "demo-data." + hashOf(DEMO_SOURCE) + ".js", buf: Buffer.from(DEMO_SOURCE) };
const DEMO_SETTINGS = ["ws", "roles", "workflow", "briefTemplates", "customFields", "tags", "cloud", "knowledge"];
function demoScripts() {
  const D = require(path.join(SHARED, "demo-data.js")), some = {};
  DEMO_SETTINGS.forEach(k => { some[k] = D[k]; });
  return {
    standalone: "<script>\n" + DEMO_SOURCE + "\n</script>\n",
    served: "<script>var CREATIVE_OS_DEMO=" + JSON.stringify(some).replace(/<\//g, "<\\/") + ",CREATIVE_OS_DEMO_SRC=" + JSON.stringify("/assets/" + DEMO_FILE.name) + ";</script>\n"
  };
}
const FONT_MARK = /<!--zc-fonts\b[\s\S]*?-->/;
const FONTS = {
  standalone: '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">',
  served: '<link rel="preload" href="/fonts/poppins-v24-latin-400.woff2" as="font" type="font/woff2" crossorigin>\n<style>' + stripCss(lf(read(SRC, "fonts.css"))) + "</style>"
};

/* the code the server and the page share (UMD: window.GalleryModel, window.ScoringSettings, window.ScoringEngine, window.AiChatModels), before
   any src/ file. Smart Scoring's engine is taken as soon as shared/scoring-engine.js is there (docs/SMART-SCORING.md),
   before its settings, which read the engine's built-in kinds of work. shared/* goes in exactly as it is: the
   server runs the same files (tests/scoring-engine.test.js compares them byte for byte). */
function sharedCode() {
  return ["gallery-model.js", "scoring-engine.js", "scoring-settings.js", "ai-chat-models.js"].filter(f => f !== "scoring-engine.js" || fs.existsSync(path.join(SHARED, f)))
    .map(f => "<script>" + read(SHARED, f) + "</script>").join("");
}

/* The served page. src/ parts lose their comments (build-strip.js); shared/* and the demo data are not touched. */
function servedPage() {
  const demo = demoScripts();
  let html = "";
  parts.forEach(p => {
    let s = read(SRC, p);
    if (p === "head.html") s = s.replace("</style>", read(SRC, "refinements.css") + "\n" + read(SRC, "v18.css") + "\n" + read(SRC, "responsive.css") + "\n" + read(SRC, "v38.css") + "\n</style>");
    /* One line ending, whatever the checkout used. Sources come off disk as LF or CRLF depending on the
       machine and the editor, and the build copied each as it found it, so a rebuild after an unrelated
       edit rewrote thousands of lines of the output. */
    s = stripHtml(lf(s));
    if (p === "head.html") { if (!FONT_MARK.test(s)) throw new Error("src/head.html: the <!--zc-fonts --> mark is missing"); s = s.replace(FONT_MARK, () => FONTS.served); }
    if (p === "body.html") s += demo.served + lf(sharedCode());
    html += s;
  });
  ASSETS.forEach(a => { html = html.replaceAll(a.mark, a.url); });
  html = html.replaceAll("__FLAG_ID_DATA__", FLAG_ID);
  /* the page's version (Oct 2026): the server says which one it serves on every API reply, and a tab left open across
     an update offers to reload (src/new-version.js). The same sources give the same id. */
  const build = crypto.createHash("sha1").update(html).digest("hex").slice(0, 12);
  return html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="zc-build" content="' + build + '">');
}
/* The standalone file: the served page with what it fetches put inside it (see above). */
function standaloneFrom(served) {
  const demo = demoScripts();
  const swap = (s, from, to) => { const at = s.indexOf(from); if (at < 0 || s.indexOf(from, at + 1) >= 0) throw new Error("standalone: expected exactly one " + from.slice(0, 60)); return s.slice(0, at) + to + s.slice(at + from.length); };
  let html = swap(served, FONTS.served, FONTS.standalone);
  html = swap(html, demo.served, demo.standalone);
  ASSETS.forEach(a => { html = html.replaceAll(a.url, a.data); });
  return html;
}
/* public/assets/ is the build's: what this build does not write there goes */
function assetFiles() { return ASSETS.map(a => ({ name: a.name, buf: a.buf })).concat([DEMO_FILE]); }
/* every script of a page still compiles: what build-strip.js left out was only comments */
function compileAll(html, name) {
  const vm = require("vm");
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\btype\s*=/i.test(m[1]) && !/\btype\s*=\s*["']?(text\/javascript|module)\b/i.test(m[1])) continue;
    try { new vm.Script(m[2]); } catch (e) { throw new Error(name + ": a script no longer compiles (" + e.message + ") near: " + m[2].slice(0, 200)); }
  }
}
function write() {
  const served = servedPage(), standalone = standaloneFrom(served), dir = path.join(PUBLIC, "assets");
  compileAll(served, "public/index.html"); compileAll(standalone, "dist/creative-os-standalone.html");
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
  const files = assetFiles(), keep = new Set(files.map(f => f.name));
  fs.readdirSync(dir).forEach(f => { if (!keep.has(f)) fs.rmSync(path.join(dir, f), { force: true }); });
  files.forEach(f => { const p = path.join(dir, f.name); if (!fs.existsSync(p) || !fs.readFileSync(p).equals(f.buf)) fs.writeFileSync(p, f.buf); });
  fs.writeFileSync(path.join(PUBLIC, "index.html"), served);
  fs.writeFileSync(path.join(ROOT, "dist", "creative-os-standalone.html"), standalone);
  console.log("Built public/index.html (" + Math.round(served.length / 1024) + " KB) and dist/creative-os-standalone.html (" + Math.round(standalone.length / 1024) + " KB)");
}
module.exports = { parts, servedPage, standaloneFrom, assetFiles };
if (require.main === module) write();
