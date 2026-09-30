/* Shared Google Drive — one account for the whole workspace.

   Before: every member ran the OAuth token flow in their own browser, so each person had to sign
   in to Google once and uploads went straight from their browser to their own Drive.
   Now: an admin connects once with the authorization-code flow, the refresh token is stored here
   (encrypted), and every member's upload is streamed through this server to that one account.
   Members never see a Google window.

   Three rules hold this together:
   - The refresh token lives in its own table, never in cloud_connections.config. That config is
     sent to every browser verbatim and written back wholesale (serialize.js), so a secret there
     would both leak to members and be wiped on the next workspace save.
   - The scope stays drive.file. A long-lived credential is worth much less if it can only see the
     files this app created, not the rest of the admin's Drive.
   - Uploads are streamed, never buffered. readBody in server.js accumulates a request into one
     JavaScript string capped at 12 MB, which is fine for JSON and hopeless for a video. */
const crypto = require("crypto"), { Readable } = require("stream");
const secrets = require("./secrets");

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
/* openid+email only so the admin can see which account is connected; drive.file is the one that matters. */
const SCOPES = "https://www.googleapis.com/auth/drive.file openid email";
const MAX_UPLOAD_BYTES = Math.max(1_000_000, +(process.env.COS_DRIVE_MAX_BYTES || 314_572_800));
const STATE_TTL_MS = 10 * 60 * 1000;
/* Signs the OAuth state. Falls back to a per-process key: state only has to survive the seconds
   between leaving for Google and coming back, so a restart invalidating it is harmless. */
const STATE_KEY = crypto.createHash("sha256").update(process.env.COS_SECRET_KEY || crypto.randomBytes(32)).digest();

const err = (status, message) => { const e = new Error(message); e.status = status; return e; };
const b64url = buf => Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const unb64url = s => Buffer.from(String(s).replace(/-/g, "+").replace(/_/g, "/"), "base64");

function ensureTable(db) {
  db.exec("CREATE TABLE IF NOT EXISTS cloud_secrets (workspace_id TEXT NOT NULL, provider TEXT NOT NULL, client_secret TEXT, refresh_token TEXT, account TEXT, updated_at TEXT, updated_by TEXT, PRIMARY KEY (workspace_id, provider))");
}
function row(db, wsId) { ensureTable(db); return db.prepare("SELECT * FROM cloud_secrets WHERE workspace_id=? AND provider='gdrive'").get(wsId) || null; }
function upsert(db, wsId, fields) {
  ensureTable(db);
  const cur = row(db, wsId) || {};
  const next = Object.assign({ client_secret: null, refresh_token: null, account: null }, cur, fields);
  db.prepare("INSERT INTO cloud_secrets (workspace_id,provider,client_secret,refresh_token,account,updated_at,updated_by) VALUES (?,'gdrive',?,?,?,?,?) ON CONFLICT(workspace_id,provider) DO UPDATE SET client_secret=excluded.client_secret, refresh_token=excluded.refresh_token, account=excluded.account, updated_at=excluded.updated_at, updated_by=excluded.updated_by")
    .run(wsId, next.client_secret, next.refresh_token, next.account, new Date().toISOString(), fields.updated_by || cur.updated_by || null);
}
/* The client ID and folder are ordinary settings, so they stay in the connection's config. */
function config(db, wsId) {
  const r = db.prepare("SELECT config FROM cloud_connections WHERE workspace_id=? AND provider='gdrive'").get(wsId);
  try { return JSON.parse((r && r.config) || "{}"); } catch { return {}; }
}
/* What the browser is allowed to know: whether a shared account is live, and which one. */
function status(db, wsId) {
  const r = row(db, wsId), c = config(db, wsId);
  return { shared: !!(r && r.refresh_token), sharedAccount: (r && r.account) || "", hasSecret: !!(r && r.client_secret), clientId: c.clientId || "" };
}
function forget(db, wsId) { upsert(db, wsId, { refresh_token: null, account: null }); cache.delete(wsId); }
function disconnect(db, wsId) { ensureTable(db); db.prepare("DELETE FROM cloud_secrets WHERE workspace_id=? AND provider='gdrive'").run(wsId); cache.delete(wsId); }

function redirectUri(req) {
  const base = String(process.env.APP_URL || "").replace(/\/+$/, "");
  if (base) return base + "/api/cloud/gdrive/callback";
  const host = (req && req.headers && req.headers.host) || "localhost:3000";
  return (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http://" : "https://") + host + "/api/cloud/gdrive/callback";
}
function signState(userId) {
  const payload = b64url(JSON.stringify({ u: String(userId), t: Date.now(), n: b64url(crypto.randomBytes(9)) }));
  return payload + "." + b64url(crypto.createHmac("sha256", STATE_KEY).update(payload).digest());
}
function readState(state) {
  const parts = String(state || "").split(".");
  if (parts.length !== 2) throw err(400, "That sign-in link is not valid. Start again from Settings.");
  const want = crypto.createHmac("sha256", STATE_KEY).update(parts[0]).digest(), got = unb64url(parts[1]);
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) throw err(400, "That sign-in link was not issued by this server. Start again from Settings.");
  let body; try { body = JSON.parse(unb64url(parts[0]).toString("utf8")); } catch { throw err(400, "That sign-in link is not valid."); }
  if (!body || !body.u || Date.now() - Number(body.t || 0) > STATE_TTL_MS) throw err(400, "That sign-in link has expired. Start again from Settings.");
  return body;
}
/* Where the admin is sent to approve. access_type=offline with prompt=consent is what makes Google
   hand back a refresh token; without prompt=consent a second connect returns none at all. */
function authUrl(db, wsId, req, userId) {
  const c = config(db, wsId), r = row(db, wsId);
  if (!c.clientId) throw err(400, "Add the Google OAuth client ID first.");
  if (!r || !r.client_secret) throw err(400, "Add the Google OAuth client secret first.");
  const q = new URLSearchParams({ client_id: c.clientId, redirect_uri: redirectUri(req), response_type: "code", scope: SCOPES, access_type: "offline", prompt: "consent", include_granted_scopes: "true", state: signState(userId) });
  return { url: AUTH_URL + "?" + q.toString(), redirectUri: redirectUri(req) };
}
async function postForm(url, params) {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(params).toString(), signal: AbortSignal.timeout(20000) });
  const text = await res.text();
  let json = {}; try { json = JSON.parse(text); } catch {}
  return { ok: res.ok, status: res.status, json, text };
}
/* The id_token comes straight from Google's token endpoint over TLS, so reading the email out of
   its payload without verifying the signature is safe here — it is a label, never an authorisation. */
function emailFromIdToken(idToken) {
  try { const p = String(idToken || "").split("."); return p.length < 2 ? "" : String(JSON.parse(unb64url(p[1]).toString("utf8")).email || ""); } catch { return ""; }
}
async function exchangeCode(db, wsId, req, code, userId) {
  const c = config(db, wsId), r = row(db, wsId);
  if (!c.clientId || !r || !r.client_secret) throw err(400, "Google Drive is not configured.");
  const out = await postForm(TOKEN_URL, { code, client_id: c.clientId, client_secret: secrets.decrypt(r.client_secret), redirect_uri: redirectUri(req), grant_type: "authorization_code" });
  if (!out.ok) throw err(502, "Google refused the connection: " + ((out.json.error_description || out.json.error || out.text || "").slice(0, 300) || "unknown error"));
  if (!out.json.refresh_token) throw err(502, "Google did not return a refresh token. Remove this app at myaccount.google.com/permissions, then connect again.");
  upsert(db, wsId, { refresh_token: secrets.encrypt(out.json.refresh_token), account: emailFromIdToken(out.json.id_token), updated_by: userId || null });
  cache.set(wsId, { token: out.json.access_token, exp: Date.now() + ((out.json.expires_in || 3600) - 120) * 1000 });
  return status(db, wsId);
}
/* Access tokens are short-lived, so keep the live one in memory and mint a new one from the refresh
   token when it ages out. Never persisted: a restart simply mints another. */
const cache = new Map();
async function accessToken(db, wsId) {
  const hit = cache.get(wsId);
  if (hit && Date.now() < hit.exp) return hit.token;
  const c = config(db, wsId), r = row(db, wsId);
  if (!r || !r.refresh_token) throw err(409, "Google Drive is not connected. An admin needs to connect it in Settings → Cloud storage.");
  const out = await postForm(TOKEN_URL, { client_id: c.clientId, client_secret: secrets.decrypt(r.client_secret), refresh_token: secrets.decrypt(r.refresh_token), grant_type: "refresh_token" });
  if (!out.ok) {
    /* invalid_grant means the token is dead for good — revoked, or expired because the OAuth
       consent screen is still in "Testing", where refresh tokens last only seven days. Drop it so
       the workspace shows as disconnected instead of failing every upload forever. */
    if (String(out.json.error || "") === "invalid_grant") { forget(db, wsId); throw err(409, "Google has revoked the workspace's Drive access. An admin needs to reconnect it in Settings → Cloud storage. If your OAuth consent screen is still in \"Testing\", publish it — refresh tokens expire after seven days there."); }
    throw err(502, "Could not renew Google access: " + ((out.json.error_description || out.json.error || "unknown error").slice(0, 300)));
  }
  const token = out.json.access_token, exp = Date.now() + ((out.json.expires_in || 3600) - 120) * 1000;
  cache.set(wsId, { token, exp });
  return token;
}
const cleanName = n => String(n || "file").replace(/[\\/\r\n\u0000]+/g, "-").replace(/^\.+/, "").trim().slice(0, 200) || "file";
const cleanMime = m => (/^[\w.+-]+\/[\w.+-]+$/.test(String(m || "")) ? String(m) : "application/octet-stream");

/* Streams one upload to Drive: ask for a resumable session, then pipe the request body straight
   into it. The bytes never gather in this process. */
async function upload(db, wsId, req, meta) {
  const bytes = +(req.headers["content-length"] || 0);
  if (!bytes) throw err(411, "The upload needs a Content-Length.");
  if (bytes > MAX_UPLOAD_BYTES) throw err(413, "That file is larger than the " + Math.round(MAX_UPLOAD_BYTES / 1048576) + " MB upload limit.");
  const token = await accessToken(db, wsId), c = config(db, wsId);
  const name = cleanName(meta.name), mime = cleanMime(meta.mime);
  const body = { name }; if (c.folderId) body.parents = [String(c.folderId)];
  const start = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true&fields=id,name,webViewLink,mimeType,size", {
    method: "POST",
    headers: { Authorization: "Bearer " + token, "Content-Type": "application/json; charset=UTF-8", "X-Upload-Content-Type": mime, "X-Upload-Content-Length": String(bytes) },
    body: JSON.stringify(body), signal: AbortSignal.timeout(30000)
  });
  if (!start.ok) { const t = await start.text(); if (start.status === 401) cache.delete(wsId); throw err(502, "Drive refused the upload: " + t.slice(0, 300)); }
  const session = start.headers.get("location");
  if (!session) throw err(502, "Drive did not open an upload session.");
  const put = await fetch(session, { method: "PUT", headers: { "Content-Type": mime, "Content-Length": String(bytes) }, body: Readable.toWeb(req), duplex: "half" });
  const text = await put.text();
  if (!put.ok) throw err(502, "Drive rejected the file: " + text.slice(0, 300));
  let file = {}; try { file = JSON.parse(text); } catch {}
  if (!file.id) throw err(502, "Drive did not return a file id.");
  if (c.publicLinks === true) {
    /* Deliberately best-effort: the file is already safely uploaded, and a failed share should not
       lose it. The member sees the link either way. */
    try { await fetch("https://www.googleapis.com/drive/v3/files/" + encodeURIComponent(file.id) + "/permissions?supportsAllDrives=true", { method: "POST", headers: { Authorization: "Bearer " + token, "Content-Type": "application/json" }, body: JSON.stringify({ role: "reader", type: "anyone" }), signal: AbortSignal.timeout(15000) }); } catch {}
  }
  return {
    driveId: file.id, name: file.name || name, mime: file.mimeType || mime,
    url: file.webViewLink || "https://drive.google.com/file/d/" + file.id + "/view",
    previewUrl: "https://drive.google.com/file/d/" + file.id + "/preview",
    size: (Number(file.size || bytes) / 1048576).toFixed(1) + " MB"
  };
}
module.exports = { ensureTable, status, config, authUrl, exchangeCode, accessToken, upload, disconnect, forget, redirectUri, readState, MAX_UPLOAD_BYTES, _row: row, _upsert: upsert };
