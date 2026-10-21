-- Creative OS — Brand Mode · SQLite schema (see schema.postgres.sql for PostgreSQL)
-- One database, multiple views. Every workspace-owned row carries workspace_id (tenant isolation, §74).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, logo TEXT, logo_img TEXT, favicon TEXT, tagline TEXT,
  time_zone TEXT DEFAULT 'Asia/Jakarta', working_days TEXT DEFAULT '[1,2,3,4,5]', work_start TEXT DEFAULT '09:00', work_end TEXT DEFAULT '18:00',
  theme TEXT DEFAULT '{}', brand TEXT DEFAULT '{}', brief_fields TEXT DEFAULT '[]', notif_prefs TEXT DEFAULT '{}', auto_hide TEXT DEFAULT '{}', smtp_settings TEXT DEFAULT '{}', backup_settings TEXT DEFAULT '{}', ai_settings TEXT DEFAULT '{}', labels TEXT DEFAULT '[]', task_fields TEXT DEFAULT '[]', legal TEXT DEFAULT '{}', scoring_settings TEXT DEFAULT '{}',
  allow_registration INTEGER DEFAULT 1, require_approval INTEGER DEFAULT 1, default_role_id TEXT DEFAULT 'member', invite_code TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, initials TEXT, avatar_color INTEGER DEFAULT 0,
  password_hash TEXT, password_salt TEXT, is_active INTEGER DEFAULT 1, last_login_at TEXT, avatar_data TEXT,
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_agent TEXT,
  created_at TEXT DEFAULT (datetime('now')), expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
-- Roles are data, not code: permissions is a JSON object of capability flags (see server/permissions.js CAPS). is_system roles cannot be deleted.
-- Roles are data, not code: permissions is a JSON list of capability keys (see server/permissions.js CAPS).
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT NOT NULL, description TEXT, permissions TEXT DEFAULT '[]',
  rank INTEGER DEFAULT 0, is_system INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), user_id TEXT NOT NULL REFERENCES users(id),
  role_id TEXT NOT NULL REFERENCES roles(id), job_title TEXT, capacity_hours INTEGER DEFAULT 40, hours_per_day INTEGER DEFAULT 8,
  is_stakeholder INTEGER DEFAULT 0, prefs TEXT DEFAULT '{}', pending INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), UNIQUE(workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, description TEXT,
  color TEXT DEFAULT 'blue', icon TEXT DEFAULT 'palette', team_lead_id TEXT REFERENCES users(id), sort_order INTEGER DEFAULT 0,
  is_archived INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS team_memberships (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
  is_primary INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), UNIQUE(team_id, user_id)
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, description TEXT, brief TEXT,
  owner_id TEXT REFERENCES users(id), status TEXT DEFAULT 'active', progress INTEGER DEFAULT 0, start_date TEXT, due_date TEXT,
  tags TEXT DEFAULT '[]', team_ids TEXT DEFAULT '[]', sort_order INTEGER DEFAULT 0, completed_at TEXT, archived_at TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS project_members (project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id), PRIMARY KEY(project_id, user_id));
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, due_date TEXT, is_done INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS task_statuses (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'work', color TEXT,
  sort_order INTEGER DEFAULT 0, is_completed INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0, name_id TEXT
);
CREATE TABLE IF NOT EXISTS brief_templates (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, description TEXT,
  fields TEXT DEFAULT '[]', required_fields TEXT DEFAULT '[]', sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL, parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL, request_id TEXT,
  title TEXT NOT NULL, description TEXT, status_id TEXT NOT NULL REFERENCES task_statuses(id), priority TEXT DEFAULT 'medium',
  assignee_id TEXT REFERENCES users(id), reviewer_id TEXT REFERENCES users(id), assignees TEXT DEFAULT '[]', reviewers TEXT DEFAULT '[]', is_hidden INTEGER DEFAULT 0, start_date TEXT, due_date TEXT,
  estimated_minutes INTEGER DEFAULT 0, asset_count INTEGER DEFAULT 0, labels TEXT, sort_order REAL DEFAULT 0, completed_at TEXT, created_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), meta TEXT DEFAULT '{}',
  extra_projects TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start',
  created_by TEXT REFERENCES users(id), created_at TEXT DEFAULT (datetime('now')),
  PRIMARY KEY (task_id, depends_on_task_id),
  CHECK (task_id <> depends_on_task_id)
);
CREATE INDEX IF NOT EXISTS idx_task_dependencies_target ON task_dependencies(depends_on_task_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ws ON tasks(workspace_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
CREATE INDEX IF NOT EXISTS idx_tasks_team ON tasks(team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status_id);
CREATE INDEX IF NOT EXISTS idx_tasks_due ON tasks(due_date);
CREATE INDEX IF NOT EXISTS idx_tasks_sort ON tasks(sort_order);
CREATE INDEX IF NOT EXISTS idx_tasks_ws_status ON tasks(workspace_id, status_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ws_team ON tasks(workspace_id, team_id);
CREATE INDEX IF NOT EXISTS idx_tasks_ws_assignee ON tasks(workspace_id, assignee_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_status ON tasks(project_id, status_id);
CREATE INDEX IF NOT EXISTS idx_tasks_project_due ON tasks(project_id, due_date);
CREATE TABLE IF NOT EXISTS briefs (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE, template_id TEXT, fields TEXT DEFAULT '{}',
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, sort_order INTEGER DEFAULT 0, archived INTEGER DEFAULT 0, UNIQUE(workspace_id, name));
CREATE TABLE IF NOT EXISTS task_tags (task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE, tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(task_id, tag_id));
CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, type TEXT NOT NULL, options TEXT DEFAULT '[]', sort_order INTEGER DEFAULT 0, name_id TEXT, display_mode TEXT
);
CREATE TABLE IF NOT EXISTS custom_field_values (task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE, field_id TEXT REFERENCES custom_fields(id) ON DELETE CASCADE, value TEXT, PRIMARY KEY(task_id, field_id));
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, mime_type TEXT, file_type TEXT, size_label TEXT, storage_provider TEXT DEFAULT 'local', storage_key TEXT, external_url TEXT,
  preview_data TEXT, drive_id TEXT, uploaded_by TEXT REFERENCES users(id), created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS file_versions (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, version_number INTEGER NOT NULL, note TEXT,
  preview_color TEXT, preview_data TEXT, uploaded_by TEXT REFERENCES users(id), approval_status TEXT DEFAULT 'pending',
  decided_by TEXT, decided_at TEXT, decision_reason TEXT, drive_url TEXT, drive_id TEXT, annotations TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')), UNIQUE(task_id, version_number)
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, version_id TEXT REFERENCES file_versions(id) ON DELETE CASCADE,
  decided_by TEXT REFERENCES users(id), decision TEXT NOT NULL, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS revision_requests (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, version_id TEXT REFERENCES file_versions(id) ON DELETE CASCADE,
  requested_by TEXT REFERENCES users(id), reason TEXT NOT NULL, feedback TEXT, priority TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE, author_id TEXT REFERENCES users(id), visibility TEXT DEFAULT 'internal',
  body TEXT NOT NULL, attachments TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')), edited_at TEXT
);
/* A project's discussion (Oct 2026): the project-level conversation, apart from any task's comments. Same shape as
   comments; a reply whose comment is removed stays, on its own (as a task comment's reply does). */
CREATE TABLE IF NOT EXISTS project_comments (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES project_comments(id) ON DELETE SET NULL, author_id TEXT REFERENCES users(id), visibility TEXT DEFAULT 'internal',
  body TEXT NOT NULL, attachments TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now')), edited_at TEXT
);
CREATE TABLE IF NOT EXISTS creative_requests (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, objective TEXT, description TEXT, deliverables TEXT,
  deadline TEXT, priority TEXT DEFAULT 'medium', links TEXT, notes TEXT, reference_files TEXT DEFAULT '[]', requested_by TEXT REFERENCES users(id),
  status TEXT DEFAULT 'submitted', decision_note TEXT, converted_task_id TEXT, converted_project_id TEXT, team_id TEXT,
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS asset_folders (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, type TEXT, sort_order INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), folder_id TEXT REFERENCES asset_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL, type TEXT, description TEXT, size_label TEXT, version INTEGER DEFAULT 1, storage_provider TEXT DEFAULT 'local', storage_key TEXT, external_url TEXT,
  preview_color TEXT, preview_data TEXT, preview_icon TEXT, tags TEXT DEFAULT '[]', is_brand INTEGER DEFAULT 0, uploaded_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cloud_connections (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), provider TEXT NOT NULL, name TEXT, account TEXT, root_folder TEXT,
  color TEXT, is_connected INTEGER DEFAULT 0, last_sync_at TEXT, config TEXT DEFAULT '{}'
);
-- The shared Google Drive credential. Deliberately NOT in cloud_connections.config: that
-- column is sent to every browser and written back wholesale, so a secret there would leak and
-- then be wiped. Values are encrypted at rest by server/secrets.js.
CREATE TABLE IF NOT EXISTS cloud_secrets (
  workspace_id TEXT NOT NULL, provider TEXT NOT NULL, client_secret TEXT, refresh_token TEXT,
  account TEXT, updated_at TEXT, updated_by TEXT, PRIMARY KEY (workspace_id, provider)
);
CREATE TABLE IF NOT EXISTS knowledge_pages (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), folder TEXT, title TEXT NOT NULL, body TEXT, author_id TEXT REFERENCES users(id),
  translations TEXT DEFAULT '{}', is_favorite INTEGER DEFAULT 0, is_pinned INTEGER DEFAULT 0, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS knowledge_folders (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL, name_id TEXT, sort_order INTEGER DEFAULT 0, created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), owner_id TEXT REFERENCES users(id), name TEXT NOT NULL, view_type TEXT NOT NULL,
  filters TEXT DEFAULT '{}', sorting TEXT, grouping TEXT, visible_fields TEXT DEFAULT '[]', configuration TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), recipient_id TEXT REFERENCES users(id), actor_id TEXT REFERENCES users(id),
  type TEXT NOT NULL, entity_type TEXT, entity_id TEXT, message TEXT, read_at TEXT, emailed_at TEXT, email_error TEXT, created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_id, read_at);
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), actor_id TEXT REFERENCES users(id), action TEXT NOT NULL,
  entity_type TEXT, entity_id TEXT, payload TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_ws_time ON activity_logs(workspace_id, created_at);

-- v18 §144 Messages (durable chat data only; typing/presence are ephemeral)
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), team_id TEXT REFERENCES teams(id), project_id TEXT REFERENCES projects(id), type TEXT NOT NULL, name TEXT, description TEXT DEFAULT '', created_by TEXT NOT NULL, created_at TEXT NOT NULL, archived_at TEXT, archived_by TEXT, dm_key TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_dm ON conversations(workspace_id, dm_key) WHERE dm_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_team_default ON conversations(workspace_id, team_id) WHERE type='TEAM_DEFAULT';
CREATE TABLE IF NOT EXISTS conversation_members (conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), role TEXT DEFAULT 'member', joined_at TEXT NOT NULL, last_read_message_id TEXT, last_read_at TEXT, notification_level TEXT DEFAULT 'ALL', starred INTEGER DEFAULT 0, PRIMARY KEY(conversation_id, user_id));
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, sender_id TEXT NOT NULL REFERENCES users(id), type TEXT DEFAULT 'TEXT', body TEXT DEFAULT '', mentions TEXT DEFAULT '[]', refs TEXT DEFAULT '[]', reply_to_message_id TEXT, created_at TEXT NOT NULL, edited_at TEXT, deleted_at TEXT);
CREATE TABLE IF NOT EXISTS link_metadata_cache (normalized_url TEXT PRIMARY KEY, hostname TEXT NOT NULL, title TEXT, description TEXT, favicon_url TEXT, image_url TEXT, status TEXT NOT NULL DEFAULT 'pending', fetched_at TEXT, expires_at TEXT);
CREATE INDEX IF NOT EXISTS messages_cursor ON messages(conversation_id, created_at, id);
CREATE TABLE IF NOT EXISTS message_reactions (message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at TEXT NOT NULL, PRIMARY KEY(message_id, user_id, emoji));
CREATE TABLE IF NOT EXISTS conversation_pins (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, pinned_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(conversation_id, message_id));
-- v18 §89 AI Gallery ownership/filter metadata (added by server/gallery.js on start when missing)
-- ALTER TABLE ai_gallery ADD COLUMN creator_role_id TEXT; file_type TEXT DEFAULT 'design'; tool_id TEXT DEFAULT 'template_composer'; source_task_id TEXT; source_task_title TEXT DEFAULT '';

-- v19 §7.7 decision log + task.meta
CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, note TEXT DEFAULT '', source_type TEXT, source_id TEXT, task_id TEXT, message_id TEXT, created_by TEXT NOT NULL, created_at TEXT NOT NULL);
-- ALTER TABLE tasks ADD COLUMN meta TEXT DEFAULT '{}';  (added at start-up by server.js when missing)

-- v29 self-service password reset. Only a SHA-256 of the emailed token is stored.
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL, expires_at TEXT NOT NULL, used_at TEXT, request_ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- v31: every task read looked up comments and files by task_id with a full table scan
-- (12,000 comments at 3,000 tasks). Both are now indexed.
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_project_comments_feed ON project_comments(workspace_id, project_id, created_at, id);
CREATE INDEX IF NOT EXISTS idx_project_comments_parent ON project_comments(project_id, parent_id);
CREATE INDEX IF NOT EXISTS idx_files_task ON files(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_recipient_time ON notifications(recipient_id, created_at);
-- Oct 2026 (performance): the columns other rows point at, so a cascade or a lookup searches instead of reading the whole
-- table. Every task save rewrites its comments, and each comment removed made SQLite read every comment for its replies
-- (comments.parent_id, ON DELETE CASCADE); a version removed read every approval and revision request; a task removed
-- read every task for its subtasks; each person's teams read every membership. This file runs at every start, so a
-- database made before these lines gets them then.
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_approvals_version ON approvals(version_id);
CREATE INDEX IF NOT EXISTS idx_revision_requests_version ON revision_requests(version_id);
CREATE INDEX IF NOT EXISTS idx_tasks_parent ON tasks(parent_task_id);
CREATE INDEX IF NOT EXISTS idx_team_memberships_user ON team_memberships(user_id);

-- custom emoji: a workspace's own, made from a PNG or JPG and stored like any file (/files/d/...).
CREATE TABLE IF NOT EXISTS custom_emoji (
  workspace_id TEXT NOT NULL, name TEXT NOT NULL, url TEXT NOT NULL, created_by TEXT, created_at TEXT NOT NULL,
  PRIMARY KEY (workspace_id, name)
);

-- progress notes: where a task stands, kept as versions (V1, V2...). Saving changes the latest; a new version starts the next.
CREATE TABLE IF NOT EXISTS task_progress_notes (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, version_number INTEGER NOT NULL,
  body TEXT NOT NULL DEFAULT '', created_by TEXT, created_at TEXT NOT NULL, edited_by TEXT, edited_at TEXT,
  UNIQUE (task_id, version_number)
);
CREATE INDEX IF NOT EXISTS idx_progress_task ON task_progress_notes(task_id, version_number);

-- Web Push: one row per browser that turned notifications on (server/push.js). The endpoint is a push service's URL.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL,
  user_agent TEXT, created_at TEXT NOT NULL, last_used_at TEXT, fail_count INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_push_subs_user ON push_subscriptions(user_id);

-- Smart Scoring & Intelligence (Oct 2026, docs/SMART-SCORING.md). Every table of the feature is here, so no later phase
-- changes the schema. The settings are one JSON object in workspaces.scoring_settings (shared/scoring-settings.js).
-- A task's score per module: the math, the AI's suggestion and the final value, where it came from, and its lock.
-- factors / math_inputs / proposal are JSON; rev is the optimistic-concurrency counter (a stale rev answers 409).
CREATE TABLE IF NOT EXISTS task_scoring (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  module TEXT NOT NULL CHECK (module IN ('hours','story','weighted')),
  workspace_id TEXT NOT NULL REFERENCES workspaces(id),
  math_value REAL, math_inputs TEXT DEFAULT '{}', ai_value REAL, ai_run_id TEXT, final_value REAL, unit TEXT,
  source TEXT CHECK (source IN ('legacy','math','ai','manual')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','proposed','approved','locked','unverified','rebaseline_needed')),
  factors TEXT DEFAULT '{}', mapping_version INTEGER, config_version INTEGER,
  locked_value REAL, locked_at TEXT, locked_by TEXT, approved_by TEXT, approved_at TEXT, scope_fingerprint TEXT, proposal TEXT,
  updated_by TEXT, updated_at TEXT, rev INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (task_id, module)
);
CREATE INDEX IF NOT EXISTS idx_task_scoring_ws ON task_scoring(workspace_id, module, status);
-- Every scoring change, with its old and new value and the reason. No foreign keys: it outlives the task, as activity_logs do.
-- module: hours | story | weighted | time | efficiency | outcomes | settings. meta: JSON (a settings change keeps its diff there).
CREATE TABLE IF NOT EXISTS scoring_audit (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT, module TEXT, action TEXT NOT NULL,
  actor_id TEXT, impersonated_by TEXT, old_value TEXT, new_value TEXT, reason TEXT, meta TEXT DEFAULT '{}', created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scoring_audit_task ON scoring_audit(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scoring_audit_ws ON scoring_audit(workspace_id, created_at);
-- a task's history as its Scoring & Intelligence panel reads it (workspace and task, newest first; server/scoring.js view)
CREATE INDEX IF NOT EXISTS idx_scoring_audit_ws_task ON scoring_audit(workspace_id, task_id, created_at);
-- Time worked on a task, by the person who did it: work, blocked (waiting, kept apart) or revision. Edits and deletes are
-- soft and audited. A legacy entry (the single "Actual" number from before) may be longer than a day.
CREATE TABLE IF NOT EXISTS task_time_entries (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, work_date TEXT NOT NULL,
  minutes INTEGER NOT NULL CHECK (minutes >= 1 AND (minutes <= 1440 OR source = 'legacy')),
  kind TEXT NOT NULL DEFAULT 'work' CHECK (kind IN ('work','blocked','revision')), started_at TEXT, ended_at TEXT, note TEXT,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','legacy')),
  verified INTEGER NOT NULL DEFAULT 0, verified_by TEXT, verified_at TEXT,
  created_by TEXT, created_at TEXT NOT NULL, edited_by TEXT, edited_at TEXT, deleted_at TEXT, deleted_by TEXT
);
CREATE INDEX IF NOT EXISTS idx_time_entries_task ON task_time_entries(task_id, work_date);
CREATE INDEX IF NOT EXISTS idx_time_entries_user ON task_time_entries(workspace_id, user_id, work_date);
-- One efficiency award per person per task (the unique key prevents duplicates). reasons: JSON list.
CREATE TABLE IF NOT EXISTS task_efficiency_awards (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL, share REAL NOT NULL DEFAULT 1, estimate_snapshot REAL, actual_snapshot REAL,
  base_points REAL, bonus_points REAL, awarded_points REAL,
  status TEXT NOT NULL DEFAULT 'provisional' CHECK (status IN ('provisional','pending_review','approved','rejected','revoked','ineligible')),
  reasons TEXT DEFAULT '[]', needs_review INTEGER NOT NULL DEFAULT 0, reviewer_id TEXT, reviewed_at TEXT, review_note TEXT, quality_score REAL,
  policy_version INTEGER, calc_key TEXT, recalculated_at TEXT, created_at TEXT NOT NULL,
  UNIQUE (task_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_awards_ws ON task_efficiency_awards(workspace_id, status);
CREATE INDEX IF NOT EXISTS idx_awards_user ON task_efficiency_awards(workspace_id, user_id, status);
-- Every AI scoring call: the cost log, the cache (task + input hash + settings version) and the quota counter.
-- No foreign key on the task: the count stays when a task is deleted.
CREATE TABLE IF NOT EXISTS scoring_ai_runs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, task_id TEXT, user_id TEXT, trigger TEXT, input_hash TEXT, config_version INTEGER, prompt_version INTEGER,
  status TEXT NOT NULL CHECK (status IN ('ok','invalid','error','timeout','quota','cached')), recommendation TEXT, confidence REAL,
  tokens_in INTEGER, tokens_out INTEGER, provider TEXT, model TEXT, ms INTEGER, error TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scoring_ai_cache ON scoring_ai_runs(task_id, input_hash, config_version);
CREATE INDEX IF NOT EXISTS idx_scoring_ai_user ON scoring_ai_runs(user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_scoring_ai_ws ON scoring_ai_runs(workspace_id, created_at);
-- What the team told the AI about a task beyond its brief (Oct 2026, server/scoring-ai.js): a note (≤ 1 000 characters)
-- and the assumptions of an earlier suggestion they marked right or wrong (checks: JSON [{a, ok, fix?}], ≤ 8). One row per
-- task, sent with every Ask AI for it; never copied with a duplicate; removed with the task (archiving keeps it).
CREATE TABLE IF NOT EXISTS scoring_ai_context (
  task_id TEXT PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE, workspace_id TEXT NOT NULL,
  note TEXT NOT NULL DEFAULT '', checks TEXT NOT NULL DEFAULT '[]', user_id TEXT, updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_scoring_ai_context_ws ON scoring_ai_context(workspace_id, updated_at);
-- KPI and OKR: Objectives, and one metric model for KPI indicators and Key Results (kind). Progress comes only from
-- evidence (evidence_rule: JSON {type:'approved_assets'|'tasks_completed'|'manual', filter:{team,project,label}}) or a
-- manual value with a reason (outcome_values).
CREATE TABLE IF NOT EXISTS outcome_objectives (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, description TEXT DEFAULT '',
  period_start TEXT, period_end TEXT, owner_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed','archived')),
  sort_order INTEGER DEFAULT 0, rev INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT NOT NULL, updated_by TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outcome_objectives_ws ON outcome_objectives(workspace_id, status);
CREATE TABLE IF NOT EXISTS outcome_metrics (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), kind TEXT NOT NULL CHECK (kind IN ('kpi','kr')),
  objective_id TEXT REFERENCES outcome_objectives(id) ON DELETE SET NULL, title TEXT NOT NULL, description TEXT DEFAULT '', unit TEXT DEFAULT '',
  direction TEXT NOT NULL DEFAULT 'up' CHECK (direction IN ('up','down')), baseline REAL, target REAL, weight REAL NOT NULL DEFAULT 1,
  period_start TEXT, period_end TEXT, evidence_rule TEXT DEFAULT '{}', owner_id TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft','active','closed','archived')),
  sort_order INTEGER DEFAULT 0, rev INTEGER NOT NULL DEFAULT 1, created_by TEXT, created_at TEXT NOT NULL, updated_by TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_outcome_metrics_ws ON outcome_metrics(workspace_id, kind, status);
CREATE INDEX IF NOT EXISTS idx_outcome_metrics_objective ON outcome_metrics(objective_id);
-- A task linked to a metric, and the evidence it counted (once: the unique key prevents a double count).
CREATE TABLE IF NOT EXISTS task_outcome_links (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  metric_id TEXT NOT NULL REFERENCES outcome_metrics(id) ON DELETE CASCADE, linked_by TEXT,
  origin TEXT NOT NULL DEFAULT 'manual' CHECK (origin IN ('manual','ai_accepted')),
  evidence_type TEXT, evidence_id TEXT, contribution REAL,
  status TEXT NOT NULL DEFAULT 'linked' CHECK (status IN ('linked','counted','revoked')),
  counted_at TEXT, revoked_at TEXT, created_at TEXT NOT NULL,
  UNIQUE (metric_id, evidence_type, evidence_id)
);
CREATE INDEX IF NOT EXISTS idx_outcome_links_task ON task_outcome_links(task_id);
CREATE INDEX IF NOT EXISTS idx_outcome_links_metric ON task_outcome_links(metric_id, status);
CREATE TABLE IF NOT EXISTS outcome_values (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), metric_id TEXT NOT NULL REFERENCES outcome_metrics(id) ON DELETE CASCADE,
  value REAL NOT NULL, source TEXT NOT NULL CHECK (source IN ('evidence','manual')), reason TEXT, actor_id TEXT, created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_outcome_values_metric ON outcome_values(metric_id, created_at);
