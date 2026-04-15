# Merge Plan: feature/easy-fixes into refactor-server-js

## Overview

Two branches need to be combined:

- **`refactor-server-js`** — Split the monolithic `server.js` into 27 modules with 490 tests. No new features, just restructuring + test coverage.
- **`feature/easy-fixes`** — New features and bug fixes built against the monolithic `server.js` on main.

The refactor is the target structure. Our features need to be placed into their modules.

## Module Mapping

### 1. DELETE: `compaction.js` (942 lines)
We stripped smart compaction entirely. Delete this module and remove its import from `server.js`.

### 2. MODIFY: `watchers.js`
- Remove `startCompactionMonitor()` — the fallback compaction poller
- Replace `checkCompactionNeeds()` call in `startJsonlWatcher()` with our `checkContextUsage()` nudge function
- Add `checkContextUsage()` function (simple 75% threshold, fires once, sends `session-nudge` prompt)

### 3. MODIFY: `routes.js`
Add our new endpoints into the existing route registration:
- `POST /api/mkdir` — create directory
- `POST /api/upload` — upload file (raw body)
- `POST /api/sessions/:sessionId/session` — session info/transition/resume
- `POST /api/sessions/:sessionId/restart` — kill and recreate tmux
- `GET /api/projects/:name/config` — project config
- `PUT /api/projects/:name/config` — save project config (name, state, notes)
- Replace `/api/mounts` grep-based detection with `/mnt` directory listing

Dependencies needed from injection: `db`, `safe`, `config`, `tmuxName`, `tmuxExists`, `CLAUDE_HOME`

Also add `formatSessionTail()` helper function.

### 4. MODIFY: `mcp-tools.js`
- Remove `blueprint_smart_compaction` tool definition and handler
- Add `blueprint_session` tool definition and handler (POST to `/api/sessions/:id/session`)
- Add `blueprint_ask_cli` tool definition and handler (POST to `/api/cli/ask`)
- Remove `mode` param from `blueprint_ask_quorum`

### 5. REPLACE: `quorum.js`
Replace entirely with our lean version:
- `askCli()` — shell out to claude/gemini/codex
- `buildCliArgs()` — construct CLI args per provider
- `getConfiguredCLIs()` — read keys from DB, return available CLIs
- `askQuorum()` — parallel junior calls + lead synthesis
- `registerQuorumRoutes()` — `/api/quorum/ask` + `/api/cli/ask`

### 6. ADD: `voice.js` (new file)
Drops in cleanly. No dependencies on the refactored modules — just `ws` and `db`.

### 7. MODIFY: `server.js`
- Remove `createCompaction` import and instantiation
- Add `voice.js` import
- Add `voiceWss` WebSocket server
- Modify upgrade handler: route `/ws/voice` to voice, everything else to terminal
- Remove `compaction` from dependency injection to routes/watchers

### 8. MODIFY: `ws-terminal.js`
No changes needed — voice WebSocket is handled in server.js upgrade, not here.

### 9. MODIFY: `tmux-lifecycle.js`
- Remove `compactionState.delete()` from session kill callback (already gone in our version)

### 10. MODIFY: `db.js`
- Add migration: `ALTER TABLE projects ADD COLUMN state TEXT DEFAULT 'active'`
- Add `state TEXT DEFAULT 'active'` to CREATE TABLE projects
- Add prepared statements: `setProjectState`, `renameProject`
- Add exported methods: `setProjectState()`, `renameProject()`

### 11. MODIFY: `safe-exec.js`
- Change `WORKSPACE` from `process.env.WORKSPACE || '/workspace'` to `'/mnt/workspace'`

### 12. MODIFY: `config/defaults.json`
- Remove entire `compaction` block
- Add `nudgeThresholdPercent: 75` and `resumeTailLines: 60` to `session` block
- Remove `compactionMonitorIntervalMs` from `polling` block

### 13. REPLACE: `config/prompts/`
- Delete: `compaction-prep.md`, `compaction-auto.md`, `compaction-nudge-*.md`, `compaction-resume.md`, `compaction-prep-to-agent.md`, `compaction-git-commit.md`
- Add: `session-nudge.md`, `session-resume.md`, `session-transition.md`
- Keep: `summarize-session.md`, `keepalive-fact.md`, `keepalive-question.md`

### 14. REPLACE: `config/skills/`
- Delete: `smart-compact/`
- Add: `session/SKILL.md`, `guides/SKILL.md`

### 15. ADD: `config/guides/`
- `using-gemini-cli.md`
- `using-codex-cli.md`
- `blueprint-deployment.md`

### 16. MODIFY: `public/index.html`
All our UI changes:
- Sidebar: `expandedProjects` from localStorage, project state filtering, `p.state` in stateHash
- Project header: config pencil button, `openProjectConfig()`, `saveProjectConfig()`
- Session item: restart button (↻) with confirm dialog
- File browser: `+ Folder` and `Upload` buttons, `fileBrowserNewFolder()`, `fileBrowserUpload()`, `getSelectedFileBrowserDir()`
- Add Project dialog: `+ Folder` button, `pickerNewFolder()`
- Settings: "API Keys" section (gemini, codex, deepgram), load on open
- Status bar: mic button, voice input JS (`toggleVoice`, `startVoice`, `stopVoice`)
- Old quorum fields removed

### 17. MODIFY: `Dockerfile`
- `/workspace` → `/mnt/workspace`, `/mnt/storage`
- `npx playwright install chromium` → `npx playwright install chrome`

### 18. MODIFY: `entrypoint.sh`
- `chown /workspace` → `chown /mnt/workspace` + `/mnt/storage`
- Add API key export from DB (gemini, codex)

### 19. MODIFY: `docker-compose.yml`
- Volumes: `/mnt/workspace`, `/mnt/storage`
- Remove `WORKSPACE` env var
- Update `CLAUDE_HOME`, `CLAUDE_CONFIG_DIR`, `BLUEPRINT_DATA` paths

## What NOT to Touch

- All 490 tests in `tests/` — keep as-is, they test the refactored module structure
- `logger.js`, `shared-state.js`, `session-resolver.js` — no changes needed
- `eslint.config.js`, `.prettierrc` — keep
- Their `docker-compose.test.yml` and `docker-compose.uitest.yml` — keep

## Test Strategy

After merge:
1. Run their mock test suite: `npm test` — should pass (minus compaction tests which are deleted)
2. Deploy to a test container on M5
3. Run our full Playwright sweep against it
4. Verify all 38 feature tests pass

## Execution Order

1. Create new branch from `refactor-server-js`: `merge/easy-fixes-into-refactor`
2. Delete `compaction.js`
3. Apply changes to modules in order: db → safe-exec → config → routes → mcp-tools → quorum → watchers → server → voice
4. Apply UI changes: index.html
5. Apply infra: Dockerfile, entrypoint, compose
6. Apply content: prompts, skills, guides
7. Run tests
8. Deploy and verify
