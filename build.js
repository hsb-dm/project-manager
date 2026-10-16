#!/usr/bin/env node
// Concatenates src/* into public/index.html (served by the API) and dist/creative-os-standalone.html (works offline in demo mode).
const fs = require("fs"); const path = require("path");
const parts = ["head.html", "body.html", "core.js", "auth.js", "gdrive.js", "image-optimize.js", "dashboard.js", "tasks.js", "drawer.js", "projects.js", "teams.js", "assets.js", "knowledge.js", "ai.js", "ai-expand.js", "analytics.js", "ai-policy.js", "entity-picker.js", "brand-icons.js", "ai-chat-actions.js", "ai-brief.js", "brand-characters.js", "brand-fonts.js", "ai-templates.js", "ai-hub-layout.js", "notify-delivery.js", "emoji.js", "messages.js", "tag-picker.js", "settings.js", "ai-admin.js", "admin-ops.js", "import-snapshot.js", "report-template.js", "report-layout.js", "export.js", "i18n.js", "studio-editor.js", "canvas-controls.js", "canvas-sharpen.js", "font-families.js", "multi-selection.js", "ai-gallery.js", "studio-actions.js", "canvas-navigation.js", "canvas-guides.js", "style-effects.js", "onboarding-refinements.js", "ai-properties.js", "enhance.js", "clipboard.js", "v29.js", "v33.js", "v34.js", "v35.js", "v38.js", "paste-image.js", "mobile.js", "comment-attach.js", "comment-mention.js", "link-tab.js", "version-preview.js", "link-chips.js", "assets-tab.js", "drive-deletion.js", "gdrive-shared.js", "legal-settings.js", "storage-settings.js", "gdrive-picker.js", "custom-emoji.js", "progress-note.js", "desc-links.js", "personal-theme.js", "task-draft.js", "similar-task.js", "effort-estimate.js", "ref-chips.js", "signup-approval.js", "project-discussion.js", "announcements.js", "notif-choices.js", "settings-access.js", "cap-grants.js", "live-redraw.js", "view-memory.js", "new-version.js", "pwa.js", "boot.js"];
const demo = "<script>\n" + fs.readFileSync(path.join(__dirname, "shared", "demo-data.js"), "utf8") + "\n</script>\n";
let html = ""; parts.forEach(p => { let s = fs.readFileSync(path.join(__dirname, "src", p), "utf8"); if (p === "head.html") s = s.replace("</style>", fs.readFileSync(path.join(__dirname,"src","refinements.css"),"utf8") + "\n" + fs.readFileSync(path.join(__dirname,"src","v18.css"),"utf8") + "\n" + fs.readFileSync(path.join(__dirname,"src","responsive.css"),"utf8") + "\n" + fs.readFileSync(path.join(__dirname,"src","v38.css"),"utf8") + "\n</style>"); if (p === "body.html") s += demo + "<script>" + fs.readFileSync(path.join(__dirname,"shared","gallery-model.js"),"utf8") + "</script>"; html += s; });
const driveLogo = "data:image/webp;base64," + fs.readFileSync(path.join(__dirname, "src", "google-drive-logo.webp")).toString("base64");
const flagEn = "data:image/webp;base64," + fs.readFileSync(path.join(__dirname, "src", "flag-en.webp")).toString("base64");
const flagId = "data:image/webp;base64," + fs.readFileSync(path.join(__dirname, "src", "flag-id.webp")).toString("base64");
html = html.replaceAll("__GOOGLE_DRIVE_LOGO_DATA__", driveLogo);
html = html.replaceAll("__FLAG_EN_DATA__", flagEn).replaceAll("__FLAG_ID_DATA__", flagId);
/* v18 §21–23 the ONE ZenCrevia notification sound, inlined so the standalone demo and the served app play the same file. */
const zenSound = "data:audio/mpeg;base64," + fs.readFileSync(path.join(__dirname, "src", "sounds", "zen-chime.mp3")).toString("base64");
html = html.replaceAll("__ZEN_SOUND_DATA__", zenSound);
fs.mkdirSync(path.join(__dirname, "public"), { recursive: true }); fs.mkdirSync(path.join(__dirname, "dist"), { recursive: true });
/* One line ending, whatever the checkout used. Sources come off disk as LF or CRLF depending on the
   machine and the editor, and the build copied each as it found it, so a rebuild after an unrelated
   edit rewrote thousands of lines of the output. */
html = html.replace(/\r\n/g, "\n");
/* the page's version (Oct 2026): the server says which one it serves on every API reply, and a tab left open across
   an update offers to reload (src/new-version.js). The same sources give the same id. */
const build = require("crypto").createHash("sha1").update(html).digest("hex").slice(0, 12);
html = html.replace('<meta charset="UTF-8">', '<meta charset="UTF-8">\n<meta name="zc-build" content="' + build + '">');
fs.writeFileSync(path.join(__dirname, "public", "index.html"), html);
fs.writeFileSync(path.join(__dirname, "dist", "creative-os-standalone.html"), html);
console.log("Built public/index.html (" + Math.round(html.length / 1024) + " KB)");
