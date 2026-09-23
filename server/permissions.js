// Server-side authorization (§12–13). Roles are rows in `roles` with a JSON list of capabilities; nothing is hard-coded to a role name
// (except that the "admin" role always has every capability). The client keeps a mirror only to hide buttons — the server decides.
const CAPS = [
  ["manage_workspace", "Manage workspace settings, theme, workflow, brand"],
  ["manage_members", "Add/remove members, change roles, reset passwords"],
  ["manage_teams", "Create teams, colors, icons, membership"],
  ["manage_roles", "Create and edit roles"],
  ["create_project", "Create projects"],
  ["edit_any_project", "Edit any project"],
  ["delete_project", "Delete projects"],
  ["create_task", "Create tasks for anyone"],
  ["create_own_task", "Create tasks assigned to themselves"],
  ["edit_any_task", "Edit any task"],
  ["edit_team_tasks", "Edit/assign/review tasks of teams they lead or belong to"],
  ["edit_own_task", "Edit tasks where they are assignee or reviewer"],
  ["assign_task", "Assign tasks to anyone"],
  ["review_any", "Approve / send back any task"],
  ["delete_task", "Delete tasks"],
  ["upload_file", "Upload files and versions"],
  ["decide_request", "Triage, accept, reject and convert creative requests"],
  ["manage_assets", "Add/edit assets and folders"],
  ["manage_knowledge", "Write knowledge pages"],
  ["view_analytics", "See analytics"],
  ["view_all", "See all projects and tasks"],
  ["submit_request", "Submit a request (a task in the first stage, unassigned) for the creative team to triage"],
  /* v16 §48 — AI Hub and AI Gallery get their own capabilities. They used to
     borrow `upload_file` / `manage_assets`, which meant anyone who could
     attach a file to a task could also publish to the shared Gallery. */
  ["use_ai_hub", "Open AI Hub and generate visuals"],
  ["view_ai_gallery", "Browse the shared AI Gallery"],
  ["publish_ai_gallery", "Publish their own designs to the AI Gallery"],
  ["duplicate_ai_gallery", "Duplicate someone else's gallery design"],
  ["manage_own_ai_gallery", "Rename, archive and delete their own designs"],
  ["manage_all_ai_gallery", "Manage any member's gallery design"],
];
const ALL = CAPS.map(c => c[0]);
const DEFAULT_ROLES = [
  { id: "admin", name: "Admin", description: "Full workspace access", rank: 100, permissions: ALL },
  { id: "creative_lead", name: "Creative Lead", description: "Create projects/tasks, assign, review, approve, analytics", rank: 80, permissions: ["create_project", "edit_any_project", "delete_project", "create_task", "create_own_task", "edit_any_task", "assign_task", "review_any", "delete_task", "upload_file", "decide_request", "manage_assets", "manage_knowledge", "view_analytics", "view_all", "use_ai_hub","view_ai_gallery","publish_ai_gallery","duplicate_ai_gallery","manage_own_ai_gallery"] },
  { id: "team_lead", name: "Team Lead", description: "Manage team workload, assign and review team tasks", rank: 60, permissions: ["create_task", "create_own_task", "edit_team_tasks", "edit_own_task", "upload_file", "decide_request", "manage_assets", "manage_knowledge", "view_analytics", "view_all", "submit_request", "use_ai_hub","view_ai_gallery","publish_ai_gallery","duplicate_ai_gallery","manage_own_ai_gallery"] },
  { id: "member", name: "Member", description: "Work on assigned tasks, upload, comment, submit for review", rank: 40, permissions: ["create_own_task", "edit_own_task", "upload_file", "manage_assets", "manage_knowledge", "view_all", "submit_request", "use_ai_hub","view_ai_gallery","publish_ai_gallery","duplicate_ai_gallery","manage_own_ai_gallery"] },
  { id: "viewer", name: "Viewer", description: "Views everything; can submit requests (which land in the backlog for triage) and comment. Cannot edit work.", rank: 10, permissions: ["view_all", "submit_request", "view_ai_gallery"] },
];
function has(u, cap) { if (!u) return false; if (u.role === "admin") return true; if (!u.caps) return false; return Array.isArray(u.caps) ? u.caps.indexOf(cap) >= 0 : !!u.caps[cap]; }
const leadsTeam = (u, teamId) => !!teamId && u.ledTeams.includes(teamId);
const inTeam = (u, teamId) => !!teamId && u.teams.includes(teamId);
const teamTask = (u, t) => has(u, "edit_team_tasks") && (leadsTeam(u, t.team) || inTeam(u, t.team));
const isAssignee = (u, t) => t.assignee === u.id || (t.assignees || []).indexOf(u.id) >= 0;
const isReviewer = (u, t) => t.reviewer === u.id || (t.reviewers || []).indexOf(u.id) >= 0;
const ownTask = (u, t) => has(u, "edit_own_task") && (isAssignee(u, t) || isReviewer(u, t));
const can = {
  manageWorkspace: (u) => has(u, "manage_workspace"),
  manageMembers:   (u) => has(u, "manage_members"),
  manageRoles:     (u) => has(u, "manage_roles"),
  manageTeams:     (u) => has(u, "manage_teams"),
  createProject:   (u) => has(u, "create_project"),
  editProject:     (u, p) => has(u, "edit_any_project") || p.owner === u.id || (has(u, "edit_team_tasks") && (p.teams || []).some(t => leadsTeam(u, t))),
  deleteProject:   (u) => has(u, "delete_project"),
  createTask:      (u, t) => has(u, "create_task") || (has(u, "create_own_task") && (!t || !t.assignee || t.assignee === u.id)),
  editTask:        (u, t) => has(u, "edit_any_task") || teamTask(u, t) || ownTask(u, t),
  assignTask:      (u, t) => has(u, "assign_task") || (has(u, "edit_team_tasks") && leadsTeam(u, t.team)) || (has(u, "create_own_task") && !t.assignee),
  reviewTask:      (u, t) => has(u, "review_any") || isReviewer(u, t) || (has(u, "edit_team_tasks") && leadsTeam(u, t.team)),
  hasReviewAny:    (u) => has(u, "review_any"),
  leadsTaskTeam:   (u, t) => has(u, "edit_team_tasks") && leadsTeam(u, t.team),
  approveTask:     (u, t) => has(u, "review_any") || isReviewer(u, t) || (has(u, "edit_team_tasks") && leadsTeam(u, t.team)),
  deleteTask:      (u) => has(u, "delete_task"),
  uploadFile:      (u, t) => has(u, "upload_file") && (has(u, "edit_any_task") || teamTask(u, t) || isAssignee(u, t) || isReviewer(u, t)),
  comment:         (u) => true,
  submitRequest:   (u) => has(u, "submit_request") || has(u, "create_task"),
  decideRequest:   (u) => has(u, "decide_request"),
  manageAssets:    (u) => has(u, "manage_assets"),
  manageKnowledge: (u) => has(u, "manage_knowledge"),
  viewAnalytics:   (u) => has(u, "view_analytics"),
  useAIHub:        (u) => has(u, "use_ai_hub"),
  saveView:        (u) => true,
};
module.exports = { can, has, CAPS, DEFAULT_ROLES };
