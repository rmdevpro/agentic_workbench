# Blueprint UI — Comprehensive Browser Test Audit

**Generated:** 2026-03-31
**Auditor:** Claude Opus 4.6
**Source files:** `public/index.html` (1934 lines), `server.js` (1293 lines)
**Existing coverage:** Phase H — 18 scenarios (H01–H18)
**Known broken:** Sessions not working, status bar broken, scrolling broken, tmux failing

---

## Table of Contents

1. [Gap Analysis: What Phase H Missed](#1-gap-analysis)
2. [Sidebar: Projects](#2-sidebar-projects)
3. [Sidebar: Sessions](#3-sidebar-sessions)
4. [Sidebar: Filters & Sort](#4-sidebar-filters--sort)
5. [Sidebar: Search](#5-sidebar-search)
6. [Tab Bar](#6-tab-bar)
7. [Terminal / xterm.js](#7-terminal--xtermjs)
8. [WebSocket Connection Lifecycle](#8-websocket-connection-lifecycle)
9. [Status Bar](#9-status-bar)
10. [Right Panel: Notes](#10-right-panel-notes)
11. [Right Panel: Tasks](#11-right-panel-tasks)
12. [Right Panel: CLAUDE.md](#12-right-panel-claudemd)
13. [Right Panel: Messages](#13-right-panel-messages)
14. [Right Panel: General](#14-right-panel-general)
15. [Settings Modal: General Tab](#15-settings-modal-general-tab)
16. [Settings Modal: System Prompts Tab](#16-settings-modal-system-prompts-tab)
17. [Settings Modal: MCP Servers](#17-settings-modal-mcp-servers)
18. [Auth Banner & Auth Modal](#18-auth-banner--auth-modal)
19. [Session Config Overlay](#19-session-config-overlay)
20. [Session Summary Overlay](#20-session-summary-overlay)
21. [Add Project Overlay](#21-add-project-overlay)
22. [Session Lifecycle (Create → Resolve → Resume → Delete)](#22-session-lifecycle)
23. [State Transitions](#23-state-transitions)
24. [Race Conditions & Timing](#24-race-conditions--timing)
25. [Stress Tests](#25-stress-tests)
26. [Recovery Scenarios](#26-recovery-scenarios)
27. [Edge Cases](#27-edge-cases)
28. [Visual / Layout](#28-visual--layout)
29. [Cross-Feature Interactions](#29-cross-feature-interactions)
30. [Data Persistence](#30-data-persistence)
31. [Security & Input Sanitization](#31-security--input-sanitization)
32. [Accessibility](#32-accessibility)
33. [Polling & Timers](#33-polling--timers)
34. [Error Paths (UI-Triggered)](#34-error-paths)

---

## 1. Gap Analysis: What Phase H Missed {#1-gap-analysis}

Phase H has 18 scenarios. Here is what it **does not cover**:

### Entirely Missing Categories
- **Add Project flow** — the jQuery File Tree picker, directory browsing, path/name inputs, git clone URL
- **Remove Project** — no test for removing a project from the sidebar
- **Session create lifecycle** — new_ temp ID → real UUID resolution, JSONL polling
- **Session resume** — clicking an existing session that has no tmux running
- **WebSocket reconnection** — exponential backoff, reconnect after disconnect
- **Terminal input/output** — typing in terminal, receiving output, binary data
- **Terminal scrollback** — scroll up, scroll down, fast scroll, 10000-line buffer
- **Terminal resize** — ResizeObserver, FitAddon, resize message to PTY
- **Multiple themes** — only tests "switch to light"; misses dark, blueprint-dark, blueprint-light
- **Font size** — changing font size, min/max bounds, applying to all terminals
- **Font family** — changing font, applying to all terminals
- **All settings** — model, thinking level, keepalive mode/timeout, quorum settings, tasks toggle
- **MCP server management** — add, remove, list MCP servers in settings
- **Session sort** — sorting by date, name, messages
- **Project collapse/expand** — clicking project headers
- **Session active dot** — green dot for running tmux sessions
- **Session message count** — count badge in sidebar
- **Session timestamp** — timeAgo display
- **Delete confirmation dialog** — confirm() before delete
- **Archive/Unarchive toggle** — directly from sidebar hover action
- **Config overlay fields** — state, model_override, session notes (not just name)
- **Summary overlay details** — recent messages in summary, loading state, error state
- **Messages panel** — viewing inter-session messages
- **Auth code submission** — entering code, sending to WebSocket, 3s dismiss
- **Auth banner** — persistent warning banner, 60s polling
- **Empty state** — "Select a session" message when no tabs
- **Panel toggle terminal refit** — opening/closing right panel refits terminal
- **State polling** — 30s interval refresh
- **Settings cache** — client-side _settingsCache used for terminal creation
- **All error alerts** — alert() on project add failure, session create failure
- **Search result click** — opening a session from search results
- **CLAUDE.md auto-save debounce** — 1.5s timer
- **Notes auto-save debounce** — 1s timer
- **Smart compaction** — UI doesn't trigger this directly but status bar reflects it
- **Keepalive browser count** — browserCount increment/decrement on WS connect/disconnect
- **tmux cleanup scheduling** — 30min cleanup after disconnect, cancelled on reconnect
- **Missing project handling** — `.missing` class, "Project directory not found" alert
- **Quorum settings** — lead model, fixed junior, additional juniors JSON

### Scenarios That Are Too Shallow
- **H01 (Page loads)** — only checks title; should also verify: sidebar rendered, empty state shown, settings loaded, auth check fired, state polling started
- **H06 (New session)** — doesn't verify: temp ID resolution, JSONL polling, tmux session created, WebSocket connected, terminal receives output
- **H09 (Settings modal)** — doesn't verify individual settings load with correct values, or that changes persist
- **H14 (Status bar)** — doesn't verify: token numbers, context bar color, percentage, polling interval, model name correctness
- **H17 (Config editor)** — doesn't test state change, model override, session notes within the overlay

---

## 2. Sidebar: Projects {#2-sidebar-projects}

### Elements
- `#sidebar-header h1` — "Blueprint" title
- `#sidebar-header button[onclick="addProject()"]` — "+" Add Project button
- `#sidebar-header button[onclick="loadState()"]` — "↻" Refresh button
- `.project-header` — clickable project row with arrow, name, count badge

### Test Scenarios

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| S-P01 | Projects render on load | Navigate to page | Project names visible in sidebar | Snapshot shows project names |
| S-P02 | Project shows session count | Load page with sessions | Count badge shows filtered count | Badge text matches filter |
| S-P03 | Project header collapse | Click expanded project header | Arrow rotates -90°, session list hidden | `.collapsed` class added |
| S-P04 | Project header expand | Click collapsed project header | Arrow rotates down, session list visible | `.collapsed` class removed |
| S-P05 | Expand persists across renders | Expand project, trigger loadState() | Project stays expanded | `expandedProjects` Set checked |
| S-P06 | Refresh button reloads state | Click ↻ | loadState() called, sidebar re-rendered | Network request to /api/state |
| S-P07 | Missing project styling | Project directory deleted | `.missing` class, "(missing)" suffix, 0.6 opacity | Visual check |
| S-P08 | Click session in missing project | Click session under missing project | alert("Project directory not found...") | Alert message |
| S-P09 | Multiple projects sorted by activity | Load with multiple projects | Most recently active project first | Order check |
| S-P10 | Project with zero sessions | Add project with no sessions | Project header shown, count=0, only "New Session" button | Snapshot |
| S-P11 | Add Project button opens overlay | Click "+" | jQuery File Tree overlay appears | Overlay visible |
| S-P12 | Remove project | Call POST /api/projects/:name/remove | Project disappears from sidebar on refresh | Sidebar check |

---

## 3. Sidebar: Sessions {#3-sidebar-sessions}

### Elements per session
- `.session-item` — clickable row
- `.session-name` — name text with overflow ellipsis
- `.session-actions` — hover-only action buttons: Summary (ℹ), Rename (✎), Archive (☐)/Unarchive (↺), Delete (✕)
- `.session-meta` — active dot, timestamp, message count badge
- `.new-session-btn` — "+ New Session" per project

### Test Scenarios

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| S-S01 | Session displays name | Load page | Session name visible, truncated if long | Text content |
| S-S02 | Session shows timestamp | Load page | Relative time (e.g., "5m ago") displayed | timeAgo output |
| S-S03 | Session shows message count | Load page | Number badge shows messageCount | Badge text |
| S-S04 | Active session shows green dot | Session with running tmux | Green dot (`.active-dot`) visible | Element exists |
| S-S05 | Inactive session no dot | Session without running tmux | No green dot | Element absent |
| S-S06 | Hover reveals action buttons | Mouse over session item | Summary, Rename, Archive, Delete buttons appear | `display: flex` |
| S-S07 | Action buttons hidden on unhover | Mouse leaves session item | Buttons hidden | `display: none` |
| S-S08 | Click session opens tab | Click session item (not action btn) | Tab created, terminal connects | Tab appears in tab bar |
| S-S09 | Click already-open session switches tab | Click session that has open tab | Existing tab activated, no duplicate | `activeTabId` matches |
| S-S10 | Open session has blue left border | Session with open tab | `border-left-color: var(--accent)` | `.open` class |
| S-S11 | Active session has highlighted background | Currently focused tab's session | Background color change | `.active` class |
| S-S12 | Archived session styling | Session with state=archived | Italic, muted color | `.archived` class |
| S-S13 | Missing session styling | Session in missing project | 0.5 opacity, `cursor: not-allowed` | `.missing` class |
| S-S14 | Rename button opens config overlay | Click ✎ on session | Config overlay appears with current name | Overlay visible |
| S-S15 | Archive button archives session | Click ☐ on active session | PUT /archive, session moves to archived filter | API call + sidebar |
| S-S16 | Unarchive button unarchives | Click ↺ on archived session | PUT /archive {archived:false}, session returns to active | API + sidebar |
| S-S17 | Delete button with confirm | Click ✕ on session | confirm() dialog appears with session name | Dialog text |
| S-S18 | Delete confirmed removes session | Accept confirm dialog | DELETE request, tab closed if open, session gone | API + sidebar |
| S-S19 | Delete cancelled keeps session | Cancel confirm dialog | No API call, session remains | Sidebar unchanged |
| S-S20 | Summary button opens overlay | Click ℹ on session | Summary overlay with "Generating summary..." | Overlay visible |
| S-S21 | New Session button creates session | Click "+ New Session" | POST /api/sessions, tab opens, polling starts | Tab + API |
| S-S22 | Action button click doesn't open session | Click action button | `e.stopPropagation()` prevents session open | No tab created |

---

## 4. Sidebar: Filters & Sort {#4-sidebar-filters--sort}

### Elements
- `.filter-btn[data-filter="active"]` — Active filter (default)
- `.filter-btn[data-filter="all"]` — All filter
- `.filter-btn[data-filter="archived"]` — Archived filter
- `.filter-btn[data-filter="hidden"]` — Hidden filter
- `#session-sort` — Sort dropdown (Date/Name/Messages)

### Test Scenarios

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| F-01 | Active filter is default | Page load | Active button has `.active` class | CSS class |
| F-02 | Active filter hides archived | Click Active | Only state=active sessions shown | Session count |
| F-03 | Active filter hides hidden | Click Active | state=hidden sessions not shown | Session count |
| F-04 | All filter shows active+archived | Click All | Active and archived shown, hidden excluded | Session count |
| F-05 | Archived filter shows only archived | Click Archived | Only state=archived shown | Session count |
| F-06 | Hidden filter shows only hidden | Click Hidden | Only state=hidden shown | Session count |
| F-07 | Filter button styling toggle | Click different filter | Previous deactivated, new activated | `.active` class |
| F-08 | Count badge updates with filter | Switch filter | Count per project reflects filtered count | Badge text |
| F-09 | Sort by date (default) | Select Date | Sessions ordered by timestamp DESC | Order check |
| F-10 | Sort by name | Select Name | Sessions ordered alphabetically | Order check |
| F-11 | Sort by messages | Select Messages | Sessions ordered by messageCount DESC | Order check |
| F-12 | Sort change triggers re-render | Change sort | renderSidebar() called | Sidebar updates |
| F-13 | Filter + sort combined | Set filter=archived, sort=name | Only archived, alphabetical | Combined check |

---

## 5. Sidebar: Search {#5-sidebar-search}

### Elements
- `#session-search` — text input with 300ms debounce

### Test Scenarios

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| SR-01 | Empty search shows normal sidebar | Clear search input | renderSidebar() called, projects shown | Normal sidebar |
| SR-02 | Single character shows normal sidebar | Type "a" | No API call, normal sidebar | No /api/search request |
| SR-03 | Two+ characters triggers search | Type "te" | After 300ms, GET /api/search?q=te | Network request |
| SR-04 | Search results replace sidebar | Type valid query with matches | Project list replaced with search results | Different content |
| SR-05 | Search result shows session name | Results returned | Session name visible | Text content |
| SR-06 | Search result shows project name | Results returned | Project name in meta | Text content |
| SR-07 | Search result shows match count | Results returned | "N matches" badge | Badge text |
| SR-08 | Search result shows snippet | Results returned | First match text preview | Text content |
| SR-09 | Click search result opens session | Click result | Session opened, search cleared, sidebar restored | Tab + sidebar |
| SR-10 | No results message | Search with no matches | "No matches found" message | Text content |
| SR-11 | Debounce prevents rapid calls | Type 5 chars quickly | Only 1 API call after 300ms pause | Network log |
| SR-12 | Clear search restores sidebar | Type query then clear input | Normal sidebar re-renders | Projects visible |
| SR-13 | Special characters in query | Type `<script>` or `"quotes"` | URL-encoded, no XSS, results or empty | Safe handling |
| SR-14 | Very long search query | Type 500+ characters | Request sent, no crash | No error |

---

## 6. Tab Bar {#6-tab-bar}

### Elements
- `#tab-bar` — horizontal scrollable container
- `.tab` — individual tab with status dot, name, close button
- `.tab-status` — colored dot (connected/disconnected/connecting)
- `.tab-name` — session name with overflow ellipsis
- `.tab-close` — ✕ button
- `#panel-toggle` — hamburger button (☰) for right panel

### Test Scenarios

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| T-01 | Tab appears on session open | Open session | Tab added to tab bar | Tab count |
| T-02 | Tab shows session name | Open session | Name visible in tab | Text content |
| T-03 | Active tab styling | Tab is active | `.active` class, bottom accent border, bg-primary background | CSS |
| T-04 | Inactive tab styling | Tab not active | text-secondary color, no bottom border | CSS |
| T-05 | Tab hover | Hover over inactive tab | bg-hover background, text-primary color | Visual |
| T-06 | Click tab switches terminal | Click inactive tab | switchTab() called, terminal pane switches | Active pane |
| T-07 | Close tab removes tab | Click ✕ | Tab removed, terminal disposed, WS closed | Tab count |
| T-08 | Close tab switches to last remaining | Close active tab with others open | Last tab in Map becomes active | activeTabId |
| T-09 | Close last tab shows empty state | Close only tab | Empty state message appears | #empty-state |
| T-10 | Close tab doesn't delete session | Close tab | Session still in sidebar, tmux still running | API check |
| T-11 | Status dot — connected | WS open | Green dot | `.connected` class |
| T-12 | Status dot — disconnected | WS closed | Red dot | `.disconnected` class |
| T-13 | Status dot — connecting | WS connecting | Amber pulsing dot | `.connecting` class + animation |
| T-14 | Tab name overflow | Open session with very long name | Text truncated with ellipsis | `text-overflow: ellipsis` |
| T-15 | Tab bar scrolls with many tabs | Open 10+ sessions | Tab bar scrollable horizontally | `overflow-x: auto` |
| T-16 | Close button click doesn't switch tab | Click ✕ | `e.stopPropagation()` prevents switchTab | No switch then close |
| T-17 | Panel toggle button | Click ☰ | Right panel opens/closes | Panel visibility |
| T-18 | Tab name updates on rename | Rename session via config overlay | Tab name updates immediately | Text content |
| T-19 | Multiple tabs maintain independent state | Open 3 sessions | Each has own terminal, WS, status | Independent data |

---

## 7. Terminal / xterm.js {#7-terminal--xtermjs}

### Elements
- `.terminal-pane` — container per tab
- xterm.js Terminal instance with FitAddon, WebLinksAddon
- ResizeObserver on `#terminal-area`

### Test Scenarios

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| XT-01 | Terminal renders in pane | Open session | xterm.js canvas visible in pane | DOM element |
| XT-02 | Terminal receives output | Connect to session | CLI banner/output appears | Terminal content |
| XT-03 | Terminal accepts keyboard input | Type characters | Characters sent via WS, echoed in terminal | WS message + echo |
| XT-04 | Terminal handles binary data | Server sends arraybuffer | Data rendered correctly | No garbled output |
| XT-05 | Terminal cursor blinks | Open terminal | Cursor blink enabled | `cursorBlink: true` |
| XT-06 | Terminal uses saved font size | Set font size 18, open new session | New terminal uses font size 18 | `term.options.fontSize` |
| XT-07 | Terminal uses saved font family | Set Fira Code, open new session | New terminal uses Fira Code | `term.options.fontFamily` |
| XT-08 | Terminal uses saved theme | Set light theme, open new session | Terminal has light theme colors | `term.options.theme` |
| XT-09 | FitAddon fits on pane show | Switch to tab | `fitAddon.fit()` called after 10ms | Terminal fills pane |
| XT-10 | ResizeObserver triggers fit | Resize browser window | Active terminal refits | Dimensions change |
| XT-11 | Resize sends dimensions to server | Terminal resizes | `{"type":"resize", cols, rows}` sent via WS | WS message |
| XT-12 | Terminal scrollback 10000 lines | Generate 10000+ lines of output | Can scroll back through buffer | Scroll position |
| XT-13 | Fast scroll sensitivity | Scroll with trackpad | Scroll speed = 5x fast, 3x normal | Scroll behavior |
| XT-14 | WebLinksAddon makes URLs clickable | Output contains URL | URL is clickable link | Link element |
| XT-15 | Terminal focus on tab switch | Switch tab | `term.focus()` called | Focus state |
| XT-16 | Only active pane visible | Multiple tabs | Only active pane has `display: block` | CSS |
| XT-17 | Terminal disposed on tab close | Close tab | `term.dispose()` called, pane element removed | DOM cleanup |
| XT-18 | Terminal pane positioned above status bar | Open session | Pane bottom = 28px (status bar height) | CSS `bottom: 28px` |
| XT-19 | Special keys (Ctrl+C, Ctrl+D, etc.) | Press Ctrl+C | Sent to PTY, interrupts process | Terminal response |
| XT-20 | ANSI color codes rendered | Output with colors | Colors displayed correctly | Visual |
| XT-21 | Terminal padding | Open terminal | 4px padding on `.xterm` | CSS |

---

## 8. WebSocket Connection Lifecycle {#8-websocket-connection-lifecycle}

### Code: `connectTab()` function (index.html:976–1057)

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| WS-01 | WS connects on tab create | createTab() called | WebSocket opened to `/ws/{tmux}` | WS state |
| WS-02 | Protocol selection | Page on http:// | Uses `ws://`; on https:// uses `wss://` | URL protocol |
| WS-03 | Binary type set | WS created | `ws.binaryType = 'arraybuffer'` | Property |
| WS-04 | On open: status → connected | WS opens | `tab.status = 'connected'`, tabs re-rendered | Status dot |
| WS-05 | On open: reconnect delay reset | WS opens after reconnect | `reconnectDelay` reset to 1000 | Property |
| WS-06 | On open: sends initial size | WS opens | Resize JSON sent with cols/rows | WS message |
| WS-07 | On open: wires terminal input | WS opens, type in terminal | `term.onData` sends to WS | WS message |
| WS-08 | On open: wires terminal resize | WS opens, resize window | `term.onResize` sends resize JSON | WS message |
| WS-09 | Heartbeat starts | WS opens | Ping sent every 30s | Interval timer |
| WS-10 | Pong received silently | Server sends pong | No terminal output | No visible change |
| WS-11 | Error JSON displayed | Server sends `{"type":"error","message":"..."}` | Red error text in terminal | Terminal content |
| WS-12 | Auth check on message | Terminal output received | `checkForAuthIssue()` called | Function call |
| WS-13 | String data written to terminal | Server sends string | `tab.term.write(data)` | Terminal content |
| WS-14 | Binary data written to terminal | Server sends arraybuffer | `tab.term.write(new Uint8Array(data))` | Terminal content |
| WS-15 | On close: status → disconnected | WS closes | Status changes, heartbeat cleared | Status dot red |
| WS-16 | Auto-reconnect after close | WS closes, tab still open | `connectTab()` called after delay | Reconnect attempt |
| WS-17 | Exponential backoff | Multiple reconnects | Delay doubles: 1s, 2s, 4s, 8s, 16s, 30s | Delay values |
| WS-18 | Max reconnect delay 30s | Many reconnects | Delay capped at 30000ms | No delay > 30s |
| WS-19 | No reconnect if tab closed | Close tab, WS closes | No reconnect scheduled | No timer |
| WS-20 | On error: status → disconnected | WS error | Status updated, tabs re-rendered | Status dot |
| WS-21 | Previous disposables cleaned up | Reconnect | Old `dataDisposable` and `resizeDisposable` disposed | No duplicate handlers |
| WS-22 | Previous heartbeat cleaned up | Reconnect | Old heartbeat interval cleared | No duplicate intervals |
| WS-23 | Session detached message | PTY process exits | `[Session detached]` shown in yellow | Terminal content |
| WS-24 | Invalid tmux session | Connect to nonexistent tmux | Error JSON sent, WS closed | Error message |

---

## 9. Status Bar {#9-status-bar}

### Elements
- `#status-bar` — bottom bar, 28px height
- Model name, Permission mode ("bypass"), Context tokens + bar + percentage, Connection status

### Code: `updateStatusBar()`, `pollTokenUsage()` (index.html:1420–1481)

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| SB-01 | Status bar hidden when no tab | No active tab | `display: none` | CSS class |
| SB-02 | Status bar shown when tab active | Open session | `display: flex` | `.active` class |
| SB-03 | Model name — Opus | Session using Opus | "Opus" displayed | Text content |
| SB-04 | Model name — Sonnet | Session using Sonnet | "Sonnet" displayed | Text content |
| SB-05 | Model name — Haiku | Session using Haiku | "Haiku" displayed | Text content |
| SB-06 | Model name — unknown | No token data yet | "unknown" displayed | Text content |
| SB-07 | Model name — long name truncated | Model > 15 chars | Truncated to 15 | Text length |
| SB-08 | Permission mode always "bypass" | Any session | "bypass" shown | Hardcoded value |
| SB-09 | Context tokens numeric display | 50000 input tokens | "50k / 200k" | Text content |
| SB-10 | Context tokens < 1000 | 500 input tokens | "500 / 200k" | No "k" suffix |
| SB-11 | Context bar green < 60% | 30% usage | Green fill bar | `.context-fill-green` |
| SB-12 | Context bar amber 60–84% | 70% usage | Amber fill bar | `.context-fill-amber` |
| SB-13 | Context bar red >= 85% | 90% usage | Red fill bar | `.context-fill-red` |
| SB-14 | Context percentage display | 45.6% usage | "46%" displayed (toFixed(0)) | Text content |
| SB-15 | Context bar width matches percentage | 50% usage | Fill bar at 50% width | CSS `width: 50%` |
| SB-16 | Context capped at 100% | Tokens exceed max | Bar width capped at 100% | No overflow |
| SB-17 | Connection status shown | Tab connected | "connected" text | Text content |
| SB-18 | Token polling every 15s | Wait 15s | GET /api/sessions/:id/tokens called | Network request |
| SB-19 | Token poll on tab switch | Switch tabs | pollTokenUsage() called immediately | Network request |
| SB-20 | Skip token poll for new_ sessions | new_ temp session | No token API call, status bar still renders | No /tokens request |
| SB-21 | Token poll failure silent | API returns error | No crash, status bar shows defaults | Graceful degradation |
| SB-22 | Status bar updates after poll | Tokens change | Bar, percentage, numbers update | Visual change |
| SB-23 | Zero tokens | Fresh session | "0 / 200k" and 0% | Text content |

---

## 10. Right Panel: Notes {#10-right-panel-notes}

### Elements
- `#notes-editor` — textarea with 1s debounce auto-save
- `#panel-notes` — container section

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| RN-01 | Notes load for current project | Open panel, notes tab | GET /api/projects/:name/notes, textarea filled | Content matches API |
| RN-02 | Notes empty for new project | Open panel for empty project | Textarea empty, placeholder shown | Placeholder visible |
| RN-03 | Type triggers auto-save | Type in notes | After 1000ms, PUT request sent | Network request |
| RN-04 | Debounce resets on continued typing | Type continuously | Only 1 PUT after last keystroke + 1s | Single request |
| RN-05 | Notes persist after refresh | Save notes, refresh page | Notes still present after reload | Content matches |
| RN-06 | Notes change on tab switch | Switch to different project's tab | Notes reload for new project | Different content |
| RN-07 | No project shows nothing | Close all tabs, open panel | No API call (getCurrentProject returns null) | No crash |
| RN-08 | Very large notes content | Paste 50KB text | Saves without error | PUT succeeds |
| RN-09 | Notes with special characters | Type `<script>alert(1)</script>` | Saved as-is, no XSS | Content preserved |
| RN-10 | Notes textarea resizable | Drag resize handle | Textarea grows vertically | `resize: vertical` |

---

## 11. Right Panel: Tasks {#11-right-panel-tasks}

### Elements
- `#task-list` — container for task items
- `.task-item` — row with checkbox, text, delete button
- `.task-checkbox` — toggle complete/reopen
- `.task-delete` — ✕ button (visible on hover)
- `#add-task-input` — text input, Enter to add

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| RT-01 | Tasks load for current project | Open panel, tasks tab | GET /api/projects/:name/tasks | Task list rendered |
| RT-02 | Add task via Enter | Type "Fix bug", press Enter | POST /api/projects/:name/tasks, task appears | Task in list |
| RT-03 | Empty task not added | Press Enter with empty input | No API call | No request |
| RT-04 | Task input cleared after add | Add task | Input field empty | Input value = "" |
| RT-05 | Complete task via checkbox | Check checkbox | PUT /api/tasks/:id/complete, strikethrough | `.done` class |
| RT-06 | Reopen task via checkbox | Uncheck checkbox | PUT /api/tasks/:id/reopen, normal style | `.done` removed |
| RT-07 | Delete task via ✕ | Click delete button | DELETE /api/tasks/:id, task removed | Task gone |
| RT-08 | Delete button visible on hover only | Hover over task item | ✕ becomes visible | `visibility: visible` |
| RT-09 | Completed task styling | Task done | Text strikethrough + muted color | CSS |
| RT-10 | Task list reloads after action | Complete/delete task | loadTasks() called, fresh render | Updated list |
| RT-11 | No project shows nothing | No active tab | No API call | No crash |
| RT-12 | Many tasks (50+) | Add 50 tasks | All rendered, scrollable | Scroll panel |
| RT-13 | Task with HTML characters | Add task `<b>bold</b>` | Rendered as text, not HTML | escHtml applied |
| RT-14 | Tasks panel toggle setting | Disable in settings | Tasks tab still visible but setting persisted | API check |

---

## 12. Right Panel: CLAUDE.md {#12-right-panel-claudemd}

### Elements
- `#project-claude-md` — textarea with 1.5s debounce
- `#panel-claudemd` — container section

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| RC-01 | CLAUDE.md loads for project | Open panel, CLAUDE.md tab | GET /api/projects/:name/claude-md | Content loaded |
| RC-02 | Default template applied | New project without CLAUDE.md | Template content shown (from settings) | Content matches template |
| RC-03 | Auto-save on type | Type in textarea | After 1500ms, PUT request sent | Network request |
| RC-04 | Debounce resets | Keep typing | Single PUT after 1.5s pause | Single request |
| RC-05 | CLAUDE.md with monospace font | View textarea | `font-family: monospace` | CSS |
| RC-06 | CLAUDE.md persists | Save, reload page | Content preserved | File on disk |
| RC-07 | Content updates on tab switch | Switch to different project | New project's CLAUDE.md loaded | Different content |

---

## 13. Right Panel: Messages {#13-right-panel-messages}

### Elements
- `#message-list` — container for messages
- `#panel-messages` — section

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| RM-01 | Messages load for project | Open panel, messages tab | GET /api/projects/:name/messages | Messages rendered |
| RM-02 | No messages | Project with no messages | "No messages yet" text | Text content |
| RM-03 | Message shows from/to | Messages exist | from session (8 chars) → to session (8 chars) | Text format |
| RM-04 | Message shows timestamp | Messages exist | Relative time via timeAgo | Time format |
| RM-05 | Message content truncated | Long message | Content capped at 200 chars | Substring |
| RM-06 | Message content HTML-escaped | Message with `<script>` | Rendered as text | No XSS |
| RM-07 | Human sender | from_session is null | "human" shown | Text |
| RM-08 | Broadcast message | to_session is null | "all" shown | Text |

---

## 14. Right Panel: General {#14-right-panel-general}

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| RP-01 | Panel toggle opens | Click ☰ | `#right-panel` gets `.open` class, width=320px | CSS |
| RP-02 | Panel toggle closes | Click ☰ again | `.open` removed, width=0 | CSS |
| RP-03 | Panel open refits terminal | Open panel | Active terminal refits after 250ms | Dimensions change |
| RP-04 | Panel close refits terminal | Close panel | Active terminal refits after 250ms | Dimensions grow |
| RP-05 | Tab switching in panel | Click Notes/Tasks/CLAUDE.md/Messages | Correct section shown, others hidden | `display` CSS |
| RP-06 | Panel tab active styling | Click tab | `.active` class with accent border | CSS |
| RP-07 | Panel reloads on tab switch | Switch terminal tab | loadPanelData() called for new project | New data |
| RP-08 | Panel remembers active panel tab | Switch to Tasks, switch terminal tab | Tasks panel still active after reload | Active panel |
| RP-09 | Panel with no active session | All tabs closed, open panel | No API calls, no crash | Graceful |

---

## 15. Settings Modal: General Tab {#15-settings-modal-general-tab}

### Elements
- Theme select: dark / light / blueprint-dark / blueprint-light
- Font size input: number, min=10, max=24
- Font family select: 6 options
- Default model select: Opus 4.6 / Sonnet 4.6 / Haiku 4.5
- Thinking level select: none / low / medium / high
- Keepalive mode select: always / browser / idle
- Idle timeout input: number, min=5, max=1440
- Quorum lead model select: Opus 4.6 / Sonnet 4.6
- Fixed junior select: 3 Anthropic options
- Additional juniors textarea (JSON)
- Tasks panel checkbox

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| SET-01 | Settings modal opens | Click ⚙ Settings | Modal visible, settings loaded from API | `.visible` class |
| SET-02 | Settings modal closes | Click ✕ | Modal hidden | `.visible` removed |
| SET-03 | Settings load current values | Open modal | All fields populated from /api/settings | Values match |
| SET-04 | Theme dark | Select dark | CSS vars removed, dark terminal theme | Visual |
| SET-05 | Theme light | Select light | Light CSS vars applied, light terminal theme | Visual |
| SET-06 | Theme blueprint-dark | Select blueprint-dark | Blueprint dark CSS + terminal theme | Visual |
| SET-07 | Theme blueprint-light | Select blueprint-light | Blueprint light CSS + terminal theme | Visual |
| SET-08 | Theme applies to existing terminals | Switch theme with open tabs | All terminal instances updated | Each tab's theme |
| SET-09 | Theme persists | Set theme, refresh | Theme reapplied on load | loadAppearanceSettings |
| SET-10 | Font size change | Set to 18 | All terminals resize, setting saved | Font size + fit |
| SET-11 | Font size min (10) | Set to 10 | Accepted, terminals update | Value applied |
| SET-12 | Font size max (24) | Set to 24 | Accepted, terminals update | Value applied |
| SET-13 | Font size below min | Type 5 | Browser validation (min=10) | Input constraint |
| SET-14 | Font size above max | Type 30 | Browser validation (max=24) | Input constraint |
| SET-15 | Font family change | Select Fira Code | All terminals update, refitted | fontFamily + fit |
| SET-16 | Default model change | Select Opus 4.6 | PUT /api/settings, new sessions use Opus | API call |
| SET-17 | Thinking level change | Select high | PUT /api/settings | API call |
| SET-18 | Keepalive mode — always | Select always | PUT /api/settings, keepalive starts | API + server |
| SET-19 | Keepalive mode — browser | Select browser | PUT /api/settings, applies immediately | API + server |
| SET-20 | Keepalive mode — idle | Select idle | PUT /api/settings, applies immediately | API + server |
| SET-21 | Idle timeout change | Set to 60 | PUT /api/settings | API call |
| SET-22 | Idle timeout min (5) | Set to 5 | Accepted | API call |
| SET-23 | Idle timeout max (1440) | Set to 1440 | Accepted | API call |
| SET-24 | Quorum lead model change | Select Sonnet | PUT /api/settings | API call |
| SET-25 | Fixed junior change | Select Opus | PUT /api/settings with JSON value | API call |
| SET-26 | Additional juniors valid JSON | Enter valid array | PUT /api/settings, parsed correctly | API call |
| SET-27 | Additional juniors invalid JSON | Enter `{broken` | JSON.parse throws, setting not saved | Error handling |
| SET-28 | Tasks panel toggle on | Check checkbox | PUT /api/settings {tasks_enabled: true} | API call |
| SET-29 | Tasks panel toggle off | Uncheck checkbox | PUT /api/settings {tasks_enabled: false} | API call |
| SET-30 | Settings tab switch | Click "System Prompts" | General hidden, prompts shown | Display toggle |
| SET-31 | Settings tab back to General | Click "General" | General shown, prompts hidden | Display toggle |

---

## 16. Settings Modal: System Prompts Tab {#16-settings-modal-system-prompts-tab}

### Elements
- `#setting-global-claude-md` — textarea + Save button
- `#setting-project-template` — textarea + Save button

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| SP-01 | Global CLAUDE.md loads | Open settings, prompts tab | Content from GET /api/claude-md/global | Content matches |
| SP-02 | Global CLAUDE.md save | Edit text, click Save | PUT /api/claude-md/global | API call |
| SP-03 | Global CLAUDE.md empty | No global file exists | Empty textarea | Placeholder |
| SP-04 | Project template loads | Open settings, prompts tab | Content from setting `default_project_claude_md` | Content matches |
| SP-05 | Project template save | Edit text, click Save | PUT /api/settings with key `default_project_claude_md` | API call |
| SP-06 | Side-by-side layout | View prompts tab | Two panels side by side, divider | Layout check |
| SP-07 | Tall content in prompts | Large CLAUDE.md | `height: calc(80vh - 140px)`, no resize | CSS |

---

## 17. Settings Modal: MCP Servers {#17-settings-modal-mcp-servers}

### Elements
- `#mcp-server-list` — list of configured servers
- `#add-mcp-form` — name input + command input + Add button

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| MCP-01 | MCP servers load | Open settings | GET /api/mcp-servers, list populated | Server names shown |
| MCP-02 | No servers message | No MCP servers configured | "No MCP servers configured" | Text |
| MCP-03 | Server shows name | Servers exist | Name displayed | Text content |
| MCP-04 | Server shows type (stdio) | Server with command | "stdio" type | Text |
| MCP-05 | Server shows type (sse) | Server with url | "sse" type | Text |
| MCP-06 | Remove server | Click ✕ on server | DELETE from mcpServers, list refreshed | Server gone |
| MCP-07 | Add server | Enter name + command, click Add | PUT /api/mcp-servers with new entry | Server in list |
| MCP-08 | Add server clears inputs | Add succeeds | Name and command inputs cleared | Input values |
| MCP-09 | Add with empty name | Leave name blank, click Add | Nothing happens (early return) | No API call |
| MCP-10 | Add with empty command | Leave command blank, click Add | Nothing happens | No API call |
| MCP-11 | Command parsed into args | Enter "npx ts-node server.ts" | command="npx", args=["ts-node","server.ts"] | Stored correctly |
| MCP-12 | Blueprint server listed | After startup | "blueprint" server visible | Name in list |

---

## 18. Auth Banner & Auth Modal {#18-auth-banner--auth-modal}

### Auth Banner
- Created dynamically as `#auth-banner`
- Shown when `/api/auth/status` returns `{valid: false}`

### Auth Modal
- `#auth-modal` — full-screen overlay
- `#auth-link` — OAuth URL link (opens in new tab)
- `#auth-code-input` — text input for auth code
- `#auth-code-submit` — Submit button

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| AU-01 | Auth check on load | Page loads | GET /api/auth/status after 1s | Network request |
| AU-02 | Auth check every 60s | Wait 60s | Repeated GET /api/auth/status | Network request |
| AU-03 | Auth valid — no banner | Credentials valid | No banner shown | #auth-banner absent |
| AU-04 | Auth invalid — banner shown | Credentials invalid | Warning banner with ⚠ icon | Banner visible |
| AU-05 | Auth banner message | Banner shown | Mentions `/login` command | Text content |
| AU-06 | Auth banner removed on valid | Invalid then valid | Banner element removed from DOM | Element gone |
| AU-07 | Auth banner persists across states | Stay invalid | Banner remains visible | Still in DOM |
| AU-08 | OAuth URL detected in PTY output | Terminal outputs OAuth URL | Auth modal opens with URL | Modal visible |
| AU-09 | URL cleaned of ANSI escapes | URL has escape sequences | `auth-link.href` is clean URL | URL check |
| AU-10 | PTY buffer per tab | Multiple tabs | Each tab has independent 2KB buffer | Buffer check |
| AU-11 | Auth modal shows link | Modal opens | "Authenticate with Claude" link with correct href | Link href |
| AU-12 | Auth code input focused | Modal opens | Code input auto-focused | Focus state |
| AU-13 | Submit auth code via button | Enter code, click Submit | Code + \r sent to triggering tab's WS | WS message |
| AU-14 | Submit auth code via Enter | Enter code, press Enter | Same as button submit | WS message |
| AU-15 | Submit empty code | Click Submit with empty input | Nothing happens (early return) | No WS message |
| AU-16 | Submit disables button | Click Submit | Button disabled, text = "Authenticating..." | Button state |
| AU-17 | Modal dismisses after 3s | Submit code | Modal hidden after 3000ms | `.visible` removed |
| AU-18 | Button re-enabled after dismiss | Modal closes | Button enabled, text = "Submit" | Button state |
| AU-19 | authModalVisible prevents duplicates | Second auth URL detected | No second modal | Single modal |
| AU-20 | Auth error pattern detection | Terminal shows "OAuth token has expired" | Recognized as auth issue (waits for URL) | Pattern match |

---

## 19. Session Config Overlay {#19-session-config-overlay}

### Elements (dynamically created)
- `#cfg-name` — name input
- `#cfg-state` — state select (active/archived/hidden)
- `#cfg-model` — model override select (default/Opus/Sonnet/Haiku)
- `#cfg-notes` — session notes textarea
- Save button
- ✕ close button
- Click-outside to close

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| CO-01 | Config overlay opens | Click ✎ on session | Overlay appears with form | Visible |
| CO-02 | Config loads current values | Open overlay | GET /api/sessions/:id/config, fields populated | Values match |
| CO-03 | Name field pre-filled | Open overlay | Current name in input | Input value |
| CO-04 | State dropdown pre-selected | Open overlay | Current state selected | Select value |
| CO-05 | Model override pre-selected | Open overlay | Current model or "Default" selected | Select value |
| CO-06 | Notes pre-filled | Open overlay | Current notes in textarea | Textarea value |
| CO-07 | Save updates all fields | Change name+state+model, click Save | PUT /api/sessions/:id/config | API call |
| CO-08 | Save updates tab name | Change name, save | Tab bar shows new name | Tab text |
| CO-09 | Save closes overlay | Click Save | Overlay removed from DOM | Element gone |
| CO-10 | Save triggers sidebar reload | Click Save | loadState() called | Sidebar updates |
| CO-11 | Close via ✕ | Click ✕ button | Overlay removed | Element gone |
| CO-12 | Close via click outside | Click overlay backdrop | Overlay removed | Element gone |
| CO-13 | Click inside doesn't close | Click form area | `event.stopPropagation()`, overlay stays | Still visible |
| CO-14 | Empty name saved | Clear name, save | Blank name sent (may cause issues) | Behavior check |
| CO-15 | State change to hidden | Change to hidden, save | Session hidden under active filter | Filter check |
| CO-16 | Model override set | Select Opus, save | model_override saved | GET config |
| CO-17 | Model override cleared | Select "Default", save | model_override = null | GET config |
| CO-18 | Config fetch fails gracefully | API error | Default values used | No crash |

---

## 20. Session Summary Overlay {#20-session-summary-overlay}

### Elements (dynamically created)
- Summary overlay with session name title
- `#summary-content` — loading text → summary content
- ✕ close button
- Click-outside to close

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| SU-01 | Summary overlay opens | Click ℹ on session | Overlay with "Generating summary..." | Visible |
| SU-02 | Summary content loads | API responds | Summary text displayed | Content |
| SU-03 | Recent messages shown | API returns recentMessages | Messages listed with Human/Claude labels | List items |
| SU-04 | Message content truncated at 150 | Long message | Text truncated with "..." | Substring |
| SU-05 | Summary error | API fails | "Failed to generate summary" or error message | Error text |
| SU-06 | Network error | Fetch throws | "Error: {message}" shown | Error text |
| SU-07 | Close via ✕ | Click ✕ | Overlay removed | Element gone |
| SU-08 | Close via click outside | Click backdrop | Overlay removed | Element gone |
| SU-09 | Click inside doesn't close | Click content area | Overlay stays | Still visible |
| SU-10 | Session name in title | Overlay opens | Correct session name displayed | Text |
| SU-11 | HTML in session name escaped | Name contains `<b>` | Rendered as text | No HTML |

---

## 21. Add Project Overlay {#21-add-project-overlay}

### Elements (dynamically created)
- jQuery File Tree browser (`#jqft-tree`)
- `#picker-path` — readonly path input
- `#picker-name` — editable name input
- Add button
- ✕ close button
- Click-outside to close

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| AP-01 | Add Project overlay opens | Click "+" | Overlay with directory tree | Visible |
| AP-02 | File tree loads root | Overlay opens | jQuery File Tree shows `/` contents | Tree rendered |
| AP-03 | Click directory shows path | Click folder in tree | `#picker-path` shows full path | Input value |
| AP-04 | Click directory fills name | Click folder | `#picker-name` auto-filled with folder name | Input value |
| AP-05 | Expand nested directory | Click arrow on folder | Subdirectories loaded | Tree expands |
| AP-06 | Add with valid path | Select folder, click Add | POST /api/projects, overlay closes, sidebar refreshes | API + sidebar |
| AP-07 | Add with no selection | Click Add without selecting | alert("Select a directory first") | Alert |
| AP-08 | Add with root path "/" | Only root selected | alert("Select a directory first") | Alert |
| AP-09 | Add with custom name | Change name input, click Add | Project added with custom name | API body |
| AP-10 | Add duplicate project | Select already-added path | 409 error, alert shown | Error alert |
| AP-11 | Add nonexistent path | Path removed between browse/add | 404 error, alert shown | Error alert |
| AP-12 | Close via ✕ | Click ✕ | Overlay removed | Element gone |
| AP-13 | Close via click outside | Click backdrop | Overlay removed | Element gone |
| AP-14 | Git clone URL | Enter git URL in path | Clone repo, project added | API call |
| AP-15 | Tree shows only directories | Browse filesystem | No files shown, only folders | `onlyFolders: true` |
| AP-16 | Hidden dirs filtered | Browse filesystem | Dirs starting with "." not shown | Server filter |

---

## 22. Session Lifecycle {#22-session-lifecycle}

### Create → Temp ID → Resolve → Use

| ID | Scenario | Action | Expected | Verify |
|----|----------|--------|----------|--------|
| SL-01 | Create returns temp ID | Click New Session | Response: `{id: "new_...", tmux: "bp_new_..."}` | Response body |
| SL-02 | Tab created with temp ID | Create session | Tab opens immediately (doesn't wait for JSONL) | Tab visible |
| SL-03 | JSONL polling starts | After create | setInterval every 3000ms, loadState() called | Network requests |
| SL-04 | JSONL polling stops after 30s | Wait 30s | clearInterval called | No more polls |
| SL-05 | Temp ID resolved to real UUID | JSONL appears on server | DB migrated, tmux renamed | Server logs |
| SL-06 | Sidebar updates with real ID | Resolution completes | Real session ID in sidebar | Sidebar render |
| SL-07 | Resume existing session | Click stopped session | POST /resume, tmux created with `--resume` | tmux check |
| SL-08 | Resume temp session | Click new_ session | POST /resume, fresh Claude (no --resume) | tmux check |
| SL-09 | Resume already-running | Click running session | No new tmux, just connect WS | tmux unchanged |
| SL-10 | Delete kills tmux | Delete session | tmux session killed | tmux check |
| SL-11 | Delete removes JSONL | Delete session | JSONL file deleted | File check |
| SL-12 | Delete removes DB entry | Delete session | Row deleted from DB | DB check |
| SL-13 | Delete closes open tab | Delete session with tab | Tab automatically closed | Tab gone |
| SL-14 | Missing project on create | Project dir deleted | 410 error returned | Error status |
| SL-15 | Missing project on resume | Project dir deleted | 410 error returned | Error status |
| SL-16 | tmux limit enforced | Already at MAX_TMUX_SESSIONS | Oldest killed before creating new | tmux count |

---

## 23. State Transitions {#23-state-transitions}

| ID | From | To | Trigger | Verify |
|----|------|-----|---------|--------|
| ST-01 | No tabs | 1 tab | Open session | Empty state removed, tab shown, status bar visible |
| ST-02 | 1 tab | No tabs | Close last tab | Empty state shown, status bar hidden |
| ST-03 | Tab A active | Tab B active | Click tab B | Pane A hidden, pane B shown, terminal B focused |
| ST-04 | Connected | Disconnected | WS closes | Red status dot, heartbeat cleared |
| ST-05 | Disconnected | Connecting | Reconnect timer fires | Amber pulsing dot |
| ST-06 | Connecting | Connected | WS opens | Green dot, heartbeat starts |
| ST-07 | Active filter | Archived filter | Click Archived | Different sessions shown, counts update |
| ST-08 | No panel | Panel open | Click ☰ | Panel slides out (200ms transition), terminal refits |
| ST-09 | Panel open | No panel | Click ☰ | Panel slides in, terminal refits |
| ST-10 | No modals | Settings open | Click ⚙ | Modal overlay appears |
| ST-11 | Settings open | Closed | Click ✕ or outside (no outside handler!) | Modal hides |
| ST-12 | No overlays | Config overlay | Click ✎ | Dynamic overlay created |
| ST-13 | Config overlay | Closed | Save or ✕ or click outside | Overlay removed from DOM |
| ST-14 | Normal sidebar | Search results | Type 2+ chars in search | Sidebar replaced with results |
| ST-15 | Search results | Normal sidebar | Clear search | Normal project/session list restored |
| ST-16 | Session active | Session archived | Archive via sidebar or config | Session moves between filters |
| ST-17 | Session archived | Session active | Unarchive | Session returns to active filter |
| ST-18 | Auth valid | Auth invalid | Credentials expire | Banner appears |
| ST-19 | Auth invalid | Auth valid | Re-authenticate | Banner removed |
| ST-20 | No auth modal | Auth modal | OAuth URL in terminal | Modal appears |
| ST-21 | Auth modal | Dismissed | Submit code, wait 3s | Modal disappears |
| ST-22 | Project collapsed | Expanded | Click header | Session list shown |
| ST-23 | Project expanded | Collapsed | Click header | Session list hidden |

---

## 24. Race Conditions & Timing {#24-race-conditions--timing}

| ID | Scenario | Detail | Expected | Risk |
|----|----------|--------|----------|------|
| RC-01 | Double-click New Session | Click + New Session twice rapidly | Should create 2 sessions, not crash | Duplicate tmux names |
| RC-02 | Click session during creation | Session still resolving temp ID | Should open or queue, not error | Tab creation race |
| RC-03 | Rapid tab switching | Click 5 different tabs in 1 second | Last clicked tab active, no orphaned terminals | Clean state |
| RC-04 | Close tab during WS connect | Close before WS.onopen fires | No crash, cleanup handles null WS | Error handling |
| RC-05 | Delete session with open config overlay | Delete while overlay open | Overlay should close or error gracefully | DOM cleanup |
| RC-06 | Archive session while opening in tab | Click archive + click session | Session state correct, tab may or may not open | Consistent state |
| RC-07 | loadState during renderSidebar | 30s poll fires during user interaction | Re-render doesn't lose expand state | expandedProjects Set |
| RC-08 | Token poll during tab switch | Poll returns for old tab after switch | _statusData on correct tab object | No stale data shown |
| RC-09 | Search debounce overlap | Type "ab", wait 200ms, type "c" | Only "abc" search fires, not "ab" then "abc" | Single API call |
| RC-10 | Notes auto-save during tab switch | Type note, immediately switch tab | Note saves for correct project | Correct API URL |
| RC-11 | Settings save during modal close | Change setting, close immediately | Setting still saved (fire-and-forget) | PUT completes |
| RC-12 | Submit auth code twice | Click Submit twice quickly | Only one code sent | Single WS message |
| RC-13 | Multiple WS reconnects | Server bounces rapidly | Exponential backoff works, no duplicate connections | Single WS per tab |
| RC-14 | Rename during temp ID resolution | Rename new_ session before UUID assigned | Name transferred to real session | DB check |
| RC-15 | CLAUDE.md save during panel switch | Type in CLAUDE.md, switch to notes | CLAUDE.md 1.5s debounce completes | PUT fires |
| RC-16 | Multiple addProject overlays | Click "+" twice | Should prevent duplicate or handle gracefully | No duplicates |
| RC-17 | Resize during WS message | Window resize + terminal output | No garbled render | Visual check |

---

## 25. Stress Tests {#25-stress-tests}

| ID | Scenario | Detail | Expected |
|----|----------|--------|----------|
| STR-01 | Many tabs open | Open 10 sessions simultaneously | All tabs functional, tab bar scrolls, memory stable |
| STR-02 | Many sessions in project | Project with 50+ sessions | Sidebar scrolls, no render lag |
| STR-03 | Rapid terminal input | Type 100 characters/second | All sent via WS, no dropped input |
| STR-04 | Large terminal output | `cat` a 100KB file | Terminal renders without freeze, scrollback works |
| STR-05 | Rapid theme switching | Switch themes 20 times in 10s | All terminals update, no CSS leak |
| STR-06 | Rapid panel toggle | Toggle panel 20 times in 10s | Terminal refits each time, no layout break |
| STR-07 | Rapid settings changes | Change font size from 10→24 1 at a time | All terminals update, no crash |
| STR-08 | Many tasks | Add 100 tasks to one project | Task list renders, scrollable |
| STR-09 | Large notes content | Paste 100KB into notes | Auto-save works, no truncation |
| STR-10 | Many search results | Search with common term | Results render, clickable |
| STR-11 | Many MCP servers | Add 20 MCP servers | List renders, remove works |
| STR-12 | Concurrent WebSocket messages | 10 tabs all receiving output | Each tab gets correct data |
| STR-13 | Long session name | 500-character session name | Truncated in sidebar and tab, no layout break |
| STR-14 | Multiple overlays | Open config, then try to open summary | Should handle gracefully |
| STR-15 | Memory leak check | Open/close 50 tabs over 10 minutes | Memory doesn't grow unboundedly |
| STR-16 | Rapid create/delete | Create and delete 10 sessions quickly | No orphaned tmux, no DB inconsistency |
| STR-17 | State poll under load | 10 tabs open, polling every 30s | /api/state responds timely |
| STR-18 | Multiple file tree opens | Click Add Project 5 times | Only 1 overlay, or all handle cleanly |
| STR-19 | Very long CLAUDE.md | 50KB CLAUDE.md file | Loads and saves without timeout |
| STR-20 | Rapid filter switching | Switch Active→All→Archived→Hidden rapidly | Sidebar renders correctly each time |

---

## 26. Recovery Scenarios {#26-recovery-scenarios}

| ID | Scenario | Detail | Expected |
|----|----------|--------|----------|
| REC-01 | Network disconnect | Disable network | All WS disconnect, red dots, reconnect on restore |
| REC-02 | Network restore | Re-enable network | WS reconnects with backoff, terminals resume |
| REC-03 | Server restart | Restart container | WS disconnect, reconnect finds tmux (cleaned on restart), new sessions needed |
| REC-04 | tmux session dies | Kill tmux from outside | "[Session detached]" in terminal, red dot |
| REC-05 | tmux killed + reconnect | Kill tmux, click session again | POST /resume recreates tmux with --resume |
| REC-06 | Close browser, reopen | Close browser tab entirely | Sessions preserved in DB, tmux may still run, can reopen |
| REC-07 | Refresh page | F5 | All tabs lost, sidebar repopulates, can reopen sessions |
| REC-08 | Server 500 on /api/state | Server error | Console error, sidebar may be stale, no crash |
| REC-09 | Server 500 on /api/sessions | Create fails | alert with error message |
| REC-10 | Server 500 on /api/sessions/:id/resume | Resume fails | alert with error message |
| REC-11 | Server 500 on /api/sessions/:id/config | Config fetch fails | Overlay uses default values |
| REC-12 | Server 500 on /api/sessions/:id/summary | Summary fails | Error shown in overlay |
| REC-13 | Server 500 on /api/settings | Settings load fails | Settings modal uses defaults |
| REC-14 | Expired auth during session | Token expires mid-work | Auth URL appears in terminal → modal opens |
| REC-15 | JSONL file deleted while session open | External deletion | Token poll may fail silently, status bar shows 0 |
| REC-16 | Database corruption | SQLite lock or corruption | Server errors, graceful degradation |
| REC-17 | Disk full | Can't write notes/CLAUDE.md | API 500, user sees nothing or alert |
| REC-18 | tmux cleanup fires | Disconnected 30 min | tmux killed, click session recreates | 
| REC-19 | tmux cleanup cancelled | Disconnect then reconnect within 30 min | Cleanup timer cancelled, session alive |
| REC-20 | Orphan tmux on restart | Server restarts | All bp_ tmux sessions killed on startup |

---

## 27. Edge Cases {#27-edge-cases}

| ID | Scenario | Detail | Expected |
|----|----------|--------|----------|
| EC-01 | Zero projects | Fresh install, no projects added | Empty sidebar, only "+" and refresh buttons |
| EC-02 | Project with no sessions dir | New project, never used | Empty session list, only New Session button |
| EC-03 | Session with no JSONL | New session, CLI hasn't responded yet | Name = "New Session", messageCount = 0 |
| EC-04 | Corrupted JSONL file | Invalid JSON in JSONL | parseSessionFile returns null, graceful degradation |
| EC-05 | Session ID with special chars | UUID with unexpected format | sanitizeTmuxName handles it |
| EC-06 | Project name with spaces | "My Project" | URL-encoded in API calls |
| EC-07 | Project name with special chars | Name with `/`, `&`, `#` | Properly escaped in HTML and URLs |
| EC-08 | Unicode session name | 日本語のセッション | Rendered correctly, truncated properly |
| EC-09 | Empty session name | Name set to "" | Falls back to "Untitled Session" |
| EC-10 | Session name = HTML | Name = `<img src=x onerror=alert(1)>` | escHtml prevents XSS |
| EC-11 | Timestamp in future | Session timestamp ahead of now | timeAgo returns "just now" (negative seconds handled) |
| EC-12 | Timestamp very old | Session from 365 days ago | timeAgo returns "365d ago" |
| EC-13 | Max tokens = 0 | Token API returns max_tokens=0 | Division by zero → pct capped, no NaN |
| EC-14 | Negative token count | Token API returns negative | Context bar shows 0%, no crash |
| EC-15 | Token count > max | 250000 / 200000 | Bar capped at 100%, not 125% |
| EC-16 | No tmux installed | Container missing tmux | Session create fails, error shown |
| EC-17 | Settings with unquoted JSON | default_model stored incorrectly | JSON.parse try/catch handles it |
| EC-18 | WebSocket URL with special chars | tmux name with spaces or special chars | sanitizeTmuxName applied |
| EC-19 | Browser with no WebSocket support | Very old browser | WS constructor fails — unhandled |
| EC-20 | Multiple browser tabs | Same Blueprint in 2 browser tabs | browserCount increments for each, keepalive correct |
| EC-21 | Empty search results click | Edge case in search | No crash |
| EC-22 | Project path with trailing slash | Path "/workspace/proj/" | Normalized by server |
| EC-23 | Session sort with equal values | All sessions same timestamp | Stable sort, no jump |
| EC-24 | Config overlay for deleted session | Session deleted while overlay open | Save may fail silently |
| EC-25 | Terminal with zero dimensions | FitAddon proposes 0x0 | Resize not sent (dims check) |
| EC-26 | JWT/OAuth token edge cases | Token exactly at expiry boundary | 5-minute buffer check |
| EC-27 | Settings modal click-outside | Click backdrop of settings modal | Nothing happens — no click-outside handler! (bug?) |
| EC-28 | Multiple auth modals prevented | Two tabs show OAuth URL | Only first triggers modal | authModalVisible flag |
| EC-29 | Auth modal with no triggering tab | Tab closed after auth modal opens | Falls back to window._loginWs | Fallback path |
| EC-30 | CLAUDE.md for non-workspace project | Project at arbitrary path | Server uses `join(WORKSPACE, name)` — may be wrong path |

---

## 28. Visual / Layout {#28-visual--layout}

| ID | Scenario | Detail | Expected |
|----|----------|--------|----------|
| VL-01 | Full viewport usage | Load page | No scrollbar on body, full height flexbox |
| VL-02 | Sidebar fixed width | Any state | 280px wide, doesn't flex |
| VL-03 | Right panel transition | Open/close panel | 200ms CSS transition on width |
| VL-04 | Right panel 320px | Panel open | width=320px, min-width=320px |
| VL-05 | Terminal fills available space | Resize window | Terminal pane fills between tab bar and status bar |
| VL-06 | Sidebar scroll | Many sessions | `overflow-y: auto` on #project-list, custom scrollbar |
| VL-07 | Tab bar horizontal scroll | Many tabs | `overflow-x: auto`, no vertical overflow |
| VL-08 | Tab max-width 200px | Long name | Tab capped at 200px, text ellipsis |
| VL-09 | Status bar at bottom | Any state | Fixed 28px bar at bottom of terminal area |
| VL-10 | Filter bar styling | Any state | Rounded pill buttons, active has accent border |
| VL-11 | Settings modal centered | Open settings | Centered in viewport, max-width 800px, max-height 80vh |
| VL-12 | Settings modal scrollable | Many settings | `overflow-y: auto` on content |
| VL-13 | Auth modal centered | Auth required | Centered, max-width 500px |
| VL-14 | Overlay backdrops | Any overlay | Semi-transparent black backdrop |
| VL-15 | Narrow viewport (< 800px) | Resize very narrow | Sidebar + main still usable, no overlap |
| VL-16 | Wide viewport (> 2000px) | Very wide screen | Terminal fills space, no excessive whitespace |
| VL-17 | Session action buttons alignment | Hover session | Actions aligned right, don't wrap |
| VL-18 | Task delete hover color | Hover delete button | Color changes to var(--danger) |
| VL-19 | Dark theme consistency | Dark theme | All elements use CSS variables, no hardcoded colors |
| VL-20 | Light theme consistency | Light theme | All text readable, sufficient contrast |
| VL-21 | Blueprint dark theme | Apply theme | Deep navy tones, high contrast |
| VL-22 | Blueprint light theme | Apply theme | Light blue-paper tones, dark text |
| VL-23 | Context bar animation | Token change | Fill width transitions in 300ms | `transition: width 0.3s` |
| VL-24 | Connecting dot animation | WS connecting | Pulsing animation at 1s interval | `@keyframes pulse` |
| VL-25 | Empty state centered | No tabs | Message centered vertically and horizontally |
| VL-26 | Sort dropdown styling | View filter bar | Small dropdown, auto margin-left | Compact, right-aligned |

---

## 29. Cross-Feature Interactions {#29-cross-feature-interactions}

| ID | Scenario | Detail | Expected |
|----|----------|--------|----------|
| CF-01 | Change theme while terminal open | Switch to light with active session | Terminal theme updates immediately |
| CF-02 | Change font size while terminal open | Change to 18 with active session | All terminals resize + refit |
| CF-03 | Delete project while tabs open | Delete project that has open tabs | Tabs should close or show error |
| CF-04 | Archive session while tab open | Archive via sidebar action | Tab remains open (archive != close) |
| CF-05 | Rename session while tab open | Rename via config overlay | Tab name updates, sidebar updates |
| CF-06 | Switch filter while search active | Search showing results, click filter | Search cleared? Or filter applied to results? |
| CF-07 | Open panel while no tabs | Click ☰ with no sessions open | Panel opens empty, no crash |
| CF-08 | Switch panel tab then switch terminal tab | View tasks, switch terminal | Tasks reload for new project |
| CF-09 | Settings modal open + auth modal trigger | Settings open, auth URL appears | Auth modal should overlay settings |
| CF-10 | Config overlay open + delete session | Open config, delete from another browser tab | Save may fail, overlay persists |
| CF-11 | Multiple overlays stacking | Summary overlay + auth modal | Z-index ordering (auth=1000, summary=1000) — may conflict |
| CF-12 | Keepalive mode change + terminal disconnect | Switch to browser mode, close all tabs | Keepalive stops (browserCount=0) |
| CF-13 | Model change in settings + new session | Change model, create session | New session uses updated model |
| CF-14 | Notes editing + session delete | Typing notes, session deleted | Note save may fail (project still exists) |
| CF-15 | Token poll + session archived | Polling tokens, archive session | Poll continues, no crash |
| CF-16 | CLAUDE.md save + project remove | Editing CLAUDE.md, project removed | PUT may fail, alert? |
| CF-17 | Auth check + network loss | 60s auth check fires during offline | Fetch fails silently (catch block) |
| CF-18 | Multiple projects expanded | Expand 3 projects | All stay expanded across re-renders |
| CF-19 | Sort change while filtered | Filter=archived, sort by name | Only archived sessions sorted by name |
| CF-20 | Search + panel data | Search results, panel open | Panel shows data for active tab, not search result |

---

## 30. Data Persistence {#30-data-persistence}

| ID | Scenario | Detail | Expected |
|----|----------|--------|----------|
| DP-01 | Page refresh preserves sessions | Refresh (F5) | Sessions in sidebar, can reopen | DB state |
| DP-02 | Page refresh loses tabs | Refresh | All terminal tabs gone, empty state | Client state |
| DP-03 | Page refresh preserves theme | Refresh | Theme re-applied from settings | loadAppearanceSettings |
| DP-04 | Page refresh preserves font size | Refresh | Font size re-applied | Settings cache |
| DP-05 | Page refresh preserves font family | Refresh | Font family re-applied | Settings cache |
| DP-06 | Page refresh resets filter | Refresh | Filter resets to "active" (hardcoded default) | Filter state |
| DP-07 | Page refresh resets sort | Refresh | Sort resets to "date" (hardcoded default) | Sort state |
| DP-08 | Page refresh resets expanded | Refresh | All projects collapsed (expandedProjects empty) | Collapsed |
| DP-09 | Page refresh resets panel | Refresh | Panel closed, notes tab active | Default state |
| DP-10 | Notes persist across refresh | Save notes, refresh | Notes still present from API | API response |
| DP-11 | Tasks persist across refresh | Add tasks, refresh | Tasks still present from API | API response |
| DP-12 | CLAUDE.md persists across refresh | Save, refresh | Content preserved on disk | File content |
| DP-13 | Settings persist across refresh | Change model, refresh | Model still set | API response |
| DP-14 | Session names persist | Rename, refresh | Name preserved in DB | Sidebar |
| DP-15 | Session state persists | Archive, refresh | Still archived | Filter check |
| DP-16 | MCP servers persist | Add server, refresh settings | Still listed | API response |
| DP-17 | Container restart preserves DB | Restart Docker | Sessions, settings, notes all intact | DB file persists |
| DP-18 | Container restart kills tmux | Restart Docker | All tmux sessions gone, orphan cleanup runs | tmux list |
| DP-19 | Webhooks persist | Add webhook, restart | Still configured | API response |
| DP-20 | Client settings cache | Open settings, close, create tab | New tab uses cached settings | _settingsCache |

---

## 31. Security & Input Sanitization {#31-security--input-sanitization}

| ID | Scenario | Detail | Expected |
|----|----------|--------|----------|
| SEC-01 | XSS in session name | Name = `<script>alert(1)</script>` | escHtml prevents execution |
| SEC-02 | XSS in project name | Name with HTML tags | escHtml prevents execution |
| SEC-03 | XSS in search results | Match text with HTML | escHtml prevents execution |
| SEC-04 | XSS in task text | Task = `<img onerror=...>` | escHtml prevents execution |
| SEC-05 | XSS in message content | Message with script tags | escHtml prevents execution |
| SEC-06 | XSS in summary content | AI-generated summary with HTML | escHtml prevents execution |
| SEC-07 | Path traversal in project add | Path = `/etc/passwd` | Server validates, but will add any path |
| SEC-08 | tmux session name injection | Session ID with shell chars | sanitizeTmuxName strips them |
| SEC-09 | CSRF on destructive endpoints | DELETE session from external page | No CSRF protection (risk) |
| SEC-10 | Config overlay innerHTML injection | Session ID with HTML in template literal | escHtml on data values |
| SEC-11 | Auth code injection | Code with special WS chars | Sent raw + \r, terminal handles it |
| SEC-12 | URL injection in auth link | Malicious URL in PTY output | Only claude.com/cai/oauth URLs matched | Regex filter |
| SEC-13 | Large payload DOS | POST 100MB to notes endpoint | Express body parser limits | Server config |
| SEC-14 | SQL injection via session name | Name with SQL chars | Parameterized queries in db.js | DB safety |

---

## 32. Accessibility {#32-accessibility}

| ID | Scenario | Detail | Expected |
|----|----------|--------|----------|
| A11Y-01 | Keyboard navigation | Tab through sidebar | Focusable elements reachable | Tab order |
| A11Y-02 | Screen reader labels | All buttons | Title attributes present | `title` attrs |
| A11Y-03 | Color contrast — dark theme | All text | Sufficient contrast ratios | WCAG check |
| A11Y-04 | Color contrast — light theme | All text | Sufficient contrast ratios | WCAG check |
| A11Y-05 | Focus indicators | Tab to elements | Visible focus ring | CSS :focus |
| A11Y-06 | Modal focus trap | Settings modal open | Tab stays within modal | Focus management |
| A11Y-07 | Escape to close modal | Press Escape in modal | Modal closes | No handler exists (gap) |

---

## 33. Polling & Timers {#33-polling--timers}

All background timers that must be verified:

| Timer | Interval | Code | What to verify |
|-------|----------|------|---------------|
| State refresh | 30s | `setInterval(loadState, REFRESH_MS)` | GET /api/state fires every 30s |
| Auth check | 60s | `setInterval(checkAuth, 60000)` | GET /api/auth/status every 60s |
| Token poll | 15s | `setInterval(pollTokenUsage, 15000)` | GET /api/sessions/:id/tokens every 15s |
| WS heartbeat | 30s | Per tab: `setInterval(ping, HEARTBEAT_MS)` | Ping sent every 30s per connected tab |
| Notes auto-save | 1s debounce | `notesSaveTimer` | PUT fires 1s after last keystroke |
| CLAUDE.md auto-save | 1.5s debounce | `claudeMdSaveTimer` | PUT fires 1.5s after last keystroke |
| Search debounce | 300ms | `searchTimer` | GET /api/search fires 300ms after typing stops |
| Reconnect backoff | 1s→30s | Per tab: `reconnectTimer` | Exponential: 1, 2, 4, 8, 16, 30s |
| Auth dismiss | 3s | `setTimeout` in submitAuthCode | Modal closes 3s after submit |
| JSONL poll | 3s (up to 30s) | `setInterval/setTimeout` in createSession | loadState() every 3s for 30s |
| Panel refit | 250ms | `setTimeout` in togglePanel | fitAddon.fit() after 250ms |
| Tab switch fit | 10ms | `setTimeout` in switchTab | fitAddon.fit() after 10ms |
| Initial auth check | 1s | `setTimeout(checkAuth, 1000)` | First auth check 1s after load |
| Token poll first | 3s | `setTimeout(pollTokenUsage, 3000)` in createTab | First poll 3s after tab create |

---

## 34. Error Paths (UI-Triggered) {#34-error-paths}

Every error the user can trigger through the browser:

| ID | Trigger | UI Response | Code Location |
|----|---------|-------------|---------------|
| ERR-01 | loadState() fails | Console error, sidebar may be stale | `loadState()` catch block |
| ERR-02 | Create session fails | `alert('Error: ' + data.error)` | `createSession()` |
| ERR-03 | Create session — project missing | alert with 410 error | Server returns 410 |
| ERR-04 | Resume session fails | `alert('Error: ' + data.error)` | `openSession()` .then |
| ERR-05 | Resume session — project missing | alert with 410 error | Server returns 410 |
| ERR-06 | Open session network error | `console.error('Failed to open session')` | `openSession()` .catch |
| ERR-07 | Delete session fails | `console.error('Failed to delete')` | `deleteSession()` catch |
| ERR-08 | Archive session fails | `console.error('Failed to archive')` | `archiveSession()` catch |
| ERR-09 | Save session config fails | Silently fails (no error handling on fetch) | `saveSessionConfig()` |
| ERR-10 | Add project fails | `alert('Error: ' + data.error)` or `alert('Error: ' + err.message)` | `pickerSelect()` |
| ERR-11 | Add project — already exists | alert with 409 error message | Server returns 409 |
| ERR-12 | Add project — path not found | alert with 404 error message | Server returns 404 |
| ERR-13 | Summary generation fails | "Failed to generate summary" in overlay | `summarizeSession()` |
| ERR-14 | Summary network error | "Error: {message}" in overlay | `summarizeSession()` catch |
| ERR-15 | Auth check fails | `console.error('Auth check failed')` | `checkAuth()` catch |
| ERR-16 | Settings load fails | Silent (empty catch) | `openSettings()` catch |
| ERR-17 | Notes load fails | Silent (empty catch) | `loadPanelData()` notes catch |
| ERR-18 | Tasks load fails | Silent (empty catch) | `loadTasks()` catch |
| ERR-19 | CLAUDE.md load fails | Silent (empty catch) | `loadPanelData()` claudemd catch |
| ERR-20 | Messages load fails | Silent (empty catch) | `loadMessages()` catch |
| ERR-21 | MCP servers load fails | Silent (empty catch) | `loadMcpServers()` catch |
| ERR-22 | Global CLAUDE.md load fails | Silent (empty catch) | `openSettings()` global catch |
| ERR-23 | Search fails | Silent (empty catch) | Search debounce handler |
| ERR-24 | Token poll fails | Silent (empty catch), shows defaults | `pollTokenUsage()` catch |
| ERR-25 | WS error event | Status → disconnected, reconnect scheduled | ws.onerror handler |
| ERR-26 | Config overlay fetch fails | Uses defaults | `renameSession()` config fetch catch |
| ERR-27 | Appearance settings load fails | No theme/font applied | `loadAppearanceSettings()` catch |
| ERR-28 | saveSetting fails | Silently fails | `saveSetting()` — no error handling |
| ERR-29 | Notes auto-save fails | Silently fails | Notes input handler — no error handling |
| ERR-30 | CLAUDE.md auto-save fails | Silently fails | CLAUDE.md input handler — no error handling |

---

## Summary Statistics

| Category | Scenario Count |
|----------|---------------|
| Sidebar: Projects | 12 |
| Sidebar: Sessions | 22 |
| Filters & Sort | 13 |
| Search | 14 |
| Tab Bar | 19 |
| Terminal / xterm.js | 21 |
| WebSocket Lifecycle | 24 |
| Status Bar | 23 |
| Right Panel: Notes | 10 |
| Right Panel: Tasks | 14 |
| Right Panel: CLAUDE.md | 7 |
| Right Panel: Messages | 8 |
| Right Panel: General | 9 |
| Settings: General | 31 |
| Settings: Prompts | 7 |
| Settings: MCP | 12 |
| Auth Banner & Modal | 20 |
| Config Overlay | 18 |
| Summary Overlay | 11 |
| Add Project Overlay | 16 |
| Session Lifecycle | 16 |
| State Transitions | 23 |
| Race Conditions | 17 |
| Stress Tests | 20 |
| Recovery Scenarios | 20 |
| Edge Cases | 30 |
| Visual / Layout | 26 |
| Cross-Feature Interactions | 20 |
| Data Persistence | 20 |
| Security | 14 |
| Accessibility | 7 |
| Polling & Timers | 14 (verification items) |
| Error Paths | 30 |
| **TOTAL** | **~568 test scenarios** |

Phase H covered **18** of these. This audit identifies **550+ additional scenarios** that were not covered.

---

## Known Issues to Verify (from broken state)

These were reported as broken and must be specifically verified:

1. **Sessions don't work** — SL-01 through SL-16, WS-01 through WS-24
2. **Status bar broken** — SB-01 through SB-23
3. **Scrolling broken** — XT-12, XT-13, VL-06, VL-07
4. **tmux failing** — SL-07, SL-08, SL-10, SL-16, REC-04, REC-05, REC-18
