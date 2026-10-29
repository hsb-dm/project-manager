/* LIVE UPDATES FOR WHAT HAD NONE (Oct 2026): saved views, AI Gallery and the announcement e-mails' list.

   A change to one of them used to reach nobody: not a colleague with the same screen open, not the person's own
   other tab or phone. It now goes out over the live stream (server/messages.js publishToUsers) as one small event,
       { type: "live_changed", kind, id, by, tab }
   and each page that shows the thing asks again for just that list and patches it in place (src/live-more.js). The
   event says what changed, never what it now says: its name, notes or picture are only in what the page asks for,
   and the server answers that as it always has, by the asker's own permissions.

   Who hears of a change is who may see the thing (each module says it where it publishes):
   - "views": a saved view is its owner's alone (serialize.readViews reads the owner's), so only the owner's pages;
   - "gallery": a design in use, everyone who may view AI Gallery; one archived both before and after the change,
     only its owner and whoever manages every design; a favourite is the person's own, so only their pages;
   - "announcements": whoever may send them, the only ones who see the list (server/announcements.js).
   Only people with a page open are looked at (chat.isOnline), so a workspace of a hundred costs a handful of reads.

   tab: the X-ZC-Tab header of the request that made the change (src/core.js ZC_TAB, a random id made once per page
   load), kept only when it is well formed, so the page that made the change can leave it alone; a change with no
   request behind it (a job, the server itself) has none. */
const TAB_RE = /^[a-z0-9]{8,32}$/;
/* the tab a request came from: ctx is a route's fifth argument ({ req, … }) or the request itself */
function tabOf(ctx) {
  const req = ctx && (ctx.req || ctx), h = req && req.headers ? req.headers["x-zc-tab"] : null;
  return typeof h === "string" && TAB_RE.test(h) ? h : null;
}
module.exports = function liveMore(db, WS_ID, d) {
  /* chat is asked for when something is sent: the messages module is made after the modules that publish */
  const { userContext, chat } = d || {};
  const hub = () => { try { return typeof chat === "function" ? chat() : chat; } catch (e) { return null; } };
  /* the workspace's active members with a page open now */
  function online() {
    const c = hub(); if (!c || !c.publishToUsers) return [];
    const ids = db.prepare("SELECT m.user_id FROM workspace_members m JOIN users u ON u.id=m.user_id WHERE m.workspace_id=? AND u.is_active=1 AND coalesce(m.pending,0)=0").all(WS_ID).map(r => r.user_id);
    return typeof c.isOnline === "function" ? ids.filter(id => c.isOnline(id)) : ids;
  }
  /* to these people's pages */
  function send(ids, kind, id, by, ctx) {
    try {
      const c = hub(); if (!c || !c.publishToUsers || !ids || !ids.length) return;
      const ev = { type: "live_changed", kind, id: id == null ? null : String(id), by: by && by.id !== undefined ? by.id : (by || null) };
      const tab = tabOf(ctx); if (tab) ev.tab = tab;
      c.publishToUsers(ids, ev);
    } catch (e) { /* live updates are best effort: the next load has it */ }
  }
  /* to everyone with a page open who passes see(user) — user as the routes know them (userContext) */
  function toWhoever(see, kind, id, by, ctx) {
    try {
      const ids = online().filter(uid => { const u = typeof userContext === "function" ? userContext(uid) : null; return !!u && !!see(u); });
      send(ids, kind, id, by, ctx);
    } catch (e) { /* best effort */ }
  }
  return { tabOf, send, toWhoever, toSelf: (u, kind, id, ctx) => send(u ? [u.id] : [], kind, id, u, ctx) };
};
module.exports.tabOf = tabOf;
module.exports.TAB_RE = TAB_RE;
