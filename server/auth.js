// Password + session auth with node:crypto (scrypt). Sessions live in the `sessions` table; the browser holds an httpOnly cookie.
const crypto = require("crypto");
const { uid, now } = require("./db");
const SESSION_HOURS = Math.max(1, +(process.env.COS_SESSION_HOURS || 12));
function hashPassword(pw, salt) { salt = salt || crypto.randomBytes(16).toString("hex"); return { salt, hash: crypto.scryptSync(String(pw), salt, 64, { N: 16384 }).toString("hex") }; }
function verifyPassword(pw, salt, hash) { if (!salt || !hash) return false; const h = crypto.scryptSync(String(pw), salt, 64, { N: 16384 }); const b = Buffer.from(hash, "hex"); return h.length === b.length && crypto.timingSafeEqual(h, b); }
function setPassword(db, userId, pw) { const { salt, hash } = hashPassword(pw); db.prepare("UPDATE users SET password_hash=?, password_salt=? WHERE id=?").run(hash, salt, userId); }
function sessionId(token) { return token ? "sha256:" + crypto.createHash("sha256").update(String(token)).digest("hex") : ""; }
function createSession(db, userId, ua) { const token = crypto.randomBytes(32).toString("hex"), id = sessionId(token); const exp = new Date(Date.now() + SESSION_HOURS * 3600000).toISOString(); db.prepare("DELETE FROM sessions WHERE expires_at<?").run(now()); db.prepare("INSERT INTO sessions (id,user_id,user_agent,expires_at) VALUES (?,?,?,?)").run(id, userId, (ua || "").slice(0, 200), exp); db.prepare("UPDATE users SET last_login_at=? WHERE id=?").run(now(), userId); return { id: token, expires: exp, exp: exp }; }
function readSession(db, token) { if (!token) return null; const id = sessionId(token); /* v29: only the hashed id is accepted. The old "OR s.id=token" fallback let a stored
     hash (from a leaked database or backup) be replayed directly as a session cookie. */
  if (!/^[a-f0-9]{64}$/.test(String(token))) return null;
  const s = db.prepare("SELECT s.*, u.is_active FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.id=?").get(id); if (!s || s.expires_at < now() || !s.is_active) return null; return s; }
function destroySession(db, token) { if (token) db.prepare("DELETE FROM sessions WHERE id=?").run(sessionId(token)); }
function cookies(req) { const out = {}; (req.headers.cookie || "").split(";").forEach(p => { const i = p.indexOf("="); if (i > 0) out[p.slice(0, i).trim()] = decodeURIComponent(p.slice(i + 1).trim()); }); return out; }
function cookieHeader(token, expires) { const secure = process.env.COS_SECURE_COOKIE === "1" || process.env.NODE_ENV === "production"; return "cos_session=" + (token || "") + "; Path=/; HttpOnly; SameSite=Lax" + (secure ? "; Secure" : "") + "; Expires=" + new Date(token ? expires : 0).toUTCString() + (token ? "; Max-Age=" + Math.max(0, Math.floor((new Date(expires).getTime() - Date.now()) / 1000)) : "; Max-Age=0"); }
function passwordProblem(pw) {
  if (typeof pw !== "string" || pw.length < 12) return "Password must contain at least 12 characters";
  if (pw.length > 256) return "Password is too long";
  const groups = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter(r => r.test(pw)).length;
  if (groups < 3) return "Password must combine at least three of: lowercase, uppercase, numbers, and symbols";
  return "";
}
function validPassword(pw) { return !passwordProblem(pw); }
function cookie(token, exp) { return cookieHeader(token, exp); }
function parseCookies(h) { return cookies({ headers: { cookie: h || "" } }); }
function sessionUser(db, token) { const s = readSession(db, token); return s ? s.user_id : null; }
function userIdFor(name, db) { let base = String(name || "").toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) || "user"; let id = base, n = 1; while (db.prepare("SELECT 1 FROM users WHERE id=?").get(id)) id = base + (++n); return id; }
module.exports = { cookie, parseCookies, sessionUser, sessionId, userIdFor, hashPassword, verifyPassword, setPassword, createSession, readSession, destroySession, cookies, cookieHeader, validPassword, passwordProblem, SESSION_HOURS };
