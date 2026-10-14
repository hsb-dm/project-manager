/* PROJECT DISCUSSION (Oct 2026) — the project-level conversation shown on a project's Overview and its
   Discussion tab.

   A task's comments are kept with the task and written back whole with it. A project's discussion is a table
   of its own (db/schema.sql project_comments) with routes of its own, so posting one comment is one small
   write, and a page of the newest threads is one indexed read: the Overview asks for three, the Discussion
   tab for twenty at a time, older ones on request.

   The rules are the task comments' rules:
   • a stakeholder reads and writes only what stakeholders may see; anyone else chooses Internal or
     Stakeholder-visible, and a reply is never more widely visible than the comment it answers;
   • a reply hangs off the first comment of its thread (one level, as in a task);
   • whoever wrote a comment changes or removes it, and an admin may; removing one leaves its replies;
   • an archived project stays readable and takes no new comment, change or removal until it is restored.
   Who is told: the people named with @, whoever wrote the comment being answered, and the project's owner —
   each once, and never anyone who could not read the comment. */
module.exports = function projectDiscussion(db, WS_ID, d) {
  const { route, HttpError, forbid, can, has, tooLong, validateStoredFiles, uid, now, J, S, userContext, notifyUsers, publish } = d;
  const MAX_TEXT = 10000, MAX_ATT = 50;

  function projectOf(id) {
    const p = db.prepare("SELECT id, name, status, owner_id, team_ids FROM projects WHERE id=? AND workspace_id=?").get(String(id || ""), WS_ID);
    if (!p) throw new HttpError(404, "Project not found");
    return { id: p.id, name: p.name, status: p.status, owner: p.owner_id, teams: J(p.team_ids, []), team: db.prepare("SELECT user_id FROM project_members WHERE project_id=?").all(p.id).map(r => r.user_id) };
  }
  /* who takes part: as for a task's comments — anyone who sees all work, whoever runs or is on the project, a stakeholder */
  const involved = (u, p) => !!u && can.comment(u) && (u.stakeholder || has(u, "view_all") || can.editProject(u, p) || p.owner === u.id || p.team.includes(u.id));
  const writable = p => { if (p.status === "archived") throw new HttpError(409, "This project is archived. Restore the project to add comments."); };
  const onlyClient = u => u.stakeholder ? " AND visibility='client'" : "";
  const shape = (r, replyCount) => Object.assign({ id: r.id, by: r.author_id, vis: r.visibility === "client" ? "client" : "internal", text: r.body, parent: r.parent_id || null, attachments: J(r.attachments, []), createdAt: r.created_at, editedAt: r.edited_at || null }, replyCount == null ? {} : { replyCount });
  const total = (u, p) => db.prepare("SELECT count(*) AS n FROM project_comments WHERE workspace_id=? AND project_id=?" + onlyClient(u)).get(WS_ID, p.id).n;
  const rowOf = (u, p, cid) => { const r = db.prepare("SELECT * FROM project_comments WHERE id=? AND project_id=?").get(String(cid || ""), p.id); if (!r || (u.stakeholder && r.visibility !== "client")) throw new HttpError(404, "Comment not found"); return r; };
  const attachmentsFrom = list => (Array.isArray(list) ? list : []).filter(a => a && typeof a === "object").slice(0, MAX_ATT);
  /* pictures checked and stored as files, links https or ours — the task comment's checks */
  const stored = (att, userId) => { const doc = { comments: [{ attachments: att }] }; validateStoredFiles(doc, userId); return doc.comments[0].attachments; };

  /* The people a comment names: "@Full Name" as the @ picker writes it, or the older "@id". Longest names first,
     each taken out once matched, so "@Anna Wijaya" does not also name an "Anna". */
  function mentionsIn(text) {
    let t = String(text || ""); const out = [];
    const reEsc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    db.prepare("SELECT u.id, u.name FROM workspace_members wm JOIN users u ON u.id=wm.user_id WHERE wm.workspace_id=? AND u.is_active=1 AND coalesce(wm.pending,0)=0").all(WS_ID)
      .sort((a, b) => String(b.name || "").length - String(a.name || "").length)
      .forEach(m => {
        [m.name, m.id].filter(Boolean).forEach(n => {
          const re = new RegExp("(^|[\\s(])@" + reEsc(n) + "(?=\\s|$|[.,!?;:)])", "gi");
          if (re.test(t)) { if (!out.includes(m.id)) out.push(m.id); t = t.replace(re, "$1"); }
        });
      });
    return out;
  }
  /* each person once — a mention first — and only those who may read the comment */
  function tell(u, p, row, mentioned, others) {
    const mayRead = id => { if (!id || id === u.id) return false; const c = userContext(id); return !!c && (row.visibility === "client" || !c.stakeholder) && involved(c, p); };
    const seen = new Set(), list = [];
    const add = (id, k, reply) => { if (seen.has(id) || !mayRead(id)) return; seen.add(id); list.push({ id, k, reply: !!reply }); };
    mentioned.forEach(id => add(id, "mention"));
    (others || []).forEach(o => add(o.id, "comment", o.reply));
    if (list.length) notifyUsers(list.slice(0, 25), { who: u.id, t: p.id, entityType: "project", comment: row.id, text: String(row.body || "").slice(0, 160) });
  }
  /* everyone signed in hears that this discussion changed (which comment, not what it says) and asks for it again */
  const announce = (u, p, cid) => publish({ type: "project_comments", project: p.id, comment: cid, by: u.id });

  route("GET", "/api/projects/:id/comments", (u, p, q) => {
    const pr = projectOf(p.id); forbid(involved(u, pr), "read this project's discussion");
    const limit = Math.max(1, Math.min(50, parseInt(q.limit, 10) || 20)), vis = onlyClient(u), args = [WS_ID, pr.id];
    let older = "";
    if (q.before) { const b = db.prepare("SELECT created_at, id FROM project_comments WHERE id=? AND project_id=?").get(String(q.before), pr.id); if (b) { older = " AND (created_at < ? OR (created_at = ? AND id < ?))"; args.push(b.created_at, b.created_at, b.id); } }
    const roots = db.prepare("SELECT * FROM project_comments WHERE workspace_id=? AND project_id=? AND parent_id IS NULL" + vis + older + " ORDER BY created_at DESC, id DESC LIMIT ?").all(...args, limit + 1);
    const hasMore = roots.length > limit; if (hasMore) roots.length = limit;
    const ids = roots.map(r => r.id);
    const replies = ids.length ? db.prepare("SELECT * FROM project_comments WHERE parent_id IN (" + ids.map(() => "?").join(",") + ")" + vis + " ORDER BY created_at, id").all(...ids) : [];
    const count = {}; replies.forEach(r => { count[r.parent_id] = (count[r.parent_id] || 0) + 1; });
    const list = roots.reverse().map(r => shape(r, count[r.id] || 0));
    /* the Overview shows the newest threads and how many replies each has; the tab shows the replies */
    return { comments: q.view === "preview" ? list : list.concat(replies.map(r => shape(r))), total: total(u, pr), hasMore, archived: pr.status === "archived" };
  });

  route("POST", "/api/projects/:id/comments", (u, p, q, b) => {
    const pr = projectOf(p.id); forbid(involved(u, pr), "comment on this project"); writable(pr);
    b = b || {};
    const text = String(b.text || "").trim(); tooLong("comment", text, MAX_TEXT);
    let att = attachmentsFrom(b.attachments);
    if (!text && !att.length) throw new HttpError(400, "Write something first");
    /* the same comment sent twice (a retry after a lost answer) is saved once */
    const wanted = /^[-\w]{1,40}$/.test(String(b.id || "")) ? String(b.id) : null, was = wanted && db.prepare("SELECT * FROM project_comments WHERE id=?").get(wanted);
    if (was && was.project_id === pr.id && was.author_id === u.id) return { comment: shape(was), total: total(u, pr) };
    let vis = u.stakeholder ? "client" : b.vis === "client" ? "client" : "internal", parent = null;
    if (b.parent) {
      let row = rowOf(u, pr, b.parent);
      for (let hop = 0; row.parent_id && hop < 20; hop++) { const up = db.prepare("SELECT * FROM project_comments WHERE id=? AND project_id=?").get(row.parent_id, pr.id); if (!up) break; row = up; }
      if (u.stakeholder && row.visibility !== "client") throw new HttpError(404, "Comment not found");
      parent = row; if (row.visibility !== "client") vis = "internal";   /* never more widely visible than what it answers */
    }
    att = stored(att, u.id);
    const id = wanted && !was ? wanted : uid("pc");
    db.prepare("INSERT INTO project_comments (id,workspace_id,project_id,parent_id,author_id,visibility,body,attachments,created_at,edited_at) VALUES (?,?,?,?,?,?,?,?,?,NULL)")
      .run(id, WS_ID, pr.id, parent ? parent.id : null, u.id, vis, text, S(att), now());
    const row = db.prepare("SELECT * FROM project_comments WHERE id=?").get(id);
    tell(u, pr, row, mentionsIn(text), [parent ? { id: parent.author_id, reply: true } : null, { id: pr.owner }].filter(Boolean));
    announce(u, pr, id);
    return { comment: shape(row), total: total(u, pr) };
  });

  /* the words and attachments change; who can see it and the thread it is in stay as they were */
  route("PUT", "/api/projects/:id/comments/:cid", (u, p, q, b) => {
    const pr = projectOf(p.id), row = rowOf(u, pr, p.cid);
    forbid((row.author_id === u.id && can.comment(u)) || can.manageWorkspace(u), "edit this comment"); writable(pr);
    b = b || {};
    const text = String(b.text || "").trim(); tooLong("comment", text, MAX_TEXT);
    let att = Array.isArray(b.attachments) ? attachmentsFrom(b.attachments) : J(row.attachments, []);
    if (!text && !att.length) throw new HttpError(400, "Write something first");
    if (text === row.body && S(att) === S(J(row.attachments, []))) return { comment: shape(row), total: total(u, pr) };
    att = stored(att, u.id);
    db.prepare("UPDATE project_comments SET body=?, attachments=?, edited_at=? WHERE id=?").run(text, S(att), now(), row.id);
    const next = db.prepare("SELECT * FROM project_comments WHERE id=?").get(row.id), before = mentionsIn(row.body);
    tell(u, pr, next, mentionsIn(text).filter(id => !before.includes(id)), []);   /* only whoever the new words name */
    announce(u, pr, row.id);
    return { comment: shape(next), total: total(u, pr) };
  });

  route("DELETE", "/api/projects/:id/comments/:cid", (u, p) => {
    const pr = projectOf(p.id), row = rowOf(u, pr, p.cid);
    forbid(row.author_id === u.id || can.manageWorkspace(u), "remove this comment"); writable(pr);
    /* its replies stay, each on its own, as a task comment's do */
    db.exec("BEGIN");
    try { db.prepare("UPDATE project_comments SET parent_id=NULL WHERE parent_id=?").run(row.id); db.prepare("DELETE FROM project_comments WHERE id=?").run(row.id); db.exec("COMMIT"); }
    catch (e) { db.exec("ROLLBACK"); throw e; }
    announce(u, pr, row.id);
    return { ok: true, total: total(u, pr) };
  });

  return { mentionsIn };
};
