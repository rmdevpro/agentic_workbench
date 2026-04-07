# Blueprint UI Audit: Comprehensive Playwright Test Requirements

**Auditor:** Gemini CLI
**Date:** 2026-03-31
**Scope:** `public/index.html`, `server.js`, `docs/master-capability-list.md`
**Objective:** 100% UI interaction coverage, including failure modes and stress testing.

---

## 1. Interaction Matrix (Every Clickable Element)

### Sidebar Header & Navigation
- [ ] **Add Project (+):** Click should open directory picker overlay.
- [ ] **Refresh (↻):** Click should trigger `/api/state` and update the project list without a full page reload.
- [ ] **Filter Tabs:** Verify clicking 'Active', 'All', 'Archived', 'Hidden' correctly filters the session list based on the `state` field in DB.
- [ ] **Sort Dropdown:** Verify sorting by Date (default), Name, and Message Count.
- [ ] **Project Headers:** Click to toggle collapse/expand state. Verify state persists during the session (uses `expandedProjects` Set).
- [ ] **Project "Missing" State:** If a project directory is deleted on disk, verify the header shows `(missing)` and has reduced opacity.

### Session Items
- [ ] **Open Session:** Click session item to open/switch tab. 
- [ ] **Missing Project Alert:** Click a session where the project is missing; verify `alert()` shows and session does not open.
- [ ] **Summary (ⓘ):** Click to open summary overlay. Verify "Generating summary..." state.
- [ ] **Rename (✎):** Click to open Config Overlay.
- [ ] **Archive/Unarchive (☐/↺):** Click to toggle session state immediately.
- [ ] **Delete (✕):** Click to trigger `confirm()`. Verify deletion from sidebar and closing of tab if open.

### Tab Bar & Terminals
- [ ] **Tab Switch:** Click tab to switch active terminal. Verify `fit()` is called and terminal receives focus.
- [ ] **Tab Close (✕):** Click to remove tab and dispose of Xterm instance. Verify fallback to last active tab or empty state.
- [ ] **Panel Toggle (☰):** Click to open/close Right Panel. Verify active terminal `fit()` is called after transition.

### Right Panel
- [ ] **Panel Tabs:** Switch between Notes, Tasks, CLAUDE.md, and Messages.
- [ ] **Task Actions:**
    - Check/Uncheck: Verify status change in DB and visual strikethrough.
    - Delete (✕): Verify task removal from list and DB.
- [ ] **Save Buttons:** Explicitly test the "Save" buttons for Global CLAUDE.md and Project Template (though others are auto-save).

### Settings Modal
- [ ] **Tabs:** Toggle between General and System Prompts.
- [ ] **Close Button:** Verify modal dismissal.
- [ ] **MCP Remove:** Click `✕` on an MCP server; verify removal from list and `settings.json`.

---

## 2. Input Validation & Edge Cases

### Text Fields
- [ ] **Session Search:**
    - Type < 2 chars: Verify no API call.
    - Type 2+ chars: Verify debounced search results appear.
    - Search with no results: Verify "No matches found" message.
    - Click search result: Verify session opens and search clears.
- [ ] **Notes / CLAUDE.md Editors:**
    - Type large amounts of text: Verify debounce doesn't lag UI.
    - Empty content: Verify persistence of empty state.
- [ ] **Add Task Input:**
    - Enter key: Verify task addition.
    - Empty input + Enter: Verify no task added.
- [ ] **MCP Form:**
    - Add without name: Verify no action.
    - Add without command: Verify no action.
- [ ] **Auth Code Input:**
    - Paste code + Enter: Verify submission to WebSocket.

### Config Overlay
- [ ] **Model Select:** Change model override; verify persistence.
- [ ] **State Select:** Change state to 'Hidden'; verify session disappears from sidebar immediately.
- [ ] **Session Notes:** Multi-line text persistence.

### Project Picker
- [ ] **Directory Navigation:** Click folders to drill down.
- [ ] **Breadcrumbs/Path Selection:** Verify clicking a folder updates the "Path" input.
- [ ] **Auto-Naming:** Verify "Name" input auto-fills with the folder name.

---

## 3. State Transitions & Persistence

- [ ] **Empty State:** Verify "Select a session" shows when no tabs are open.
- [ ] **Tab Restoration:** **CRITICAL:** Currently, `index.html` does NOT restore tabs on page refresh. 
    - Test Case: Open 3 tabs, refresh page. *Expected:* Sidebar state persists (Active/All filter), but Tab Bar is empty.
- [ ] **Settings Persistence:** Change theme to 'Light' and Font Size to 18. Refresh page. *Expected:* UI remains Light and Font Size remains 18.
- [ ] **Status Bar Sync:** Switch between an Opus session and a Sonnet session. Verify the model name and context bar update correctly for each.
- [ ] **Panel Sync:** Open Project A Notes. Switch to a tab for Project B. Verify Right Panel updates to Project B's notes automatically.

---

## 4. Race Conditions & Stress Tests

- [ ] **Rapid Tab Switching:** Click between 5 tabs as fast as possible. Verify terminal doesn't glitch or show wrong PTY output.
- [ ] **Double "New Session":** Click "+" then immediately click "+" again. Verify two sessions are created without ID collision.
- [ ] **Search-Typing-Race:** Type "test", delete one char, type another, all within 300ms. Verify only the final query result is rendered.
- [ ] **Loading-Interrupt:** Click a session to open it; before it connects, click a different session. Verify the second session takes precedence.
- [ ] **Massive Session Count:** Load 100+ sessions into one project. Verify sidebar scrolling performance.
- [ ] **Output Flood:** Run `yes` in a terminal. Verify UI remains responsive and "Status Bar" context polling still functions.

---

## 5. Recovery & Failure Scenarios

- [ ] **Network Disconnect:** 
    - Toggle "Offline" in browser. 
    - *Expected:* Tab status dots turn Red. Terminal shows `[Session detached]`. 
    - Toggle "Online". 
    - *Expected:* Auto-reconnect (exponential backoff) triggers. Status dots turn Green.
- [ ] **Server Restart:**
    - Kill the Node.js process while browser is open.
    - *Expected:* All tabs show disconnected. 
    - Restart server.
    - *Expected:* Tabs auto-reconnect without user intervention.
- [ ] **Expired Token:**
    - Simulate `api/auth/status` returning `{valid: false}`.
    - *Expected:* Yellow "Not authenticated" banner appears at top of main area.
- [ ] **OAuth Detection:**
    - Mock a PTY message containing a `claude.com/cai/oauth` URL.
    - *Expected:* Auth Modal pops up immediately.
- [ ] **Invalid Settings:** 
    - Manually set `quorum_additional_juniors` to invalid JSON. 
    - *Expected:* Settings modal handles error gracefully (doesn't crash UI).

---

## 6. Visual & Layout Audit

- [ ] **Resize Fitting:** 
    - Resize window from 1920px to 800px. Verify `FitAddon` recalculates cols/rows and sends `resize` event to WS.
- [ ] **Sidebar Overflow:** Very long project names (e.g., 100 chars) should use ellipsis and not break the sidebar width.
- [ ] **Tab Overflow:** Open 20 tabs. Verify the tab bar becomes horizontally scrollable and doesn't wrap to multiple lines.
- [ ] **Theme Consistency:** 
    - Blueprint Dark: Verify high-contrast lines.
    - Blueprint Light: Verify readability of dark blue text on light blue background.
- [ ] **Status Bar Color Logic:** 
    - 50% context: Green bar.
    - 70% context: Amber bar.
    - 90% context: Red bar.

---

## 7. Gaps in Phase H (Test Plan 1.0)

Phase H was inadequate. This audit adds the following missing coverage:
1. **Dynamic Auth Modal:** Phase H only tested the banner; it missed the PTY-sniffing modal trigger.
2. **Project Picker:** Completely untested. No coverage for adding projects via the UI.
3. **Session Config Overlay:** Phase H tested "config editor" but not the specific fields (state, model override).
4. **Resiliency:** No tests for WS reconnect logic or exponential backoff.
5. **Panel State Sync:** Phase H missed testing whether the Right Panel follows the active tab's project context.
6. **Smart Compaction:** UI trigger for smart compaction (`/compact` or tool call) is untested.
7. **Search Snippets:** Verify the search result list shows text match snippets from the JSONL.

---

**Approval:** This document defines the requirements for `tests/live/phase-h-ui.test.js`. Full compliance is required for 100% coverage certification.
