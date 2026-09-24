#!/usr/bin/env node
// Concatenates src/* into public/index.html (served by the API) and dist/creative-os-standalone.html (works offline in demo mode).
const fs = require("fs"); const path = require("path");
const parts = ["head.html", "body.html", "core.js", "auth.js", "gdrive.js", "dashboard.js", "tasks.js", "drawer.js", "projects.js", "teams.js", "assets.js", "knowledge.js", "ai.js", "analytics.js", "ai-policy.js", "entity-picker.js", "ai-brief.js", "notify-delivery.js", "emoji.js", "messages.js", "tag-picker.js", "settings.js", "ai-admin.js", "admin-ops.js", "report-template.js", "report-layout.js", "export.js", "i18n.js", "studio-editor.js", "canvas-controls.js", "multi-selection.js", "ai-gallery.js", "studio-actions.js", "canvas-navigation.js", "canvas-guides.js", "style-effects.js", "onboarding-refinements.js", "ai-properties.js", "enhance.js", "clipboard.js", "v29.js", "v33.js", "v34.js", "v35.js", "v38.js", "gdrive-picker.js", "boot.js"];
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
fs.writeFileSync(path.join(__dirname, "public", "index.html"), html);
fs.writeFileSync(path.join(__dirname, "dist", "creative-os-standalone.html"), html);
console.log("Built public/index.html (" + Math.round(html.length / 1024) + " KB)");
