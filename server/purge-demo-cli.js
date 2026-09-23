#!/usr/bin/env node
/* v38: npm run purge-demo -- [--keep <adminUserId>] [--people-only] [--yes]
   Same operation as Settings → Backup & Data → Remove demo data. Make a backup first. */
const { open } = require("./db");
const demoPurge = require("./demo-purge");
const args = process.argv.slice(2), flag = n => args.includes(n);
const keep = args[args.indexOf("--keep") + 1] && args.indexOf("--keep") >= 0 ? args[args.indexOf("--keep") + 1] : "admin";
const db = open(); const ws = db.prepare("SELECT id FROM workspaces LIMIT 1").get();
if (!ws) { console.error("No workspace in this database."); process.exit(1); }
const pre = demoPurge.preview(db, ws.id, keep);
console.log("Demo accounts:", pre.people.map(p => p.id + " (" + p.name + ")").join(", ") || "none");
console.log("Demo tasks:", pre.tasks, "· projects:", pre.projects, "· assets:", pre.assets, "· knowledge pages:", pre.knowledge);
if (!flag("--yes")) { console.log("\nNothing changed. Stop the server, make a backup, then run again with --yes."); process.exit(0); }
const release = id => { db.prepare("UPDATE users SET email=NULL, password_hash=NULL, password_salt=NULL, is_active=0 WHERE id=?").run(id); db.prepare("DELETE FROM sessions WHERE user_id=?").run(id); };
console.log("Removed:", demoPurge.purge(db, ws.id, keep, { people: true, content: !flag("--people-only") }, release));
db.close();
