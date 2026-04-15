# Easy Fixes Test Runbook

**Target:** http://192.168.1.120:7868
**Container:** blueprint-easy-fixes on M5
**Branch:** feature/easy-fixes
**Tool:** Malory (headless Playwright MCP)

## Tests

### SMOKE-01: Page Load
- Navigate, verify title "Blueprint", sidebar present, empty state visible
- API /api/state returns workspace: /mnt/workspace

### SMOKE-02: Create Project via API
- POST /api/mkdir to create directory
- POST /api/projects to register it
- Reload, verify project appears in sidebar

### TEST-07: Sidebar collapsed state persists
- Collapse a project group
- Reload page
- Verify group is still collapsed (localStorage)

### TEST-09: File browser shows /mnt mounts
- Open file browser panel
- Verify mounts from /api/mounts appear

### TEST-11a: File browser new folder
- Click "+ Folder" in file browser
- Verify folder created and tree refreshes

### TEST-11b: File browser upload
- Upload a file via the Upload button
- Verify file appears in tree

### TEST-30: Add Project new folder
- Open Add Project dialog
- Click "+ Folder" to create a folder
- Verify it appears and is selectable

### TEST-32: Smart compaction stripped
- Verify no blueprint_smart_compaction in MCP tools
- Verify /session skill exists
- Verify session-nudge.md prompt template responds

### TEST-36: Settings - Additional CLIs
- Open settings
- Verify "Additional CLIs" section with Gemini/Codex key fields
- Verify old quorum fields (lead/fixed/additional) are gone

### TEST-37: Session restart button
- Create a session
- Verify restart button (↻) appears in session actions
- Click restart, verify session restarts

### TEST-38: Project config
- Click pencil on project header
- Verify config modal opens with name, state, notes fields
- Change state to archived, save
- Verify project disappears from active filter

## Bugs Found
(filled in during execution)
