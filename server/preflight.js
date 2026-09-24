/* v36 production preflight.
   Refuses to start in production with configuration that would be unsafe on the internet,
   and prints warnings for configuration that works but is probably not what you want.
   Found in the pre-launch audit: copying .env.example unchanged started a live server whose
   admin password was the public placeholder "replace-with-a-strong-password", with an empty
   or placeholder encryption key, and with password-reset links pointing at example.com.
   Emergency override (not recommended): COS_SKIP_PREFLIGHT=1. */
const PLACEHOLDER = /replace-with|example\.com|changeme|change-me|your-company\.com/i;

function check(env, opts) {
  opts = opts || {};
  const errors = [], warnings = [];
  const v = k => String(env[k] == null ? "" : env[k]).trim();
  const secret = v("COS_SECRET_KEY"), backup = v("COS_BACKUP_KEY"), appUrl = v("APP_URL"), origins = v("COS_ALLOWED_ORIGINS");

  if (!secret) errors.push("COS_SECRET_KEY is not set. It encrypts stored SMTP and AI keys. Use at least 32 random characters.");
  else if (secret.length < 32) errors.push("COS_SECRET_KEY must be at least 32 characters.");
  else if (PLACEHOLDER.test(secret)) errors.push("COS_SECRET_KEY still has the placeholder value from .env.example.");

  if (!backup) warnings.push("COS_BACKUP_KEY is not set: automatic and manual backups are disabled.");
  else if (backup.length < 32) errors.push("COS_BACKUP_KEY must be at least 32 characters.");
  else if (PLACEHOLDER.test(backup)) errors.push("COS_BACKUP_KEY still has the placeholder value from .env.example.");
  else if (backup === secret) errors.push("COS_BACKUP_KEY must be different from COS_SECRET_KEY.");

  if (opts.firstStart && env.COS_ADMIN_PASSWORD != null && v("COS_ADMIN_PASSWORD") !== "") {
    const pw = v("COS_ADMIN_PASSWORD");
    if (PLACEHOLDER.test(pw)) errors.push("COS_ADMIN_PASSWORD still has the placeholder value from .env.example. Anyone who has read that file could sign in as admin.");
    else if (pw.length < 8) errors.push("COS_ADMIN_PASSWORD must be at least 8 characters.");
  }
  if (opts.firstStart && PLACEHOLDER.test(v("COS_ADMIN_EMAIL"))) errors.push("COS_ADMIN_EMAIL still has the placeholder value. Use the real admin's email so password reset works.");

  if (!appUrl) warnings.push("APP_URL is not set: links in emails (password reset, notifications) will not point at your server.");
  else if (PLACEHOLDER.test(appUrl)) errors.push("APP_URL still points at the placeholder domain. Password-reset emails would send people to " + appUrl + ".");
  else if (!/^https:\/\//i.test(appUrl) && !/localhost|127\.0\.0\.1/.test(appUrl)) warnings.push("APP_URL is not https. Session cookies are Secure in production, so sign-in only works over HTTPS.");

  if (origins && PLACEHOLDER.test(origins)) errors.push("COS_ALLOWED_ORIGINS still has the placeholder domain; every sign-in would be rejected.");
  if (v("COS_ALLOW_REGISTRATION") === "1" && PLACEHOLDER.test(v("COS_INVITE_CODE"))) errors.push("Registration is on but COS_INVITE_CODE is the placeholder.");

  const transport = v("COS_MAIL_TRANSPORT") || "log";
  if (transport === "log") warnings.push("Email transport is 'log': notifications and password-reset links are written to data/outbox, not sent. Configure SMTP (Settings → Notifications & email) before inviting people.");
  if (PLACEHOLDER.test(v("MAIL_FROM"))) warnings.push("MAIL_FROM uses the placeholder domain; many mail servers will reject or spam-folder it.");
  if (/^https:/i.test(appUrl) && v("COS_TRUST_PROXY") !== "1") warnings.push("APP_URL is https but COS_TRUST_PROXY is not 1. Behind a reverse proxy every user would share one IP for rate limits (sign-in, password reset).");
  /* v38: data inside the application folder is deleted by any update that replaces that folder */
  const path = require("path"), appDir = path.resolve(__dirname, ".."), dataDir = path.resolve(v("COS_DATA_DIR") || path.join(appDir, "data"));
  if (dataDir === appDir || dataDir.startsWith(appDir + path.sep)) warnings.push("The database and uploads are stored inside the application folder (" + dataDir + "). Replacing the app folder during an update would delete them. Set COS_DATA_DIR outside it, e.g. /var/lib/zencrevia (see deploy/migrate-data-dir.sh).");
  if (!v("TZ")) warnings.push("TZ is not set; the server clock decides the day boundary for automatic archiving and schedules. Set TZ=Asia/Jakarta.");
  return { errors, warnings };
}

function run(opts) {
  const env = process.env;
  if (env.NODE_ENV !== "production") return { errors: [], warnings: [] };
  const r = check(env, opts);
  if (env.COS_SKIP_PREFLIGHT === "1") { if (r.errors.length) console.warn("[preflight] COS_SKIP_PREFLIGHT=1 — starting despite:\n  - " + r.errors.join("\n  - ")); }
  else if (r.errors.length) {
    console.error("\nZenCrevia will not start in production until these are fixed in .env:\n  - " + r.errors.join("\n  - ") + "\n");
    process.exit(78);
  }
  r.warnings.forEach(w => console.warn("[preflight] " + w));
  return r;
}
module.exports = { check, run, PLACEHOLDER };
