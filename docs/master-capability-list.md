# Blueprint — Master Capability List

**Generated:** 2026-03-28
**Updated:** 2026-03-31
**Sources:** Independent audits by Claude (Sonnet 4.6), Gemini (2.5 Pro), Codex (GPT-5.3)
**Method:** Three CLIs independently audited the full codebase. This list aggregates and deduplicates all findings.

---

## Coverage Key

| Status | Meaning |
|--------|---------|
| MOCK | Covered by mock/unit test only |
| REAL | Covered by live/integration test only |
| BOTH | Covered by both mock and live tests |
| NONE | Not yet covered |

---

## API Endpoints (51)

### Projects

| # | Capability | Coverage |
|---|-----------|----------|
| 1 | `GET /` — Serve static UI from `public/` | REAL |
| 2 | `GET /lib/xterm/*` — Serve xterm.js assets from node_modules | REAL |
| 3 | `GET /lib/xterm-fit/*` — Serve xterm fit addon assets | REAL |
| 4 | `GET /lib/xterm-web-links/*` — Serve xterm web-links addon assets | REAL |
| 5 | `POST /api/projects` — Add project by git clone URL or local path symlink; auto-trusts directory | REAL |
| 6 | `GET /api/state` — Return all projects with sessions (syncs JSONL to DB, enriches with tmux status) | REAL |
| 7 | `GET /api/projects/:name/notes` — Read shared project notes from DB | REAL |
| 8 | `PUT /api/projects/:name/notes` — Write shared project notes to DB | REAL |
| 9 | `GET /api/projects/:name/tasks` — List all tasks for a project | REAL |
| 10 | `POST /api/projects/:name/tasks` — Create task (fires `task_added` webhook) | REAL |
| 11 | `GET /api/projects/:name/messages` — Retrieve last 50 inter-session messages | REAL |
| 12 | `POST /api/projects/:name/messages` — Send message; writes bridge file and injects via `claude --resume --print` if target running (fires `message_sent` webhook) | REAL |
| 13 | `GET /api/projects/:name/claude-md` — Read project CLAUDE.md; applies default template if absent | REAL |
| 14 | `PUT /api/projects/:name/claude-md` — Write project CLAUDE.md to disk | REAL |

### Sessions

| # | Capability | Coverage |
|---|-----------|----------|
| 15 | `POST /api/sessions` — Create new Claude CLI session in tmux (fires `session_created` webhook) | REAL |
| 16 | `POST /api/sessions/:id/resume` — Resume session; spawns tmux with `claude --resume` if not running | REAL |
| 17 | `PUT /api/sessions/:id/name` — Rename session in DB | REAL |
| 18 | `DELETE /api/sessions/:id` — Kill tmux, delete JSONL, remove from DB | REAL |
| 19 | `GET /api/sessions/:id/config` — Get full session config (name, state, model_override, notes) | REAL |
| 20 | `PUT /api/sessions/:id/config` — Update session config fields | REAL |
| 21 | `PUT /api/sessions/:id/archive` — Legacy archive toggle (maps to state) | REAL |
| 22 | `GET /api/sessions/:id/notes` — Read session private notes | REAL |
| 23 | `PUT /api/sessions/:id/notes` — Write session private notes | REAL |
| 24 | `POST /api/sessions/:id/summary` — Generate AI summary via `claude --print --no-session-persistence` | REAL |
| 25 | `GET /api/sessions/:id/tokens` — Parse JSONL for token usage (last real assistant message) | BOTH |
| 26 | `POST /api/sessions/:id/smart-compact` — Smart compaction: prep plan, send /compact, feed recovery docs | REAL |

### Tasks

| # | Capability | Coverage |
|---|-----------|----------|
| 27 | `PUT /api/tasks/:id/complete` — Mark task done | REAL |
| 28 | `PUT /api/tasks/:id/reopen` — Reopen task | REAL |
| 29 | `DELETE /api/tasks/:id` — Delete task | REAL |

### Auth

| # | Capability | Coverage |
|---|-----------|----------|
| 30 | `GET /api/auth/status` — Check OAuth credentials validity and expiry | BOTH |
| 31 | `POST /api/auth/login` — Probe auth via `claude --print "test"` | REAL |

### Keepalive

| # | Capability | Coverage |
|---|-----------|----------|
| 32 | `GET /api/keepalive/status` — Return running state, mode, token expiry, browser count | BOTH |
| 33 | `PUT /api/keepalive/mode` — Change mode (always/browser/idle); applies immediately | BOTH |

### Settings

| # | Capability | Coverage |
|---|-----------|----------|
| 34 | `GET /api/settings` — Return all settings with defaults | REAL |
| 35 | `PUT /api/settings` — Write setting; applies keepalive changes immediately | REAL |

### Search

| # | Capability | Coverage |
|---|-----------|----------|
| 36 | `GET /api/search?q=` — Full-text search across all session JSONLs (min 2 chars) | REAL |

### CLAUDE.md

| # | Capability | Coverage |
|---|-----------|----------|
| 37 | `GET /api/claude-md/global` — Read ~/.claude/CLAUDE.md | REAL |
| 38 | `PUT /api/claude-md/global` — Write ~/.claude/CLAUDE.md | REAL |

### MCP Servers Config

| # | Capability | Coverage |
|---|-----------|----------|
| 39 | `GET /api/mcp-servers` — Read mcpServers from settings.json | REAL |
| 40 | `PUT /api/mcp-servers` — Write mcpServers to settings.json | REAL |

### Webhooks

| # | Capability | Coverage |
|---|-----------|----------|
| 41 | `GET /api/webhooks` — List configured webhooks | BOTH |
| 42 | `PUT /api/webhooks` — Replace entire webhook array | BOTH |
| 43 | `POST /api/webhooks` — Add a webhook | BOTH |
| 44 | `DELETE /api/webhooks/:index` — Remove webhook by index | BOTH |

### Internal MCP HTTP

| # | Capability | Coverage |
|---|-----------|----------|
| 45 | `GET /api/mcp/tools` — List internal MCP tool schemas | REAL |
| 46 | `POST /api/mcp/call` — Execute internal MCP tool | REAL |

### External MCP HTTP

| # | Capability | Coverage |
|---|-----------|----------|
| 47 | `GET /api/mcp/external/tools` — List internal + admin tools | REAL |
| 48 | `POST /api/mcp/external/call` — Execute internal or admin tool | REAL |

### Quorum

| # | Capability | Coverage |
|---|-----------|----------|
| 49 | `POST /api/quorum/ask` — Run full quorum round (juniors + lead synthesis) | REAL |

### OpenAI-Compatible

| # | Capability | Coverage |
|---|-----------|----------|
| 50 | `GET /v1/models` — List available Claude models in OpenAI format | BOTH |
| 51 | `POST /v1/chat/completions` — Route to Claude CLI; supports `bp:<session_id>`, streaming, `X-Blueprint-Session` header | BOTH |

---

## WebSocket (9)

| # | Capability | Coverage |
|---|-----------|----------|
| 52 | `WS /ws/:tmuxSession` — Attach PTY to tmux session; bidirectional terminal I/O | REAL |
| 53 | Receive terminal output (string/binary) — Stream PTY bytes to client xterm.js | REAL |
| 54 | Send raw keystrokes — Client keyboard input to PTY | NONE |
| 55 | Send `{"type":"resize", cols, rows}` — Resize PTY | REAL |
| 56 | Send `{"type":"ping"}` / receive `{"type":"pong"}` — 30s heartbeat | REAL |
| 57 | Receive `{"type":"error", message}` — Error if tmux session doesn't exist | REAL |
| 58 | Receive `[Session detached]` — PTY process exited | NONE |
| 59 | Auto-reconnect with exponential backoff — Up to 30s max delay | NONE |
| 60 | Connect/disconnect tracks browserCount — Triggers keepalive onBrowserConnect/Disconnect | NONE |

---

## MCP Tools — Internal (14)

| # | Capability | Coverage |
|---|-----------|----------|
| 61 | `blueprint_search_sessions` — Search session JSONLs for keywords | REAL |
| 62 | `blueprint_summarize_session` — AI summary via Claude CLI | REAL |
| 63 | `blueprint_list_sessions` — List sessions with metadata | REAL |
| 64 | `blueprint_get_project_notes` — Read project notes from DB | REAL |
| 65 | `blueprint_get_session_notes` — Read session notes from DB | REAL |
| 66 | `blueprint_get_tasks` — List project tasks | REAL |
| 67 | `blueprint_add_task` — Add task (created_by: agent) | REAL |
| 68 | `blueprint_complete_task` — Mark task done | REAL |
| 69 | `blueprint_get_project_claude_md` — Read project CLAUDE.md | REAL |
| 70 | `blueprint_read_plan` — Read session plan file | REAL |
| 71 | `blueprint_update_plan` — Write session plan file | REAL |
| 72 | `blueprint_smart_compaction` — Trigger smart compaction | NONE |
| 73 | `blueprint_ask_quorum` — Run quorum (delegates to HTTP API) | NONE |
| 74 | `blueprint_send_message` — Send via bridge file; auto-cleanup (5s delivered, 1h undelivered) | NONE |

## MCP Tools — External Admin (8)

| # | Capability | Coverage |
|---|-----------|----------|
| 75 | `blueprint_create_session` — Create session programmatically | REAL |
| 76 | `blueprint_delete_session` — Delete session (tmux + JSONL + DB) | REAL |
| 77 | `blueprint_set_session_state` — Change state (active/archived/hidden) | REAL |
| 78 | `blueprint_get_token_usage` — Get context token usage | BOTH |
| 79 | `blueprint_set_project_notes` — Write project notes | REAL |
| 80 | `blueprint_set_project_claude_md` — Write project CLAUDE.md | REAL |
| 81 | `blueprint_list_projects` — List all projects | REAL |
| 82 | `blueprint_update_settings` — Write a setting | REAL |

## MCP stdio Protocol

| # | Capability | Coverage |
|---|-----------|----------|
| 83 | `initialize` — Return protocol version and server info | MOCK |
| 84 | `tools/list` — Return full tool schema array | MOCK |
| 85 | `tools/call` — Execute tool, return result | NONE |
| 86 | Unknown method — Return JSON-RPC error -32601 | MOCK |

## Quorum Junior Agent Tools (5)

| # | Capability | Coverage |
|---|-----------|----------|
| 87 | `read_file` — Read file from CWD with path-traversal guard; truncate at 10k chars | MOCK |
| 88 | `list_files` — List directory (up to 100 entries) | MOCK |
| 89 | `search_files` — grep with optional glob; first 50 matches | MOCK |
| 90 | `web_search` — DuckDuckGo instant-answer API | NONE |
| 91 | `web_fetch` — curl URL, strip HTML, first 10k chars | NONE |

---

## UI Features (48)

### Sidebar

| # | Capability | Coverage |
|---|-----------|----------|
| 92 | Project list with session counts (collapsible) | NONE |
| 93 | Session list: name, relative timestamp, message count, active indicator | NONE |
| 94 | Filter bar: Active / All / Archived / Hidden | NONE |
| 95 | Sort selector: Date / Name / Messages | NONE |
| 96 | Session search (300ms debounce, inline results) | NONE |
| 97 | Add Project button (+) — prompt for git URL or local path | NONE |
| 98 | Refresh button — reloads state | NONE |
| 99 | New Session button — creates session, opens tab, polls for JSONL | NONE |

### Session Actions

| # | Capability | Coverage |
|---|-----------|----------|
| 100 | Config editor (pencil) — overlay with name, state, model_override, notes | NONE |
| 101 | Archive/unarchive toggle | NONE |
| 102 | Delete with confirm dialog | NONE |
| 103 | Summary overlay — AI-generated, click-outside to close | NONE |

### Tabs

| # | Capability | Coverage |
|---|-----------|----------|
| 104 | Tab bar with status dots (connected/disconnected/connecting) | NONE |
| 105 | Click session in sidebar opens new tab (or focuses existing) | NONE |
| 106 | Click tab switches terminal | NONE |
| 107 | Close tab (X) — detaches PTY, doesn't delete session | NONE |
| 108 | Reopen closed tab reattaches to existing tmux | NONE |

### Terminal

| # | Capability | Coverage |
|---|-----------|----------|
| 109 | xterm.js with FitAddon and WebLinksAddon | NONE |
| 110 | Auto-resize via ResizeObserver | NONE |
| 111 | Terminal heartbeat (30s ping/pong) | NONE |
| 112 | Theme application (dark/light) to terminal instances | NONE |

### Status Bar

| # | Capability | Coverage |
|---|-----------|----------|
| 113 | Model name display | NONE |
| 114 | Permission mode display (bypass) | NONE |
| 115 | Context token usage with color-coded fill bar (green <60%, amber <85%, red >=85%) | NONE |
| 116 | Token polling every 15s + on tab switch | NONE |

### Right Panel

| # | Capability | Coverage |
|---|-----------|----------|
| 117 | Toggle open/close (hamburger button), refits terminal | NONE |
| 118 | Notes tab — auto-save 1s debounce | NONE |
| 119 | Tasks tab — add (Enter), complete (checkbox), delete (X) | NONE |
| 120 | CLAUDE.md tab — auto-save 1.5s debounce | NONE |
| 121 | Messages tab — last 50 messages | NONE |
| 122 | Panel reloads on tab switch | NONE |

### Settings Modal

| # | Capability | Coverage |
|---|-----------|----------|
| 123 | General tab / System Prompts tab navigation | NONE |
| 124 | Theme toggle (dark/light) — CSS variable swap + terminal themes | NONE |
| 125 | Font size setting — applies to all terminals | NONE |
| 126 | Font family setting (6 options) — applies to all terminals | NONE |
| 127 | Default model selector (Opus/Sonnet/Haiku) | NONE |
| 128 | Thinking level selector | NONE |
| 129 | Keepalive mode + idle timeout | NONE |
| 130 | Tasks panel toggle | NONE |
| 131 | MCP servers add/remove | NONE |
| 132 | Quorum settings (lead, fixed junior, additional juniors JSON) | NONE |
| 133 | Global CLAUDE.md editor with save button | NONE |
| 134 | Default project template editor with save button | NONE |

### Auth

| # | Capability | Coverage |
|---|-----------|----------|
| 135 | Auth banner on page load (checks every 60s) | NONE |
| 136 | Auth modal — detects OAuth URL in PTY output (regex on last 2KB buffer per tab) | NONE |
| 137 | Auth code submission — sends to triggering session's WebSocket | NONE |
| 138 | Auth modal dismisses after 3s | NONE |

### General

| # | Capability | Coverage |
|---|-----------|----------|
| 139 | State polling every 30s | NONE |
| 140 | Empty state (no tabs open) | NONE |
| 141 | Settings cached client-side for terminal creation | NONE |

---

## Database Operations (32)

### Schema

| # | Capability | Coverage |
|---|-----------|----------|
| 142 | WAL journal mode pragma on startup | MOCK |
| 143 | Foreign keys pragma on startup | MOCK |
| 144 | Migration: add `notes` column to projects (idempotent) | NONE |
| 145 | Migration: add `notes` column to sessions (idempotent) | NONE |
| 146 | Migration: add `state` column to sessions (idempotent) | NONE |
| 147 | Migration: add `model_override` column to sessions (idempotent) | NONE |
| 148 | Migration: backfill `state='archived'` from `archived=1` (idempotent) | NONE |

### Projects

| # | Capability | Coverage |
|---|-----------|----------|
| 149 | `ensureProject(name, path)` — INSERT OR IGNORE + SELECT | MOCK |
| 150 | `getProjects()` — SELECT all | MOCK |
| 151 | `getProject(name)` — SELECT by name | MOCK |

### Sessions

| # | Capability | Coverage |
|---|-----------|----------|
| 152 | `getSessionsForProject(projectId)` — SELECT ordered by updated_at DESC | MOCK |
| 153 | `getSession(id)` — SELECT by PK | MOCK |
| 154 | `getSessionFull(id)` — JOIN with projects | MOCK |
| 155 | `upsertSession(id, projectId, name)` — INSERT ON CONFLICT; preserves existing name | MOCK |
| 156 | `renameSession(id, name)` — UPDATE | MOCK |
| 157 | `archiveSession(id, archived)` — UPDATE (legacy) | MOCK |
| 158 | `setSessionState(id, state)` — UPDATE both archived and state | MOCK |
| 159 | `setSessionModelOverride(id, model)` — UPDATE | MOCK |
| 160 | `deleteSession(id)` — DELETE | MOCK |

### Notes

| # | Capability | Coverage |
|---|-----------|----------|
| 161 | `getProjectNotes/setProjectNotes` — Read/write projects.notes | MOCK |
| 162 | `getSessionNotes/setSessionNotes` — Read/write sessions.notes | MOCK |

### Tasks

| # | Capability | Coverage |
|---|-----------|----------|
| 163 | `getTasks(projectId)` — SELECT ordered by created_at | MOCK |
| 164 | `addTask(projectId, text, createdBy)` — INSERT | MOCK |
| 165 | `completeTask(id)` — UPDATE status + completed_at | MOCK |
| 166 | `reopenTask(id)` — UPDATE status, null completed_at | MOCK |
| 167 | `deleteTask(id)` — DELETE | MOCK |

### Messages

| # | Capability | Coverage |
|---|-----------|----------|
| 168 | `getUnreadMessages(projectId, toSession)` — SELECT unread for session | MOCK |
| 169 | `getRecentMessages(projectId)` — SELECT last 50 | MOCK |
| 170 | `sendMessage(projectId, from, to, content)` — INSERT | MOCK |
| 171 | `markMessageRead(id)` — UPDATE read=1 | MOCK |

### Settings

| # | Capability | Coverage |
|---|-----------|----------|
| 172 | `getSetting(key, default)` — SELECT with default | MOCK |
| 173 | `setSetting(key, value)` — INSERT OR REPLACE | MOCK |

---

## Configuration (28)

### Environment Variables

| # | Capability | Coverage |
|---|-----------|----------|
| 174 | `PORT` — Server port (default 3000) | NONE |
| 175 | `WORKSPACE` — Project root directory (default /workspace) | NONE |
| 176 | `CLAUDE_HOME` — Claude config dir (default /home/blueprint/.claude) | NONE |
| 177 | `BLUEPRINT_DATA` — SQLite DB dir (default ~/.blueprint) | NONE |
| 178 | `KEEPALIVE_MODE` — Initial mode: always/browser/idle (default always) | MOCK |
| 179 | `KEEPALIVE_IDLE_MINUTES` — Idle timeout minutes (default 30) | MOCK |
| 180 | `BLUEPRINT_PORT` — Port for mcp-server.js HTTP calls (default 3000) | NONE |
| 181 | `HOME` — Used for .claude.json trust and global CLAUDE.md | NONE |
| 182 | `ANTHROPIC_API_KEY` — For quorum junior Anthropic agents | NONE |
| 183 | `OPENAI_API_KEY` — For quorum junior OpenAI agents | NONE |

### SQLite Settings

| # | Capability | Coverage |
|---|-----------|----------|
| 184 | `default_model` — Model for new sessions (default claude-sonnet-4-6) | NONE |
| 185 | `thinking_level` — none/low/medium/high (default none) | NONE |
| 186 | `keepalive_mode` — Persisted mode | NONE |
| 187 | `keepalive_idle_minutes` — Persisted idle timeout | NONE |
| 188 | `tasks_enabled` — Tasks panel toggle (default true) | NONE |
| 189 | `default_project_claude_md` — Template for new projects | NONE |
| 190 | `theme` — dark/light | NONE |
| 191 | `font_size` — Terminal font size px | NONE |
| 192 | `font_family` — Terminal font family CSS | NONE |
| 193 | `webhooks` — JSON array of webhook configs | NONE |
| 194 | `quorum_lead_model` — Lead model (default claude-opus-4-6) | NONE |
| 195 | `quorum_fixed_junior` — Fixed junior JSON config | NONE |
| 196 | `quorum_additional_juniors` — Additional juniors JSON array | NONE |

### Startup Behaviors

| # | Capability | Coverage |
|---|-----------|----------|
| 197 | Auto-trust all workspace directories in .claude.json | REAL |
| 198 | Auto-register Blueprint MCP server in Claude settings.json | REAL |
| 199 | Ensure settings.json exists with skipDangerousModePermissionPrompt | NONE |
| 200 | Ensure .claude.json exists (CMD startup script) | NONE |
| 201 | Start keepalive on server start | NONE |

---

## Error Paths (65)

### API Validation Errors (400)

| # | Capability | Coverage |
|---|-----------|----------|
| 202 | `POST /api/projects` — missing path → 400 | REAL |
| 203 | `POST /api/sessions/:id/resume` — missing project → 400 | REAL |
| 204 | `PUT /api/sessions/:id/name` — missing/blank name → 400 | REAL |
| 205 | `DELETE /api/sessions/:id` — missing project → 400 | REAL |
| 206 | `POST /api/sessions/:id/summary` — missing project → 400 | REAL |
| 207 | `POST /api/sessions/:id/smart-compact` — missing project → 400 | REAL |
| 208 | `PUT /api/keepalive/mode` — invalid mode → 400 | REAL |
| 209 | `PUT /api/settings` — missing key → 400 | REAL |
| 210 | `POST /api/projects/:name/tasks` — missing text → 400 | REAL |
| 211 | `POST /api/projects/:name/messages` — missing content → 400 | REAL |
| 212 | `PUT /api/webhooks` — not an array → 400 | REAL |
| 213 | `POST /api/webhooks` — missing url → 400 | REAL |
| 214 | `POST /api/quorum/ask` — missing question → 400 | REAL |
| 215 | `POST /api/quorum/ask` — missing project → 400 | REAL |
| 216 | `POST /v1/chat/completions` — missing messages → 400 | REAL |
| 217 | `POST /v1/chat/completions` — no user message → 400 | REAL |

### Not Found Errors (404)

| # | Capability | Coverage |
|---|-----------|----------|
| 218 | `GET /api/sessions/:id/config` — session not found → 404 | REAL |
| 219 | `GET /api/projects/:name/notes` — project not found → 404 | REAL |
| 220 | `PUT /api/projects/:name/notes` — project not found → 404 | REAL |
| 221 | `POST /api/projects/:name/tasks` — project not found → 404 | REAL |
| 222 | `GET /api/projects/:name/messages` — project not found → 404 | REAL |
| 223 | `POST /api/projects/:name/messages` — project not found → 404 | REAL |
| 224 | `DELETE /api/webhooks/:index` — index out of bounds → 404 | REAL |
| 225 | `POST /api/mcp/call` — unknown tool → 404 | REAL |
| 226 | `POST /api/mcp/external/call` — unknown tool → 404 | REAL |

### Conflict Errors (409)

| # | Capability | Coverage |
|---|-----------|----------|
| 227 | `POST /api/projects` — directory already exists → 409 | REAL |
| 228 | `POST /api/projects` — local path not found → 404 | REAL |

### Server Errors (500)

| # | Capability | Coverage |
|---|-----------|----------|
| 229 | `GET /api/state` — readdir failure → 500 | NONE |
| 230 | `POST /api/sessions` — tmux spawn failure → 500 | NONE |
| 231 | `PUT /api/sessions/:id/config` — DB write failure → 500 | NONE |
| 232 | `POST /api/sessions/:id/summary` — JSONL read failure → 500 | NONE |
| 233 | `POST /api/sessions/:id/summary` — Claude CLI fails → 500 | NONE |
| 234 | `POST /api/mcp/call` — tool execution throws → 500 | NONE |
| 235 | `POST /api/mcp/external/call` — admin tool failure → 500 | NONE |
| 236 | `POST /v1/chat/completions` — Claude CLI error → 500 | NONE |

### Graceful Degradations (200 with error info)

| # | Capability | Coverage |
|---|-----------|----------|
| 237 | `GET /api/sessions/:id/tokens` — missing project → `{tokens: null}` | NONE |
| 238 | `GET /api/sessions/:id/tokens` — file unreadable → `{input_tokens: 0}` | NONE |
| 239 | `POST /api/sessions/:id/smart-compact` — tmux not running → `{compacted: false}` | NONE |
| 240 | `GET /api/search` — query < 2 chars → `{results: []}` | NONE |
| 241 | `GET /api/auth/status` — no credentials file → `{valid: false, reason: 'no_credentials_file'}` | MOCK |
| 242 | `GET /api/auth/status` — no access token → `{valid: false, reason: 'no_credentials'}` | MOCK |
| 243 | `GET /api/auth/status` — invalid tokens → `{valid: false, reason: 'invalid_credentials'}` | MOCK |
| 244 | `GET /api/auth/status` — expired no refresh → `{valid: false, reason: 'expired_no_refresh'}` | MOCK |

### WebSocket Errors

| # | Capability | Coverage |
|---|-----------|----------|
| 245 | WS upgrade — tmux doesn't exist → send error JSON, close | NONE |
| 246 | WS PTY exits → send `[Session detached]`, close | NONE |
| 247 | WS error event → log, kill PTY | NONE |

### Keepalive Errors

| # | Capability | Coverage |
|---|-----------|----------|
| 248 | Claude query failure → log, return null, cycle continues | MOCK |
| 249 | Token unreadable → doRefresh immediately, fallback 30min interval | MOCK |

### Webhook Errors

| # | Capability | Coverage |
|---|-----------|----------|
| 250 | Network/HTTP error → log, no retry, no block | MOCK |
| 251 | Malformed URL → caught, logged, other webhooks still fire | MOCK |

### Quorum Errors

| # | Capability | Coverage |
|---|-----------|----------|
| 252 | Junior: no API key → returns error string as answer | NONE |
| 253 | Junior: API returns error → returns error string as answer | NONE |
| 254 | Junior: max 10 turns reached → returns "Max tool turns reached" | NONE |
| 255 | Junior read_file: path traversal → blocked with error message | MOCK |
| 256 | Junior read_file: not found → error message | NONE |
| 257 | Lead CLI fails → error string in synthesis file, round completes | NONE |
| 258 | Quorum overall failure → 500 | NONE |

### MCP stdio Errors

| # | Capability | Coverage |
|---|-----------|----------|
| 259 | Unparseable JSON on stdin → silently ignored | MOCK |
| 260 | Unknown method with id → JSON-RPC -32601 | NONE |
| 261 | Tool execution throws → isError response | NONE |

### UI Errors

| # | Capability | Coverage |
|---|-----------|----------|
| 262 | Add project failure → alert | NONE |
| 263 | Open session failure → console error | NONE |
| 264 | Create session failure → alert | NONE |
| 265 | Summary failure → "Failed to generate summary" in modal | NONE |
| 266 | Auth check failure → console error | NONE |

---

## Coverage Status

**Summary as of 2026-03-31 (288 tests: 140 mock + 148 live):**

| Status | Count | Capabilities |
|--------|-------|-------------|
| BOTH | 11 | 25, 30, 32, 33, 41, 42, 43, 44, 50, 51, 78 |
| REAL | 93 | 1–24, 26–29, 31, 34–40, 45–49, 52–53, 55–57, 61–71, 75–77, 79–82, 197–198, 202–228 |
| MOCK | 45 | 83–84, 86–89, 142–143, 149–173, 178–179, 241–244, 248–249, 250–251, 255, 259 |
| NONE | 117 | 54, 58–60, 72–74, 85, 90–141, 144–148, 174–177, 180–196, 199–201, 229–240, 245–247, 252–254, 256–258, 260–266 |
| **Total** | **266** | |

**Progress:** 149 of 266 capabilities covered (56%). Primary gap is UI features (92–141, all NONE — requires browser automation) and untested error paths.

Target: zero NONE entries after full test plan execution (Phases A–K including UI audit scenarios).
