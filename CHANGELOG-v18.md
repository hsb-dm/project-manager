# ZenCrevia v18 — Messages, AI Gallery quotas, Task-as-AI-brief

Implements the ZenCrevia Master Implementation Plan v3 (Gate A → Gate B). Every item below ships in the served app (`public/index.html`) and the standalone demo (`dist/creative-os-standalone.html`) built by `node build.js`.

## Gate A — AI Gallery & Task-as-Brief
- **Role-based gallery quotas** (§62–68, §91): one gallery, limits per role (Admin unlimited, Creative Lead 500, Team Lead 250, Member 100, Viewer 0), editable per role in Settings → AI & integrations → Usage & Limits with presets (Small / Standard / Large / Unlimited). Enforced client-side and server-side inside a write transaction (`GalleryQuotaExceeded`, 429). Duplicate, restore and save-as-new count; edit/favorite/archive/delete never block.
- **Usage indicator + banners** (§69–72, §92): `used / limit` in the gallery header, 80 % / 90 % / 100 % states, one in-app notification per threshold; admin usage table (user, role, used, limit, %) with role/level filters.
- **Filters & sort** (§74–86): Created by, Role, File type, AI tool, Date, Status, Favorites; active chips; Newest / Oldest / A–Z / Z–A / Most used. Server filters on the same list endpoint. Items store `creatorRoleId`, `fileType`, `toolId`, `sourceTaskId` (§89).
- **Task as AI brief** (§103–134): AI Hub “Brief source: Manual | Use Task”, task picker, task card with stale detection, readiness checks (required/recommended fields per tool template), locked Admin Base Prompt + locked Tool rules + editable Task Brief prompt, refs/discussion inclusion, prompt refine via `/api/ai/chat`, snapshot (task/prompt versions) stored on every run and “Generated from Task” badge in history/gallery. Task drawer gains “Use in AI Hub”. Admin → Prompt rules section manages the base prompt (versioned, visibility toggle) and per-tool Task-to-prompt templates.
- **Persistence fix**: AI policy, models, quotas, base prompt and tool templates now survive reload/server round-trip (`server/serialize.js` `AI_PLAIN_KEYS`).

## Gate B — Messages
- **Dedicated Messages pill** in the top bar with unread badge (§42.1); screen inside the normal shell.
- **Three-column layout** matching the approved mockup: navigator (search, Semua/Belum dibaca/Mention/Starred/Arsip, TEAM with collapsible per-team channels, DIRECT MESSAGES, GROUPS) / conversation (header, Pesan·Files·Tasks·Links tabs, timeline with day dividers, grouping, “New messages”, reactions, reply references, pinned highlight, typing indicator) / detail panel (Detail·Members·Files·Tasks·Links, pinned items, per-conversation notification level, leave).
- **Conversation types**: `#general` auto-created for every Team and membership derived from Team membership (option **a** — each team has its own #general, no workspace-wide demo team); extra team channels; unique DMs; small groups (2–20); archived list.
- **Composer**: Enter to send, Shift+Enter newline, `@mention` picker with keyboard navigation and `@everyone` permission, staged references (Task / Project / Asset / File upload / Google Drive link, max 5), pasted links become smart cards (Drive/Docs/Sheets/Slides/Figma/Canva/generic) with 12 h metadata cache and Drive-permission fallback, AI Assist opens the existing AI panel with conversation context.
- **Object cards**: Task cards open the existing Task drawer; Create Task from message uses the existing New Task modal and posts a “Task created from this message” reference. Files/Tasks/Links tabs are derived from message references — no copied stores.
- **Notifications** (§16–27, §142): single delivery pipeline → existing Notification Center (bell) + optional browser notification + **the ZenCrevia chime (`src/sounds/zen-chime.mp3`, the only notification sound; inlined by the build)**. Pre-prompt before the browser permission dialog, per-user preferences (Settings → Notifications: browser, sound, chat/task/project categories), per-conversation ALL / MENTIONS / MUTED, foreground de-duplication. Task notifications reuse the same pipeline.
- **Workspace Quest**: new “Messages & coordination” chapter (open Messages, #general, mention, attach task, notification level) — total stays 100 XP.
- **Server** (`server/messages.js`): conversations / members / messages / reactions / pins tables (SQLite + Postgres schema), tuple cursor pagination, ref validation, capability checks (`view_messages`, `send_message`, `create_group_chat`, `manage_group_chat`, `create_team_channel`, `manage_team_channel`, `mention_everyone`, `pin_message`, `manage_any_message`), notification fan-out into the notifications table (+ email for DM/mention), one SSE stream per session (`GET /api/messages/stream`) multiplexing inbox events, the active conversation, typing and presence. Creating a Team creates its #general.
- **Tests**: `tests/messages.test.js`, `tests/gallery-quota.test.js` (81 tests pass with `npm test`).

## Known limits
- Standalone demo simulates realtime (a member replies after a short typing delay); server SSE is implemented but only unit-tested, not load-tested.
- Drive card names resolve only when Google Drive is connected; otherwise the card shows the link type and “Open in Drive”.
- Browser notifications require HTTPS/localhost and an explicit grant; sound plays only after the first user interaction (browser policy).

## v18.1 — polish after review
- **Pickers never clipped**: `place()` now flips a popover above its anchor when there is no room below and clamps it to the viewport; the entity picker re-positions after every render. The @mention and Task pickers open upward from the composer.
- **Emoji**: new picker (`src/emoji.js`) — 8 categories (~600 Unicode emoji), Recent, search in English/Indonesian, keyboard Enter picks the first hit. Graphics are **Twemoji** (open source: code MIT, art CC-BY 4.0, jdecked/twemoji) loaded per-emoji from jsDelivr when online, with automatic fallback to the system emoji font; a footer toggle switches to system emoji. Same picker for the composer, reactions and the quick reaction bar.
- **Archive mechanism** (§141): DM/Group can be archived by any member (for themselves); Team channels only by `manage_team_channel`/`manage_teams` (for everyone); `#general` is archived only when its Team is archived. Archived conversations leave the lists and unread counts, live under **Arsip**, are read-only (composer replaced by an "archived" bar with Unarchive) and are never deleted. Server enforces the same rules and refuses new messages in an archived conversation.
- **Knowledge** moved from the top navigation into the profile menu (Workspace section) and the mobile "More" sheet; the Workspace Quest step now guides through the profile menu.
- **Mobile/tablet**: floating Messages button (with unread badge) stacked above the AI Intelligence button on screens ≤ 980 px.

## v18.2 — review fixes
- **Popovers sit next to their control**: `place()` now left-aligns when right-alignment would push a popover away from a left-side anchor; composer pickers (attach menu, Task/Project/Asset picker, emoji) are explicitly left-aligned to their button and open directly above the composer. The @mention picker opens at the caret column where "@" was typed (mirror-div measurement).
- **Toggle**: pressing Task/Project/Asset again closes the open picker instead of reopening it.
- **Reactions**: the trailing smiley button after each reaction row is gone; reacting uses the hover action on the message (quick bar + full emoji picker), like Slack.
- **Chat notifications now visible in the demo**: unread demo messages (Dian's mention, Sarah's DM) are seeded into the Notification Center on load; ~20 s after Messages is first opened a DM from Maya arrives so badge, bell entry, in-app toast and chime can be seen; when no browser notification is delivered, a clickable in-app toast (avatar · name · preview) appears for messages in other conversations. Foreground rule unchanged: the conversation you are reading shows the message itself and only plays the chime.

## v19 — UX/UI & Lightweight Feature Enhancement Master Plan

### Phase 0 audit (rule §2 / §13)
| Feature | Finding | Action |
|---|---|---|
| Saved views, global search, Task drawer, entity picker, notification center, Messages state preservation, task estimate (`effort`), activity feed | EXISTS | left alone, reused |
| Deep links (`#conv=` only), undo (canvas only), references (message refs, gallery `sourceTaskId`, task `sourceMessageId`), shortcuts (scattered), Create menu (Task/Request) | PARTIAL | extended |
| Recently viewed, universal Saved, Watch, Remind me, Decision log, Related items, Command palette, Availability, Focus strip, notification grouping/bundling, right-click menu, bulk actions, checklist templates, actual effort, activity digest | MISSING | implemented in `src/enhance.js` + `server/decisions.js` |

### Implemented (all in existing tokens, existing stores, existing permission checks)
- **Phase 1 foundation** — *Related items* (§7.1) derived from the references that already exist (message refs, AI Gallery `sourceTaskId`, decisions, task ↔ message source); shown as a RELATED block in the Task drawer with click-through lists. No second relation table. *Deep links* (§7.17): `#task= #project= #asset= #knowledge= #conv=…&msg= #decision=` with "Copy link" on tasks, projects and messages; links respect entity access. *Undo framework* (§7.18/§6.12): `undoToast()` used for archive, bulk updates, checklist edits and decision removal.
- **Phase 2 speed** — *Command palette* (⌘/Ctrl+K) on top of the existing search predicate and router: Recent, Saved, Tasks, People, Projects, Conversations, Assets, Knowledge, Actions; keyboard navigation; the old Ctrl+K→search moved to `/`. *Recently viewed* (client-side, 30 items) and *Saved items* (personal, `myPrefs.saved`, synced via the existing member endpoint) on Home and in the palette. *Keyboard framework* (§7.20): one registry, disabled while typing, `?` shows the help (⌘K, /, N, G M/H/T; in a task: E, C, A, R, W).
- **Phase 3 personal** — *Watch* (`task.meta.watchers`, notified through the existing activity → notify pipeline), *Remind me* (Later today / Tomorrow / Next Monday / Custom → personal notification through the bell and browser/chime pipeline; client scheduler for MVP), *Focus strip* on Home ("N items need your attention": due, review, mentions, blocked, reminders — presentation only), *Availability* (Available / Focus / Away / OOO until…) in the profile menu, DM header and member lists.
- **Phase 4 team knowledge** — *Decision log*: project tab **Decisions**, "Save as decision" from any message, "Log decision" from a task; one `decisions` table. *Activity digest*: deterministic TODAY aggregation on the project Activity tab. *Notification hierarchy/bundling* (§6.13/§7.12): NEEDS ACTION / UPDATES sections, All/Unread/Mentions/Tasks/Messages filters, low-priority channel messages bundled per conversation; mentions, DMs, replies, approvals and reminders never bundled.
- **Phase 5 workflow** — *Bulk actions* (Select mode on task views: Assign, Status, Due date, Priority, Archive + Undo; each mutation still runs through `editTaskWith` and the task's own permission), *Checklist + templates* in the Task drawer (save any checklist as a workspace template, apply from a picker), *Estimate vs actual* effort row. Project templates (§7.14) not done — see below.
- **Phase 6 polish** — Home page hierarchy (Focus → Saved/Recent → KPIs), right-click context menu on any task card/row (Open, new tab, Edit, Assign, Status, Copy link, Watch, Save, Remind, Archive), quick-add menu extended (Task, Request, Project, Message, AI design, Knowledge page, Decision) with project/team context defaults.
- Server: `tasks.meta` JSON column (added lazily), `decisions` table + routes; 84 tests pass.

### Deliberately not done / limits
- Project templates (§7.14) and AI Hub progressive disclosure (§6.7): both touch large existing surfaces; scheduled after this release.
- Reminders fire from the client (open tab) — the spec allows this for MVP; a server scheduler is the follow-up.
- Bulk actions persist per task (no batch endpoint yet).

## v19.1 — review fixes
- **Status like Slack**: emoji + text (+ optional "until"): presets Focus 🎯, In a meeting 📅, Lunch 🍽️, Working remotely 🏡, Commuting 🚌, Out sick 🤒, Vacationing 🌴, Out of office 🚫, plus a custom status with any emoji (emoji picker) and clear-after time. Visible everywhere a person appears: message sender names, DM rows in the navigator, DM header, member lists, @mention and assignee pickers, profile menu (current status card + one-tap presets). Demo members carry sample statuses.
- **Active states**: Save (★) and Watch (🔔) buttons now have distinct hover / pressed / active looks (filled icon, tinted background, pop animation on save); every enhancement control has 120–150 ms transitions.
- **Home**: Focus is one row under the greeting; Saved / Recent merged into one compact "quick access" chip row with a Saved | Recent switch and an "Everything ⌘K" shortcut — no stacked panels.
- Messages detail panel: names, descriptions and pinned titles use the primary text colour (white in dark mode).

## v19.2 — review fixes
- **Home**: all personal enhancements now live in ONE flexible panel, "My space" (collapsible, remembered per member) with tabs Focus · Saved · Recent · Reminders. Focus shows attention chips plus the top due/review tasks; Saved/Recent are chip rows (unsave inline); Reminders lists upcoming ones with Open / cancel (undo). No more separate strips.
- **Status**: the profile menu shows a single "Set a status ▾" row (or the current status); the dropdown offers No status, the eight presets and Custom — the menu stays short.
- **Bug fixed**: "Create small group" / "New team channel" closed immediately. Cause: the inline people picker inside the New conversation modal was removed on mousedown, shifting the button under the pointer so the click landed on the backdrop. Inline pickers now stay until the modal closes, and the backdrop only closes on a click that also started on it.
- **Profile peek**: click any avatar or sender name in Messages / the task drawer (or a member row) → popover with name, role, teams, status, email, open tasks, online state, and Message / Assign task / Full profile actions.
- Member rows in the detail panel: role text in primary colour (white in dark mode).

## v19.3 — bug fixes
- Login screen no longer shows the Messages pill.
- Popovers/pickers now stack above modals (menu z-index 260, picker 270 > modal 200): "Add member" in the group dialog works, as does the emoji picker inside the status dialog.
- Profile peek also opens from the member avatar stack, whole member rows and the DM identity block; buttons/links inside rows keep their own behaviour.
- Save ★ / Watch 🔔: no icon swap or bounce — colour + background fade (250 ms), icon fills with the active colour; state flips in place without re-rendering the drawer.
- Task drawer header stays one row: only Watch + Save live there (28 px); Copy link / Remind me / Decision remain in the ⋯ menu.
- Avatar initials are always white in light and dark mode.
- Top bar: the Messages pill is icon-only with a corner badge up to 1366 px, so the main navigation keeps its labels down to the existing 1150 px compact breakpoint and the account button no longer overflows at 1200–1280 px.

## v19.4 — review fixes (task header, Create menu, My space, Quest, Messages, Profile)
- **Task header**: Watch · Save · Remind · Settings · Close are one size (36 px, 32 px on phones), sit on one baseline, and the active state changes colour/fill only — no hover lift or press-scale. New **Remind me** icon (clock) beside Watch/Save; the menu shows Later today / Tomorrow / Next Monday / Custom plus any pending reminder with a cancel entry, and the icon lights up while a reminder is pending. **Copy task link** added at the top of the gear menu.
- **Create menu (Home + quick-add + command palette)**: Knowledge page needs `manage_knowledge`, Message needs `send_message`, AI design needs `use_ai_hub`, Decision needs `create_task`. Roles without the capability no longer see the entry.
- **My space**: now the first card of the Home grid instead of a fixed strip — draggable, collapsible, hideable (×) and restorable from Customize like every other card; the Workspace Quest card sits above it. The keyboard hint shows the system modifier (`Ctrl + K` on Windows/Linux, `⌘ K` on macOS; override in Settings → My profile) — same for the palette footer, the shortcut help and the Messages search box.
- **Workspace Quest**: two new Home missions explain My space (Focus/Saved/Recent/Reminders, moving/hiding the card) and the command palette; Home chapter XP rebalanced (3+2+3+2 = 10, total still 100). **Complete all instantly** in Mission Center marks every mission done, awards 100 XP and removes the practice tasks — for people who want to skip the tutorial.
- **Messages**: (bug) opening a DM/group no longer scrolls the navigator back to the top — the list keeps its scroll position across re-renders. Confirmed `@mentions` render as chips inside the composer (same look as a sent mention) so the tag is visibly "in" before sending. **Schedule message** (clock beside Send): In an hour / Tomorrow 09:00 / Next Monday / Custom; queued messages appear in a strip above the composer with Send now and Cancel (undo), and are sent by the open tab when due (personal queue in `prefs.scheduledMessages`, same MVP rule as reminders). Detail-panel member rows: small ADMIN/MEMBER pill beside the name, full name width, status under the title, chat button kept.
- **Profile (Settings → My profile)**: self-service **Status** block (current status, presets, custom, clear) plus Initials, Pronouns, Phone/WhatsApp, Location, Time zone, About me and avatar colour (when no photo). Extra fields live in `prefs.profile` — no schema change; the member page and profile peek show them. Duplicate-email check on save.

## v19.5 — review fixes
- **Task header active state**: the "active" class collided with the activity-row `.act` rule (padding 9px 18px), which pushed the icon 8 px off-centre when Watch/Save/Remind lit up. Renamed to `.is-on`; icons stay centred in both states.
- **My space** starts minimized: a summary row (counts · Focus/Saved/Recent/Reminders tabs · shortcut). Clicking the row or any tab expands it; the card control collapses it again. Applied once per member, so an explicit choice sticks.
- **Settings → My profile** re-laid: header (avatar with hover pencil, name/title, avatar colours, status dropdown with Clear), then Identity · Contact · About me · Workspace (role, capacity, teams) sections. Status presets moved into the same dropdown used in the profile menu — no more chip wall.
- **Member page** back to the title line only (title · role · teams). Owner gets a settings icon beside the name (→ Settings → My profile); a pencil appears on the avatar's bottom-right on hover (always on touch) to change or remove the photo. Extra profile fields still show in the profile peek popover.

## v19.6 — review fixes
- **Messages read state (bug)**: the demo store saved whole conversations and replaced the fresh ones on load, so (a) another member's read state was carried over and the current member had none → everything looked unread, and (b) a saved `lastReadAt` compared against regenerated timestamps. Now only per-user state (read, pins, star, notification level, archive) is merged over the fresh copy; unread is anchored on `lastReadMessageId`; a member without saved state gets the demo default. Rule is simple: opening a conversation marks it read and the counter disappears.
- **Links in chat** open through the same "Open external link" confirm popup as project asset links (host, type, copy link, open).
- **Task card in chat**: left icon; right side two rows — title (+ task id) on top, status pill + View Task underneath. Assignee/due moved to the tooltip.
- **My space**: click anywhere else on Home while it is expanded → it folds back (menus, modals, drawer, palette and the quest coach are exempt). Tablet (≤980 px): head wraps to two rows, tabs scroll horizontally, title keeps its width; phone hides the shortcut label.
- **Status**: the dropdown toggles closed on a second click (from the profile menu and from Settings). Every preset opens the status editor prefilled (emoji · text · default clear-after: Focus 2 h, Meeting/Lunch/Commuting 1 h, Sick tomorrow, Vacation +3 d) with quick chips 30 min / 1 h / 2 h / End of today / Tomorrow / Don't clear, so any status can carry a time. The emoji button in the editor now opens the chat emoji picker (it was closed immediately by the global click handler — fixed with `data-menu`). Menu variant classes no longer leak between popovers.
- **Home KPIs** (audit items 1+2): row 1 (My tasks · Due today · In review · Overdue) removed — same data as the My space Focus chips; row 2 trimmed to Assets delivered + Assets in production as one half-width card ("Asset KPIs" in Customize).

## v19.7 — review fixes
- **My space** toggles from inside too: clicking the header row folds/expands it, a tab click opens that tab, clicking the already-open tab folds the panel. Clicking anywhere else on Home still folds it.
- **KPI cards** are back to the original eight; Customize has a new "KPI cards" section to show/hide each card per member (`prefs.kpiHidden`), grid adapts to the count. Reset to default restores all eight.
- **Edit link**: the sender of a message with a URL / Drive attachment gets "Edit link…" in the message menu; the card re-resolves after saving. Server `PATCH /api/messages/:id` now accepts `refs` (sender or `manage_any_message`).
- **External-link popup everywhere**: `openExternal()` (task versions/files, project final asset, asset library cloud location, Drive cards) now shows the same confirm popup as chat links, then opens a new tab.
- **Status change while reading chat** no longer re-renders the whole Messages screen (which reset the timeline to the bottom); navigator, detail panel and timeline refresh in place.

## v19.8
- **Messages header**: the "Notifications" button is gone — it opened the same workspace-wide Notification Center as the topbar bell, so it duplicated it and read as "chat notifications". Unread/Mention filters, the ⋮ menu (Mark all read, Notification settings) and per-conversation levels cover the chat-specific needs.

## v19.9 — paste from the clipboard (Windows & macOS)
- New `src/clipboard.js`: Ctrl/⌘+V with an image (Snipping Tool, Print Screen, ⌘⇧4/5, a copied image from a browser or Finder/Explorer) lands where you are working: Messages composer → staged attachment (same as Lampiran); task comment box → attachment chip with thumbnail (draft text kept); Upload version / Upload asset modal → the file; task drawer open (editor) → opens Upload version with the image; Assets screen (manager) → opens Upload asset. Text paste stays native; pasting into unrelated inputs is untouched. Pasted screenshots get a readable name (`Pasted image YYYY-MM-DD HH.MM.SS.png`).
- Composer attach menu gains **Paste from clipboard** (async Clipboard API: images attach, text inserts at the caret; falls back to a hint when the browser blocks it).
- Comment attachments with a preview show a thumbnail and open the image preview.

## v19.10
- **Messages (bug)**: sending a message animated the timeline from the top to the bottom. Cause: `.msg-timeline{scroll-behavior:smooth}` applied to the freshly rendered box, so `scrollTop = scrollHeight` was tweened from 0. Smooth scrolling now applies only to explicit jumps (`msgJump` → `scrollIntoView({behavior:"smooth"})`); renders position instantly. Late-loading previews re-pin the bottom while the user is at the bottom.

## v19.11 — save any attachment
- `saveFile()` (gdrive.js): local previews (data URLs) download directly with a proper name; files that live in Google Drive open Drive's download endpoint so the **original** is saved, not the reduced preview; other URLs try a fetch and fall back to a browser download link. A PNG preview of a .psd/.pdf/.ai is saved as `name (preview).png` so it never pretends to be the original.
- Save button on every file card in chat (timeline + Files tab), **Save attachments** in the message menu (all files of that message), **Download** + **Copy image** in the preview modal, **Save** on task file rows, **Download**/**Copy image** in the version preview. Comment attachments open the same preview modal.
- `copyImageToClipboard()` copies a shared screenshot straight to the clipboard as PNG (Clipboard API; hint when unsupported).
