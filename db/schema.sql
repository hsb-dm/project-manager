-- Creative OS — Brand Mode · SQLite schema (see schema.postgres.sql for PostgreSQL)
-- One database, multiple views. Every workspace-owned row carries workspace_id (tenant isolation, §74).
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, logo TEXT, logo_img TEXT, favicon TEXT, tagline TEXT,
  time_zone TEXT DEFAULT 'Asia/Jakarta', working_days TEXT DEFAULT '[1,2,3,4,5]', work_start TEXT DEFAULT '09:00', work_end TEXT DEFAULT '18:00',
  theme TEXT DEFAULT '{}', brand TEXT DEFAULT '{}', brief_fields TEXT DEFAULT '[]', notif_prefs TEXT DEFAULT '{}', auto_hide TEXT DEFAULT '{}', smtp_settings TEXT DEFAULT '{}', backup_settings TEXT DEFAULT '{}', ai_settings TEXT DEFAULT '{}', labels TEXT DEFAULT '[]', task_fields TEXT DEFAULT '[]',
  allow_registration INTEGER DEFAULT 1, default_role_id TEXT DEFAULT 'member', invite_code TEXT,
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
  is_stakeholder INTEGER DEFAULT 0, prefs TEXT DEFAULT '{}', created_at TEXT DEFAULT (datetime('now')), UNIQUE(workspace_id, user_id)
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
  sort_order INTEGER DEFAULT 0, is_completed INTEGER DEFAULT 0, is_archived INTEGER DEFAULT 0
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
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')), meta TEXT DEFAULT '{}'
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
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, type TEXT NOT NULL, options TEXT DEFAULT '[]', sort_order INTEGER DEFAULT 0
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
  body TEXT NOT NULL, attachments TEXT DEFAULT '[]', created_at TEXT DEFAULT (datetime('now'))
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
  preview_color TEXT, preview_data TEXT, tags TEXT DEFAULT '[]', is_brand INTEGER DEFAULT 0, uploaded_by TEXT REFERENCES users(id),
  created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now'))
);
CREATE TABLE IF NOT EXISTS cloud_connections (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), provider TEXT NOT NULL, name TEXT, account TEXT, root_folder TEXT,
  color TEXT, is_connected INTEGER DEFAULT 0, last_sync_at TEXT, config TEXT DEFAULT '{}'
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
CREATE INDEX IF NOT EXISTS idx_files_task ON files(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_recipient_time ON notifications(recipient_id, created_at);
