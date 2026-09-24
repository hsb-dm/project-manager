const fs = require("fs");
const path = require("path");

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const TRUST_PROXY = process.env.COS_TRUST_PROXY === "1";
const DATA_DIR = process.env.COS_DATA_DIR || path.join(__dirname, "..", "data");
const LOG_PATH = process.env.COS_SECURITY_LOG || path.join(DATA_DIR, "security.log");
const ALLOWED_ORIGINS = new Set(String(process.env.COS_ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean));
const WINDOW_MS = Math.max(60_000, +(process.env.COS_LOGIN_WINDOW_MS || 15 * 60_000));
const MAX_ATTEMPTS = Math.max(3, +(process.env.COS_LOGIN_MAX_ATTEMPTS || 5));
const MAX_RATE_KEYS = Math.max(1000, +(process.env.COS_LOGIN_MAX_KEYS || 10000));
const attempts = new Map();

/* Entity ids are rendered in several interactive surfaces and also appear in
   URLs. Keep them deliberately boring: no quotes, whitespace, slashes or HTML
   metacharacters can cross from stored data into browser code or markup. */
function validTaskId(value) {
  return typeof value === "string" && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(value);
}

function clientIp(req) {
  if (TRUST_PROXY && req.headers["x-forwarded-for"]) return String(req.headers["x-forwarded-for"]).split(",")[0].trim().slice(0, 80);
  return String((req.socket && req.socket.remoteAddress) || "unknown").slice(0, 80);
}

function loginKey(ip, email) { return String(ip || "unknown") + "|" + String(email || "").trim().toLowerCase().slice(0, 254); }
function loginStatus(ip, email) {
  const key = loginKey(ip, email), row = attempts.get(key), now = Date.now();
  if (!row || row.resetAt <= now) { attempts.delete(key); return { allowed: true, retryAfter: 0 }; }
  return row.count >= MAX_ATTEMPTS ? { allowed: false, retryAfter: Math.max(1, Math.ceil((row.resetAt - now) / 1000)) } : { allowed: true, retryAfter: 0 };
}
function loginResult(ip, email, success) {
  const key = loginKey(ip, email);
  if (success) return attempts.delete(key);
  const now = Date.now(), row = attempts.get(key);
  if (!row && attempts.size >= MAX_RATE_KEYS) {
    for (const [k, v] of attempts) if (v.resetAt <= now) attempts.delete(k);
    while (attempts.size >= MAX_RATE_KEYS) attempts.delete(attempts.keys().next().value);
  }
  attempts.set(key, !row || row.resetAt <= now ? { count: 1, resetAt: now + WINDOW_MS } : { count: row.count + 1, resetAt: row.resetAt });
}

function requireSameOrigin(req) {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return;
  const origin = req.headers.origin;
  if (!origin) {
    if (IS_PRODUCTION && process.env.COS_ALLOW_MISSING_ORIGIN !== "1") { const e = new Error("Request origin is required"); e.status = 403; throw e; }
    return;
  }
  if (ALLOWED_ORIGINS.has(origin)) return;
  let host;
  try { host = new URL(origin).host; } catch { host = ""; }
  if (!host || host !== req.headers.host) { const e = new Error("Request origin is not allowed"); e.status = 403; throw e; }
}

function applyHeaders(res) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=(), usb=()");
  res.setHeader("Cross-Origin-Opener-Policy", "same-origin-allow-popups");
  res.setHeader("Content-Security-Policy", "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://accounts.google.com https://apis.google.com https://www.gstatic.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com https://www.gstatic.com https://apis.google.com; font-src 'self' https://fonts.gstatic.com data:; img-src 'self' data: blob: https:; media-src 'self' data: blob:; connect-src 'self' https://accounts.google.com https://oauth2.googleapis.com https://www.googleapis.com https://content.googleapis.com; frame-src https://drive.google.com https://docs.google.com https://accounts.google.com https://content.googleapis.com https://apis.google.com");
  if (IS_PRODUCTION) res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
}

function clean(value, depth) {
  if (depth > 3) return "[depth]";
  if (value == null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.replace(/[\r\n]/g, " ").slice(0, 500);
  if (Array.isArray(value)) return value.slice(0, 20).map(v => clean(v, depth + 1));
  const out = {};
  for (const [k, v] of Object.entries(value).slice(0, 30)) {
    if (/password|secret|token|key|cookie|authorization/i.test(k)) out[k] = "[redacted]";
    else out[k] = clean(v, depth + 1);
  }
  return out;
}

/* v29 rotation: security.log -> .1 -> .2 ... once it passes COS_SECURITY_LOG_MAX_MB
   (default 10 MB); COS_SECURITY_LOG_KEEP rotated files are kept (default 5). */
const LOG_MAX_BYTES = Math.max(0.01, +(process.env.COS_SECURITY_LOG_MAX_MB || 10)) * 1048576;
const LOG_KEEP = Math.max(1, Math.min(50, +(process.env.COS_SECURITY_LOG_KEEP || 5)));
let logChecks = 0;
function rotateIfNeeded() {
  if (++logChecks % 50 !== 1) return; // stat at most every 50 writes
  let size = 0; try { size = fs.statSync(LOG_PATH).size; } catch { return; }
  if (size < LOG_MAX_BYTES) return;
  for (let i = LOG_KEEP - 1; i >= 1; i--) { try { fs.renameSync(LOG_PATH + "." + i, LOG_PATH + "." + (i + 1)); } catch {} }
  try { fs.rmSync(LOG_PATH + "." + (LOG_KEEP + 1), { force: true }); } catch {}
  try { fs.renameSync(LOG_PATH, LOG_PATH + ".1"); } catch {}
}
function log(event, details) {
  try {
    fs.mkdirSync(path.dirname(LOG_PATH), { recursive: true });
    rotateIfNeeded();
    fs.appendFileSync(LOG_PATH, JSON.stringify({ at: new Date().toISOString(), event: String(event).slice(0, 80), details: clean(details || {}, 0) }) + "\n", { mode: 0o600 });
  } catch (e) { console.error("[security-log]", e.message); }
}

module.exports = { _rotateNow: () => { logChecks = 0; rotateIfNeeded(); }, IS_PRODUCTION, clientIp, loginStatus, loginResult, requireSameOrigin, applyHeaders, log, validTaskId, LOG_PATH, _attempts: attempts };
