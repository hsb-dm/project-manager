-- Creative OS — Brand Mode · PostgreSQL schema (generated from schema.sql)
-- One database, multiple views. Every workspace-owned row carries workspace_id (tenant isolation, §74).

CREATE TABLE IF NOT EXISTS workspaces (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, logo TEXT, logo_img TEXT, favicon TEXT, tagline TEXT,
  time_zone TEXT DEFAULT 'Asia/Jakarta', working_days TEXT DEFAULT '[1,2,3,4,5]', work_start TEXT DEFAULT '09:00', work_end TEXT DEFAULT '18:00',
  theme JSONB DEFAULT '{}'::jsonb, brand JSONB DEFAULT '{}'::jsonb, brief_fields JSONB DEFAULT '[]'::jsonb, notif_prefs JSONB DEFAULT '{}'::jsonb,
  allow_registration BOOLEAN DEFAULT true, default_role_id TEXT DEFAULT 'member', invite_code TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, email TEXT UNIQUE, initials TEXT, avatar_color INTEGER DEFAULT 0,
  password_hash TEXT, password_salt TEXT, is_active BOOLEAN DEFAULT true, last_login_at TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE, user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), expires_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
-- Roles are data, not code: permissions is a JSON object of capability flags (see server/permissions.js CAPS). is_system roles cannot be deleted.
-- Roles are data, not code: permissions is a JSON list of capability keys (see server/permissions.js CAPS).
CREATE TABLE IF NOT EXISTS roles (
  id TEXT PRIMARY KEY, workspace_id TEXT, name TEXT NOT NULL, description TEXT, permissions JSONB DEFAULT '[]'::jsonb,
  rank INTEGER DEFAULT 0, is_system BOOLEAN DEFAULT false, sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS workspace_members (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), user_id TEXT NOT NULL REFERENCES users(id),
  role_id TEXT NOT NULL REFERENCES roles(id), job_title TEXT, capacity_hours INTEGER DEFAULT 40, hours_per_day INTEGER DEFAULT 8,
  is_stakeholder BOOLEAN DEFAULT false, prefs JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(workspace_id, user_id)
);
CREATE TABLE IF NOT EXISTS teams (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, description TEXT,
  color TEXT DEFAULT 'blue', icon TEXT DEFAULT 'palette', team_lead_id TEXT REFERENCES users(id), sort_order INTEGER DEFAULT 0,
  is_archived BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS team_memberships (
  id TEXT PRIMARY KEY, team_id TEXT NOT NULL REFERENCES teams(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id),
  is_primary BOOLEAN DEFAULT false, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(team_id, user_id)
);
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, description TEXT, brief TEXT,
  owner_id TEXT REFERENCES users(id), status TEXT DEFAULT 'active', progress INTEGER DEFAULT 0, start_date TEXT, due_date TEXT,
  tags JSONB DEFAULT '[]'::jsonb, team_ids JSONB DEFAULT '[]'::jsonb, sort_order INTEGER DEFAULT 0, completed_at TEXT, archived_at TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS project_members (project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, user_id TEXT REFERENCES users(id), PRIMARY KEY(project_id, user_id));
CREATE TABLE IF NOT EXISTS milestones (
  id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE, name TEXT NOT NULL, due_date TEXT, is_done BOOLEAN DEFAULT false, sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS task_statuses (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, kind TEXT NOT NULL DEFAULT 'work', color TEXT,
  sort_order INTEGER DEFAULT 0, is_completed BOOLEAN DEFAULT false, is_archived BOOLEAN DEFAULT false
);
CREATE TABLE IF NOT EXISTS brief_templates (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, description TEXT,
  fields JSONB DEFAULT '[]'::jsonb, required_fields JSONB DEFAULT '[]'::jsonb, sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  team_id TEXT REFERENCES teams(id) ON DELETE SET NULL, parent_task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL, request_id TEXT,
  title TEXT NOT NULL, description TEXT, status_id TEXT NOT NULL REFERENCES task_statuses(id), priority TEXT DEFAULT 'medium',
  assignee_id TEXT REFERENCES users(id), reviewer_id TEXT REFERENCES users(id), assignees JSONB DEFAULT '[]'::jsonb, reviewers JSONB DEFAULT '[]'::jsonb, is_hidden BOOLEAN DEFAULT false, start_date TEXT, due_date TEXT,
  estimated_minutes INTEGER DEFAULT 0, asset_count INTEGER DEFAULT 0, labels TEXT, sort_order DOUBLE PRECISION DEFAULT 0, completed_at TEXT, created_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS task_dependencies (
  task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  depends_on_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  dependency_type TEXT NOT NULL DEFAULT 'finish_to_start',
  created_by TEXT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now(),
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
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL UNIQUE REFERENCES tasks(id) ON DELETE CASCADE, template_id TEXT, fields JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS tags (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, sort_order INTEGER DEFAULT 0, archived BOOLEAN DEFAULT false, UNIQUE(workspace_id, name));
CREATE TABLE IF NOT EXISTS task_tags (task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE, tag_id TEXT REFERENCES tags(id) ON DELETE CASCADE, PRIMARY KEY(task_id, tag_id));
CREATE TABLE IF NOT EXISTS custom_fields (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, type TEXT NOT NULL, options JSONB DEFAULT '[]'::jsonb, sort_order INTEGER DEFAULT 0
);
CREATE TABLE IF NOT EXISTS custom_field_values (task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE, field_id TEXT REFERENCES custom_fields(id) ON DELETE CASCADE, value TEXT, PRIMARY KEY(task_id, field_id));
CREATE TABLE IF NOT EXISTS files (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), task_id TEXT REFERENCES tasks(id) ON DELETE CASCADE, project_id TEXT REFERENCES projects(id) ON DELETE CASCADE,
  filename TEXT NOT NULL, mime_type TEXT, file_type TEXT, size_label TEXT, storage_provider TEXT DEFAULT 'local', storage_key TEXT, external_url TEXT,
  preview_data TEXT, drive_id TEXT, uploaded_by TEXT REFERENCES users(id), created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS file_versions (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, version_number INTEGER NOT NULL, note TEXT,
  preview_color TEXT, preview_data TEXT, uploaded_by TEXT REFERENCES users(id), approval_status TEXT DEFAULT 'pending',
  decided_by TEXT, decided_at TEXT, decision_reason TEXT, annotations JSONB DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ DEFAULT now(), UNIQUE(task_id, version_number)
);
CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, version_id TEXT REFERENCES file_versions(id) ON DELETE CASCADE,
  decided_by TEXT REFERENCES users(id), decision TEXT NOT NULL, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS revision_requests (
  id TEXT PRIMARY KEY, task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE, version_id TEXT REFERENCES file_versions(id) ON DELETE CASCADE,
  requested_by TEXT REFERENCES users(id), reason TEXT NOT NULL, feedback TEXT, priority TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  parent_id TEXT REFERENCES comments(id) ON DELETE CASCADE, author_id TEXT REFERENCES users(id), visibility TEXT DEFAULT 'internal',
  body TEXT NOT NULL, attachments JSONB DEFAULT '[]'::jsonb, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS creative_requests (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), title TEXT NOT NULL, objective TEXT, description TEXT, deliverables TEXT,
  deadline TEXT, priority TEXT DEFAULT 'medium', links TEXT, notes TEXT, reference_files JSONB DEFAULT '[]'::jsonb, requested_by TEXT REFERENCES users(id),
  status TEXT DEFAULT 'submitted', decision_note TEXT, converted_task_id TEXT, converted_project_id TEXT, team_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS asset_folders (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), name TEXT NOT NULL, type TEXT, sort_order INTEGER DEFAULT 0);
CREATE TABLE IF NOT EXISTS assets (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), folder_id TEXT REFERENCES asset_folders(id) ON DELETE SET NULL,
  name TEXT NOT NULL, type TEXT, description TEXT, size_label TEXT, version INTEGER DEFAULT 1, storage_provider TEXT DEFAULT 'local', storage_key TEXT, external_url TEXT,
  preview_color TEXT, preview_data TEXT, tags JSONB DEFAULT '[]'::jsonb, is_brand BOOLEAN DEFAULT false, uploaded_by TEXT REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS cloud_connections (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), provider TEXT NOT NULL, name TEXT, account TEXT, root_folder TEXT,
  color TEXT, is_connected BOOLEAN DEFAULT false, last_sync_at TEXT, config JSONB DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS knowledge_pages (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), folder TEXT, title TEXT NOT NULL, body TEXT, author_id TEXT REFERENCES users(id),
  translations JSONB DEFAULT '{}'::jsonb, is_favorite BOOLEAN DEFAULT false, is_pinned BOOLEAN DEFAULT false, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now(), updated_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS knowledge_folders (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  name TEXT NOT NULL, name_id TEXT, sort_order INTEGER DEFAULT 0, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS saved_views (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), owner_id TEXT REFERENCES users(id), name TEXT NOT NULL, view_type TEXT NOT NULL,
  filters JSONB DEFAULT '{}'::jsonb, sorting TEXT, grouping TEXT, visible_fields JSONB DEFAULT '[]'::jsonb, configuration JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), recipient_id TEXT REFERENCES users(id), actor_id TEXT REFERENCES users(id),
  type TEXT NOT NULL, entity_type TEXT, entity_id TEXT, message TEXT, read_at TEXT, emailed_at TEXT, email_error TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notif_recipient ON notifications(recipient_id, read_at);
CREATE TABLE IF NOT EXISTS activity_logs (
  id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), actor_id TEXT REFERENCES users(id), action TEXT NOT NULL,
  entity_type TEXT, entity_id TEXT, payload JSONB DEFAULT '{}'::jsonb, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_activity_entity ON activity_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_activity_ws_time ON activity_logs(workspace_id, created_at);

-- Full-text search (§59)
CREATE INDEX IF NOT EXISTS idx_tasks_fts ON tasks USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(description,'')));
CREATE INDEX IF NOT EXISTS idx_pages_fts ON knowledge_pages USING gin (to_tsvector('simple', coalesce(title,'') || ' ' || coalesce(body,'')));

-- v18 §144 Messages
CREATE TABLE IF NOT EXISTS conversations (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), team_id TEXT REFERENCES teams(id), project_id TEXT REFERENCES projects(id), type TEXT NOT NULL, name TEXT, description TEXT DEFAULT '', created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, archived_at TIMESTAMPTZ, archived_by TEXT, dm_key TEXT);
CREATE UNIQUE INDEX IF NOT EXISTS conversations_dm ON conversations(workspace_id, dm_key) WHERE dm_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS conversations_team_default ON conversations(workspace_id, team_id) WHERE type='TEAM_DEFAULT';
CREATE TABLE IF NOT EXISTS conversation_members (conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, user_id TEXT NOT NULL REFERENCES users(id), role TEXT DEFAULT 'member', joined_at TIMESTAMPTZ NOT NULL, last_read_message_id TEXT, last_read_at TIMESTAMPTZ, notification_level TEXT DEFAULT 'ALL', starred BOOLEAN DEFAULT FALSE, PRIMARY KEY(conversation_id, user_id));
CREATE TABLE IF NOT EXISTS messages (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, sender_id TEXT NOT NULL REFERENCES users(id), type TEXT DEFAULT 'TEXT', body TEXT DEFAULT '', mentions JSONB DEFAULT '[]', refs JSONB DEFAULT '[]', reply_to_message_id TEXT, created_at TIMESTAMPTZ NOT NULL, edited_at TIMESTAMPTZ, deleted_at TIMESTAMPTZ);
CREATE TABLE IF NOT EXISTS link_metadata_cache (normalized_url TEXT PRIMARY KEY, hostname TEXT NOT NULL, title TEXT, description TEXT, favicon_url TEXT, image_url TEXT, status TEXT NOT NULL DEFAULT 'pending', fetched_at TIMESTAMPTZ, expires_at TIMESTAMPTZ);
CREATE INDEX IF NOT EXISTS messages_cursor ON messages(conversation_id, created_at, id);
CREATE TABLE IF NOT EXISTS message_reactions (message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, user_id TEXT NOT NULL, emoji TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, PRIMARY KEY(message_id, user_id, emoji));
CREATE TABLE IF NOT EXISTS conversation_pins (id TEXT PRIMARY KEY, conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE, message_id TEXT NOT NULL REFERENCES messages(id) ON DELETE CASCADE, pinned_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL, UNIQUE(conversation_id, message_id));
ALTER TABLE ai_gallery ADD COLUMN IF NOT EXISTS creator_role_id TEXT; ALTER TABLE ai_gallery ADD COLUMN IF NOT EXISTS file_type TEXT NOT NULL DEFAULT 'design'; ALTER TABLE ai_gallery ADD COLUMN IF NOT EXISTS tool_id TEXT NOT NULL DEFAULT 'template_composer'; ALTER TABLE ai_gallery ADD COLUMN IF NOT EXISTS source_task_id TEXT; ALTER TABLE ai_gallery ADD COLUMN IF NOT EXISTS source_task_title TEXT NOT NULL DEFAULT '';

-- v19
CREATE TABLE IF NOT EXISTS decisions (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL REFERENCES workspaces(id), project_id TEXT REFERENCES projects(id) ON DELETE CASCADE, title TEXT NOT NULL, note TEXT DEFAULT '', source_type TEXT, source_id TEXT, task_id TEXT, message_id TEXT, created_by TEXT NOT NULL, created_at TIMESTAMPTZ NOT NULL);
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS meta JSONB DEFAULT '{}';

-- v29 self-service password reset. Only a SHA-256 of the emailed token is stored.
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL, expires_at TIMESTAMPTZ NOT NULL, used_at TIMESTAMPTZ, request_ip TEXT
);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets(user_id);

-- v31 indexes for per-task reads
CREATE INDEX IF NOT EXISTS idx_comments_task ON comments(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_files_task ON files(task_id, created_at);
CREATE INDEX IF NOT EXISTS idx_notif_recipient_time ON notifications(recipient_id, created_at);
