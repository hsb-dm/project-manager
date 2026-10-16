/* SMART SCORING — TIME WORKED ON A TASK, DAY BY DAY (Oct 2026). docs/SMART-SCORING.md, Phase 3a

   A task had one number for the time spent on it, "Actual" (meta.actualEffort), which anyone editing the task could
   type. Once Smart Scoring is on with Effort Hours — "time-log mode", scoring.isOn() && scoring.moduleOn("hours") —
   that number is no longer typed: the people assigned to the task log the time they worked, as dated entries, each
   one work, revision or blocked (time spent waiting on someone or something, kept apart), and Actual becomes their
   sum, written by the server: work + revision minutes ÷ 60, to the nearest quarter of an hour (never 0 once any work
   is logged). Blocked time is recorded and shown, never counted in Actual. Every reader of Actual — the AI's context,
   the exports, the analytics, today's effort estimate learning from finished tasks — keeps working unchanged.

   Who does what. Everyone who sees the task sees its time log (a stakeholder, outside the team, sees the totals but
   not the entries). Only the people assigned log time on it, and only their own (can.logTime); they change and
   delete their own entries while they are on the task. Anyone else's entry is corrected only by someone holding
   scoring_edit_task, with a reason. Every entry made, changed and deleted is written to scoring_audit with the
   entry as it was and as it became; a deletion is soft (deleted_at), so the audit and a later review can still read
   it, and a change of an entry a reviewer had verified takes the verification away.

   What is refused, and what is only said. A day that has not come yet; a day more than 60 days back, unless the
   person may correct scores (the error says so); an entry under 1 minute or over 24 hours; a start or end that is not
   a time of day, an end before the start, more minutes than the time between them; an entry whose start and end
   overlap another of the same person on the same day (on any task); and a day on which one person would have more
   than 24 hours. A day above 1.5 × the person's usual hours (workspace_members.hours_per_day, 8 when unset) is saved,
   with a warning in the answer.

   The single number of before stays as it was: a task with an Actual and no time log gets one entry for it — source
   'legacy', not verified, work, all of it on the day the task was finished (or last changed), for its first assignee
   (or creator). That happens once for the whole workspace when the time log is first on (app_meta
   scoring_time_backfill_v1, in one transaction, the count logged), and for one task when its first entry is logged
   after that. Making those entries never changes Actual; the task's Actual becomes the log's sum the first time its
   log is changed. The page shows them as "from before the time log (not verified)"; the person whose entry it is may
   delete it (to log the days instead), and only a corrector changes its minutes.

   Changing entries, the task is told: its Actual (read, changed and written in the same transaction as the entry)
   and updated_at, so every open tab fetches it again (deps.announceTask, as a task save does), and the data version
   (deps.bumpData). With Smart Scoring's onTaskWritten (server/scoring.js, when it is there) a task saved, moved or
   restored gets its Actual back from the log; a sweep every 10 minutes does the same for tasks changed since, and runs
   the backfill when the time log is turned on. While time-log mode is off every route here answers 409 and Actual is
   typed as before; with COS_SCORING=0, 409 "Smart Scoring is turned off on this server".

   Routes (the answer to each: { on, entries, totals, actualEffort, updatedAt, touched, can, limits, window }, and for
   a write also { entry, warnings }; entries newest day first):
     GET    /api/tasks/:id/time
     POST   /api/tasks/:id/time             { workDate:"YYYY-MM-DD", minutes, kind:"work"|"revision"|"blocked",
                                              startedAt?:"HH:MM", endedAt?:"HH:MM", note? (≤ 500) }   own entry
     PUT    /api/tasks/:id/time/:entryId    { any of those fields, reason? (≤ 1000; required for a correction) }
     DELETE /api/tasks/:id/time/:entryId?reason=…
   (work_date / started_at / ended_at are accepted for the camelCase names.) An entry: { id, userId, workDate, minutes,
   kind, startedAt, endedAt, note, source:"manual"|"legacy", verified, verifiedBy, verifiedAt, createdBy, createdAt,
   editedBy, editedAt }. totals: { minutes:{work,revision,blocked}, actualHours, byPerson:{userId:{work,revision,
   blocked,actualHours}} }. A warning: { code:"long_day", key, vars, text } — key is the English sentence with
   {placeholders}, for the page to translate.

   Registered in server.js right after server/scoring.js. Returns { backfill, sync, sweep, state, logMode }; the pure
   arithmetic is module.exports.math (tests/scoring-sanity.test.js). */
const DAY = 86400000;
const KINDS = ["work", "revision", "blocked"];
const LIMITS = { minMinutes: 1, maxMinutes: 1440, maxDayMinutes: 1440, daysBack: 60, noteMax: 500, reasonMax: 1000, longDayFactor: 1.5, perTask: 3000, legacyMax: 600000 };
const BACKFILL_KEY = "scoring_time_backfill_v1";
const OFF = "Time logging is off. It is on while Smart Scoring and its Effort Hours are turned on (Settings → Smart Scoring).";
const WINDOW = "Only the last 60 days can be logged or changed. An older day needs someone who may correct scores (the scoring_edit_task permission).";

/* ---------- the arithmetic (pure) ---------- */
/* hours to the nearest quarter, never 0 once a minute is logged */
function actualHours(minutes) { const m = Math.max(0, Math.round(+minutes || 0)); return m ? Math.max(0.25, Math.round(m / 15) / 4) : 0; }
function totals(entries) {
  const minutes = { work: 0, revision: 0, blocked: 0 }, byPerson = {};
  (entries || []).forEach(e => {
    if (!e || e.deletedAt) return;
    const k = KINDS.indexOf(e.kind) >= 0 ? e.kind : "work", n = Math.max(0, Math.round(+e.minutes || 0));
    minutes[k] += n;
    const p = byPerson[e.userId] || (byPerson[e.userId] = { work: 0, revision: 0, blocked: 0, actualHours: 0 }); p[k] += n;
  });
  Object.keys(byPerson).forEach(id => { const p = byPerson[id]; p.actualHours = actualHours(p.work + p.revision); });
  return { minutes, actualHours: actualHours(minutes.work + minutes.revision), byPerson };
}
/* "09:30" → minutes of the day; anything else → null */
function clock(v) { const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(String(v == null ? "" : v).trim()); return m ? +m[1] * 60 + +m[2] : null; }
const isoDay = ms => new Date(ms).toISOString().slice(0, 10);
function validDay(s) { s = String(s == null ? "" : s); if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false; const d = new Date(s + "T00:00:00Z"); return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s; }
/* the days that may be logged: up to today somewhere on Earth (UTC+14), back to 60 days before the earliest today (UTC−12) */
function dayWindow(nowMs, daysBack) { return { latest: isoDay(nowMs + 14 * 3600000), earliest: isoDay(nowMs - 12 * 3600000 - (daysBack == null ? LIMITS.daysBack : daysBack) * DAY) }; }
const hrs = min => Math.round(min / 60 * 100) / 100;

module.exports = function scoringTime(db, WS_ID, d) {
  const { scoring, route, HttpError, forbid, can, security, uid, now, tx, act } = d;
  const bumpData = typeof d.bumpData === "function" ? d.bumpData : () => {};
  const announce = typeof d.announceTask === "function" ? d.announceTask : null;
  const parse = (v, dflt) => { if (v == null || v === "") return dflt; try { const x = JSON.parse(v); return x == null ? dflt : x; } catch (e) { return dflt; } };
  db.exec("CREATE TABLE IF NOT EXISTS app_meta (key TEXT PRIMARY KEY, value TEXT)");

  const featureOn = () => (scoring && typeof scoring.featureOn === "function" ? !!scoring.featureOn() : true);
  const logMode = () => { try { return !!(scoring.isOn() && scoring.moduleOn("hours")); } catch (e) { return false; } };
  function on() { if (!featureOn()) throw new HttpError(409, "Smart Scoring is turned off on this server"); if (!logMode()) throw new HttpError(409, OFF); }
  /* our own transaction, unless one is already open (a hook called from inside another) */
  const inTx = fn => (db.isTransaction ? fn() : tx(db, fn));

  function taskRow(id) {
    const r = db.prepare("SELECT id, assignee_id, assignees, created_by, meta, updated_at, completed_at FROM tasks WHERE id=? AND workspace_id=?").get(id, WS_ID);
    if (!r) throw new HttpError(404, "Task not found");
    const a = parse(r.assignees, []);
    return { id: r.id, assignee: r.assignee_id || null, assignees: Array.isArray(a) ? a : [], createdBy: r.created_by || null, meta: parse(r.meta, {}), updatedAt: r.updated_at, completedAt: r.completed_at };
  }
  const shape = r => ({ id: r.id, userId: r.user_id, workDate: r.work_date, minutes: r.minutes, kind: r.kind, startedAt: r.started_at || null, endedAt: r.ended_at || null, note: r.note || "", source: r.source, verified: !!r.verified, verifiedBy: r.verified_by || null, verifiedAt: r.verified_at || null, createdBy: r.created_by || null, createdAt: r.created_at, editedBy: r.edited_by || null, editedAt: r.edited_at || null });
  const rowsOf = taskId => db.prepare("SELECT * FROM task_time_entries WHERE task_id=? AND workspace_id=? AND deleted_at IS NULL ORDER BY work_date DESC, coalesce(started_at,'') DESC, created_at DESC, rowid DESC").all(taskId, WS_ID);
  function entryOf(taskId, id) {
    const r = db.prepare("SELECT * FROM task_time_entries WHERE id=? AND task_id=? AND workspace_id=? AND deleted_at IS NULL").get(String(id), taskId, WS_ID);
    if (!r) throw new HttpError(404, "That time entry is not there any more. Reload the time log.");
    return shape(r);
  }
  /* the log is in charge of the task's Actual once anything but the legacy entry was logged, changed or deleted */
  const touched = taskId => !!db.prepare("SELECT 1 FROM task_time_entries WHERE task_id=? AND workspace_id=? AND (source<>'legacy' OR deleted_at IS NOT NULL OR edited_at IS NOT NULL) LIMIT 1").get(taskId, WS_ID);
  function hoursPerDay(userId) { const r = db.prepare("SELECT hours_per_day FROM workspace_members WHERE workspace_id=? AND user_id=?").get(WS_ID, userId); const h = r ? +r.hours_per_day : 0; return h > 0 && h <= 24 ? h : 8; }

  /* the task's Actual from its log, written onto the task (call inside a transaction); touch: updated_at even when the
     number is the same, so open tabs fetch the task again */
  function writeActual(taskId, touch) {
    const r = db.prepare("SELECT meta FROM tasks WHERE id=? AND workspace_id=?").get(taskId, WS_ID); if (!r) return null;
    const m = parse(r.meta, {}), had = m.actualEffort;
    const sum = db.prepare("SELECT coalesce(sum(minutes),0) AS m FROM task_time_entries WHERE task_id=? AND workspace_id=? AND deleted_at IS NULL AND kind IN ('work','revision')").get(taskId, WS_ID).m;
    const want = actualHours(sum), same = want > 0 ? +had === want : !(+had > 0);
    if (same && !touch) return null;
    const at = now();
    if (same) db.prepare("UPDATE tasks SET updated_at=? WHERE id=?").run(at, taskId);
    else { if (want > 0) m.actualEffort = want; else delete m.actualEffort; db.prepare("UPDATE tasks SET meta=?, updated_at=? WHERE id=?").run(JSON.stringify(m), at, taskId); }
    return { changed: !same, from: +had || 0, to: want, updatedAt: at };
  }

  /* ---------- the number of before, kept: one legacy entry for a task with an Actual and no log ---------- */
  function legacyEntry(t) {
    const a = +((t.meta || {}).actualEffort), minutes = Math.round(a * 60);
    if (!(a > 0) || !Number.isFinite(a) || minutes < 1) return 0;
    const who = t.assignee || (t.assignees || [])[0] || t.createdBy; if (!who) return -1;
    const day = String(t.completedAt || t.updatedAt || now()).slice(0, 10);
    db.prepare("INSERT INTO task_time_entries (id,workspace_id,task_id,user_id,work_date,minutes,kind,note,source,verified,created_by,created_at) VALUES (?,?,?,?,?,?,'work',NULL,'legacy',0,NULL,?)")
      .run(uid("te"), WS_ID, t.id, who, validDay(day) ? day : isoDay(Date.now()), Math.min(minutes, LIMITS.legacyMax), now());
    return 1;
  }
  let backfilled = false;
  function backfill() {
    if (backfilled) return null;
    if (db.prepare("SELECT 1 FROM app_meta WHERE key=?").get(BACKFILL_KEY)) { backfilled = true; return null; }
    if (!logMode()) return null;
    const out = inTx(() => {
      if (db.prepare("SELECT 1 FROM app_meta WHERE key=?").get(BACKFILL_KEY)) return null;
      const rows = db.prepare("SELECT t.id FROM tasks t WHERE t.workspace_id=? AND t.meta LIKE '%actualEffort%' AND NOT EXISTS (SELECT 1 FROM task_time_entries e WHERE e.task_id=t.id)").all(WS_ID);
      let entries = 0, skipped = 0;
      rows.forEach(r => { const n = legacyEntry(taskRow(r.id)); if (n > 0) entries++; else if (n < 0) skipped++; });
      db.prepare("INSERT INTO app_meta (key, value) VALUES (?, ?)").run(BACKFILL_KEY, JSON.stringify({ at: now(), entries, skipped }));
      if (entries || skipped) scoring.audit({ module: "time", action: "legacy_backfill", actor: null, newValue: { entries, skipped }, meta: { entries, skipped } });
      return { entries, skipped };
    });
    backfilled = true;
    if (out) console.log("[scoring-time] the Actual of before kept as legacy time entries: " + out.entries + " made, " + out.skipped + " without anyone to give them to");
    return out;
  }
  const ensureBackfill = () => { try { backfill(); } catch (e) { console.error("[scoring-time] backfill: " + e.message); } };

  /* ---------- what the log looks like to this person ---------- */
  function state(u, taskId) {
    const t = taskRow(taskId), list = rowsOf(taskId).map(shape), sum = totals(list), stake = !!u.stakeholder, perDay = hoursPerDay(u.id);
    return {
      on: true, entries: stake ? [] : list,
      totals: stake ? { minutes: sum.minutes, actualHours: sum.actualHours, byPerson: {} } : sum,
      actualEffort: +t.meta.actualEffort || 0, updatedAt: t.updatedAt, touched: touched(taskId),
      can: { log: !!can.logTime(u, t), correct: !!can.scoringEditTask(u, t) },
      limits: { minMinutes: LIMITS.minMinutes, maxMinutes: LIMITS.maxMinutes, maxDayMinutes: LIMITS.maxDayMinutes, daysBack: LIMITS.daysBack, noteMax: LIMITS.noteMax, reasonMax: LIMITS.reasonMax, hoursPerDay: perDay, longDayMinutes: Math.round(perDay * 60 * LIMITS.longDayFactor) },
      window: dayWindow(Date.now())
    };
  }

  /* ---------- checks ---------- */
  function fields(b, cur) {
    const pick = (k, alt) => (b[k] !== undefined ? b[k] : alt && b[alt] !== undefined ? b[alt] : undefined);
    const f = {};
    let v = pick("workDate", "work_date"); f.workDate = v === undefined ? (cur ? cur.workDate : "") : String(v == null ? "" : v).trim();
    if (!validDay(f.workDate)) throw new HttpError(400, "Choose the day the time was worked (a date like 2026-10-16)");
    v = pick("kind"); f.kind = v === undefined || v === null || v === "" ? (cur ? cur.kind : "work") : String(v);
    if (KINDS.indexOf(f.kind) < 0) throw new HttpError(400, "Choose what the time was: work, revision or blocked");
    const time = (k, alt, was) => { const x = pick(k, alt); if (x === undefined) return was; if (x === null || String(x).trim() === "") return null; const s = String(x).trim(); if (clock(s) === null) throw new HttpError(400, "Start and end are times of the day, like 09:30"); return s; };
    f.startedAt = time("startedAt", "started_at", cur ? cur.startedAt : null);
    f.endedAt = time("endedAt", "ended_at", cur ? cur.endedAt : null);
    const s = clock(f.startedAt), e = clock(f.endedAt), both = s !== null && e !== null;
    if (both && e <= s) throw new HttpError(400, "The end must be after the start");
    const span = both ? e - s : null, moved = !cur || f.startedAt !== cur.startedAt || f.endedAt !== cur.endedAt;
    v = pick("minutes");
    if (v === undefined || v === null || v === "") {
      if (both && moved) f.minutes = span; else if (cur) f.minutes = cur.minutes;
      else throw new HttpError(400, "Say how long it took: from 1 minute to 24 hours");
    } else {
      const n = typeof v === "number" ? v : /^\s*\d+(\.\d+)?\s*$/.test(String(v)) ? Number(v) : NaN;
      if (!Number.isFinite(n)) throw new HttpError(400, "Say how long it took: from 1 minute to 24 hours");
      f.minutes = Math.round(n);
    }
    const max = cur && cur.source === "legacy" ? LIMITS.legacyMax : LIMITS.maxMinutes;
    if (f.minutes < LIMITS.minMinutes || f.minutes > max) throw new HttpError(400, "An entry is from 1 minute to 24 hours");
    if (both && f.minutes > span) throw new HttpError(400, "The time cannot be more than the time between the start and the end");
    v = pick("note"); f.note = v === undefined ? (cur ? cur.note : "") : String(v == null ? "" : v).replace(/\s+/g, " ").trim();
    if (f.note.length > LIMITS.noteMax) throw new HttpError(413, "Text is too long: note (max 500 characters)");
    return f;
  }
  function windowCheck(day, corrector) {
    const w = dayWindow(Date.now());
    if (day > w.latest) throw new HttpError(400, "That day has not come yet: time is logged for today or a day before");
    if (day < w.earliest && !corrector) throw new HttpError(400, WINDOW);
  }
  function overlapCheck(userId, f, exceptId) {
    const s = clock(f.startedAt), e = clock(f.endedAt); if (s === null || e === null) return;
    const hit = db.prepare("SELECT task_id, started_at, ended_at FROM task_time_entries WHERE workspace_id=? AND user_id=? AND work_date=? AND deleted_at IS NULL AND started_at IS NOT NULL AND ended_at IS NOT NULL AND id<>?").all(WS_ID, userId, f.workDate, exceptId || "")
      .find(r => { const a = clock(r.started_at), b = clock(r.ended_at); return a !== null && b !== null && a < e && s < b; });
    if (hit) throw new HttpError(409, "This overlaps another entry of the same person on that day (" + hit.started_at + "–" + hit.ended_at + " · " + hit.task_id + ")");
  }
  /* one person's day across every task (the legacy entries, all on one day, left out) */
  function dayCheck(userId, day, minutes, exceptId) {
    const before = db.prepare("SELECT coalesce(sum(minutes),0) AS m FROM task_time_entries WHERE workspace_id=? AND user_id=? AND work_date=? AND deleted_at IS NULL AND source<>'legacy' AND id<>?").get(WS_ID, userId, day, exceptId || "").m;
    const total = before + minutes;
    if (total > LIMITS.maxDayMinutes) throw new HttpError(409, "More than 24 hours in one day for one person (" + hrs(total) + " h · " + day + ")");
    const perDay = hoursPerDay(userId);
    if (total <= perDay * 60 * LIMITS.longDayFactor) return [];
    const key = "A long day: {hours} h logged on {date}, more than 1.5 × the usual {perDay} h a day", vars = { hours: hrs(total), date: day, perDay };
    return [{ code: "long_day", key, vars, text: key.replace(/\{(\w+)\}/g, (m, k) => String(vars[k])) }];
  }
  /* whose entry it is and who is changing it: their own while they are on the task, anyone's with scoring_edit_task and a reason */
  function changer(u, t, cur, reasonIn) {
    const own = cur.userId === u.id && !!can.logTime(u, t), corrector = !!can.scoringEditTask(u, t);
    if (!own && !corrector) forbid(false, cur.userId === u.id ? "change this time: it is changed by the people assigned to the task" : "change someone else's time");
    const reason = String(reasonIn == null ? "" : reasonIn).trim();
    if (reason.length > LIMITS.reasonMax) throw new HttpError(413, "Text is too long: reason (max 1,000 characters)");
    if (!own && !reason) throw new HttpError(400, "Say why this time is corrected: a correction needs a reason");
    return { own, corrector, reason };
  }

  /* an entry changed: in one transaction with the task's Actual; then the task's hooks, the data version, the open tabs */
  function write(u, taskId, fn) {
    const out = inTx(() => { const r = fn(); r.synced = writeActual(taskId, true); return r; });
    bumpData();
    if (scoring && typeof scoring.afterTaskWrite === "function") { try { scoring.afterTaskWrite(taskId, u); } catch (e) { console.error("[scoring-time] afterTaskWrite: " + e.message); } }
    if (announce) { try { announce(taskId, u); } catch (e) { /* best effort */ } }
    const s = state(u, taskId); s.entry = out.entry || null; s.warnings = out.warnings || []; return s;
  }
  const correction = (u, taskId, who, action, cur, entry, ctx) => {
    if (who.own) return;
    act(u, "edited", "task", taskId, { task: taskId, what: "the time log" });
    security.log("scoring_time_corrected", { userId: u.id, impersonatedBy: u.impersonatedBy || undefined, ip: ctx && ctx.ip, taskId, entryId: cur.id, owner: cur.userId, action, minutes: [cur.minutes, entry ? entry.minutes : null] });
  };

  route("GET", "/api/tasks/:id/time", (u, p) => { on(); ensureBackfill(); return state(u, p.id); });

  route("POST", "/api/tasks/:id/time", (u, p, q, b) => {
    on(); ensureBackfill();
    const t = taskRow(p.id);
    forbid(can.logTime(u, t), "log time on this task: the people assigned to it log their own time");
    const f = fields(b || {}, null);
    windowCheck(f.workDate, can.scoringEditTask(u, t));
    return write(u, p.id, () => {
      if (db.prepare("SELECT count(*) AS n FROM task_time_entries WHERE task_id=? AND deleted_at IS NULL").get(p.id).n >= LIMITS.perTask) throw new HttpError(413, "This task has too many time entries");
      overlapCheck(u.id, f, null);
      const warnings = dayCheck(u.id, f.workDate, f.minutes, null);
      if (!db.prepare("SELECT 1 FROM task_time_entries WHERE task_id=? LIMIT 1").get(p.id)) legacyEntry(t);   /* its Actual of before first */
      const id = uid("te");
      db.prepare("INSERT INTO task_time_entries (id,workspace_id,task_id,user_id,work_date,minutes,kind,started_at,ended_at,note,source,verified,created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,'manual',0,?,?)")
        .run(id, WS_ID, p.id, u.id, f.workDate, f.minutes, f.kind, f.startedAt, f.endedAt, f.note || null, u.id, now());
      const entry = entryOf(p.id, id);
      scoring.audit({ taskId: p.id, module: "time", action: "time_logged", actor: u.id, impersonatedBy: u.impersonatedBy, newValue: entry, meta: { entryId: id, userId: u.id, own: true } });
      return { entry, warnings };
    });
  });

  route("PUT", "/api/tasks/:id/time/:entryId", (u, p, q, b, ctx) => {
    on(); ensureBackfill();
    b = b || {};
    const t = taskRow(p.id), cur = entryOf(p.id, p.entryId), who = changer(u, t, cur, b.reason);
    if (cur.source === "legacy" && !who.corrector) throw new HttpError(403, "An entry from before the time log is changed only by someone who may correct scores. You can delete it and log the days instead.");
    const f = fields(b, cur);
    windowCheck(cur.workDate, who.corrector); windowCheck(f.workDate, who.corrector);
    if (["workDate", "minutes", "kind", "startedAt", "endedAt", "note"].every(k => f[k] === cur[k])) { const s = state(u, p.id); s.entry = cur; s.warnings = []; s.unchanged = true; return s; }
    return write(u, p.id, () => {
      overlapCheck(cur.userId, f, cur.id);
      const warnings = cur.source === "legacy" ? [] : dayCheck(cur.userId, f.workDate, f.minutes, cur.id);
      db.prepare("UPDATE task_time_entries SET work_date=?, minutes=?, kind=?, started_at=?, ended_at=?, note=?, verified=0, verified_by=NULL, verified_at=NULL, edited_by=?, edited_at=? WHERE id=?")
        .run(f.workDate, f.minutes, f.kind, f.startedAt, f.endedAt, f.note || null, u.id, now(), cur.id);
      const entry = entryOf(p.id, cur.id);
      scoring.audit({ taskId: p.id, module: "time", action: "time_edited", actor: u.id, impersonatedBy: u.impersonatedBy, oldValue: cur, newValue: entry, reason: who.reason || null, meta: { entryId: cur.id, userId: cur.userId, own: who.own } });
      correction(u, p.id, who, "edited", cur, entry, ctx);
      return { entry, warnings };
    });
  });

  /* DELETE carries no body here: the reason comes as ?reason= */
  route("DELETE", "/api/tasks/:id/time/:entryId", (u, p, q, b, ctx) => {
    on(); ensureBackfill();
    const t = taskRow(p.id), cur = entryOf(p.id, p.entryId), who = changer(u, t, cur, q && q.reason);
    windowCheck(cur.workDate, who.corrector);
    return write(u, p.id, () => {
      db.prepare("UPDATE task_time_entries SET deleted_at=?, deleted_by=? WHERE id=? AND deleted_at IS NULL").run(now(), u.id, cur.id);
      scoring.audit({ taskId: p.id, module: "time", action: "time_deleted", actor: u.id, impersonatedBy: u.impersonatedBy, oldValue: cur, newValue: null, reason: who.reason || null, meta: { entryId: cur.id, userId: cur.userId, own: who.own } });
      correction(u, p.id, who, "deleted", cur, null, ctx);
      return { entry: null, warnings: [] };
    });
  });

  /* ---------- a task written elsewhere (saved, moved, restored) gets its Actual back from its log ---------- */
  function sync(taskId, user) {
    if (!taskId || !logMode() || !touched(taskId)) return null;
    const r = inTx(() => writeActual(taskId, false));
    if (r && r.changed) { bumpData(); if (announce) { try { announce(taskId, user && user.id ? user : { id: "system" }); } catch (e) { /* best effort */ } } }
    return r;
  }
  if (scoring && typeof scoring.onTaskWritten === "function") scoring.onTaskWritten((taskId, user) => { try { sync(taskId, user); } catch (e) { console.error("[scoring-time] " + e.message); } });

  /* every 10 minutes (and soon after start): the backfill once the log is on, and the Actual of tasks changed since */
  let lastSweep = null;
  function sweep() {
    if (!logMode()) return 0;
    ensureBackfill();
    const since = lastSweep; lastSweep = now();
    const ids = db.prepare("SELECT DISTINCT e.task_id AS id FROM task_time_entries e JOIN tasks t ON t.id=e.task_id WHERE e.workspace_id=? AND (e.source<>'legacy' OR e.deleted_at IS NOT NULL OR e.edited_at IS NOT NULL)" + (since ? " AND t.updated_at>=?" : "")).all(...(since ? [WS_ID, since] : [WS_ID]));
    let changed = 0;
    ids.forEach(r => { try { const x = inTx(() => writeActual(r.id, false)); if (x && x.changed) { changed++; if (announce) announce(r.id, { id: "system" }); } } catch (e) { console.error("[scoring-time] sweep " + r.id + ": " + e.message); } });
    if (changed) bumpData();
    return changed;
  }
  const run = () => { try { sweep(); } catch (e) { console.error("[scoring-time] sweep: " + e.message); } };
  const first = setTimeout(run, 3000), every = setInterval(run, 10 * 60000);
  if (first.unref) first.unref(); if (every.unref) every.unref();

  return { backfill, sync, sweep, state, logMode };
};
module.exports.math = { actualHours, totals, clock, validDay, dayWindow, KINDS, LIMITS };
