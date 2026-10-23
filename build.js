#!/usr/bin/env node
// Concatenates src/* into public/index.html and its files under public/assets/ (served by the API), and into dist/creative-os-standalone.html (works offline in demo mode).
const fs = require("fs"); const path = require("path"); const crypto = require("crypto");
const { stripHtml, stripCss } = require("./build-strip");
const i18n = require("./build-i18n");
const parts = ["head.html", "body.html", "core.js", "auth.js", "gdrive.js", "image-optimize.js", "dashboard.js", "tasks.js", "drawer.js", "projects.js", "teams.js", "assets.js", "knowledge.js", "ai.js", "ai-expand.js", "analytics.js", "ai-policy.js", "entity-picker.js", "brand-icons.js", "ai-chat-actions.js", "ai-brief.js", "brand-characters.js", "brand-fonts.js", "ai-templates.js", "ai-hub-layout.js", "notify-delivery.js", "emoji.js", "messages.js", "tag-picker.js", "settings.js", "ai-admin.js", "admin-ops.js", "import-snapshot.js", "report-template.js", "report-layout.js", "export.js", "i18n.js", "studio-editor.js", "canvas-controls.js", "canvas-sharpen.js", "font-families.js", "ai-layout-map.js", "multi-selection.js", "ai-gallery.js", "studio-actions.js", "canvas-navigation.js", "canvas-guides.js", "style-effects.js", "onboarding-refinements.js", "ai-properties.js", "enhance.js", "clipboard.js", "v29.js", "v33.js", "v34.js", "v35.js", "v38.js", "paste-image.js", "mobile.js", "comment-attach.js", "comment-mention.js", "link-tab.js", "version-preview.js", "link-chips.js", "assets-tab.js", "drive-deletion.js", "gdrive-shared.js", "legal-settings.js", "storage-settings.js", "gdrive-picker.js", "custom-emoji.js", "progress-note.js", "desc-links.js", "desc-emoji.js", "desc-format.js", "personal-theme.js", "task-draft.js", "similar-task.js", "effort-estimate.js", "ref-chips.js", "desc-literal.js", "signup-approval.js", "project-discussion.js", "announcements.js", "notif-choices.js", "settings-access.js", "cap-grants.js", "scoring-core.js", "scoring-settings.js", "scoring-assets.js", "scoring-panel.js", "scoring-awards.js", "scoring-time.js", "scoring-analytics.js", "scoring-teams.js", "scoring-outcomes.js", "scoring-kinds.js", "live-redraw.js", "view-memory.js", "list-columns.js", "new-version.js", "ai-chat-models.js", "pwa.js", "boot.js"];
/* the style sheets that follow src/head.html's own <style>, in this order */
const HEAD_CSS = ["refinements.css", "v18.css", "responsive.css", "v38.css"];
const ROOT = __dirname, SRC = path.join(ROOT, "src"), SHARED = path.join(ROOT, "shared"), PUBLIC = path.join(ROOT, "public");
const read = (...p) => fs.readFileSync(path.join(...p), "utf8");
const lf = s => s.replace(/\r\n/g, "\n");
const hashOf = buf => crypto.createHash("sha1").update(buf).digest("hex").slice(0, 10);

/* Two pages from the same sources (Oct 2026, performance stages 2 and 3). The served page (public/index.html) is the
   one a visit downloads, and the server sends everything else it needs as files of their own under /assets/, each
   named after its content (the server has the browser keep them a year: a new file is a new name); the standalone
   file (dist/creative-os-standalone.html) must open from a disk on its own, so it carries all of it inside. The
   standalone file is the served page with exactly these swaps (standaloneFrom), nothing else:
   - the code and the style sheet. The served page is a few KB of HTML: its <head> with the small script that asks
     for the session and the workspace at once, a <link> to /assets/app.<hash>.css (every style sheet of src/, in the
     page's order) and, where its scripts began, one <script src="/assets/app.<hash>.js"> (every script, in the
     page's order: the demo settings, shared/*, then src/*.js as parts lists them). A script of its own is what lets
     the browser keep the compiled code (V8's code cache) between visits, where 120 scripts inside the page were
     compiled again at every visit; one file keeps the order the modules wrap each other in (bundleScripts says what
     one script changes). The standalone file has them inside, as <style> and <script>;
   - the Indonesian dictionary (UI_ID, build-i18n.js): out of the code, in /assets/i18n-id.<hash>.json, asked for only
     when Indonesian is needed (src/core.js ZC_I18N); in the standalone file, inside (ZC_I18N_INLINE);
   - the Google Drive logo, the English flag and the notification chime: files under /assets/, or data: addresses.
     The Indonesian flag, 152 bytes, is inside both: a request of its own would cost more than it;
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
/* where the head's early script finds the dictionary (src/head.html) */
const I18N_MARK = "__I18N_ID_SRC__";

const DEMO_SOURCE = lf(read(SHARED, "demo-data.js"));
const DEMO_FILE = { name: "demo-data." + hashOf(DEMO_SOURCE) + ".js", buf: Buffer.from(DEMO_SOURCE) };
const DEMO_SETTINGS = ["ws", "roles", "workflow", "briefTemplates", "customFields", "tags", "cloud", "knowledge"];
function demoScripts() {
  const D = require(path.join(SHARED, "demo-data.js")), some = {};
  DEMO_SETTINGS.forEach(k => { some[k] = D[k]; });
  return {
    standalone: "\n" + DEMO_SOURCE + "\n",
    served: "var CREATIVE_OS_DEMO=" + JSON.stringify(some).replace(/<\//g, "<\\/") + ",CREATIVE_OS_DEMO_SRC=" + JSON.stringify("/assets/" + DEMO_FILE.name) + ";"
  };
}
const FONT_MARK = /<!--zc-fonts\b[\s\S]*?-->/;
const FONTS = {
  standalone: '<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin><link href="https://fonts.googleapis.com/css2?family=Poppins:wght@400;500;600;700;800&display=swap" rel="stylesheet">',
  served: '<link rel="preload" href="/fonts/poppins-v24-latin-400.woff2" as="font" type="font/woff2" crossorigin>\n<style>' + stripCss(lf(read(SRC, "fonts.css"))) + "</style>"
};

/* the code the server and the page share (UMD: window.GalleryModel, window.ScoringSettings, window.ScoringEngine, window.AiChatModels,
   window.LinkProviders), before
   any src/ file. Smart Scoring's engine is taken as soon as shared/scoring-engine.js is there (docs/SMART-SCORING.md),
   before its settings, which read the engine's built-in kinds of work. shared/* goes in exactly as it is: the
   server runs the same files (tests/scoring-engine.test.js compares them byte for byte). */
function sharedScripts() {
  return ["gallery-model.js", "scoring-engine.js", "scoring-settings.js", "ai-chat-models.js", "link-providers.js"].filter(f => f !== "scoring-engine.js" || fs.existsSync(path.join(SHARED, f)))
    .map(f => ({ file: "shared/" + f, code: lf(read(SHARED, f)) }));
}

/* The page as its sources give it, in the page's order: the head and the body's markup (HTML, which stays HTML),
   every style sheet and every script. src/ parts lose their comments (build-strip.js); shared/* and the demo data
   are not touched. Scripts inside head.html or body.html stay where they are (the head's early script); the parts
   after body.html are nothing but <script> and <style>, and the page's closing tags. */
const CSS_MARK = "<!--zc-css-->", JS_MARK = "<!--zc-js-->";
function pageSources() {
  const demo = demoScripts(), styles = [], scripts = [];
  let head = "", body = "", tail = "";
  parts.forEach(p => {
    /* One line ending, whatever the checkout used. Sources come off disk as LF or CRLF depending on the
       machine and the editor, and the build copied each as it found it, so a rebuild after an unrelated
       edit rewrote thousands of lines of the output. */
    let s = stripHtml(lf(read(SRC, p)));
    if (p === "head.html") {
      const css = s.match(/<style>([\s\S]*?)<\/style>/g) || [];
      if (css.length !== 1) throw new Error("src/head.html: expected one <style>, found " + css.length);
      styles.push({ file: "src/head.html", css: css[0].slice(7, -8) });
      HEAD_CSS.forEach(f => styles.push({ file: "src/" + f, css: stripCss(lf(read(SRC, f))) }));
      s = s.replace(css[0], () => CSS_MARK);
      if (!FONT_MARK.test(s)) throw new Error("src/head.html: the <!--zc-fonts --> mark is missing"); s = s.replace(FONT_MARK, () => FONTS.served);
      head = s; return;
    }
    if (p === "body.html") {
      body = s;
      scripts.push({ file: "demo settings", code: demo.served });
      sharedScripts().forEach(x => scripts.push(x));
      return;
    }
    if (tail.trim()) throw new Error("src/" + p + ": the page goes on after " + JSON.stringify(tail.trim().slice(0, 40)));
    tail = "";
    const re = /<(script|style)\b([^>]*)>([\s\S]*?)<\/\1>/gi; let at = 0, m;
    while ((m = re.exec(s))) {
      if (s.slice(at, m.index).trim()) throw new Error("src/" + p + ": HTML between its scripts, which the bundle cannot keep in place: " + s.slice(at, m.index).trim().slice(0, 60));
      if (m[2].trim()) throw new Error("src/" + p + ": a <" + m[1] + " " + m[2].trim() + "> the bundle cannot take");
      if (m[1].toLowerCase() === "style") styles.push({ file: "src/" + p, css: m[3] });
      else scripts.push({ file: "src/" + p, code: m[3] });
      at = re.lastIndex;
    }
    tail = s.slice(at);
  });
  return { head, body, tail, styles, scripts };
}
const marks = s => { ASSETS.forEach(a => { s = s.replaceAll(a.mark, a.url); }); return s.replaceAll("__FLAG_ID_DATA__", FLAG_ID); };
/* A NUL character written as itself (src/v38.js, in a regular expression) makes Git take the whole file for binary;
   \x00 is the same character in a string, a template or a regular expression, the only places it can be. */
const NUL = String.fromCharCode(0), BS = String.fromCharCode(92);
function escapeNul(code) {
  if (code.indexOf(NUL) < 0) return code;
  let out = "";
  for (let i = 0; i < code.length; i++) {
    if (code.charAt(i) !== NUL) { out += code.charAt(i); continue; }
    let n = 0; while (out.length - n - 1 >= 0 && out.charAt(out.length - n - 1) === BS) n++;
    out = (n % 2 ? out.slice(0, -1) : out) + BS + "x00";
  }
  return out;
}
/* The scripts as one: each as it was, in the same order, a ; between two so none runs into the next. What one script
   changes, against 120: a function declared at the top of one is there from the start of all (the three declared
   twice, tests/v37-code-health.test.js, are the later one's from the start; neither runs before both are there), a
   promise's then waits for the end of all rather than of its own, and an error at the top of one stops the rest.
   No file declares a let, const or class at its top (two would clash in one script), and none is "use strict". */
const SEP = file => "\n;/* " + file + " */\n";
function bundleScripts(list) { return list.map(x => SEP(x.file) + x.code).join("").slice(1) + "\n"; }
function bundleStyles(list) { return list.map(x => "/* " + x.file + " */\n" + x.css).join("\n") + "\n"; }

/* The served page and its files: { html, files: [{ name, buf }] } */
let SERVED = null;
function served() {
  if (SERVED) return SERVED;
  const src = pageSources();
  const shared = sharedScripts().map(x => x.code);
  const dict = i18n.extract(src.scripts.map(x => ({ file: x.file, code: x.code })), shared);
  const js = marks(bundleScripts(dict.blocks.map((b, k) => ({ file: b.file, code: /^src\//.test(b.file) ? escapeNul(b.code) : b.code }))));
  const css = marks(bundleStyles(src.styles));
  const name = (base, ext, text) => base + "." + hashOf(text) + ext;
  const files = { js: name("app", ".js", js), css: name("app", ".css", css), i18n: name("i18n-id", ".json", dict.json) };
  let html = marks(src.head).replace(CSS_MARK, () => '<link rel="stylesheet" href="/assets/' + files.css + '">').replaceAll(I18N_MARK, "/assets/" + files.i18n)
    + marks(src.body) + JS_MARK + src.tail;
  html = html.replace(JS_MARK, () => '<script src="/assets/' + files.js + '"></script>');
  /* the page's version (Oct 2026): the server says which one it serves on every API reply, and a tab left open across
     an update offers to reload (src/new-version.js). The same sources give the same id; the names of its files are
     in the page, so a change to any of them is a new id. */
  const build = crypto.createHash("sha1").update(html).digest("hex").slice(0, 12);
  html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="zc-build" content="' + build + '">');
  SERVED = { html, files: [{ name: files.js, buf: Buffer.from(js) }, { name: files.css, buf: Buffer.from(css) }, { name: files.i18n, buf: Buffer.from(dict.json) }], dict };
  return SERVED;
}
function servedPage() { return served().html; }
/* The standalone file: the served page with what it fetches put inside it (see above). asset(name) reads one of the
   served page's files (public/assets/ by default). */
function standaloneFrom(page, asset) {
  asset = asset || (n => fs.readFileSync(path.join(PUBLIC, "assets", n), "utf8"));
  const demo = demoScripts();
  const swap = (s, from, to) => { const at = s.indexOf(from); if (at < 0 || s.indexOf(from, at + 1) >= 0) throw new Error("standalone: expected exactly one " + from.slice(0, 60)); return s.slice(0, at) + to + s.slice(at + from.length); };
  const one = (re, what) => { const m = page.match(re); if (!m) throw new Error("standalone: the served page has no " + what); return m; };
  const css = one(/<link rel="stylesheet" href="\/assets\/(app\.[0-9a-f]{10}\.css)">/, "style sheet"), js = one(/<script src="\/assets\/(app\.[0-9a-f]{10}\.js)"><\/script>/, "script");
  const dict = one(/"\/assets\/(i18n-id\.[0-9a-f]{10}\.json)"/, "dictionary");
  const code = swap(asset(js[1]), demo.served, demo.standalone);
  if (/<\/script[\s/>]/i.test(code) || /<\/style[\s/>]/i.test(asset(css[1]))) throw new Error("standalone: a file that would end its element early inside the page");
  let html = swap(page, FONTS.served, FONTS.standalone);
  html = swap(html, css[0], "<style>" + asset(css[1]) + "</style>");
  html = swap(html, js[0], "<script>var ZC_I18N_INLINE=" + asset(dict[1]).replace(/<\//g, "<\\/") + ";</script>\n<script>" + code + "</script>");
  html = swap(html, dict[0], '""');
  ASSETS.forEach(a => { html = html.replaceAll(a.url, a.data); });
  return html;
}
/* public/assets/ is the build's: what this build does not write there goes (the server keeps the files of the builds
   it served for a while, server/delivery.js keepAssets, so a tab still open on one keeps working) */
function assetFiles() { return ASSETS.map(a => ({ name: a.name, buf: a.buf })).concat([DEMO_FILE], served().files); }
/* every script of a page still compiles: what build-strip.js left out was only comments */
function compileAll(html, name) {
  const vm = require("vm");
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    if (/\btype\s*=/i.test(m[1]) && !/\btype\s*=\s*["']?(text\/javascript|module)\b/i.test(m[1])) continue;
    try { new vm.Script(m[2]); } catch (e) { throw new Error(name + ": a script no longer compiles (" + e.message + ") near: " + m[2].slice(0, 200)); }
  }
}
/* One English text, one Indonesian wording (Oct 2026). Two UI_ID blocks that word the same English differently used to
   be settled silently, the page keeping one; now nothing is written while any is left. --i18n-conflicts lists them all. */
function checkI18n(dict, listAll) {
  const clash = i18n.conflicts(dict);
  if (listAll) clash.forEach(c => console.log(JSON.stringify(c.key) + " → " + JSON.stringify(c.kept) + "\n" + c.given.map(g => "    " + g.file + ": " + JSON.stringify(g.value)).join("\n")));
  if (clash.length) throw Object.assign(new Error(i18n.conflictMessage(clash)), { i18nConflicts: clash });
  if (listAll) console.log("No English text has two Indonesian wordings.");
}
function write() {
  const s = served(), byName = new Map(s.files.map(f => [f.name, f.buf.toString("utf8")]));
  checkI18n(s.dict, process.argv.includes("--i18n-conflicts"));
  const standalone = standaloneFrom(s.html, n => byName.get(n));
  compileAll(s.html, "public/index.html"); compileAll("<script>" + byName.get(s.files[0].name) + "</script>", "public/assets/" + s.files[0].name); compileAll(standalone, "dist/creative-os-standalone.html");
  const dir = path.join(PUBLIC, "assets");
  fs.mkdirSync(dir, { recursive: true }); fs.mkdirSync(path.join(ROOT, "dist"), { recursive: true });
  const files = assetFiles(), keep = new Set(files.map(f => f.name));
  fs.readdirSync(dir).forEach(f => { if (!keep.has(f)) fs.rmSync(path.join(dir, f), { force: true }); });
  files.forEach(f => { const p = path.join(dir, f.name); if (!fs.existsSync(p) || !fs.readFileSync(p).equals(f.buf)) fs.writeFileSync(p, f.buf); });
  fs.writeFileSync(path.join(PUBLIC, "index.html"), s.html);
  fs.writeFileSync(path.join(ROOT, "dist", "creative-os-standalone.html"), standalone);
  const kb = n => Math.round(n / 1024) + " KB", size = n => kb(s.files.find(f => f.name.startsWith(n)).buf.length);
  console.log("Built public/index.html (" + kb(s.html.length) + ", with app.js " + size("app.") + ", app.css " + kb(s.files[1].buf.length) + ", the Indonesian dictionary " + size("i18n-id.") + ": " + Object.keys(s.dict.dict).length + " words from " + s.dict.statements + " blocks) and dist/creative-os-standalone.html (" + kb(standalone.length) + ")");
}
module.exports = { parts, servedPage, served, standaloneFrom, assetFiles, pageSources, checkI18n };
if (require.main === module) {
  try { write(); } catch (e) { if (!e || !e.i18nConflicts) throw e; console.error(e.message); process.exitCode = 1; }
}
