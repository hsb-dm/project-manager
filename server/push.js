"use strict";
/* ============================================================
   WEB PUSH — notifications on a phone's lock screen or a computer's corner, the app closed.
   RFC 8030 (delivery), 8291 (payload encryption, aes128gcm), 8292 (VAPID) with node:crypto alone.
   The server holds one VAPID key pair: COS_VAPID_PUBLIC_KEY / COS_VAPID_PRIVATE_KEY (base64url, raw P-256)
   when given, otherwise made once and kept in app_meta. A browser that turns notifications on stores a
   subscription here (its push service's endpoint and its keys); a notification is encrypted for each of
   the person's subscriptions and POSTed to that push service. A subscription the service says is gone
   (404/410) is dropped. Endpoints are only ever the known push services — a client cannot make the server
   POST to an address of its choosing.
   ============================================================ */
const crypto = require("crypto");
const b64u = buf => Buffer.from(buf).toString("base64url");
const unb64u = s => Buffer.from(String(s || ""), "base64url");

/* Chrome, Edge, Opera, Samsung (FCM) · Firefox · Edge on Windows · Safari */
const PUSH_HOSTS = ["fcm.googleapis.com", "push.services.mozilla.com", "notify.windows.com", "push.apple.com"];
/* tests only: a local stand-in for a push service, named by host:port */
const EXTRA_HOSTS = String(process.env.COS_PUSH_EXTRA_HOSTS || "").split(",").map(s => s.trim()).filter(Boolean);

function allowedEndpoint(url) {
  let u; try { u = new URL(String(url)); } catch (e) { return false; }
  if (EXTRA_HOSTS.includes(u.host)) return u.protocol === "http:" || u.protocol === "https:";
  if (u.protocol !== "https:" || u.username || u.password) return false;
  const host = u.hostname.toLowerCase();
  return PUSH_HOSTS.some(h => host === h || host.endsWith("." + h));
}

function keysFrom(db) {
  const pub = process.env.COS_VAPID_PUBLIC_KEY, priv = process.env.COS_VAPID_PRIVATE_KEY;
  if (pub && priv) return { publicKey: pub, privateKey: priv };
  db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");
  const row = db.prepare("SELECT value FROM app_meta WHERE key='vapid'").get();
  if (row) { try { const k = JSON.parse(row.value); if (k.publicKey && k.privateKey) return k; } catch (e) {} }
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const k = { publicKey: b64u(ecdh.getPublicKey()), privateKey: b64u(ecdh.getPrivateKey()) };
  db.prepare("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('vapid', ?)").run(JSON.stringify(k));
  return k;
}

/* the raw P-256 private key as a key node can sign with */
function signingKey(k) {
  const pub = unb64u(k.publicKey);
  return crypto.createPrivateKey({ key: { kty: "EC", crv: "P-256", d: k.privateKey, x: b64u(pub.subarray(1, 33)), y: b64u(pub.subarray(33, 65)) }, format: "jwk" });
}

/* RFC 8292: who is sending, signed for the push service's origin */
function vapidAuth(endpoint, k, key, subject) {
  const head = b64u(JSON.stringify({ typ: "JWT", alg: "ES256" }));
  const body = b64u(JSON.stringify({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: subject }));
  const sig = crypto.sign("sha256", Buffer.from(head + "." + body), { key, dsaEncoding: "ieee-p1363" });
  return "vapid t=" + head + "." + body + "." + b64u(sig) + ", k=" + k.publicKey;
}

/* RFC 8291: the payload, readable only by the browser that holds the subscription's private key */
function encrypt(text, p256dh, auth) {
  const uaPublic = unb64u(p256dh), authSecret = unb64u(auth);
  if (uaPublic.length !== 65 || uaPublic[0] !== 4 || authSecret.length < 16) throw new Error("bad subscription keys");
  const hmac = (key, data) => crypto.createHmac("sha256", key).update(data).digest();
  const ecdh = crypto.createECDH("prime256v1"); ecdh.generateKeys();
  const asPublic = ecdh.getPublicKey(), shared = ecdh.computeSecret(uaPublic);
  const ikm = hmac(hmac(authSecret, shared), Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic, Buffer.from([1])]));
  const salt = crypto.randomBytes(16), prk = hmac(salt, ikm);
  const cek = hmac(prk, Buffer.from("Content-Encoding: aes128gcm\0\x01", "binary")).subarray(0, 16);
  const nonce = hmac(prk, Buffer.from("Content-Encoding: nonce\0\x01", "binary")).subarray(0, 12);
  const cipher = crypto.createCipheriv("aes-128-gcm", cek, nonce);
  const sealed = Buffer.concat([cipher.update(Buffer.concat([Buffer.from(text, "utf8"), Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4); rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, sealed]);
}

module.exports = function (db, opts) {
  opts = opts || {};
  db.exec("CREATE TABLE IF NOT EXISTS push_subscriptions (id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, user_agent TEXT, created_at TEXT NOT NULL, last_used_at TEXT, fail_count INTEGER NOT NULL DEFAULT 0)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id)");
  const k = keysFrom(db), key = signingKey(k);
  const subject = () => { const s = typeof opts.subject === "function" ? opts.subject() : opts.subject; return /^(mailto:|https:)/.test(String(s || "")) ? s : "mailto:admin@example.com"; };
  const now = () => new Date().toISOString();
  const bad = msg => { const e = new Error(msg); e.status = 400; return e; };

  function subscribe(userId, sub, userAgent) {
    sub = sub || {}; const keys = sub.keys || {};
    if (!allowedEndpoint(sub.endpoint)) throw bad("That is not a push service this server sends to");
    if (unb64u(keys.p256dh).length !== 65 || unb64u(keys.auth).length < 16) throw bad("The subscription's keys are missing or malformed");
    if (String(sub.endpoint).length > 1000) throw bad("Endpoint too long");
    const id = "ps_" + crypto.createHash("sha256").update(String(sub.endpoint)).digest("hex").slice(0, 24);
    db.prepare("INSERT INTO push_subscriptions (id,user_id,endpoint,p256dh,auth,user_agent,created_at,fail_count) VALUES (?,?,?,?,?,?,?,0) ON CONFLICT(endpoint) DO UPDATE SET user_id=excluded.user_id, p256dh=excluded.p256dh, auth=excluded.auth, user_agent=excluded.user_agent, fail_count=0")
      .run(id, userId, String(sub.endpoint), String(keys.p256dh), String(keys.auth), String(userAgent || "").slice(0, 300), now());
  }
  function unsubscribe(userId, endpoint) { db.prepare("DELETE FROM push_subscriptions WHERE user_id=? AND endpoint=?").run(userId, String(endpoint || "")); }
  function count(userId) { return db.prepare("SELECT count(*) n FROM push_subscriptions WHERE user_id=?").get(userId).n; }

  async function sendOne(s, text) {
    if (!allowedEndpoint(s.endpoint)) { db.prepare("DELETE FROM push_subscriptions WHERE id=?").run(s.id); return { gone: true }; }
    let res;
    try {
      res = await fetch(s.endpoint, { method: "POST", body: encrypt(text, s.p256dh, s.auth), signal: AbortSignal.timeout(10000),
        headers: { "Content-Encoding": "aes128gcm", "Content-Type": "application/octet-stream", "TTL": "86400", "Urgency": "normal", "Authorization": vapidAuth(s.endpoint, k, key, subject()) } });
    } catch (e) { db.prepare("UPDATE push_subscriptions SET fail_count=fail_count+1 WHERE id=?").run(s.id); return { error: e.message }; }
    if (res.status === 404 || res.status === 410) { db.prepare("DELETE FROM push_subscriptions WHERE id=?").run(s.id); return { gone: true, status: res.status }; }
    if (res.ok) { db.prepare("UPDATE push_subscriptions SET last_used_at=?, fail_count=0 WHERE id=?").run(now(), s.id); return { ok: true, status: res.status }; }
    /* a subscription that keeps failing is let go after a while */
    db.prepare("UPDATE push_subscriptions SET fail_count=fail_count+1 WHERE id=?").run(s.id);
    db.prepare("DELETE FROM push_subscriptions WHERE id=? AND fail_count>=20").run(s.id);
    return { status: res.status };
  }
  /* payload: { title, body, url, tag } — kept small: a push carries at most ~4 KB */
  async function sendToUser(userId, payload) {
    const p = { title: String(payload.title || "").slice(0, 120), body: String(payload.body || "").slice(0, 400), url: String(payload.url || "/").slice(0, 600), tag: String(payload.tag || "").slice(0, 120) };
    const text = JSON.stringify(p), subs = db.prepare("SELECT * FROM push_subscriptions WHERE user_id=?").all(userId);
    return Promise.all(subs.map(s => sendOne(s, text)));
  }
  return { publicKey: () => k.publicKey, subscribe, unsubscribe, count, sendToUser, allowedEndpoint };
};
module.exports.allowedEndpoint = allowedEndpoint;
module.exports.encrypt = encrypt;
