/* Shared Google Drive: one admin account for the whole workspace (server/gdrive.js).
   The properties worth guarding are the ones a mistake would quietly break — that the credential
   never reaches a browser, that a dead token disconnects instead of failing forever, and that a
   file is streamed rather than gathered in memory. */
const test = require("node:test"), assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { DatabaseSync } = require("node:sqlite");

const WS = "ws_test";
function freshDb() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "zcv-gd-"));
  const db = new DatabaseSync(path.join(dir, "t.db"));
  db.exec("CREATE TABLE cloud_connections (id TEXT PRIMARY KEY, workspace_id TEXT, provider TEXT, name TEXT, account TEXT, root_folder TEXT, color TEXT, is_connected INTEGER, last_sync_at TEXT, config TEXT)");
  db.prepare("INSERT INTO cloud_connections (id,workspace_id,provider,name,config) VALUES ('cc1',?,'gdrive','Google Drive',?)").run(WS, JSON.stringify({ clientId: "cid.apps.googleusercontent.com", folderId: "folder123" }));
  return db;
}
function loadDrive(env) {
  Object.assign(process.env, env || {});
  delete require.cache[require.resolve("../server/gdrive.js")];
  delete require.cache[require.resolve("../server/secrets.js")];
  return require("../server/gdrive.js");
}
const KEY = { COS_SECRET_KEY: "k".repeat(40) };

test("the client secret and refresh token are stored encrypted, and never in the workspace config", () => {
  const gd = loadDrive(KEY), db = freshDb();
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-supersecret") });
  gd._upsert(db, WS, { refresh_token: require("../server/secrets.js").encrypt("1//refresh-abc") });
  const row = gd._row(db, WS);
  assert.ok(row.client_secret.startsWith("enc:v1:"), "client secret is encrypted at rest");
  assert.ok(row.refresh_token.startsWith("enc:v1:"), "refresh token is encrypted at rest");
  assert.ok(!JSON.stringify(row).includes("supersecret"));
  assert.ok(!JSON.stringify(row).includes("1//refresh-abc"));
  /* the config column is what gets sent to every browser — it must stay clean */
  const cfg = db.prepare("SELECT config FROM cloud_connections WHERE workspace_id=?").get(WS).config;
  assert.ok(!/supersecret|refresh-abc/.test(cfg));
});

test("status tells the browser only whether an account is connected, and which", () => {
  const gd = loadDrive(KEY), db = freshDb();
  assert.deepEqual(gd.status(db, WS), { shared: false, sharedAccount: "", hasSecret: false, clientId: "cid.apps.googleusercontent.com" });
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-x"), refresh_token: require("../server/secrets.js").encrypt("1//r"), account: "team@example.com" });
  const st = gd.status(db, WS);
  assert.equal(st.shared, true);
  assert.equal(st.sharedAccount, "team@example.com");
  /* no field of status may carry a credential */
  assert.ok(!JSON.stringify(st).includes("GOCSPX"));
  assert.ok(!JSON.stringify(st).includes("1//r"));
});

test("the workspace payload sent to members exposes the flag but no credential", () => {
  const gd = loadDrive(KEY), db = freshDb();
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-leaky"), refresh_token: require("../server/secrets.js").encrypt("1//leaky-token"), account: "team@example.com" });
  /* mirror what serialize.js sends for the cloud list */
  const row = db.prepare("SELECT * FROM cloud_connections WHERE workspace_id=?").get(WS);
  const shared = db.prepare("SELECT refresh_token, account FROM cloud_secrets WHERE workspace_id=? AND provider='gdrive'").get(WS);
  const sent = { id: row.provider, config: JSON.parse(row.config), shared: !!shared.refresh_token, sharedAccount: shared.account || "" };
  assert.equal(sent.shared, true);
  assert.ok(!JSON.stringify(sent).includes("leaky"), "nothing resembling the credential crosses to the client");
});

test("the OAuth state is signed, single-purpose, and rejects tampering", () => {
  const gd = loadDrive(KEY), db = freshDb();
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-x") });
  const { url } = gd.authUrl(db, WS, { headers: { host: "app.example.com" } }, "admin");
  const state = new URL(url).searchParams.get("state");
  assert.equal(gd.readState(state).u, "admin");
  /* Tamper in the middle, never at the end. The final character of a 43-character base64url HMAC
     carries only 4 real bits; the other 2 are padding that decoding ignores. Changing it could
     yield the same bytes — about one run in sixteen — and this test used to fail at random for
     exactly that reason. Every middle character carries all 6 bits, so any change there counts. */
  const [payload, sig] = state.split(".");
  const flip = s => { const i = Math.floor(s.length / 2); return s.slice(0, i) + (s[i] === "A" ? "B" : "A") + s.slice(i + 1); };
  assert.throws(() => gd.readState(payload + "." + flip(sig)), /not issued by this server|not valid/, "a changed signature");
  assert.throws(() => gd.readState(flip(payload) + "." + sig), /not issued by this server|not valid/, "a changed payload under the old signature");
  assert.throws(() => gd.readState("nonsense"), /not valid/);
});

test("connecting asks Google for offline access, which is what yields a refresh token", () => {
  const gd = loadDrive(KEY), db = freshDb();
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-x") });
  const q = new URL(gd.authUrl(db, WS, { headers: { host: "app.example.com" } }, "admin").url).searchParams;
  assert.equal(q.get("access_type"), "offline");
  assert.equal(q.get("prompt"), "consent", "without this a second connect returns no refresh token at all");
  assert.equal(q.get("response_type"), "code");
  assert.match(q.get("scope"), /drive\.file/);
  /* the broad Drive scopes would let a stored credential read the admin's whole Drive */
  assert.ok(!/auth\/drive(\s|$)/.test(q.get("scope")), "scope stays limited to files this app created");
});

test("connecting refuses to start before the client ID and secret are in place", () => {
  const gd = loadDrive(KEY), db = freshDb();
  assert.throws(() => gd.authUrl(db, WS, { headers: {} }, "admin"), /client secret/);
  db.prepare("UPDATE cloud_connections SET config='{}' WHERE workspace_id=?").run(WS);
  assert.throws(() => gd.authUrl(db, WS, { headers: {} }, "admin"), /client ID/);
});

test("the redirect URI follows APP_URL, so it matches what Google has on file", () => {
  const gd = loadDrive(Object.assign({}, KEY, { APP_URL: "https://app.example.com/" }));
  assert.equal(gd.redirectUri({ headers: { host: "other" } }), "https://app.example.com/api/cloud/gdrive/callback");
  const gd2 = loadDrive(Object.assign({}, KEY, { APP_URL: "" }));
  assert.equal(gd2.redirectUri({ headers: { host: "localhost:3000" } }), "http://localhost:3000/api/cloud/gdrive/callback");
});

test("a revoked refresh token disconnects the workspace instead of failing every upload forever", async () => {
  const gd = loadDrive(KEY), db = freshDb();
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-x"), refresh_token: require("../server/secrets.js").encrypt("1//dead"), account: "team@example.com" });
  const realFetch = global.fetch;
  global.fetch = async () => ({ ok: false, status: 400, text: async () => JSON.stringify({ error: "invalid_grant" }), json: async () => ({ error: "invalid_grant" }), headers: new Map() });
  try {
    await assert.rejects(() => gd.accessToken(db, WS), /reconnect it|revoked/);
    assert.equal(gd.status(db, WS).shared, false, "the workspace now reads as disconnected");
    /* the client secret is kept: only the user's grant died, not the app's registration */
    assert.equal(gd.status(db, WS).hasSecret, true);
  } finally { global.fetch = realFetch; }
});

test("an access token is reused until it nears expiry, then minted again", async () => {
  const gd = loadDrive(KEY), db = freshDb();
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-x"), refresh_token: require("../server/secrets.js").encrypt("1//live") });
  const realFetch = global.fetch; let calls = 0;
  global.fetch = async () => { calls++; return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "at-" + calls, expires_in: 3600 }), headers: new Map() }; };
  try {
    assert.equal(await gd.accessToken(db, WS), "at-1");
    assert.equal(await gd.accessToken(db, WS), "at-1");
    assert.equal(calls, 1, "the second call is served from memory");
  } finally { global.fetch = realFetch; }
});

test("uploading refuses an unmeasured or oversized file before contacting Google", async () => {
  const gd = loadDrive(Object.assign({}, KEY, { COS_DRIVE_MAX_BYTES: "1000000" })), db = freshDb();
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-x"), refresh_token: require("../server/secrets.js").encrypt("1//live") });
  const realFetch = global.fetch; let touched = false;
  global.fetch = async () => { touched = true; throw new Error("should not be reached"); };
  try {
    await assert.rejects(() => gd.upload(db, WS, { headers: {} }, { name: "a.png" }), /Content-Length/);
    await assert.rejects(() => gd.upload(db, WS, { headers: { "content-length": "9999999" } }, { name: "a.png" }), /larger than the 1 MB/);
    assert.equal(touched, false, "neither attempt spent a Google call");
  } finally { global.fetch = realFetch; }
});

test("an upload streams the request body and lands in the configured folder", async () => {
  const gd = loadDrive(KEY), db = freshDb();
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-x"), refresh_token: require("../server/secrets.js").encrypt("1//live") });
  const { Readable } = require("node:stream");
  const payload = Buffer.from("pretend-png-bytes");
  const req = Readable.from([payload]); req.headers = { "content-length": String(payload.length) };
  const seen = [];
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    seen.push({ url: String(url), opts });
    if (String(url).includes("oauth2")) return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "at", expires_in: 3600 }), headers: new Map() };
    if (String(url).includes("uploadType=resumable")) return { ok: true, status: 200, text: async () => "", headers: new Map([["location", "https://upload.example/session-1"]]) };
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: "F1", name: "a.png", mimeType: "image/png", size: String(payload.length) }), headers: new Map() };
  };
  try {
    const out = await gd.upload(db, WS, req, { name: "a.png", mime: "image/png" });
    assert.equal(out.driveId, "F1");
    assert.match(out.url, /F1/);
    const init = seen.find(s => s.url.includes("uploadType=resumable"));
    assert.deepEqual(JSON.parse(init.opts.body).parents, ["folder123"], "the workspace folder is honoured");
    assert.equal(init.opts.headers["X-Upload-Content-Length"], String(payload.length));
    const put = seen.find(s => s.url === "https://upload.example/session-1");
    assert.equal(put.opts.duplex, "half", "half-duplex streaming: the bytes are never buffered here");
    assert.ok(typeof put.opts.body.getReader === "function", "the body is a stream, not a string or buffer");
  } finally { global.fetch = realFetch; }
});

test("a file name from the browser cannot escape into a path or header", async () => {
  const gd = loadDrive(KEY), db = freshDb();
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-x"), refresh_token: require("../server/secrets.js").encrypt("1//live") });
  const { Readable } = require("node:stream");
  const req = Readable.from([Buffer.from("x")]); req.headers = { "content-length": "1" };
  let metadata = null;
  const realFetch = global.fetch;
  global.fetch = async (url, opts) => {
    if (String(url).includes("oauth2")) return { ok: true, status: 200, text: async () => JSON.stringify({ access_token: "at", expires_in: 3600 }), headers: new Map() };
    if (String(url).includes("uploadType=resumable")) { metadata = JSON.parse(opts.body); return { ok: true, status: 200, text: async () => "", headers: new Map([["location", "https://upload.example/s"]]) }; }
    return { ok: true, status: 200, text: async () => JSON.stringify({ id: "F2" }), headers: new Map() };
  };
  try {
    await gd.upload(db, WS, req, { name: "../../etc/passwd\r\nX-Evil: 1", mime: "not a mime type" });
    assert.ok(!/[\r\n]/.test(metadata.name), "no CRLF survives into the request");
    assert.ok(!metadata.name.includes("/"), "no path separators survive");
  } finally { global.fetch = realFetch; }
});

test("disconnecting removes the credential outright", () => {
  const gd = loadDrive(KEY), db = freshDb();
  gd._upsert(db, WS, { client_secret: require("../server/secrets.js").encrypt("GOCSPX-x"), refresh_token: require("../server/secrets.js").encrypt("1//live"), account: "team@example.com" });
  gd.disconnect(db, WS);
  assert.equal(gd._row(db, WS), null);
  assert.deepEqual(gd.status(db, WS), { shared: false, sharedAccount: "", hasSecret: false, clientId: "cid.apps.googleusercontent.com" });
});

test("the streaming upload route is exempt from the JSON body reader", () => {
  const src = fs.readFileSync(path.join(__dirname, "..", "server", "server.js"), "utf8");
  /* the set also holds server storage's upload path now; what matters is that Drive's is in it */
  const set = src.slice(src.indexOf("const RAW_BODY = new Set(["), src.indexOf("]);", src.indexOf("const RAW_BODY = new Set([")));
  assert.ok(set.includes('"/api/cloud/gdrive/upload"'), "the Drive upload path is exempt");
  assert.match(src, /RAW_BODY\.has\(url\.pathname\) \? \{\} : await readBody\(req\)/, "readBody must be skipped for the upload path");
});
