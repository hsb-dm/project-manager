/* PERSONAL CHECKS (Oct 2026) — the tick on a task ("Mark as checked" / "Tandai dicentang", the "N checked" chip and its
   Clear checks), kept for the person who made it.

   It lived in each browser's localStorage, so it never reached the person's phone or even their other tab. It is now a
   small table of its own (db/schema.sql task_checks): one row per task a person has ticked. It is still nobody else's:
   • a person reads and writes only their own set (the signed-in account; there is no route that names someone else);
   • nothing here touches the task — no history, no activity, no export, no "updated" time, no task_changed — and a
     write does not count as a change to the workspace's data (the task list's cache, server.js DATA_VERSION, stays);
   • a deleted task's check goes with it (ON DELETE CASCADE), and an id that names no task of this workspace is ignored,
     which is what lets a browser send up the ticks it kept before this (a task deleted since among them) as they are;
   • after a change that changed something, the person's other tabs and devices hear "checks_changed" (to that person
     only; the tab that made it is named, X-ZC-Tab, so it can tell its own echo) and ask for the set again.

   GET  /api/task-checks                                   → { ids }  the person's ticked tasks, oldest tick first
   POST /api/task-checks { check?, uncheck?, clear? }      → { ids }  clear: true removes every tick first; check adds
        (a list; what was there stays, so a browser's own ticks are merged in, never written over); uncheck removes a
        list ("clear a list"). One request, one transaction. */
const security = require("./security");

module.exports = function taskChecks(db, WS_ID, d) {
  const { route, HttpError, now, publish } = d;
  const MAX_IDS = 20000;
  const TAB = /^[a-z0-9]{8,32}$/;
  /* the tab that asked (the per-tab contract: X-ZC-Tab, kept only when it is what a page makes) */
  const tabOf = ctx => { const t = ctx && ctx.req && ctx.req.headers ? String(ctx.req.headers["x-zc-tab"] || "") : ""; return TAB.test(t) ? t : null; };
  /* a list of task ids as a page sends one: strings that can be ids, each once */
  const idsFrom = (v, label) => {
    if (v == null) return [];
    if (!Array.isArray(v)) throw new HttpError(400, label + " must be a list of task ids");
    if (v.length > MAX_IDS) throw new HttpError(413, "Too many tasks at once (max " + MAX_IDS.toLocaleString("en-US") + ")");
    const seen = new Set();
    v.forEach(x => { if (security.validTaskId(x)) seen.add(x); });
    return Array.from(seen);
  };
  const setOf = userId => db.prepare("SELECT c.task_id AS id FROM task_checks c JOIN tasks t ON t.id=c.task_id AND t.workspace_id=c.workspace_id WHERE c.workspace_id=? AND c.user_id=? ORDER BY c.checked_at, c.task_id").all(WS_ID, userId).map(r => r.id);
  const announce = (u, ctx) => { const tab = tabOf(ctx); try { publish([u.id], Object.assign({ type: "checks_changed", by: u.id }, tab ? { tab } : {})); } catch (e) { /* live updates are best effort */ } };

  route("GET", "/api/task-checks", u => ({ ids: setOf(u.id) }));

  route("POST", "/api/task-checks", (u, p, q, b, ctx) => {
    b = b || {};
    const check = idsFrom(b.check, "check"), uncheck = idsFrom(b.uncheck, "uncheck"), clear = b.clear === true;
    const at = now();
    const add = db.prepare("INSERT INTO task_checks (workspace_id, user_id, task_id, checked_at) SELECT ?, ?, t.id, ? FROM tasks t WHERE t.id=? AND t.workspace_id=? ON CONFLICT (workspace_id, user_id, task_id) DO NOTHING");
    const drop = db.prepare("DELETE FROM task_checks WHERE workspace_id=? AND user_id=? AND task_id=?");
    let changed = 0;
    db.exec("BEGIN");
    try {
      if (clear) changed += db.prepare("DELETE FROM task_checks WHERE workspace_id=? AND user_id=?").run(WS_ID, u.id).changes;
      check.forEach(id => { changed += add.run(WS_ID, u.id, at, id, WS_ID).changes; });
      uncheck.forEach(id => { changed += drop.run(WS_ID, u.id, id).changes; });
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
    if (changed) announce(u, ctx);
    return { ids: setOf(u.id) };
  });
};
