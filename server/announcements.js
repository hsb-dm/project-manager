/* ANNOUNCEMENT EMAILS (Oct 2026) — Settings → Notifications → Announcement email.

   Whoever holds the send_announcements capability — Admin only, unless a role is given it in Roles & permissions —
   writes a subject and a message (and, if they like, a link) and sends it by e-mail to every member of the
   workspace: everyone signed up, let in and active, with an e-mail address. Stakeholders (people outside the
   team) only when asked for. Or to the people chosen one by one (a stakeholder chosen is a stakeholder asked for).
   A test goes to the sender alone first, if they want to see it.

   Sending is one e-mail per person, through the same mail settings as every notification, one after another in
   the background; the request answers at once and the history says how far it got (sent, failed). At most five
   announcements an hour, so a mistake or a stuck button cannot flood everyone's inbox — or the mail account's
   sending limits.

   Live (Oct 2026, server/live-more.js): one sent shows at once in the list of whoever else has Settings →
   Notifications open, and in the sender's other tabs: live_changed {kind:"announcements", id, by, tab} when it starts
   and again, with no tab, when the last e-mail has gone. Only those who may send announcements hear of it, the only
   ones who see the list; a page that is told asks for the list and follows how far it got while it is going. A test
   changes no list and tells no one. */
module.exports = function announcements(db, WS_ID, d) {
  const { route, HttpError, forbid, can, mailer, sz, uid, now, security, live } = d;
  const tell = (id, u, ctx) => { if (live) live.toWhoever(v => can.sendAnnouncements(v), "announcements", id, u, ctx); };
  const PER_HOUR = 5;
  db.exec(`CREATE TABLE IF NOT EXISTS announcements (
    id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, subject TEXT NOT NULL, body TEXT NOT NULL, link TEXT, sent_by TEXT,
    stakeholders INTEGER DEFAULT 0, recipients INTEGER DEFAULT 0, sent INTEGER DEFAULT 0, failed INTEGER DEFAULT 0,
    status TEXT DEFAULT 'sending', created_at TEXT, finished_at TEXT);
    CREATE INDEX IF NOT EXISTS idx_announcements_ws ON announcements(workspace_id, created_at);`);
  /* chosen: sent to people picked one by one rather than to everyone */
  try { db.exec("ALTER TABLE announcements ADD COLUMN chosen INTEGER DEFAULT 0"); } catch (e) { /* already there */ }

  /* who can receive one: members let in and active, with an address */
  const reachable = () => db.prepare("SELECT u.id, u.name, u.email, coalesce(wm.is_stakeholder,0) AS stakeholder FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=? AND u.is_active=1 AND coalesce(wm.pending,0)=0 AND coalesce(u.email,'')<>''").all(WS_ID);
  /* everyone — stakeholders only when asked for — or the people chosen, each of whom must still be reachable */
  function audience(b) {
    const all = reachable();
    if (!Array.isArray(b && b.recipients)) return all.filter(r => (b && b.stakeholders) || !r.stakeholder);
    const ids = [...new Set(b.recipients.map(String))], list = all.filter(r => ids.includes(r.id));
    if (!ids.length) throw new HttpError(400, "Choose at least one person");
    if (list.length < ids.length) throw new HttpError(400, (ids.length - list.length) + " of the people chosen can no longer receive it (no e-mail address, or no longer in the workspace). Reload and choose again.");
    return list;
  }
  const shape = r => ({ id: r.id, subject: r.subject, body: r.body, link: r.link || "", by: r.sent_by, stakeholders: !!r.stakeholders, chosen: !!r.chosen, recipients: r.recipients, sent: r.sent, failed: r.failed, status: r.status, createdAt: r.created_at, finishedAt: r.finished_at || null });
  const history = () => db.prepare("SELECT * FROM announcements WHERE workspace_id=? ORDER BY created_at DESC LIMIT 10").all(WS_ID).map(shape);
  function fields(b) {
    const subject = String((b && b.subject) || "").replace(/[\r\n]+/g, " ").trim(), body = String((b && b.message) || "").replace(/\r\n/g, "\n").trim(), link = String((b && b.link) || "").trim();
    if (!subject) throw new HttpError(400, "Write a subject");
    if (!body) throw new HttpError(400, "Write a message");
    if (subject.length > 150) throw new HttpError(413, "The subject is too long (max 150 characters)");
    if (body.length > 5000) throw new HttpError(413, "The message is too long (max 5,000 characters)");
    if (link) { let u; try { u = new URL(link); } catch (e) { throw new HttpError(400, "The link is not valid"); } if (u.protocol !== "https:" || link.length > 500) throw new HttpError(400, "The link must start with https://"); }
    return { subject, body, link };
  }
  const mail = (ws, sender, r, f) => mailer.send({
    to: r.email, subject: "[" + ws.name + "] " + f.subject, text: "Hi " + String(r.name || "").split(" ")[0] + ",\n\n" + f.body, meta: {},
    link: f.link || mailer.link("/"), cta: f.link ? "Open the link" : "Open ZenCrevia", workspace: ws.name,
    footer: "You receive this because you are a member of " + ws.name + ". Sent by " + (sender.name || "an admin") + " from ZenCrevia." });

  route("GET", "/api/announcements", (u) => {
    forbid(can.sendAnnouncements(u), "send announcements");
    const all = reachable();
    /* who can be chosen: their ids — names, photos and teams the page already has */
    return { members: all.filter(r => !r.stakeholder).length, stakeholders: all.filter(r => r.stakeholder).length, people: all.map(r => ({ id: r.id, stakeholder: !!r.stakeholder })), perHour: PER_HOUR, history: history() };
  });

  route("POST", "/api/announcements", (u, p, q, b, ctx) => {
    forbid(can.sendAnnouncements(u), "send announcements");
    const f = fields(b), ws = sz.readWorkspace(db, WS_ID), sender = db.prepare("SELECT name, email FROM users WHERE id=?").get(u.id) || {};
    /* a test: to the sender alone, and the answer says whether it went */
    if (b && b.test) {
      if (!sender.email) throw new HttpError(400, "Your account has no e-mail address");
      return mail(ws, sender, { email: sender.email, name: sender.name }, f).then(() => ({ ok: true, test: true, to: sender.email }))
        .catch(e => { throw new HttpError(424, "The test could not be sent: " + e.message); });
    }
    const hour = new Date(Date.now() - 3600000).toISOString();
    if (db.prepare("SELECT count(*) AS n FROM announcements WHERE workspace_id=? AND created_at>?").get(WS_ID, hour).n >= PER_HOUR) throw new HttpError(429, "At most " + PER_HOUR + " announcements an hour. Try again later.");
    const people = audience(b || {}), chosen = Array.isArray(b && b.recipients);
    if (!people.length) throw new HttpError(400, "No one in the workspace has an e-mail address yet");
    const id = uid("an");
    db.prepare("INSERT INTO announcements (id,workspace_id,subject,body,link,sent_by,stakeholders,chosen,recipients,sent,failed,status,created_at) VALUES (?,?,?,?,?,?,?,?,?,0,0,'sending',?)")
      .run(id, WS_ID, f.subject, f.body, f.link || null, u.id, !chosen && b && b.stakeholders ? 1 : 0, chosen ? 1 : 0, people.length, now());
    security.log("announcement_sent", { userId: u.id, recipients: people.length, chosen });
    tell(id, u, ctx);
    /* one after another, in the background; the history counts as it goes */
    setImmediate(async () => {
      let sent = 0, failed = 0;
      for (const r of people) {
        try { await mail(ws, sender, r, f); sent++; } catch (e) { failed++; console.error("[announcement] " + r.email + ": " + e.message); }
        try { db.prepare("UPDATE announcements SET sent=?, failed=? WHERE id=?").run(sent, failed, id); } catch (e) {}
      }
      try { db.prepare("UPDATE announcements SET status=?, finished_at=? WHERE id=?").run(failed ? (sent ? "partial" : "failed") : "sent", now(), id); } catch (e) {}
      tell(id, u, null);   /* done: no request behind this one, so no tab */
    });
    return { announcement: shape(db.prepare("SELECT * FROM announcements WHERE id=?").get(id)), history: history() };
  });
};
