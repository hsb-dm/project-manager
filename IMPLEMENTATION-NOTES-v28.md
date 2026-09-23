# ZenCrevia v28 — Task UI and Messages Link/Media

Scope source: `ZenCrevia_Task_UI_and_Messages_Link_Media_Only_v1.md` only.

## Implemented

- Task Detail fields now support Primary, More details, and Hidden display modes.
- Responsive task metadata, localized dates, searchable people/project pickers, compact dependency state, improved description guidance, and one responsive workflow-stage control.
- Messages now has Pesan, Media, Files, Tasks, and Links views over the existing message/reference data model.
- Plain URLs in message text are normalized, deduplicated, linked safely, and parsed authoritatively by the server.
- Link metadata is resolved asynchronously with cache, redirect/size/time limits, DNS/private-network blocking, and no cookies or authorization forwarding.
- Clipboard, drag-and-drop, and file-picker media staging include status, retry, and MIME-based Media/Files separation.
- Shared detail views, search/filter/sort, lazy media grids, source-message navigation, edit/delete synchronization, and single-event notifications are included.

## Follow-up UX refinements

- Chat now includes a dedicated Attach link action for any valid web URL, alongside Google Drive.
- Task Assets & versions now includes Attach link for trusted external HTTPS references.
- Priority and Team are visible in the primary task metadata by default; Tags sit on their own final horizontal row.
- The full Due date value is clickable and opens the native date picker directly.
- The Task footer presents Approved, Delivered, and Done as one Done step while retaining each historical stored status; Declined remains separate.
- Workflow-stage capsules use one-line labels and a consistent minimum height; narrow layouts scroll horizontally instead of wrapping labels.
- Priority, Team, Project, and custom-select fields such as Channel now mark their trigger as a menu control, so the global outside-click handler no longer closes the dropdown immediately.
- Editable dropdowns always show a chevron and pointer cursor; hover/focus still provides the stronger active treatment.
- The Indonesian Settings item is shortened to `Menu & tata letak` and kept on one line in the sidebar.
- Project Description & objective now opens in a clean reading view; permitted users enter a separate edit mode with Cancel and Save.
- The Log decision action now sits in the Decisions panel header, with consistent body padding for the decision list.
- Project progress is automatic: completed-task effort contributes 60% and completed milestones contribute 40%. If only tasks or only milestones exist, that component supplies the full percentage. Declined tasks are excluded.
- The former manual project-progress slider is removed. The project card shows the task and milestone breakdown, while project lists, timeline, analytics, exports, and AI summaries use the same calculation.
- Every Final assets row in a project is now a full-width task-opening target. External asset buttons remain independent and keep their original link/file behavior.
- Calendar `+N more` now opens every item scheduled on that date, including tasks, milestones, and the project deadline. Selecting a task closes the date agenda before opening Task Detail, preventing the task drawer from appearing behind the modal layer.
- Project, Team, and Person details now use one contextual Back pattern. The control names the real source (for example Home, Calendar, Search, Analytics, Projects, or the parent team/project), restores its view/filter/search state and scroll position, and supports nested Team → Person → Team returns.
- Detail pages opened from a direct link or after a fresh reload safely fall back to the relevant Projects or Teams list instead of inventing a previous page.
- The contextual Back control is shifted slightly left so its arrow aligns more cleanly with the detail header below while retaining the full click target.

## Scope boundaries preserved

- The approved Task Detail header was not redesigned.
- No AI Hub, Gallery, global navigation, or unrelated module redesign was introduced.
- Existing task and message stores remain authoritative; the new views are derived indexes, not duplicate stores.

## Consolidated UX revision batch

- Knowledge folders are now durable workspace data. Roles with `manage_knowledge` can create bilingual folder names, search the folder picker, add a folder from the bottom action, and delete managed folders from the Knowledge sidebar. Pages in a deleted folder move safely to General.
- Knowledge authoring supports English and Indonesian title, content, and folder text in both New page and Edit page flows.
- Task dropdown menus anchor directly below their triggering field. Bulk selection is available consistently in every task-bearing My Tasks and Project view: Kanban/Board, List, Grid/Table, Calendar, and Timeline. Non-task project tabs such as Activity and Assets remain unaffected.
- The mobile/tablet sign-in screen hides application navigation and floating action buttons until a demo user is selected.
- Chat classifies screenshots and pasted images as Media, recognizes pasted ZenCrevia task/project links as rich internal cards, and uploads image/video attachments to Google Drive when Drive is configured. Standalone mode keeps its clearly local preview fallback.
- Calendar label visibility is a working toggle: inactive shows `Show labels`; active is blue and shows `Hide labels`. Calendar/Next 14 days spacing and mobile calendar cards were refined.
- Teams now offers PowerPoint export and adds Done this month plus Assets produced KPIs to the overview and team detail.
- Mobile My Tasks, Calendar, Timeline, Task Detail, and Messages were compacted: smaller Select control, visible task Close action, simpler calendar cards/headers, non-overlapping project timeline groups, and icon-only chat quick actions.
- Mobile selection controls now keep Select and New Task in a stable compact action row, while every selected view uses the same bottom bulk-action bar and synchronized task checkboxes.
- Mobile Messages now keeps the conversation panel fixed, scrolls only the message timeline, places the expanding composer above the quick actions, moves New conversation to a floating `+` control, and suppresses horizontal overflow.
- The mobile conversation header and composer were tightened without shrinking message content; New conversation is anchored inside the timeline with a chat-plus icon. Mobile Calendar now presents month navigation, Today, filters, scope, view mode, and label visibility on one compact control row.
- Mobile Project actions stay on one line with a shortened New Task control. The standalone Calendar, AI Gallery header, and AI Canvas were further condensed, and the Account tile in the More menu now opens the account menu correctly.
- The Indonesian AI brief source action remains on one line as `AI Hub`.

## Verification

- Build completed successfully; generated server and standalone HTML match.
- 4/4 contextual-navigation behavior tests passed, including calendar restoration, nested Team/Person returns, scroll preservation, and direct-link fallback.
- Priority 3 resolves the Windows SQLite restore failure: the live handle is checkpointed and closed only after the safety copy and staged database pass validation, then the restored database is reopened in-process. Rollback reopens the previous database if the swap fails.
- The restore dialog now presents the three recovery stages in plain language, disables confirmation until the backup filename matches, blocks duplicate submission, exposes progress to assistive technology, and provides a direct Reload workspace action after success. English and Indonesian restore text are both complete.
- 116/116 full-suite tests passed, including a production-server backup → restore → reconnect integration test. The former Windows `EBUSY` failure is no longer present.
- Browser verification passed on the built app in Indonesian: the project list, automatic 60/40 breakdown, and edit mode without a manual slider rendered correctly.
- Browser verification passed for the calendar agenda: the Sep 23 example shows all six date items, and opening a task removes the agenda modal before displaying Task Detail.
- Browser verification also passed for the Teams PowerPoint/KPI additions, active calendar label state, anchored task dropdown, bilingual Knowledge modal/folder picker, clean pre-login mobile surface, compact mobile task/calendar headers, and visible mobile Task Detail close action.
- Browser verification at 390×844 passed for My Tasks and Project selection in Board/Kanban, Grid/Table, Calendar, and Timeline; Project header actions; fixed mobile chat without horizontal overflow; compact standalone Calendar; AI Gallery; the 260 px mobile Canvas; and the repaired Account menu.
