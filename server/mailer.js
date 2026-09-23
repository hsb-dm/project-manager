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
  appUrl: process.env.APP_URL || "http://localhost:" + (process.env.PORT || 3000),
  smtp: { host: process.env.SMTP_HOST, port: +(process.env.SMTP_PORT || 587), user: process.env.SMTP_USER, pass: process.env.SMTP_PASS, secure: process.env.SMTP_SECURE === "1" },
  resendKey: process.env.RESEND_API_KEY,
  outbox: path.join(process.env.COS_DATA_DIR || path.join(__dirname, "..", "data"), "outbox"),
};
const state = { sent: 0, failed: 0, lastError: null, lastTo: null, lastAt: null };

const esc = (s) => String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
function render(m) {
  const html = `<!doctype html><html><body style="margin:0;background:#EEF0F3;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#111214">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:20px;padding:28px 32px;border:1px solid #E6E8EC">
<div style="display:flex;align-items:center;gap:10px;margin-bottom:18px"><span style="display:inline-block;width:28px;height:28px;border-radius:9px;background:#2F5BFF"></span><b style="font-size:15px">${esc(m.workspace)}</b><span style="color:#6B7280;font-size:12px"> · ZenCrevia</span></div>
<h1 style="font-size:20px;letter-spacing:-.02em;margin:0 0 10px">${esc(m.subject)}</h1>
<p style="font-size:15px;line-height:1.5;margin:0 0 18px">${esc(m.text)}</p>
${m.meta ? `<table style="font-size:13px;color:#6B7280;border-collapse:collapse;margin-bottom:18px">${Object.entries(m.meta).map(([k, v]) => `<tr><td style="padding:3px 14px 3px 0;text-transform:uppercase;font-size:11px;letter-spacing:.06em">${esc(k)}</td><td style="padding:3px 0;color:#111214">${esc(v)}</td></tr>`).join("")}</table>` : ""}
<a href="${esc(m.link)}" style="display:inline-block;background:#111214;color:#fff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:999px">${esc(m.cta || "Open in ZenCrevia")}</a>
<p style="font-size:11px;color:#9CA3AF;margin-top:22px">${esc(m.footer || "You receive this because you are involved in this work. Change email preferences in Settings → Notifications.")}</p></div></body></html>`;
  const text = `${m.subject}\n\n${m.text}\n\n${m.meta ? Object.entries(m.meta).map(([k, v]) => `${k}: ${v}`).join("\n") + "\n\n" : ""}${m.link}\n`;
  return { html, text };
}
function mime(m) {
  const { html, text } = render(m); const b = "zcv" + Date.now().toString(36);
  return [`From: ${cfg.from}`, `To: ${m.to}`, `Subject: =?UTF-8?B?${Buffer.from(m.subject).toString("base64")}?=`, `Date: ${new Date().toUTCString()}`, `Message-ID: <${b}@zencrevia>`, "MIME-Version: 1.0", `Content-Type: multipart/alternative; boundary="${b}"`, "", `--${b}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(text).toString("base64").replace(/(.{76})/g, "$1\r\n"), `--${b}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", Buffer.from(html).toString("base64").replace(/(.{76})/g, "$1\r\n"), `--${b}--`, ""].join("\r\n");
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
const plainAuthOk = host => process.env.COS_SMTP_ALLOW_PLAINTEXT_AUTH === "1" || /^(localhost|127\.\d+\.\d+\.\d+|::1)$/i.test(String(host || ""));
function sendSmtp(m) {
  const s = cfg.smtp; if (!s.host) return Promise.reject(new Error("SMTP_HOST not set"));
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
      let r = await cmd("EHLO zencrevia");
      if (!s.secure && r.lines.some(l => /STARTTLS/i.test(l))) { await cmd("STARTTLS"); sock.removeListener("data", onData); sock = tls.connect({ socket: sock, servername: s.host }); sock.on("data", onData); sock.on("error", fail); await new Promise(res => sock.once("secureConnect", res)); r = await cmd("EHLO zencrevia"); }
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
function sendResend(m) { if (!cfg.resendKey) return Promise.reject(new Error("RESEND_API_KEY not set")); const { html, text } = render(m); return fetch("https://api.resend.com/emails", { method: "POST", headers: { Authorization: "Bearer " + cfg.resendKey, "Content-Type": "application/json" }, body: JSON.stringify({ from: cfg.from, to: [m.to], subject: m.subject, html, text }) }).then(async r => { if (!r.ok) throw new Error("Resend " + r.status + ": " + (await r.text()).slice(0, 200)); return r.json(); }); }

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
  return { transport: cfg.transport, from: cfg.from, replyTo: "", smtp: cfg.smtp, source: "environment" };
}
/* Deliver using an explicit configuration rather than the module globals, so a
   "Send test email" can exercise unsaved settings before they are committed. */
function sendWith(conf, m) {
  if (FORCE_LOG) conf = Object.assign({}, conf, { transport: "log" });
  const saved = { transport: cfg.transport, from: cfg.from, smtp: cfg.smtp };
  cfg.transport = conf.transport; cfg.from = conf.from; cfg.smtp = conf.smtp;
  const fn = conf.transport === "smtp" ? sendSmtp : conf.transport === "resend" ? sendResend : sendLog;
  const restore = () => { cfg.transport = saved.transport; cfg.from = saved.from; cfg.smtp = saved.smtp; };
  return Promise.resolve().then(() => fn(m)).then(r => { restore(); return r; }, e => { restore(); throw e; });
}
/* §P1-4 "Test connection" — reach the server, negotiate TLS and authenticate,
   without sending anything. This is what makes the guided flow trustworthy. */
function verifySmtp(s) {
  return new Promise((resolve, reject) => {
    if (!s || !s.host) return reject(new Error("Enter an SMTP host first"));
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
      let r = await cmd("EHLO zencrevia"); caps = r.lines;
      let starttls = false;
      if (!s.secure && r.lines.some(l => /STARTTLS/i.test(l))) {
        starttls = true;
        await cmd("STARTTLS"); sock.removeListener("data", onData);
        sock = tls.connect({ socket: sock, servername: s.host }); sock.on("data", onData); sock.on("error", fail);
        await new Promise(res => sock.once("secureConnect", res));
        r = await cmd("EHLO zencrevia"); caps = r.lines;
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
module.exports = { send, sendWith, verifySmtp, setStoredConfig, activeConfig, PROVIDER_PRESETS, cfg, state, link: (p) => cfg.appUrl.replace(/\/$/, "") + p };
