/* v38 remove demo data from a workspace that was first started with demo content
   (NODE_ENV not production, or COS_SEED_DEMO=1). Real accounts and real work are kept.

   A user counts as demo only if its id is one of the demo ids in shared/demo-data.js AND it still
   looks like the demo account (a @zencrevia.demo email, or the demo name and it never signed in).
   A real colleague who happens to be called "Sarah" (id "sarah") is therefore never touched.

   people   : demo accounts are removed from the workspace and can no longer sign in; their open
              tasks, reviews and project ownership move to the admin who runs the purge.
   content  : demo tasks (incl. the H-### analytics history), demo projects/assets/knowledge/views
              and chat messages written by demo accounts. A demo project or team that real work
              has been added to is kept. */
const DEMO = require("../shared/demo-data");
const { tx } = require("./db");

function demoUserIds(db, keepId) {
  return Object.keys(DEMO.people).filter(id => id !== "admin" && id !== keepId).filter(id => {
    const u = db.prepare("SELECT u.id, u.name, u.email, u.last_login_at FROM users u JOIN workspace_members m ON m.user_id=u.id WHERE u.id=?").get(id);
    if (!u) return false;
    if (/@zencrevia\.demo$/i.test(u.email || "")) return true;
    return u.name === DEMO.people[id].name && !u.last_login_at;
  });
}

function preview(db, wsId, keepId) {
  const people = demoUserIds(db, keepId);
  const taskIds = demoTaskIds(db, wsId);
  return {
    people: people.map(id => ({ id, name: (db.prepare("SELECT name FROM users WHERE id=?").get(id) || {}).name })),
    tasks: taskIds.length,
    projects: demoProjects(db, wsId).length,
    assets: demoAssets(db).length,
    knowledge: demoPages(db).length,
  };
}
/* Ids alone are not enough: a real workspace numbers its own tasks T-101, T-102… too.
   A row is demo only when its id AND its title/name still match the seed. */
function demoTaskIds(db, wsId) {
  const out = [];
  DEMO.tasks.forEach(t => { const r = db.prepare("SELECT title FROM tasks WHERE id=? AND workspace_id=?").get(t.id, wsId); if (r && r.title === t.title) out.push(t.id); });
  db.prepare("SELECT id, title FROM tasks WHERE workspace_id=? AND id GLOB 'H-[0-9][0-9][0-9]'").all(wsId).forEach(r => { if (/ \u2014 wk \d+$/.test(r.title)) out.push(r.id); });
  return out;
}
const demoProjects = (db, wsId) => DEMO.projects.filter(p => { const r = db.prepare("SELECT name FROM projects WHERE id=? AND workspace_id=?").get(p.id, wsId); return r && r.name === p.name; });
const demoAssets = db => DEMO.assets.filter(a => { const r = db.prepare("SELECT name FROM assets WHERE id=?").get(a.id); return r && r.name === a.name; });
const demoPages = db => DEMO.knowledge.filter(k => { const r = db.prepare("SELECT title FROM knowledge_pages WHERE id=?").get(k.id); return r && r.title === k.title; });

function purge(db, wsId, keepId, opts, releaseAccount) {
  opts = Object.assign({ people: true, content: true }, opts || {});
  const out = { people: 0, tasks: 0, projects: 0, teams: 0, assets: 0, knowledge: 0, messages: 0 };
  tx(db, () => {
    if (opts.content) {
      const tids = demoTaskIds(db, wsId);
      tids.forEach(id => {
        ["task_dependencies"].forEach(t => { db.prepare("DELETE FROM " + t + " WHERE task_id=? OR depends_on_task_id=?").run(id, id); });
        ["briefs", "task_tags", "custom_field_values", "files", "comments", "approvals", "revision_requests", "file_versions"].forEach(t => { try { db.prepare("DELETE FROM " + t + " WHERE task_id=?").run(id); } catch (e) {} });
        db.prepare("UPDATE tasks SET parent_task_id=NULL WHERE parent_task_id=?").run(id);
        db.prepare("DELETE FROM activity_logs WHERE entity_type='task' AND entity_id=?").run(id);
        db.prepare("DELETE FROM notifications WHERE entity_id=?").run(id);
        db.prepare("DELETE FROM tasks WHERE id=?").run(id); out.tasks++;
      });
      demoProjects(db, wsId).forEach(p => {
        if (db.prepare("SELECT 1 FROM tasks WHERE project_id=?").get(p.id)) return; /* real work lives here */
        db.prepare("DELETE FROM milestones WHERE project_id=?").run(p.id);
        db.prepare("DELETE FROM project_members WHERE project_id=?").run(p.id);
        db.prepare("DELETE FROM projects WHERE id=?").run(p.id); out.projects++;
      });
      demoAssets(db).forEach(a => { if (db.prepare("DELETE FROM assets WHERE id=?").run(a.id).changes) out.assets++; });
      demoPages(db).forEach(k => { if (db.prepare("DELETE FROM knowledge_pages WHERE id=?").run(k.id).changes) out.knowledge++; });
      db.prepare("DELETE FROM knowledge_folders WHERE id LIKE 'kf_seed_%' AND NOT EXISTS (SELECT 1 FROM knowledge_pages k WHERE k.folder=knowledge_folders.name)").run();
      DEMO.savedViews.forEach(v => { try { db.prepare("DELETE FROM saved_views WHERE id=?").run(v.id); } catch (e) {} });
      const demoIds = demoUserIds(db, keepId); demoIds.forEach(id => { try { db.prepare("DELETE FROM decisions WHERE created_by=?").run(id); } catch (e) {} db.prepare("DELETE FROM activity_logs WHERE actor_id=?").run(id); });
    }
    if (opts.people) {
      const ids = demoUserIds(db, keepId);
      ids.forEach(id => {
        db.prepare("UPDATE tasks SET assignee_id=? WHERE assignee_id=?").run(keepId, id);
        db.prepare("UPDATE tasks SET reviewer_id=NULL WHERE reviewer_id=?").run(id);
        db.prepare("SELECT id, assignees, reviewers FROM tasks WHERE assignees LIKE ? OR reviewers LIKE ?").all('%"' + id + '"%', '%"' + id + '"%').forEach(t => {
          const fix = (json, repl) => { let a = []; try { a = JSON.parse(json || "[]"); } catch (e) {} a = a.map(x => x === id ? repl : x).filter(Boolean); return JSON.stringify(Array.from(new Set(a))); };
          db.prepare("UPDATE tasks SET assignees=?, reviewers=? WHERE id=?").run(fix(t.assignees, keepId), fix(t.reviewers, null), t.id);
        });
        db.prepare("UPDATE projects SET owner_id=? WHERE owner_id=?").run(keepId, id);
        db.prepare("UPDATE teams SET team_lead_id=NULL WHERE team_lead_id=?").run(id);
        db.prepare("DELETE FROM project_members WHERE user_id=?").run(id);
        db.prepare("DELETE FROM team_memberships WHERE user_id=?").run(id);
        db.prepare("DELETE FROM workspace_members WHERE user_id=? AND workspace_id=?").run(id, wsId);
        try { out.messages += db.prepare("DELETE FROM messages WHERE sender_id=?").run(id).changes; } catch (e) {}
        try { db.prepare("DELETE FROM conversation_members WHERE user_id=?").run(id); } catch (e) {}
        db.prepare("DELETE FROM notifications WHERE recipient_id=? OR actor_id=?").run(id, id);
        releaseAccount(id); out.people++;
      });
      if (opts.content) DEMO.teams.forEach(t => {
        const row = db.prepare("SELECT name FROM teams WHERE id=? AND workspace_id=?").get(t.id, wsId); if (!row || row.name !== t.name) return;
        if (db.prepare("SELECT 1 FROM team_memberships WHERE team_id=?").get(t.id) || db.prepare("SELECT 1 FROM tasks WHERE team_id=?").get(t.id)) return;
        db.prepare("UPDATE teams SET is_archived=1 WHERE id=? AND workspace_id=?").run(t.id, wsId); out.teams++;
      });
    }
  });
  return out;
}
module.exports = { purge, preview, demoUserIds };
