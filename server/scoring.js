/* SMART SCORING — THE SETTINGS, AND THE LEADS' PERMISSIONS IN ONE CLICK (Oct 2026). docs/SMART-SCORING.md

   The workspace's Smart Scoring settings are one JSON object in workspaces.scoring_settings, in the shape of
   shared/scoring-settings.js. Everyone signed in reads them (GET /api/scoring/settings; the workspace document carries
   them too, as ws.scoring). Only whoever holds scoring_manage_workspace — Admin, unless a role or a person is given it —
   changes them, through PUT /api/scoring/settings, and only from the version they were looking at: a save made on an
   older version than the one stored answers 409, so two people never overwrite each other unseen. What is saved is
   normalized first, the version goes up by one, and the change is written to scoring_audit with the whole old and new
   settings and the list of what changed, as well as to the workspace's history and the security log. A save that
   changes nothing is not a change: no new version, no audit row.

   The server keeps a few fields its own: the version, who saved and when, when the efficiency bonus was turned on
   (bonus.enabledAt — only estimates locked after it can ever earn one), and the weighted points mapping version, which
   goes up whenever the weights or the scale change so a stored score always says which mapping made it. The bonus
   stays off until the awards ship (BONUS_READY).

   POST /api/scoring/delegate-leads is the one-click hand-over the owner asked for: the Team Lead and Creative Lead roles
   (where they exist) are given the permissions to approve estimates, approve finished work and see the team's scoring
   analytics. For whoever manages roles; nothing else about the roles changes; audited.

   With COS_SCORING=0 on the server every route here answers 409 "Smart Scoring is turned off on this server" and the
   page hides the feature; the settings, the tables and the audit stay as they are.

   Registered in server.js after the AI helpers, like the scoring modules of the later phases. Returns
   { settings, audit, featureOn, isOn, moduleOn } for them: settings() is the current normalized settings object. */
const model = require("../shared/scoring-settings");

module.exports = function scoring(db, WS_ID, d) {
  const { route, HttpError, forbid, can, security, uid, now, tx, act, readRoles, featureOn } = d;
  const BONUS_READY = false;   /* Phase 3 (the efficiency awards) turns this on; until then a save keeps the bonus off */
  const LEAD_ROLES = ["team_lead", "creative_lead"];
  const LEAD_CAPS = ["scoring_approve_estimate", "scoring_approve_completion", "scoring_view_analytics"];
  const SHOWN = 20;   /* the settings changes the Settings tab lists */
  const parse = (v, dflt) => { if (v == null || v === "") return dflt; try { return JSON.parse(v); } catch (e) { return dflt; } };

  function settings() { const r = db.prepare("SELECT scoring_settings FROM workspaces WHERE id=?").get(WS_ID); return model.normalizeSettings(r ? r.scoring_settings : null); }
  /* one row of the audit: what was done to what, by whom (and who was acting as them), the old and new value, why */
  function audit(e) {
    const id = uid("sa"), json = v => v === undefined || v === null ? null : JSON.stringify(v);
    db.prepare("INSERT INTO scoring_audit (id,workspace_id,task_id,module,action,actor_id,impersonated_by,old_value,new_value,reason,meta,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)")
      .run(id, WS_ID, e.taskId || null, e.module || null, String(e.action), e.actor || null, e.impersonatedBy || null, json(e.oldValue), json(e.newValue), e.reason ? String(e.reason).slice(0, 1000) : null, JSON.stringify(e.meta || {}), e.at || now());
    return id;
  }
  const shape = r => { const m = parse(r.meta, {}) || {}; return { id: r.id, action: r.action, by: r.actor_id, impersonatedBy: r.impersonated_by || null, at: r.created_at, reason: r.reason || "", diff: Array.isArray(m.diff) ? m.diff : [], configVersion: m.configVersion || null, added: m.added || null }; };
  const settingsAudit = () => db.prepare("SELECT * FROM scoring_audit WHERE workspace_id=? AND module='settings' ORDER BY created_at DESC, rowid DESC LIMIT ?").all(WS_ID, SHOWN).map(shape);
  /* who sees the history of the settings: those who see the Settings tab */
  const seesAudit = u => can.scoringConfigure(u) || can.scoringViewAnalytics(u) || can.manageRoles(u);
  function on() { if (!featureOn()) throw new HttpError(409, "Smart Scoring is turned off on this server"); }

  route("GET", "/api/scoring/settings", (u) => { on(); return { settings: settings(), audit: seesAudit(u) ? settingsAudit() : [] }; });

  route("PUT", "/api/scoring/settings", (u, p, q, b, ctx) => {
    on();
    forbid(can.scoringConfigure(u), "change the Smart Scoring settings");
    if (!b || !b.settings || typeof b.settings !== "object" || Array.isArray(b.settings)) throw new HttpError(400, "Send the settings to save");
    if (JSON.stringify(b.settings).length > 100000) throw new HttpError(413, "These settings are too large");
    if (!/^\d{1,9}$/.test(String(b.configVersion))) throw new HttpError(400, "Say which version of the settings was changed (configVersion)");
    const reason = String((b && b.reason) || "").trim(); if (reason.length > 1000) throw new HttpError(413, "Text is too long: reason (max 1,000 characters)");
    const out = tx(db, () => {
      const cur = settings();
      if (+b.configVersion !== cur.configVersion) throw new HttpError(409, "Someone else changed the Smart Scoring settings in the meantime. Reload them and make your change again.");
      const next = model.normalizeSettings(b.settings);
      next.configVersion = cur.configVersion; next.updatedAt = cur.updatedAt; next.updatedBy = cur.updatedBy;
      if (!BONUS_READY) next.bonus.on = false;
      next.bonus.enabledAt = next.bonus.on ? (cur.bonus.on && cur.bonus.enabledAt ? cur.bonus.enabledAt : now()) : null;
      next.weighted.mappingVersion = cur.weighted.mappingVersion;
      if (JSON.stringify([cur.weighted.weights, cur.weighted.scaleMax]) !== JSON.stringify([next.weighted.weights, next.weighted.scaleMax])) next.weighted.mappingVersion++;
      const diff = model.diffSettings(cur, next);
      if (!diff.length) return { settings: cur, unchanged: true };
      next.configVersion = cur.configVersion + 1; next.updatedAt = now(); next.updatedBy = u.id;
      db.prepare("UPDATE workspaces SET scoring_settings=?, updated_at=? WHERE id=?").run(JSON.stringify(next), now(), WS_ID);
      audit({ module: "settings", action: "settings_changed", actor: u.id, impersonatedBy: u.impersonatedBy, oldValue: cur, newValue: next, reason, meta: { diff, configVersion: next.configVersion } });
      act(u, "edited", "workspace", WS_ID, { what: "Smart Scoring settings" });
      return { settings: next, diff };
    });
    if (!out.unchanged) security.log("scoring_settings_changed", { userId: u.id, impersonatedBy: u.impersonatedBy || undefined, ip: ctx.ip, configVersion: out.settings.configVersion, enabled: out.settings.enabled, changes: out.diff.length, paths: out.diff.slice(0, 20).map(c => c.path) });
    return { settings: out.settings, unchanged: !!out.unchanged, audit: settingsAudit() };
  });

  route("POST", "/api/scoring/delegate-leads", (u, p, q, b, ctx) => {
    on();
    forbid(can.manageRoles(u), "change roles");
    const added = {};
    tx(db, () => {
      LEAD_ROLES.forEach(id => {
        const r = db.prepare("SELECT permissions FROM roles WHERE id=?").get(id); if (!r) return;
        let perms = parse(r.permissions, []); if (!Array.isArray(perms)) perms = [];
        const add = LEAD_CAPS.filter(c => perms.indexOf(c) < 0); if (!add.length) return;
        db.prepare("UPDATE roles SET permissions=? WHERE id=?").run(JSON.stringify(perms.concat(add)), id); added[id] = add;
      });
      if (Object.keys(added).length) {
        audit({ module: "settings", action: "leads_delegated", actor: u.id, impersonatedBy: u.impersonatedBy, newValue: added, meta: { added } });
        act(u, "edited", "workspace", WS_ID, { what: "roles " + Object.keys(added).join(", ") + " (Smart Scoring approval and analytics)" });
      }
    });
    if (Object.keys(added).length) security.log("scoring_leads_delegated", { userId: u.id, impersonatedBy: u.impersonatedBy || undefined, ip: ctx.ip, added });
    return { roles: readRoles(), added, audit: seesAudit(u) ? settingsAudit() : [] };
  });

  return {
    settings,
    audit,
    featureOn,
    /* the master switch, and a module inside it; both false while the server has the feature turned off */
    isOn: () => !!featureOn() && settings().enabled,
    moduleOn: id => !!featureOn() && model.moduleOn(settings(), id),
    LEAD_CAPS
  };
};
