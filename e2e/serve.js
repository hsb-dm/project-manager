/* Starts a throwaway production-mode server for the browser tests (clean workspace, no demo). */
const fs = require("fs"), path = require("path"), { spawn } = require("child_process");
const dir = path.join(require("os").tmpdir(), "zencrevia-e2e-" + (process.env.E2E_PORT || "3310")); fs.rmSync(dir, { recursive: true, force: true }); fs.mkdirSync(dir, { recursive: true });
const port = process.env.E2E_PORT || "3310";
const env = Object.assign({}, process.env, {
  NODE_ENV: "production", PORT: port, APP_URL: "http://localhost:" + port, COS_ALLOWED_ORIGINS: "http://localhost:" + port,
  COS_DATA_DIR: dir, COS_SECURE_COOKIE: "0", COS_SEED_DEMO: "0", TZ: "Asia/Jakarta", COS_MAIL_TRANSPORT: "log",
  COS_ADMIN_EMAIL: "admin@e2e.test", COS_ADMIN_NAME: "Admin E2E", COS_ADMIN_PASSWORD: "E2E!Admin-2026",
  COS_SECRET_KEY: "e2e-secret-key-0123456789-abcdefghij", COS_BACKUP_KEY: "e2e-backup-key-9876543210-zyxwvutsr",
  COS_MSG_RATE_MAX: "500"
});
const child = spawn(process.execPath, ["--no-warnings", "server/server.js"], { cwd: path.join(__dirname, ".."), env, stdio: "inherit" });
const stop = () => { child.kill("SIGTERM"); }; process.on("SIGTERM", stop); process.on("SIGINT", stop); child.on("exit", c => process.exit(c || 0));
