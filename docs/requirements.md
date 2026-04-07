# Blueprint — Requirements Document

**Version:** 1.0  
**Date:** 2026-04-02  
**Source Files Analyzed:** server.js, db.js, safe-exec.js, session-utils.js, keepalive.js, mcp-server.js, mcp-external.js, mcp-tools.js, openai-compat.js, webhooks.js, quorum.js, entrypoint.sh, public/index.html, Dockerfile

---

## 1. Session Management

**REQ-SM-001:** The system shall create new Claude CLI sessions within a tmux process, returning a temporary ID (`new_<timestamp>`) immediately and resolving to the real Claude session UUID asynchronously once a JSONL file appears.

**REQ-SM-002:** The system shall resume existing sessions by attaching to an existing tmux session or, if none exists, creating a new tmux session with `--resume <sessionId>` to restore the Claude CLI conversation.

**REQ-SM-003:** The system shall support renaming sessions, persisting the user-chosen name in the database and appending a `summary` entry to the session JSONL file so the CLI reflects the new name.

**REQ-SM-004:** The system shall support three session states — `active`, `archived`, and `hidden` — and allow transitions between them via the API.

**REQ-SM-005:** The system shall support deleting sessions, which kills the associated tmux process, removes the JSONL file, and deletes the database and metadata cache entries.

**REQ-SM-006:** The system shall maintain a per-session configuration consisting of name, state, model override, and notes, accessible via `GET/PUT /api/sessions/:id/config`.

**REQ-SM-007:** The system shall resolve temporary `new_*` session IDs to real Claude UUIDs by polling the sessions directory for new JSONL files (up to 60 seconds, every 2 seconds) and migrating all DB metadata (name, notes, state, model override) to the resolved entry.

**REQ-SM-008:** On server startup, the system shall resolve any stale `new_*` session entries that survived a server restart by matching them against unresolved JSONL files, and clean up orphaned temp entries that have no matching JSONL or tmux process.

**REQ-SM-009:** The system shall cache session metadata (name, timestamp, message count) in a `session_meta` SQLite table, keyed by file mtime and size, to avoid re-parsing JSONL files on every request.

**REQ-SM-010:** The system shall enforce a configurable maximum number of concurrent tmux sessions (`MAX_TMUX_SESSIONS`, default 5), killing the least recently active session when the limit is exceeded.

**REQ-SM-011:** The system shall schedule cleanup of idle tmux sessions after a configurable delay (`TMUX_CLEANUP_MINUTES`, default 30 minutes) when all WebSocket clients disconnect from a session, and cancel cleanup if a client reconnects.

**REQ-SM-012:** On startup, the system shall kill all orphaned `bp_*` tmux sessions from previous container runs.

**REQ-SM-013:** The system shall generate AI-powered session summaries by extracting the last ~1500 characters of conversation and sending them to Claude Sonnet via `--print --no-session-persistence`.

**REQ-SM-014:** The system shall parse token usage from session JSONL files, extracting `input_tokens`, `cache_read_input_tokens`, and `cache_creation_input_tokens` from the most recent assistant message, and report the model's context limit (200K or 1M based on model name).

## 2. Terminal / WebSocket

**REQ-WS-001:** The system shall expose a WebSocket endpoint at `/ws/<tmux-session-name>` that bridges browser input/output to a tmux session via a `node-pty` pseudo-terminal.

**REQ-WS-002:** The WebSocket shall support JSON control messages for terminal resize (`{ type: "resize", cols, rows }`) and heartbeat ping/pong (`{ type: "ping" }` / `{ type: "pong" }`).

**REQ-WS-003:** The PTY process shall be spawned with `xterm-256color` terminal type, truecolor support, initial dimensions of 120×40, and attach to the named tmux session.

**REQ-WS-004:** When the PTY process exits, the system shall notify the connected WebSocket client with a `[Session detached]` message and close the connection.

**REQ-WS-005:** The system shall sanitize tmux session names from WebSocket URLs, allowing only alphanumeric characters, underscores, and hyphens to prevent tmux target injection.

**REQ-WS-006:** The WebSocket client shall automatically reconnect on disconnection with exponential backoff (starting at 1 second, max 30 seconds), and stop reconnecting if the tmux session no longer exists.

**REQ-WS-007:** The WebSocket client shall send heartbeat pings every 30 seconds to keep the connection alive.

## 3. Smart Compaction

**REQ-SC-001:** The system shall implement a smart compaction workflow consisting of four sequential steps: (1) a helper CLI prepares/updates the plan file, (2) `/compact` is sent to the tmux session, (3) the system polls for compaction completion by checking for the CLI prompt (up to 30 seconds), (4) post-compaction recovery sends the plan file path and resume instruction to the session.

**REQ-SC-002:** The system shall run a compaction monitor every 30 seconds that checks token usage for all active sessions (those with running tmux processes) and triggers threshold-based actions.

**REQ-SC-003:** At 65% context usage, the system shall send an advisory notification to the session recommending compaction at a natural break point.

**REQ-SC-004:** At 75% context usage, the system shall send a warning notification to the session.

**REQ-SC-005:** At 85% context usage, the system shall send an urgent notification indicating automatic compaction will occur at 90%.

**REQ-SC-006:** At 90% context usage, the system shall automatically trigger smart compaction without user intervention.

**REQ-SC-007:** Each threshold notification (65%, 75%, 85%, auto-triggered) shall fire at most once per session to prevent duplicate alerts. The compaction state map shall be capped at 100 entries, evicting the oldest when full.

**REQ-SC-008:** Notifications shall be delivered via bridge files written to disk and sent to the tmux session as file paths.

**REQ-SC-009:** The system shall disable the CLI's built-in auto-compaction (`DISABLE_AUTO_COMPACT=1`) so Blueprint's smart compaction controls the process exclusively.

## 4. Keepalive

**REQ-KA-001:** The system shall maintain OAuth token freshness by periodically invoking Claude CLI queries (using Haiku model) before the token expires.

**REQ-KA-002:** The keepalive system shall read token expiry from `~/.claude/.credentials.json` and schedule refresh checks at a random point between 65–85% of the remaining token lifetime, with a minimum interval of 1 minute.

**REQ-KA-003:** The system shall support three keepalive modes: `always` (always running), `browser` (runs only while browsers are connected, default), and `idle` (stops after a configurable inactivity timeout).

**REQ-KA-004:** In `browser` mode, keepalive shall start when the first browser connects and stop when the last browser disconnects.

**REQ-KA-005:** In `idle` mode, keepalive shall start when a browser connects, and after the last browser disconnects, wait for the configured idle timeout (default 30 minutes) before stopping.

**REQ-KA-006:** If the token is expired or unreadable, the system shall refresh immediately and fall back to a 30-minute polling interval if the token remains unreadable after refresh.

**REQ-KA-007:** The keepalive status (running, mode, token expiration) shall be exposed via `GET /api/keepalive/status`.

**REQ-KA-008:** The keepalive mode shall be configurable at runtime via `PUT /api/keepalive/mode`.

## 5. MCP Tools (Internal — stdio transport)

**REQ-MCP-001:** The system shall expose an MCP server over stdio (JSON-RPC 2.0, protocol version `2024-11-05`) that proxies tool calls to the Blueprint HTTP API.

**REQ-MCP-002:** The MCP server shall expose the following tools: `blueprint_search_sessions`, `blueprint_summarize_session`, `blueprint_list_sessions`, `blueprint_get_project_notes`, `blueprint_get_session_notes`, `blueprint_get_tasks`, `blueprint_add_task`, `blueprint_complete_task`, `blueprint_get_project_claude_md`, `blueprint_read_plan`, `blueprint_update_plan`, `blueprint_smart_compaction`, `blueprint_ask_quorum`, `blueprint_send_message`.

**REQ-MCP-003:** The `blueprint_search_sessions` tool shall search across all session JSONL files for a query string, returning matching sessions with up to 3 context snippets per session, sorted by match count, limited to 15 results.

**REQ-MCP-004:** The `blueprint_read_plan` and `blueprint_update_plan` tools shall read/write per-session plan files stored at `{DATA_DIR}/plans/{project}/{session_id}.md`, with path traversal protection.

**REQ-MCP-005:** The `blueprint_send_message` tool shall write message content to a uniquely-named bridge file, record it in the database, and attempt delivery to the target session via `claude --resume` with the file path. Delivered bridge files shall be cleaned up after 5 seconds; undelivered files after 1 hour.

**REQ-MCP-006:** On startup, the system shall auto-register the Blueprint MCP server in `~/.claude/settings.json` as a stdio-based server pointing to `mcp-server.js`.

## 6. MCP Tools (External — HTTP transport)

**REQ-EXT-001:** The system shall expose external MCP tool listing at `GET /api/mcp/external/tools` returning both internal and admin tools.

**REQ-EXT-002:** The system shall expose external MCP tool execution at `POST /api/mcp/external/call`, routing internal tool calls to the internal handler and handling admin tools directly.

**REQ-EXT-003:** The external MCP shall provide admin tools: `blueprint_create_session`, `blueprint_delete_session`, `blueprint_set_session_state`, `blueprint_get_token_usage`, `blueprint_set_project_notes`, `blueprint_set_project_claude_md`, `blueprint_list_projects`, `blueprint_update_settings`.

## 7. Quorum

**REQ-QR-001:** The system shall implement a multi-model quorum pattern where multiple junior models answer a question independently, and a lead model synthesizes their responses.

**REQ-QR-002:** Junior agents shall be implemented as ReAct agents with up to 10 tool-use turns, with access to: `read_file`, `list_files`, `search_files` (CWD read-only), `web_search` (DuckDuckGo API), and `web_fetch`.

**REQ-QR-003:** Junior agents shall support both Anthropic API and OpenAI-compatible API providers, configured per-agent with model name, provider, base URL, and API key environment variable.

**REQ-QR-004:** The lead synthesis shall run via Claude CLI (`--print`) using the configured lead model, receiving all junior responses and producing a holistic synthesis.

**REQ-QR-005:** All junior responses and the lead synthesis shall be persisted as markdown files in `{DATA_DIR}/quorum/{round_id}/`.

**REQ-QR-006:** The quorum shall support `new` mode (fresh question) and `resume` mode (follow-up using a cached lead session ID).

**REQ-QR-007:** Quorum settings (lead model, fixed junior, additional juniors) shall be configurable via SQLite settings and exposed in the UI.

**REQ-QR-008:** Junior tool implementations shall enforce path traversal protection, truncate file reads at 10,000 characters, and limit directory listings to 100 entries.

## 8. OpenAI Compatibility

**REQ-OA-001:** The system shall expose `GET /v1/models` returning available Claude models in OpenAI model list format.

**REQ-OA-002:** The system shall expose `POST /v1/chat/completions` accepting OpenAI-format chat completion requests and returning OpenAI-format responses.

**REQ-OA-003:** Session routing shall be supported via the `model` field (prefix `bp:<session_id>`) or the `X-Blueprint-Session` header, with the project derivable from `X-Blueprint-Project` header or request body.

**REQ-OA-004:** The endpoint shall support both streaming (SSE with `data:` prefix and `[DONE]` terminator) and non-streaming response modes.

**REQ-OA-005:** The system shall handle OpenAI content format where `content` can be a string or an array of content blocks (filtering for `type: "text"`).

**REQ-OA-006:** If no session ID is provided, the system shall use `--no-session-persistence` for a stateless one-shot query.

## 9. Webhooks

**REQ-WH-001:** The system shall fire outbound HTTP POST webhooks when events occur, including `session_created`, `message_sent`, and `task_added`.

**REQ-WH-002:** Webhooks shall support event filtering — each webhook can subscribe to specific events or use `*` for all events.

**REQ-WH-003:** Webhooks shall support two payload modes: `event_only` (sends only event type, timestamp, and extracted IDs) and `full_content` (sends complete event data).

**REQ-WH-004:** Webhook configuration shall be persisted in SQLite settings and manageable via REST API: `GET /api/webhooks` (list), `POST /api/webhooks` (add), `PUT /api/webhooks` (replace all), `DELETE /api/webhooks/:index` (remove by index).

**REQ-WH-005:** Webhook delivery shall use a 5-second timeout and log errors without blocking the originating request.

**REQ-WH-006:** The webhook `User-Agent` header shall be `Blueprint-Webhook/0.1`.

## 10. Settings

**REQ-SET-001:** The system shall persist key-value settings in SQLite, with values stored as JSON strings.

**REQ-SET-002:** The system shall provide the following configurable settings with defaults: `default_model` (claude-sonnet-4-6), `thinking_level` (none), `keepalive_mode` (always), `keepalive_idle_minutes` (30), `tasks_enabled` (true).

**REQ-SET-003:** Changes to `keepalive_mode` and `keepalive_idle_minutes` shall be applied immediately upon save.

**REQ-SET-004:** The system shall manage Claude CLI MCP server configuration via `GET/PUT /api/mcp-servers`, reading from and writing to `~/.claude/settings.json`.

**REQ-SET-005:** The settings UI shall provide a "System Prompts" tab for editing the global `~/.claude/CLAUDE.md` and a default project template that is applied to new projects without an existing CLAUDE.md.

**REQ-SET-006:** The settings UI shall expose appearance settings (theme, terminal font size, terminal font family), Claude Code settings (default model, thinking level), keepalive settings, quorum settings, feature toggles, and MCP server management.

## 11. Authentication

**REQ-AUTH-001:** The system shall check authentication status by reading `~/.claude/.credentials.json` and verifying the presence and validity of the OAuth access token and refresh token.

**REQ-AUTH-002:** `GET /api/auth/status` shall return `{ valid: true }` if credentials exist with a valid access token or a usable refresh token, or `{ valid: false, reason }` with a specific reason code (`no_credentials`, `invalid_credentials`, `expired_no_refresh`, `no_credentials_file`).

**REQ-AUTH-003:** The UI shall detect authentication failures by monitoring terminal output for OAuth-related error patterns and display an auth modal with instructions for re-authentication.

**REQ-AUTH-004:** The entrypoint shall verify Claude CLI credentials on startup with a test query and report the result.

**REQ-AUTH-005:** The keepalive system shall read the OAuth token from credentials and inject it as `CLAUDE_CODE_OAUTH_TOKEN` when creating tmux sessions to skip CLI onboarding.

## 12. Projects

**REQ-PROJ-001:** The system shall maintain a registry of projects in SQLite, each with a unique name, filesystem path, optional notes, and creation timestamp.

**REQ-PROJ-002:** Adding a project shall support two modes: registering an existing local path, or cloning a git repository (HTTP/HTTPS or SSH URL) into the workspace directory.

**REQ-PROJ-003:** When adding a project, the system shall auto-trust the directory in `~/.claude/.claude.json` by setting `hasTrustDialogAccepted: true`.

**REQ-PROJ-004:** Removing a project shall delete the database entry and cascade-delete all associated sessions, tasks, and messages, but shall NOT delete any files from disk.

**REQ-PROJ-005:** Projects shall support shared notes (read/write via `GET/PUT /api/projects/:name/notes`) visible to all sessions.

**REQ-PROJ-006:** Projects shall support per-project CLAUDE.md files (read/write via `GET/PUT /api/projects/:name/claude-md`), stored at the project root. When a project has no CLAUDE.md, the default template from settings shall be applied.

**REQ-PROJ-007:** The system shall expose a filesystem browser at `GET /api/browse` for navigating directories when adding projects, returning only directories (not hidden entries).

**REQ-PROJ-008:** The system shall detect and flag projects whose directories no longer exist on disk, marking them as `missing` in the state response.

## 13. Search

**REQ-SRCH-001:** The system shall provide full-text search across all session JSONL files via `GET /api/search?q=<query>`, with a minimum query length of 2 characters and a maximum of 20 results.

**REQ-SRCH-002:** Search results shall include session ID, project name, session name, match count, and up to 3 text snippets (200 chars max each).

**REQ-SRCH-003:** Search results shall be sorted by match count (descending) and use cached session metadata for session names when available.

**REQ-SRCH-004:** The UI shall provide a search input in the sidebar for filtering sessions by name (client-side).

## 14. Tasks

**REQ-TASK-001:** The system shall support a per-project task list with CRUD operations: create, complete, reopen, and delete.

**REQ-TASK-002:** Each task shall have text content, a status (`todo` or `done`), a creator (`human` or `agent`), creation timestamp, and completion timestamp.

**REQ-TASK-003:** Task creation shall fire a `task_added` webhook event.

**REQ-TASK-004:** Tasks shall be accessible both via the REST API and via MCP tools (`blueprint_get_tasks`, `blueprint_add_task`, `blueprint_complete_task`).

## 15. Inter-Session Messages

**REQ-MSG-001:** The system shall support sending messages between sessions within a project, stored in the database with sender, recipient, content, read status, and timestamp.

**REQ-MSG-002:** When a message targets a specific session, the system shall write the content to a bridge file and deliver it via `claude --resume <target> --print <file_path>`, cleaning up delivered files after 5 seconds and undelivered files after 1 hour.

**REQ-MSG-003:** Message sending shall fire a `message_sent` webhook event.

**REQ-MSG-004:** The UI shall provide a "Messages" panel displaying recent messages for the active project.

**REQ-MSG-005:** On startup, the system shall clean up bridge files older than 2 hours.

## 16. UI

**REQ-UI-001:** The system shall serve a single-page web application with a three-panel layout: left sidebar (projects/sessions), center (tabbed terminal area), and right panel (notes/tasks/CLAUDE.md/messages).

**REQ-UI-002:** The sidebar shall display projects as collapsible groups with session lists, filterable by state (active, all, archived, hidden) and sortable by date, name, or message count.

**REQ-UI-003:** The terminal area shall support multiple open sessions as tabs with xterm.js terminals, each showing connection status (connected/disconnected/connecting) via colored dots.

**REQ-UI-004:** Each terminal tab shall display a status bar showing session model, context usage (as a colored progress bar: green < amber < red), and token count.

**REQ-UI-005:** The UI shall auto-refresh project/session state every 30 seconds and poll token usage for active sessions.

**REQ-UI-006:** The UI shall support session actions from the sidebar: open, rename (via config editor overlay), archive/unarchive, delete (with confirmation), and summarize.

**REQ-UI-007:** The session config editor shall allow editing name, state, model override, and session notes in a modal overlay.

**REQ-UI-008:** The right panel shall have four tabs: Notes (project-level, auto-saved), Tasks (with inline add/complete/reopen/delete), CLAUDE.md (project-level, manual save), and Messages.

**REQ-UI-009:** The settings modal shall have two tabs: General (appearance, Claude Code, keepalive, quorum, features, MCP servers) and System Prompts (global CLAUDE.md, default project template).

**REQ-UI-010:** The UI shall support four themes: dark, light, blueprint-dark, and blueprint-light, with configurable terminal font size and font family.

**REQ-UI-011:** The UI shall display an authentication modal when token expiration is detected in terminal output, providing a link to authenticate and a field to submit the authorization code.

**REQ-UI-012:** The UI shall resolve temporary `new_*` tab IDs to real session UUIDs when the state refresh detects the temp ID has been replaced, migrating the tab and terminal connection seamlessly.

## 17. Deployment / Infrastructure

**REQ-DEP-001:** The system shall be packaged as a Docker container based on `node:22-slim` with dependencies: git, curl, tmux, ssh, gosu, jq, python3, make, g++.

**REQ-DEP-002:** The Claude CLI shall be installed globally via `npm install -g @anthropic-ai/claude-code`.

**REQ-DEP-003:** The entrypoint shall run as root to match the Docker socket GID, then drop privileges to the `hopper` user via `gosu` for all application code.

**REQ-DEP-004:** The entrypoint shall ensure the Claude CLI onboarding state is marked complete (including `hasCompletedOnboarding`, `bypassPermissionsModeAccepted`, and `lastOnboardingVersion`) to prevent interactive prompts in the container.

**REQ-DEP-005:** The entrypoint shall create required directories (`~/.blueprint`, `~/.claude/projects`, bridges, quorum) and symlink `$HOME/.claude` to `CLAUDE_HOME` if they differ.

**REQ-DEP-006:** The container shall expose port 3000 and bind to `0.0.0.0`.

**REQ-DEP-007:** The process shall exit on uncaught exceptions (exit code 1) to allow Docker's restart policy to handle recovery cleanly, rather than continuing in an undefined state.

## 18. Data / Persistence

**REQ-DATA-001:** The system shall use SQLite (via `better-sqlite3`) with WAL journal mode and foreign keys enabled.

**REQ-DATA-002:** The database shall be stored at `{BLUEPRINT_DATA}/blueprint.db` (default `~/.blueprint/blueprint.db`).

**REQ-DATA-003:** The database schema shall include tables: `projects`, `sessions`, `tasks`, `settings`, `messages`, and `session_meta`.

**REQ-DATA-004:** Session deletion shall cascade to related records via foreign key constraints.

**REQ-DATA-005:** The system shall apply idempotent schema migrations on startup to add columns for notes, state, model_override, and user_renamed, and migrate the legacy `archived` flag to the `state` column.

## 19. Command Execution / Security

**REQ-SEC-001:** All external command execution shall use `execFileSync` / `execFile` with argument arrays (not shell interpolation) to prevent command injection.

**REQ-SEC-002:** Tmux session names shall be sanitized to alphanumeric, underscore, and hyphen characters only.

**REQ-SEC-003:** Plan file paths shall be validated against path traversal by checking they start with the expected base directory (including separator to prevent prefix-match bypass).

**REQ-SEC-004:** Smart compaction shall validate session IDs against a pattern of `[a-zA-Z0-9_-]+` before constructing file paths.

**REQ-SEC-005:** Quorum junior agent file operations shall enforce path traversal protection and be limited to the project directory.

**REQ-SEC-006:** Git clone shall validate URLs against HTTP(S) or SSH (`git@`) patterns before execution.

**REQ-SEC-007:** The Claude CLI shall run in `--dangerously-skip-permissions` mode within tmux sessions (the container is a trusted single-user environment).
