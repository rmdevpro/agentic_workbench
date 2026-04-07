# Blueprint UI Audit (Codex)

Scope: Browser-only (Playwright) coverage derived from `public/index.html`, `server.js`, `docs/test-plan.md`, and `docs/master-capability-list.md`.
Goal: exhaustive UI interaction, edge case, stress, failure, recovery, and persistence coverage. This is intentionally broader than Phase H.

---

## A. Full UI Interaction Inventory (every clickable element + expected behavior)

### A1. Sidebar header
- Click **Add Project (+)**: opens directory picker overlay; file tree loads; clicking a folder populates path/name; Add button calls POST `/api/projects`; overlay closes on success; sidebar refreshes.
- Click **Refresh (?)**: calls `loadState()`; project/session list re-renders using current filter/sort; expansion state persists in memory; search results are replaced by sidebar list.

### A2. Filter bar
- Click **Active / All / Archived / Hidden**: sets filter state; toggles active pill styling; re-renders list and counts; hidden sessions are excluded from All.
- Change **Sort selector** (Date/Name/Messages): re-sorts filtered sessions; list should be stable (no flicker or duplicates).

### A3. Session search input
- Focus/typing: debounce 300ms; q length <2 reverts to normal sidebar list.
- Search results list: clicking a result clears search input, opens session tab (resume), then re-renders normal sidebar.

### A4. Project groups
- Click **Project header**: toggles expand/collapse (arrow rotates); updates list display only (no network).
- Missing project header: shows ?(missing)? and reduced opacity.

### A5. Session items
- Click **Session row** (non-action area): opens/resumes tab unless project missing; if missing, shows alert and does not open.
- Hover: shows session action buttons.
- **Rename (?)**: opens session config overlay (name/state/model/notes); Save sends PUT `/api/sessions/:id/config`.
- **Archive/Unarchive** (? / ?): sends PUT `/api/sessions/:id/archive` with `archived` flag; refresh list.
- **Delete (?)**: confirm dialog; DELETE `/api/sessions/:id?project=...`; closes tab if open; refresh list.
- **Summary (?)**: opens summary overlay; POST `/api/sessions/:id/summary`; shows summary or error.

### A6. New Session button (per project)
- Click **+ New Session**: POST `/api/sessions`; opens new tab using temp id; polls `/api/state` every 3s for 30s.

### A7. Tabs
- Click **Tab**: switch active terminal pane; status bar updates; right panel reloads if open.
- Click **Tab close (?)**: disconnects WebSocket, disposes terminal, removes pane; if last tab closes, empty state shows.
- Tab status dot: visual only, indicates connected/disconnected/connecting.
- Tab bar overflow: horizontal scrolling with many tabs; close buttons remain clickable.

### A8. Terminal area
- **Terminal input**: keystrokes sent via WS to tmux; output renders in xterm.
- **Resize**: ResizeObserver resizes terminal; sends resize JSON to WS.
- **Scrollback**: mouse/trackpad scroll within terminal; xterm scrollback 10000 lines.
- **Web links**: clickable URLs in terminal (xterm WebLinksAddon).

### A9. Status bar
- Visible only when a tab is active.
- Displays model short name, mode (?bypass?), context usage bar/percent, connection status text.
- Updates on: tab switch, WS connect, token poll (15s), manual polling call.

### A10. Right panel (hamburger toggle)
- Click **Panel toggle (?)**: open/close panel; refit active terminal after 250ms.
- **Notes tab**: shows project notes; typing auto-saves after 1s debounce (PUT `/api/projects/:name/notes`).
- **Tasks tab**: list tasks; checkbox toggles complete/reopen; delete removes; input Enter adds task.
- **CLAUDE.md tab**: shows project CLAUDE.md; typing auto-saves after 1.5s debounce (PUT `/api/projects/:name/claude-md`).
- **Messages tab**: loads last 50 messages; shows empty placeholder if none.

### A11. Settings modal
- Click **Settings (?)** in sidebar footer: opens modal and loads settings + global CLAUDE.md + MCP servers.
- Tabs: **General** and **System Prompts** switch sections.
- **Theme select**: applies CSS variables + terminal theme; saves setting.
- **Font size**: applies to all terminals; saves setting.
- **Font family**: applies to all terminals; saves setting.
- **Default model**: saves setting (no immediate UI change).
- **Thinking level**: saves setting.
- **Keepalive mode**: saves setting.
- **Keepalive idle minutes**: saves setting.
- **Quorum lead model**: saves setting.
- **Quorum fixed junior**: saves setting (JSON.parse on select value).
- **Quorum additional juniors**: saves setting (JSON.parse on textarea content).
- **Tasks panel toggle**: saves setting.
- **MCP servers**: add by name+command; remove by ?x?.
- **Global CLAUDE.md**: edit and Save button (PUT `/api/claude-md/global`).
- **Default project template**: edit and Save button (PUT `/api/settings`).
- Close: X button only.

### A12. Auth banner + modal
- **Auth banner**: appears when `/api/auth/status` invalid; inserted above tab bar; removed when valid.
- **Auth modal**: triggered by detecting OAuth URL in terminal output; contains link + code input + submit button.
- **Auth modal submit**: sends code to triggering tab?s WS, disables button, auto-dismisses after 3s.
- **Auth modal click outside**: no close (must submit or wait 3s after submit).

### A13. Add Project overlay
- **File tree**: expands/collapses folders; clicking folder fills path/name.
- **Path input**: read-only; displays selected path.
- **Name input**: custom project name.
- **Add button**: calls `pickerSelect()` and POST `/api/projects`; closes on success; alert on failure.
- **Overlay close (?)**: closes overlay.
- **Overlay click outside**: closes overlay.

### A14. Session config overlay
- Fields: Name, State (active/archived/hidden), Model override, Session notes.
- **Save**: PUT `/api/sessions/:id/config`; closes overlay; reloads state; re-renders tabs.
- **Close (?)** and click outside: closes overlay.

### A15. Summary overlay
- Opens on summary action; shows ?Generating summary...?.
- Close via X or click outside overlay.

---

## B. Input Validation Matrix (valid/invalid values to test)

### B1. Session search input (`#session-search`)
- Valid: 2+ chars, mixed case, spaces, special chars, unicode, regex-like input, extremely long query.
- Invalid/edge: empty, 1 char, only whitespace, rapid typing, rapid backspace, IME composition, pasted large text.
- Expected: <2 chars reverts list; >=2 triggers search; no crashes; results or ?No matches found?.

### B2. Add Project overlay
- Path: valid folder, root ?/? (should alert), very deep path, path with spaces, symlink dir.
- Name: empty (falls back to basename), whitespace-only (should trim), extremely long, special chars.
- Failure responses: 404 path not found, 409 already exists, 500 server error.

### B3. Session config overlay
- Name: empty/whitespace (server 400), extremely long, unicode, HTML special chars, name collision with existing.
- State: active/archived/hidden; invalid state (should be rejected server-side if sent).
- Model override: blank (default), valid model ids, invalid value (server should ignore or error).
- Notes: empty, very long, multi-line, emojis, HTML.

### B4. Tasks input (`#add-task-input`)
- Valid: short text, long text, multiline pasted text, emojis, markdown.
- Invalid: empty/whitespace-only; Enter with empty; rapid Enter; duplicate tasks.
- Expected: creates task; trims; UI refreshes; no duplicates if back-end rejects.

### B5. Notes editor (`#notes-editor`)
- Valid: large note, multiline, emojis, special chars, JSON-like.
- Edge: type fast, paste huge content, undo/redo, select-all delete.
- Expected: debounced save; last value persists.

### B6. Project CLAUDE.md editor
- Valid: large content, markdown, code blocks, special chars.
- Edge: rapid typing then switch tab before debounce fires (ensure save goes to correct project).

### B7. Settings - number inputs
- Font size (10?24): min, max, below min, above max, non-numeric, empty, decimals, negative.
- Idle minutes (5?1440): min, max, below, above, non-numeric, empty.
- Expected: parseInt; if NaN, server receives null/NaN (should not crash). Verify UI behavior and persistence.

### B8. Settings - select inputs
- Theme: each option; invalid value via devtools.
- Font family: each option; invalid value.
- Default model / thinking level / keepalive mode / quorum lead / quorum fixed: all options; invalid value.

### B9. Settings - JSON textarea (quorum additional juniors)
- Valid JSON array (empty, one entry, many).
- Invalid JSON (trailing comma, single quotes, object instead of array, huge JSON).
- Expected: invalid JSON throws in onchange; verify UI does not crash, error handling needed.

### B10. MCP server inputs
- Name: empty, whitespace, duplicate name, long name, special chars.
- Command: empty, single word, command with args, quoted args, command with spaces in path.
- Expected: split by whitespace; commands with quotes may break; should not crash.

### B11. Auth code input
- Empty; short code; long code; pasted with whitespace/newlines; rapid double submit; Enter key.

---

## C. State Transitions (must be tested)

### C1. App boot
- No projects -> sidebar empty; add project flow; ensure no crash.
- Projects exist -> collapsed groups; expand/collapse; counts update.
- Auth banner shown on invalid auth; removed on valid.

### C2. Session lifecycle
- Create session -> temp ID -> real UUID resolution; sidebar updates name/time; tab id should remain working.
- Resume session -> if tmux exists, attach; if not, new tmux created.
- Delete session while tab open -> tab closes; sidebar updates.
- Archive/unarchive -> visibility changes across filters.
- Hidden -> disappears from All/Active; appears in Hidden filter; still openable via search.

### C3. Tab lifecycle
- Open session -> tab + terminal pane created; status bar activates.
- Switch tabs -> active pane changes; status bar updates; panel reloads data.
- Close last tab -> empty state appears; status bar hides.
- Reopen session after close -> new tab attaches; terminal reconnect.

### C4. WS connection lifecycle
- Connecting -> connected -> disconnected -> auto-reconnect (1s -> 2s -> 4s ... max 30s).
- WS error -> status dot red; terminal still visible.
- WS close during active input -> reconnect; no duplicate terminals.

### C5. Panel lifecycle
- Panel closed -> open -> load data for current project; switch tab within panel; reload data.
- Panel open + tab switch -> panel reloads new project data.
- Panel open + no active tab -> no data, should not crash.

### C6. Settings lifecycle
- Open settings -> loads server values; close -> no changes.
- Change theme/font size/family -> apply to all current terminals; new tabs should match.
- Toggle tasks -> expected effect on UI (currently no hiding) should be verified.

### C7. Search lifecycle
- Enter search -> results list replaces sidebar list.
- Clear input -> sidebar list returns.
- Background `loadState` during search -> list should not flicker or reset; current code will reset (test and log).

---

## D. Race Conditions and Concurrency

- Double-click session row: should not create duplicate tabs or double resume requests.
- Double-click New Session: should not create duplicate sessions or overlapping temp IDs; ensure no UI corruption.
- Click session actions while `loadState` re-rendering: no stale handlers; no exceptions.
- Click Archive/Delete while session is opening (tab creating): should resolve consistently.
- Rapid tab switching while tokens polling: status bar should update correctly to active tab only.
- Right panel open/close rapidly during terminal resize: no exceptions; terminal remains visible.
- Rapid typing in notes/CLAUDE.md then switching projects before debounce triggers: ensure save applied to correct project (current code likely saves to new project).
- Concurrent settings changes (theme + font size) while multiple tabs connecting: no null references.
- Search input typing while `loadState` refreshes: ensure search results are not unexpectedly overwritten.

---

## E. Stress and Performance Tests (browser-level)

- Open 10+ tabs simultaneously; verify tab bar scrolling and status updates.
- Create 50+ sessions across projects; verify sidebar render performance.
- Very large session list (hundreds): ensure sidebar scroll and hover actions still work.
- Very large task list (100+): list renders, checkboxes responsive.
- Large notes/CLAUDE.md (hundreds of KB): editor remains responsive; save requests complete.
- Long session names (200+ chars): ellipsis, hover actions still visible.
- Rapid terminal output (e.g., `yes` or `cat` large file): scrollback works; UI remains responsive; status bar stays visible.
- Type very fast into terminal; ensure no dropped characters and WS remains stable.
- Multi-browser tabs (10 browser tabs all attached to same tmux): check WS stability, keepalive behavior.

---

## F. Failure Scenarios (UI-visible behavior)

- `/api/state` fails (500/timeout): UI should not crash; console error only.
- Resume session API returns error (410 missing project): alert shown; no tab created.
- Create session API returns error: alert; no tab created.
- Rename/Save config API fails: overlay closes anyway (bug); name may not update.
- Archive API fails: UI might still re-render old state; should report error.
- Delete API fails: tab may remain, list might not update.
- Summary API fails: modal shows error text.
- Tokens API fails: status bar should still render, no crash.
- Settings API fails: modal shows defaults; changes might be lost.
- MCP servers API fails: list empty; add/remove should not crash.
- WebSocket error or tmux missing: terminal shows error message; auto-reconnect behavior; status dot red.
- Auth status check fails: console error; banner state unchanged.
- Auth modal submit without WS (tab closed): no crash; modal still dismisses.
- Add Project: jQuery file tree fails to load; overlay should still be closeable.

---

## G. Recovery Scenarios

- Browser refresh with open tabs: tabs are lost (expected); sidebar must show sessions; user can reopen.
- Browser close/reopen: projects/sessions/tasks/notes/settings persist.
- Server restart while browser open: WS disconnects; auto-reconnect after server returns.
- Container restart: sessions reappear; open tabs can be reopened; tmux cleanup may have killed sessions (ensure resume works).
- Network disconnect/reconnect: WS auto-reconnect; UI remains stable.
- tmux session killed while tab open: WS closes; UI shows disconnected; reopen session creates new tmux.
- JSONL missing or corrupted: session metadata may be incomplete; UI should still render list and allow delete.

---

## H. Edge Cases (explicit)

- Empty project list; empty session list; empty tasks list; empty messages list.
- Project directory deleted or moved: project marked missing; session click shows alert; delete still works.
- Session JSONL missing (temp session never got JSONL): status bar tokens skipped; session delete should work.
- Expired/invalid auth token: auth banner appears; auth modal triggered by terminal output.
- No tmux installed / tmux command fails: session creation or resume fails -> error alert; WS error on connect.
- Corrupted JSONL (parse errors) -> state/tokens/summary endpoints may return error; UI should handle gracefully.
- Very old timestamps (timeAgo negative): should display ?just now?.
- Session name contains HTML/script: ensure escaping in list, tabs, overlay.
- Project name with slashes/spaces: API paths and UI rendering.

---

## I. Visual / Layout / Responsiveness

- Window resize narrow/wide: sidebar and right panel layout; tab bar overflow; terminal refit.
- Vertical resize small height: terminal + status bar not overlapping; panel scroll.
- Sidebar scroll: project list scrollbars visible; no clipping.
- Long session names: ellipsis works; action buttons not overlapping.
- Long project names: header layout and count badge alignment.
- Session search results text overflow: ellipsis in snippet.
- Status bar context fill width with large tokens (over 100% capped).
- Theme switch (dark/light/blueprint) updates CSS vars and terminal colors consistently.
- Settings modal scroll with many settings; ensure buttons visible.
- Overlays (add project, config, summary, auth) are centered and closable; z-index ordering with auth modal.

---

## J. Cross-Feature Interactions

- Change settings (theme/font) while sessions are running: existing terminals update; new sessions inherit.
- Rename session while tab open: tab label updates after save; sidebar updates.
- Archive a session that is open: should remain in tab; sidebar hides in active filter; status bar still updates.
- Delete a session while open: tab closes; tokens polling stops; right panel updates.
- Search results open a hidden/archived session: tab opens; filter remains unchanged.
- Switch project in right panel while notes/CLAUDE.md debounce pending: verify saves are not written to the wrong project.
- Toggle tasks setting while tasks panel open: should hide/disable tasks UI (currently not wired).
- Open settings modal while auth modal visible: ensure focus/overlay stacking is sane.
- Add MCP server then reopen settings: entry persists; remove persists.

---

## K. Data Persistence (browser-level)

- Refresh page: settings, notes, tasks, CLAUDE.md, session states persist.
- Close/reopen browser: projects/sessions/tasks/notes persist; search field cleared; expanded state resets.
- Server restart: settings/tasks/notes/claude.md persist; active tmux sessions may be cleaned up; resume works.

---

## L. Phase H (UI) Gaps: Everything Missing From the Existing 18 Scenarios

Phase H currently covers only basic load, filters, open/close, settings modal open, right panel open, notes save, add task, auth banner, status bar, session search, summary, config editor, theme toggle. It misses all of the following:

### L1. Clickable elements not covered
- Refresh button behavior.
- Sort selector (Date/Name/Messages).
- Project expand/collapse behavior and count updates.
- Session action buttons: Archive/Unarchive and Delete (including confirm).
- New Session button per project (only ?+ New Session? scenario partially covered, but not per-project state or temp ID resolution).
- Tab status dot states and reconnect behavior.
- Panel tabs (Tasks/CLAUDE.md/Messages) switching and data loads.
- Settings modal close button and tab switching.
- MCP server add/remove controls.
- Global CLAUDE.md save and project template save.
- Auth modal (link click, code input, submit, auto-dismiss).
- Add Project overlay and all its controls.

### L2. Input validation and error handling not covered
- Empty/invalid session rename and config fields; server 400 handling.
- Invalid JSON in quorum additional juniors (throws in onchange).
- Font size / idle minutes out-of-range or non-numeric.
- Empty tasks input; whitespace-only tasks.
- Empty/short search queries and query trimming.
- Add Project errors: root path, missing path, 409 conflict, 500 errors.
- MCP server invalid command/name and duplicates.

### L3. Missing state transitions
- Temp session id -> real UUID migration and UI update.
- Archive/hidden state interactions with filters and open tabs.
- Search mode vs normal sidebar (and reversion on clear).
- Panel reload on tab switch and on panel open.
- Auth banner show/hide on status changes.
- Status bar hidden when no active tab.

### L4. Race conditions and concurrency
- Double-click / rapid clicking (open session, new session, delete, archive).
- `loadState` refresh while search active.
- Debounced saves while switching projects (notes/CLAUDE.md).
- Rapid settings changes while terminals connect.

### L5. Stress/performance
- Many tabs/sessions/tasks/messages.
- Large notes/CLAUDE.md content.
- High-output terminal scrollback and performance.
- Multi-tab browser usage (same tmux).

### L6. Recovery scenarios
- Network disconnect/reconnect (WS auto-reconnect).
- Server restart and session resume.
- tmux killed while tab open.
- Corrupted/missing JSONL effects on state/tokens/summary.

### L7. Visual/layout
- Resize window, overflow, tab bar scroll, panel width, long names.
- Theme switch impact on terminal + CSS.
- Overlay stacking/z-index interactions.

### L8. Cross-feature interactions
- Settings change while sessions running.
- Archive/delete while tab open.
- Search results opening hidden/archived sessions.
- Tasks panel toggle not hiding UI.

---

## M. Specific Focus Areas (based on known failures)

- **Sessions dont work**: full create/resume/delete/rename flow; tmux existence; temp ID resolution; tab connection; WS errors.
- **Status bar broken**: token polling, model display, context bar updates, hidden state when no tab.
- **Scrolling broken**: terminal scrollback + sidebar scroll + settings modal scroll + panel scroll.
- **tmux failing**: WS error handling, resume behavior, alert on session open failure, auto-reconnect behavior.

---

## N. Test Execution Notes (Playwright)

- Use deterministic waits for debounce (notes 1000ms, CLAUDE.md 1500ms, search 300ms).
- Validate network requests per action (HTTP method, endpoint, payload).
- Use browser-level stubs to simulate server errors and WS failures when needed.
- For race/rapid actions, use `page.click({ clickCount: 2 })` and `Promise.all` with throttled network.

---

End of audit.
