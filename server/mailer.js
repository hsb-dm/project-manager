// Email delivery for notifications — zero dependencies.
// Transports (env COS_MAIL_TRANSPORT): "log" (default: writes .eml files to data/outbox — safe for demos),
// "smtp" (raw SMTP over STARTTLS/TLS using node:net + node:tls: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_SECURE=1 for implicit TLS),
// "resend" (HTTPS JSON API: RESEND_API_KEY). MAIL_FROM sets the sender, APP_URL builds links.
const fs = require("fs");
const path = require("path");
const net = require("net");
const tls = require("tls");

const cfg = {
  transport: process.env.COS_MAIL_TRANSPORT || "log",
  from: process.env.MAIL_FROM || "ZenCrevia <no-reply@zencrevia.local>",
  replyTo: process.env.MAIL_REPLY_TO || "",
  appUrl: process.env.APP_URL || "http://localhost:" + (process.env.PORT || 3000),
  smtp: { host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587), user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, secure: process.env.SMTP_SECURE === "1" },
  resendKey: process.env.RESEND_API_KEY,
  outbox: path.join(process.env.COS_DATA_DIR || path.join(__dirname, "..", "data"), "outbox"),
};
const state = { sent: 0, failed: 0, lastError: null, lastTo: null, lastAt: null };

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

/* ---- how every email looks and is put together ----
   Outlook on Windows draws email with Word: no flex, no gap, no padding on a link, no max-width on a div,
   and it shows no data: image (Gmail drops those too). So the layout is tables with inline styles, the
   button is a table cell, and the workspace logo travels inside the message as an inline part (cid:).
   For spam filters: text parts are quoted-printable (base64 text is a known spam signal), the plain-text
   part says what the HTML says, the Message-ID carries the sender's own domain, the client greets the
   server with a real name, and Reply-To is set when one is configured. Delivery to Outlook still rests
   mostly on the sender domain's SPF, DKIM and DMARC — no layout makes up for those. */
let brandOf = () => ({});
/* The server hands over how to read the workspace's name, logo and accent colour (the dashboard's). */
function setBrand(fn) { brandOf = typeof fn === "function" ? fn : () => ({}); }
function brand(m) {
  let b = {}; try { b = brandOf() || {}; } catch {}
  const name = String(m.workspace || b.name || "ZenCrevia");
  const accent = /^#[0-9a-f]{6}$/i.test(b.accent || "") ? b.accent : "#2F5BFF";
  const [r, g, bl] = [1, 3, 5].map(i => parseInt(accent.substr(i, 2), 16));
  return { name, accent, ink: 0.299 * r + 0.587 * g + 0.114 * bl > 170 ? "#111214" : "#FFFFFF",
           initials: String(b.logo || name.split(/\s+/).map(w => w[0] || "").join("").slice(0, 2) || "Z").slice(0, 3).toUpperCase(), logoImg: b.logoImg };
}
/* The logo as an image part: PNG, JPEG or GIF only (no mail client shows SVG; Outlook shows no WebP), and
   small enough to ride along with every message. Anything else falls back to the initials badge. */
function logoPart(img) {
  const m = /^data:image\/(png|jpe?g|gif);base64,([A-Za-z0-9+/=\s]+)$/i.exec(String(img || ""));
  if (!m) return null;
  const data = Buffer.from(m[2].replace(/\s+/g, ""), "base64"), kind = m[1].toLowerCase() === "png" ? "png" : m[1].toLowerCase() === "gif" ? "gif" : "jpeg";
  if (data.length < 24 || data.length > 300000) return null;
  let w = 0, h = 0;
  if (kind === "png") { w = data.readUInt32BE(16); h = data.readUInt32BE(20); }
  else if (kind === "gif") { w = data.readUInt16LE(6); h = data.readUInt16LE(8); }
  else for (let i = 2; i + 9 < data.length;) { if (data[i] !== 0xFF) break; const mk = data[i + 1], len = data.readUInt16BE(i + 2); if (mk >= 0xC0 && mk <= 0xCF && ![0xC4, 0xC8, 0xCC].includes(mk)) { h = data.readUInt16BE(i + 5); w = data.readUInt16BE(i + 7); break; } i += 2 + len; }
  const height = 40, width = w > 0 && h > 0 ? Math.max(16, Math.min(160, Math.round(height * w / h))) : 40;
  return { type: "image/" + kind, ext: kind === "jpeg" ? "jpg" : kind, data, width, height };
}
const FONT = "Inter,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
/* The heading drops the "[Workspace] " the subject starts with: the workspace already heads the email. */
const heading = (m, name) => String(m.subject || "").replace(new RegExp("^\\[" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "\\]\\s*"), "");
const DEFAULT_FOOTER = "You receive this because you are involved in this work. Change email preferences in Settings → Notifications.";
function render(m, cid) {
  const b = brand(m), logo = cid ? logoPart(b.logoImg) : null, title = heading(m, b.name), footer = m.footer || DEFAULT_FOOTER, cta = m.cta || "Open in ZenCrevia";
  const meta = m.meta && Object.keys(m.meta).length ? Object.entries(m.meta) : [];
  const mark = logo
    ? (logo.width === logo.height
        ? `<td width="40" height="40" bgcolor="${b.accent}" style="width:40px;height:40px;background:${b.accent};border-radius:11px"><img src="cid:${cid}" width="40" height="40" alt="${esc(b.name)}" style="display:block;width:40px;height:40px;border:0;border-radius:11px"></td>`
        : `<td style="height:40px"><img src="cid:${cid}" width="${logo.width}" height="${logo.height}" alt="${esc(b.name)}" style="display:block;width:${logo.width}px;height:${logo.height}px;border:0"></td>`)
    : `<td width="40" height="40" align="center" valign="middle" bgcolor="${b.accent}" style="width:40px;height:40px;background:${b.accent};border-radius:11px;color:${b.ink};font-family:${FONT};font-size:14px;font-weight:800;letter-spacing:-.02em;text-align:center">${esc(b.initials)}</td>`;
  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${esc(m.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript>
<style>table,td,h1,p,a,span{font-family:'Segoe UI',Arial,sans-serif !important}</style><![endif]-->
</head>
<body style="margin:0;padding:0;background:#F3F4F6;color:#111214">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="#F3F4F6" style="background:#F3F4F6">
<tr><td align="center" style="padding:24px 12px">
<!--[if mso]><table role="presentation" width="560" align="center" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px">
<tr><td bgcolor="#FFFFFF" style="background:#FFFFFF;border:1px solid #E6E8EC;border-radius:16px;padding:28px 28px 26px">
<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr>${mark}<td style="padding-left:12px;font-family:${FONT};font-size:16px;font-weight:700;color:#111214;letter-spacing:-.01em">${esc(b.name)}</td></tr></table>
<h1 style="margin:22px 0 10px;font-family:${FONT};font-size:20px;line-height:1.3;font-weight:700;color:#111214;letter-spacing:-.02em">${esc(title)}</h1>
<p style="margin:0 0 20px;font-family:${FONT};font-size:15px;line-height:1.55;color:#111214">${esc(m.text).replace(/\n/g, "<br>")}</p>
${meta.length ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 22px">${meta.map(([k, v]) => `<tr><td style="padding:3px 16px 3px 0;font-family:${FONT};font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:#6B7280;white-space:nowrap">${esc(k)}</td><td style="padding:3px 0;font-family:${FONT};font-size:13px;color:#111214">${esc(v)}</td></tr>`).join("")}</table>\n` : ""}<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${b.accent}" style="background:${b.accent};border-radius:999px"><a href="${esc(m.link)}" target="_blank" style="display:inline-block;padding:11px 22px;font-family:${FONT};font-size:14px;font-weight:600;line-height:1.2;color:${b.ink};text-decoration:none;border-radius:999px">${esc(cta)}</a></td></tr></table>
</td></tr>
<tr><td style="padding:16px 28px 0;font-family:${FONT};font-size:11px;line-height:1.5;color:#9CA3AF">${esc(footer)}<br><span style="font-weight:600;color:#6B7280">ZenCrevia</span></td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr>
</table>
</body>
</html>`;
  const text = `${b.name}\n\n${title}\n\n${m.text}\n\n${meta.length ? meta.map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\n" : ""}${cta}: ${m.link}\n\n${footer}\nZenCrevia\n`;
  return { html, text, logo };
}
/* quoted-printable (RFC 2045): lines of at most 76 characters, "=" ending a line that continues. */
function qp(str) {
  return String(str).replace(/\r\n|\r/g, "\n").split("\n").map(line => {
    const bytes = Buffer.from(line, "utf8"); let out = "", cur = "";
    for (let i = 0; i < bytes.length; i++) {
      const c = bytes[i], plain = (c >= 33 && c <= 126 && c !== 61) || ((c === 32 || c === 9) && i < bytes.length - 1);
      const tok = plain ? String.fromCharCode(c) : "=" + c.toString(16).toUpperCase().padStart(2, "0");
      if (cur.length + tok.length > 75) { out += cur + "=\r\n"; cur = ""; }
      cur += tok;
    }
    return out + cur;
  }).join("\r\n");
}
const oneLine = s => String(s == null ? "" : s).replace(/[\r\n]+/g, " ").trim();
/* A header value as plain text when it is plain ASCII, else RFC 2047 encoded words of at most 75 characters. */
function headerText(s) {
  s = oneLine(s);
  if (/^[\x20-\x7e]*$/.test(s) && !s.includes("=?")) return s;
  const parts = []; let cur = "";
  for (const ch of s) { if (Buffer.byteLength(cur + ch) > 45) { parts.push(cur); cur = ""; } cur += ch; }
  if (cur) parts.push(cur);
  return parts.map(p => "=?UTF-8?B?" + Buffer.from(p).toString("base64") + "?=").join("\r\n ");
}
/* "Name <a@b.c>" with the name quoted (or encoded), so a comma or accent in a workspace name stays one address. */
function addressHeader(v) {
  const m = /^(.*?)\s*<([^<>\s]+@[^<>\s]+)>$/.exec(oneLine(v));
  if (!m) return oneLine(v);
  const name = m[1].replace(/^"(.*)"$/, "$1").trim();
  if (!name) return m[2];
  return (/^[\x20-\x7e]*$/.test(name) ? '"' + name.replace(/[\\"]/g, "\\$&") + '"' : headerText(name)) + " <" + m[2] + ">";
}
const fromAddress = () => (oneLine(cfg.from).match(/<([^>]+)>/) || [null, oneLine(cfg.from)])[1];
const FQDN = /^(?=.{4,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;
function senderDomain() {
  const d = String(fromAddress().split("@")[1] || "").toLowerCase();
  if (FQDN.test(d)) return d;
  try { const h = new URL(cfg.appUrl).hostname; if (FQDN.test(h)) return h; } catch {}
  return "zencrevia.local";
}
/* The name this client greets an SMTP server with: the app's own host name, or an address literal —
   a bare word like "zencrevia" in EHLO is a spam signal. */
function heloName() { try { const h = new URL(cfg.appUrl).hostname; if (FQDN.test(h)) return h; } catch {} return "[127.0.0.1]"; }
const EMAIL = /^[^@\s<>"]+@[^@\s<>"]+\.[^@\s<>"]+$/;
function mime(m) {
  const id = Date.now().toString(36) + "." + require("crypto").randomBytes(8).toString("hex"), domain = senderDomain(), cid = "logo." + id + "@" + domain;
  const { html, text, logo } = render(m, cid), alt = "alt-" + id, rel = "rel-" + id, replyTo = oneLine(cfg.replyTo);
  const head = [
    "From: " + addressHeader(cfg.from), "To: " + oneLine(m.to), EMAIL.test(replyTo) ? "Reply-To: " + replyTo : null,
    "Subject: " + headerText(m.subject), "Date: " + new Date().toUTCString().replace(/GMT$/, "+0000"), "Message-ID: <" + id + "@" + domain + ">",
    "MIME-Version: 1.0", "Auto-Submitted: auto-generated", "X-Auto-Response-Suppress: OOF, AutoReply",
    `Content-Type: multipart/alternative; boundary="${alt}"`
  ].filter(Boolean);
  const htmlPart = ["Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: quoted-printable", "", qp(html)];
  const body = ["", `--${alt}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: quoted-printable", "", qp(text), `--${alt}`];
  if (logo) body.push(`Content-Type: multipart/related; type="text/html";`, ` boundary="${rel}"`, "", `--${rel}`, ...htmlPart, `--${rel}`,
    `Content-Type: ${logo.type}; name="logo.${logo.ext}"`, "Content-Transfer-Encoding: base64", `Content-ID: <${cid}>`, `Content-Disposition: inline; filename="logo.${logo.ext}"`, "",
    logo.data.toString("base64").replace(/(.{76})(?!$)/g, "$1\r\n"), `--${rel}--`);
  else body.push(...htmlPart);
  body.push(`--${alt}--`, "");
  return head.concat(body).join("\r\n");
}

/* --- transports --- */
/* v29: the log transport keeps COS_OUTBOX_DAYS (default 14) days and at most
   COS_OUTBOX_MAX (default 1000) messages, so a server without SMTP does not fill its disk. */
let outboxWrites = 0;
function pruneOutbox() {
  if (++outboxWrites % 20 !== 1) return;
  try {
    const days = Math.max(1, +(process.env.COS_OUTBOX_DAYS || 14)), max = Math.max(50, +(process.env.COS_OUTBOX_MAX || 1000)), cut = Date.now() - days * 86400000;
    const files = fs.readdirSync(cfg.outbox).filter(n => n.endsWith(".eml")).map(n => { const f = path.join(cfg.outbox, n); return { f, t: fs.statSync(f).mtimeMs }; }).sort((a, b) => b.t - a.t);
    files.forEach((x, i) => { if (i >= max || x.t < cut) { try { fs.rmSync(x.f, { force: true }); } catch {} } });
  } catch {}
}
function sendLog(m) { fs.mkdirSync(cfg.outbox, { recursive: true }); const file = path.join(cfg.outbox, new Date().toISOString().replace(/[:.]/g, "-") + "-" + m.to.replace(/[^a-z0-9@.]/gi, "_") + "-" + require("crypto").randomBytes(3).toString("hex") + ".eml"); /* v30: two mails in one millisecond no longer overwrite each other */ fs.writeFileSync(file, mime(m), { mode: 0o600 }); pruneOutbox(); console.log("[mail:log] → " + m.to + " · " + m.subject + "  (" + path.relative(process.cwd(), file) + ")"); return Promise.resolve({ file }); }
/* Google shows an App Password in four groups of four ("abcd efgh ijkl mnop"). Pasted like that, the spaces went to
   Gmail as part of the password and it answered "535 Username and Password not accepted". For a Gmail host, a
   password that is exactly such an App Password is sent as its 16 letters; any other password is sent as typed. */
const smtpPass = (host, pass) => { const p = String(pass == null ? "" : pass); return /(^|\.)(gmail|googlemail)\.com$/i.test(String(host || "").trim()) && /^[a-z]{4}(\s?[a-z]{4}){3}$/i.test(p.trim()) ? p.replace(/\s+/g, "") : p; };
const plainAuthOk = host => process.env.COS_SMTP_ALLOW_PLAINTEXT_AUTH === "1" || /^(localhost|127\.\d+\.\d+\.\d+|::1)$/i.test(String(host || ""));
function sendSmtp(m) {
  const s = Object.assign({}, cfg.smtp, { pass: smtpPass(cfg.smtp.host, cfg.smtp.pass) }); if (!s.host) return Promise.reject(new Error("SMTP_HOST not set"));
  return new Promise((resolve, reject) => {
    let sock = s.secure ? tls.connect({ host: s.host, port: s.port, servername: s.host }) : net.connect({ host: s.host, port: s.port });
    let buf = "", queue = [], done = false; const fromAddr = (cfg.from.match(/<([^>]+)>/) || [null, cfg.from])[1];
    const fail = (e) => { if (!done) { done = true; try { sock.destroy(); } catch {} reject(e); } };
    const wait = () => new Promise((res, rej) => queue.push({ res, rej }));
    const cmd = (line) => { sock.write(line + "\r\n"); return wait(); };
    const onData = (d) => { buf += d.toString(); let lines = buf.split("\r\n"); buf = lines.pop(); let resp = []; for (const l of lines) { resp.push(l); if (/^\d{3} /.test(l)) { const q = queue.shift(); const code = +l.slice(0, 3); if (q) code >= 400 ? q.rej(new Error(resp.join(" | "))) : q.res({ code, lines: resp }); resp = []; } } };
    sock.on("data", onData); sock.on("error", fail); sock.setTimeout(20000, () => fail(new Error("SMTP timeout")));
    (async () => {
      await wait(); // greeting
      let r = await cmd("EHLO " + heloName());
      if (!s.secure && r.lines.some(l => /STARTTLS/i.test(l))) { await cmd("STARTTLS"); sock.removeListener("data", onData); sock = tls.connect({ socket: sock, servername: s.host }); sock.on("data", onData); sock.on("error", fail); await new Promise(res => sock.once("secureConnect", res)); r = await cmd("EHLO " + heloName()); }
      /* v36: never send the SMTP password in clear text. If the server did not offer STARTTLS
         (or an attacker stripped it) and this is not implicit TLS, stop before AUTH. A relay on
         this machine (localhost) is allowed; COS_SMTP_ALLOW_PLAINTEXT_AUTH=1 overrides. */
      if (s.user && !s.secure && !sock.encrypted && !plainAuthOk(s.host)) throw new Error("SMTP server did not offer STARTTLS; refusing to send the password unencrypted. Use port 465 with SMTP_SECURE=1, or a server that supports STARTTLS.");
      if (s.user) { if (r.lines.some(l => /AUTH.*PLAIN/i.test(l))) await cmd("AUTH PLAIN " + Buffer.from("\0" + s.user + "\0" + s.pass).toString("base64")); else { await cmd("AUTH LOGIN"); await cmd(Buffer.from(s.user).toString("base64")); await cmd(Buffer.from(s.pass).toString("base64")); } }
      await cmd("MAIL FROM:<" + fromAddr + ">"); await cmd("RCPT TO:<" + m.to + ">"); await cmd("DATA"); await cmd(mime(m).replace(/\r\n\./g, "\r\n..") + "\r\n."); await cmd("QUIT").catch(() => {});
      done = true; sock.end(); resolve({ ok: true });
    })().catch(fail);
  });
}
function sendResend(m) { if (!cfg.resendKey) return Promise.reject(new Error("RESEND_API_KEY not set")); const { html, text } = render(m); return fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + cfg.resendKey, "Content-Type": "application/json" }, body: JSON.stringify(Object.assign({ from: cfg.from, to: [m.to], subject: oneLine(m.subject), html, text }, EMAIL.test(oneLine(cfg.replyTo)) ? { reply_to: oneLine(cfg.replyTo) } : {})) }).then(async r => { if (!r.ok) throw new Error("Resend " + r.status + ": " + (await r.text()).slice(0, 200)); return r.json(); }); }

/* ============================================================
   v17 §P1-4 — SMTP configured from the Admin dashboard.
   Environment variables remain a valid way to configure delivery, but they are
   now only the FALLBACK: a configuration saved in Settings → Notifications &
   Email → SMTP takes precedence, so an admin never has to touch the server.
   The password is stored encrypted and is never returned to a client.
   ============================================================ */
const PROVIDER_PRESETS = {
  gmail:     { label: "Google Workspace / Gmail", host: "smtp.gmail.com",          port: 587, secure: false, note: "Use a Google App Password, not the account password." },
  microsoft: { label: "Microsoft 365",            host: "smtp.office365.com",      port: 587, secure: false, note: "The mailbox must allow SMTP AUTH." },
  ses:       { label: "Amazon SES",               host: "email-smtp.us-east-1.amazonaws.com", port: 587, secure: false, note: "Use SES SMTP credentials, not your AWS keys. Match the region in the host." },
  sendgrid:  { label: "SendGrid SMTP",            host: "smtp.sendgrid.net",       port: 587, secure: false, note: "The username is literally 'apikey'." },
  mailgun:   { label: "Mailgun SMTP",             host: "smtp.mailgun.org",        port: 587, secure: false, note: "Use the SMTP credentials from your sending domain." },
  zoho:      { label: "Zoho",                     host: "smtp.zoho.com",           port: 587, secure: false, note: "Enable IMAP/SMTP access in the Zoho admin console." },
  custom:    { label: "Custom SMTP",              host: "",                        port: 587, secure: false, note: "" }
};
/* The live configuration a send should use. `override` is the DB-stored config,
   injected by the server; when absent we fall back to the environment. */
let dbConfig = null;
/* v38.1 staging: a copy of the live database also carries the live SMTP settings. With
   COS_MAIL_FORCE_LOG=1 nothing is ever delivered; every email goes to the outbox folder. */
const FORCE_LOG = process.env.COS_MAIL_FORCE_LOG === "1";
if (FORCE_LOG) cfg.transport = "log";
function setStoredConfig(c) { dbConfig = !FORCE_LOG && c && c.enabled ? c : null; }
function activeConfig() {
  if (dbConfig && dbConfig.host) {
    return {
      transport: "smtp",
      from: dbConfig.fromName ? dbConfig.fromName + " <" + dbConfig.fromEmail + ">" : dbConfig.fromEmail,
      replyTo: dbConfig.replyTo || "",
      smtp: { host: dbConfig.host, port: +dbConfig.port || 587, user: dbConfig.user, pass: dbConfig.pass, secure: !!dbConfig.secure },
      source: "dashboard"
    };
  }
  return { transport: cfg.transport, from: cfg.from, replyTo: cfg.replyTo, smtp: cfg.smtp, source: "environment" };
}
/* Deliver using an explicit configuration rather than the module globals, so a
   "Send test email" can exercise unsaved settings before they are committed. */
function sendWith(conf, m) {
  if (FORCE_LOG) conf = Object.assign({}, conf, { transport: "log" });
  const saved = { transport: cfg.transport, from: cfg.from, replyTo: cfg.replyTo, smtp: cfg.smtp };
  cfg.transport = conf.transport; cfg.from = conf.from; cfg.replyTo = conf.replyTo || ""; cfg.smtp = conf.smtp;
  const fn = conf.transport === "smtp" ? sendSmtp : conf.transport === "resend" ? sendResend : sendLog;
  const restore = () => { cfg.transport = saved.transport; cfg.from = saved.from; cfg.replyTo = saved.replyTo; cfg.smtp = saved.smtp; };
  return Promise.resolve().then(() => fn(m)).then(r => { restore(); return r; }, e => { restore(); throw e; });
}
/* §P1-4 "Test connection" — reach the server, negotiate TLS and authenticate,
   without sending anything. This is what makes the guided flow trustworthy. */
function verifySmtp(s) {
  return new Promise((resolve, reject) => {
    if (!s || !s.host) return reject(new Error("Enter an SMTP host first"));
    s = Object.assign({}, s, { pass: smtpPass(s.host, s.pass) });
    const port = +s.port || 587;
    let sock = s.secure ? tls.connect({ host: s.host, port, servername: s.host }) : net.connect({ host: s.host, port });
    let buf = "", queue = [], done = false, caps = [];
    const fail = (e) => { if (!done) { done = true; try { sock.destroy(); } catch {} reject(e); } };
    const wait = () => new Promise((res, rej) => queue.push({ res, rej }));
    const cmd = (line) => { sock.write(line + "\r\n"); return wait(); };
    const onData = (d) => { buf += d.toString(); let lines = buf.split("\r\n"); buf = lines.pop(); let resp = []; for (const l of lines) { resp.push(l); if (/^\d{3} /.test(l)) { const q = queue.shift(); const code = +l.slice(0, 3); if (q) code >= 400 ? q.rej(new Error(resp.join(" | "))) : q.res({ code, lines: resp }); resp = []; } } };
    sock.on("data", onData); sock.on("error", fail);
    sock.setTimeout(15000, () => fail(new Error("The server did not respond within 15 seconds — check the host, port and firewall.")));
    (async () => {
      await wait();
      let r = await cmd("EHLO " + heloName()); caps = r.lines;
      let starttls = false;
      if (!s.secure && r.lines.some(l => /STARTTLS/i.test(l))) {
        starttls = true;
        await cmd("STARTTLS"); sock.removeListener("data", onData);
        sock = tls.connect({ socket: sock, servername: s.host }); sock.on("data", onData); sock.on("error", fail);
        await new Promise(res => sock.once("secureConnect", res));
        r = await cmd("EHLO " + heloName()); caps = r.lines;
      }
      let authenticated = false;
      if (s.user && !s.secure && !starttls && !plainAuthOk(s.host)) throw new Error("SMTP server did not offer STARTTLS; refusing to send the password unencrypted. Use port 465 with SMTP_SECURE=1, or a server that supports STARTTLS.");
      if (s.user) {
        if (r.lines.some(l => /AUTH.*PLAIN/i.test(l))) await cmd("AUTH PLAIN " + Buffer.from("\0" + s.user + "\0" + s.pass).toString("base64"));
        else { await cmd("AUTH LOGIN"); await cmd(Buffer.from(s.user).toString("base64")); await cmd(Buffer.from(s.pass).toString("base64")); }
        authenticated = true;
      }
      await cmd("QUIT").catch(() => {});
      done = true; sock.end();
      resolve({ ok: true, encryption: s.secure ? "implicit TLS" : starttls ? "STARTTLS" : "none", authenticated, capabilities: caps.slice(0, 12) });
    })().catch(fail);
  });
}

function send(m) {
  const conf = activeConfig();
  return sendWith(conf, m)
    .then(r => { state.sent++; state.lastTo = m.to; state.lastAt = new Date().toISOString(); state.lastError = null; return r; })
    .catch(e => { state.failed++; state.lastError = e.message; state.lastTo = m.to; state.lastAt = new Date().toISOString(); throw e; });
}
module.exports = { setBrand, smtpPass, send, sendWith, verifySmtp, setStoredConfig, activeConfig, PROVIDER_PRESETS, cfg, state, link: (p) => cfg.appUrl.replace(/\/$/, "") + p };
