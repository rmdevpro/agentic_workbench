# Blueprint — High Level Design (HLD)

## 1. Architecture Overview

Blueprint is a **single-user, web-based workbench** for managing multiple concurrent Claude Code CLI sessions. It runs as a containerized Node.js application that wraps the `claude` CLI, providing:

- A browser UI for creating, resuming, and monitoring Claude CLI sessions
- Terminal access via WebSocket-bridged tmux/PTY
- Session metadata management (names, notes, state, tasks)
- Cross-session messaging and search
- OAuth token keepalive
- Smart context compaction
- Multi-model quorum (ask N models, synthesize)
- MCP server integration (Claude CLI reads Blueprint tools)
- OpenAI-compatible chat completions API
- Outbound webhooks

Blueprint is **not a multi-tenant service**. It is designed as a personal developer tool running inside a Docker container, with full trust granted to the single operator.

---

## 2. Component Diagram (Text)

```
┌─────────────────────────────────────────────────────────────────────┐
│  Browser (public/index.html)                                        │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────────┐              │
│  │  Sidebar     │  │  Tab Bar +   │  │  Right Panel  │              │
│  │  (projects,  │  │  Terminal    │  │  (notes,tasks, │              │
│  │   sessions)  │  │  (xterm.js)  │  │   CLAUDE.md,  │              │
│  │              │  │              │  │   messages)   │              │
│  └──────┬───────┘  └──────┬───────┘  └───────┬───────┘              │
│         │  REST API       │  WebSocket        │  REST API           │
└─────────┼─────────────────┼───────────────────┼─────────────────────┘
          │                 │                   │
┌─────────▼─────────────────▼───────────────────▼─────────────────────┐
│  server.js (Express + HTTP + WebSocketServer)                       │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │ REST API   │ │ WS Terminal  │ │ Compaction   │ │ Session      │ │
│  │ Routes     │ │ PTY Bridge   │ │ Monitor      │ │ Resolver     │ │
│  └────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ │
│  │mcp-tools.js│ │openai-compat │ │ webhooks.js  │ │mcp-external  │ │
│  │(internal)  │ │   .js        │ │              │ │   .js        │ │
│  └────────────┘ └──────────────┘ └──────────────┘ └──────────────┘ │
│  ┌────────────┐ ┌──────────────┐                                    │
│  │ quorum.js  │ │ keepalive.js │                                    │
│  └────────────┘ └──────────────┘                                    │
├─────────────────────────────────────────────────────────────────────┤
│  Shared Modules                                                     │
│  ┌────────────┐ ┌──────────────┐ ┌──────────────┐                  │
│  │  db.js     │ │ safe-exec.js │ │session-utils │                  │
│  │ (SQLite)   │ │ (tmux, CLI)  │ │   .js        │                  │
│  └────────────┘ └──────────────┘ └──────────────┘                  │
├─────────────────────────────────────────────────────────────────────┤
│  External Processes                                                 │
│  ┌──────┐  ┌─────────────┐  ┌───────────────────────┐              │
│  │ tmux │  │ Claude CLI  │  │ mcp-server.js (stdio) │              │
│  │      │◄─┤ (per-session│  │ (MCP protocol for     │              │
│  │      │  │  instances) │  │  Claude CLI to call)   │              │
│  └──────┘  └─────────────┘  └───────────────────────┘              │
├─────────────────────────────────────────────────────────────────────┤
│  Storage                                                            │
│  ┌──────────────────────┐  ┌─────────────────────────────┐         │
│  │ ~/.blueprint/        │  │ ~/.claude/                   │         │
│  │   blueprint.db       │  │   .credentials.json          │         │
│  │   plans/             │  │   settings.json              │         │
│  │   bridges/           │  │   .claude.json               │         │
│  │   quorum/            │  │   projects/{encoded}/*.jsonl  │         │
│  └──────────────────────┘  └─────────────────────────────┘         │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 3. Data Flow

### 3.1 Session Lifecycle

```
User clicks "New Session"
  → POST /api/sessions { project }
    → Snapshot existing JSONL files
    → Assign tmpId = "new_{timestamp}"
    → tmuxCreateClaude(tmux, projectPath, claudeArgs)
      → tmux new-session → exec claude --dangerously-skip-permissions [--model ...]
    → DB: upsertSession(tmpId, projectId)
    → Background: resolveSessionId() polls for new JSONL file
      → When found: DB migrate tmpId → realUUID, rename tmux session
    → Return { id: tmpId, tmux }
  → Browser opens WebSocket to /ws/{tmux}
    → server.on('upgrade') → pty.spawn('tmux', ['attach-session', '-t', tmux])
    → bidirectional data: WS ↔ PTY ↔ tmux ↔ Claude CLI
```

### 3.2 MCP Tool Call (Claude CLI → Blueprint)

```
Claude CLI session (inside tmux)
  → starts mcp-server.js via stdio (registered in settings.json)
  → CLI sends JSON-RPC: tools/call { name: "blueprint_search_sessions", args }
  → mcp-server.js → HTTP POST localhost:3000/api/mcp/call { tool, args }
  → mcp-tools.js handles tool, returns result
  → mcp-server.js → JSON-RPC response back to CLI
```

### 3.3 Smart Compaction

```
Compaction monitor (30s interval) checks active sessions:
  → getTokenUsage() parses JSONL for input_tokens
  → At 65/75/85%: write bridge file with nudge message, send to tmux
  → At 90%: auto-trigger runSmartCompaction()
    → Step 1: Claude CLI helper reads plan, updates it
    → Step 2: tmux send-keys "/compact"
    → Step 3: Poll tmux for CLI prompt (compaction done)
    → Step 4: Send plan file path to session for recovery
```

### 3.4 Inter-Session Messaging

```
POST /api/projects/:name/messages { from_session, to_session, content }
  → Write content to bridge file: ~/.blueprint/bridges/msg_{uuid}.md
  → DB: sendMessage(projectId, from, to, content)
  → If target tmux is running:
    → claudeExecAsync(['--resume', to_session, '--print', bridgeFile])
    → Cleanup bridge file after 5s
  → Else: file persists for 1 hour
```

### 3.5 Quorum

```
POST /api/quorum/ask { question, project, mode }
  → Run N junior agents in parallel (Anthropic API or OpenAI-compat API)
    → Each junior has ReAct tools: read_file, list_files, search_files, web_search, web_fetch
    → Each junior writes response to quorum/{roundId}/junior_N.md
  → Lead synthesis via Claude CLI --print
    → Reads all junior responses, produces synthesized answer
    → Writes to quorum/{roundId}/lead_synthesis.md
  → Return file paths to all responses
```

---

## 4. Deployment Model

### Container

- **Base image**: `node:22-slim`
- **System deps**: git, curl, tmux, ssh, gosu, jq, python3, make, g++
- **Claude CLI**: installed globally via npm (`@anthropic-ai/claude-code`)
- **App runtime**: Node.js with `node-pty` for terminal bridging
- **User**: `hopper` (non-root); entrypoint runs as root to fix Docker socket GID, then drops to `hopper` via `gosu`

### Entrypoint (`entrypoint.sh`)

1. Match Docker socket GID and add `hopper` to the group
2. Create data directories (`~/.claude`, `~/.blueprint`)
3. Ensure Claude CLI settings (skip permissions prompt, onboarding)
4. Verify credentials
5. `exec gosu hopper node /app/server.js`

### Docker Compose (production)

```yaml
hopper-ui:
  build: { context: ., dockerfile: Dockerfile.hopper-ui }
  ports: ["7866:3000"]
  environment: [MAX_TMUX_SESSIONS=20]
  volumes:
    - data/hopper-ui:/home/hopper/.claude     # CLI credentials + settings
    - data/blueprint-db:/home/hopper/.blueprint  # SQLite + plans + bridges + quorum
    - /workspace/Project1:/workspace/Project1  # project mounts
  restart: unless-stopped
```

### Key Environment Variables

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `3000` | HTTP server port |
| `WORKSPACE` | `/workspace` | Root for project directories |
| `CLAUDE_HOME` | `/home/hopper/.claude` | Claude CLI config/credentials directory |
| `BLUEPRINT_DATA` | `~/.blueprint` | SQLite DB, plans, bridges, quorum data |
| `MAX_TMUX_SESSIONS` | `5` | Max concurrent tmux sessions (oldest killed) |
| `TMUX_CLEANUP_MINUTES` | `30` | Idle tmux cleanup delay after browser disconnect |
| `KEEPALIVE_MODE` | `browser` | Token keepalive strategy |
| `ANTHROPIC_API_KEY` | — | For quorum junior agents (API-based) |
| `OPENAI_API_KEY` | — | For OpenAI-compat quorum juniors |

---

## 5. Database Schema

**Engine**: SQLite (better-sqlite3) with WAL mode, foreign keys enabled.

**Location**: `$BLUEPRINT_DATA/blueprint.db`

### Tables

#### `projects`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `name` | TEXT UNIQUE | Display name |
| `path` | TEXT UNIQUE | Absolute filesystem path |
| `notes` | TEXT | Shared project notes |
| `created_at` | TEXT | ISO datetime |

#### `sessions`
| Column | Type | Notes |
|---|---|---|
| `id` | TEXT PK | Claude CLI session UUID (or `new_{ts}` temporary) |
| `project_id` | INTEGER FK | References `projects(id)` CASCADE |
| `name` | TEXT | Session display name |
| `archived` | INTEGER | Legacy archive flag |
| `state` | TEXT | `active`, `archived`, `hidden` |
| `model_override` | TEXT | Per-session model override |
| `user_renamed` | INTEGER | Whether user explicitly renamed |
| `notes` | TEXT | Per-session notes |
| `created_at` | TEXT | ISO datetime |
| `updated_at` | TEXT | ISO datetime |

#### `tasks`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `project_id` | INTEGER FK | References `projects(id)` CASCADE |
| `text` | TEXT | Task description |
| `status` | TEXT | `todo` or `done` |
| `created_by` | TEXT | `human` or `agent` |
| `created_at` | TEXT | ISO datetime |
| `completed_at` | TEXT | ISO datetime |

#### `messages`
| Column | Type | Notes |
|---|---|---|
| `id` | INTEGER PK | Auto-increment |
| `project_id` | INTEGER FK | References `projects(id)` CASCADE |
| `from_session` | TEXT | Source session ID (nullable) |
| `to_session` | TEXT | Target session ID (nullable) |
| `content` | TEXT | Message body |
| `read` | INTEGER | 0 or 1 |
| `created_at` | TEXT | ISO datetime |

#### `session_meta` (cache)
| Column | Type | Notes |
|---|---|---|
| `session_id` | TEXT PK | Session UUID |
| `file_path` | TEXT | JSONL file path |
| `file_mtime` | REAL | File modification time (ms) |
| `file_size` | INTEGER | File size (bytes) |
| `name` | TEXT | Cached session name |
| `timestamp` | TEXT | Last message timestamp |
| `message_count` | INTEGER | Total messages |

#### `settings`
| Column | Type | Notes |
|---|---|---|
| `key` | TEXT PK | Setting name |
| `value` | TEXT | JSON-encoded value |

---

## 6. API Surface

### Projects

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/state` | List all projects with enriched session data |
| `POST` | `/api/projects` | Add project (local path or git clone URL) |
| `POST` | `/api/projects/:name/remove` | Remove project from Blueprint (no file deletion) |
| `GET` | `/api/projects/:name/notes` | Get project notes |
| `PUT` | `/api/projects/:name/notes` | Set project notes |
| `GET` | `/api/projects/:name/tasks` | List tasks |
| `POST` | `/api/projects/:name/tasks` | Add task |
| `GET` | `/api/projects/:name/messages` | List recent inter-session messages |
| `POST` | `/api/projects/:name/messages` | Send message (with bridge file delivery) |
| `GET` | `/api/projects/:name/claude-md` | Read project CLAUDE.md |
| `PUT` | `/api/projects/:name/claude-md` | Write project CLAUDE.md |

### Sessions

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/sessions` | Create new session (spawns tmux + Claude CLI) |
| `POST` | `/api/sessions/:id/resume` | Resume session (re-spawn tmux if needed) |
| `PUT` | `/api/sessions/:id/name` | Rename (also writes summary entry to JSONL) |
| `DELETE` | `/api/sessions/:id` | Delete session (kills tmux, deletes JSONL + DB) |
| `GET` | `/api/sessions/:id/config` | Get session config |
| `PUT` | `/api/sessions/:id/config` | Update config (name, state, model, notes) |
| `PUT` | `/api/sessions/:id/archive` | Archive/unarchive (legacy compat) |
| `GET/PUT` | `/api/sessions/:id/notes` | Session notes |
| `POST` | `/api/sessions/:id/summary` | AI-generated summary |
| `GET` | `/api/sessions/:id/tokens` | Token usage for context bar |
| `POST` | `/api/sessions/:id/smart-compact` | Trigger smart compaction |

### Tasks

| Method | Path | Purpose |
|---|---|---|
| `PUT` | `/api/tasks/:id/complete` | Mark done |
| `PUT` | `/api/tasks/:id/reopen` | Reopen |
| `DELETE` | `/api/tasks/:id` | Delete |

### Settings & Config

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/settings` | All settings with defaults |
| `PUT` | `/api/settings` | Update a setting |
| `GET` | `/api/mcp-servers` | List configured MCP servers |
| `PUT` | `/api/mcp-servers` | Update MCP server config |
| `GET/PUT` | `/api/claude-md/global` | Global CLAUDE.md |
| `GET` | `/api/auth/status` | Check OAuth credential validity |
| `POST` | `/api/auth/login` | Probe credentials |
| `GET` | `/api/keepalive/status` | Keepalive + token status |
| `PUT` | `/api/keepalive/mode` | Set keepalive mode |
| `GET` | `/api/search?q=...` | Full-text search across session JSONLs |
| `GET` | `/api/browse?path=...` | Browse filesystem directories |

### MCP Endpoints

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/mcp/tools` | List internal MCP tools |
| `POST` | `/api/mcp/call` | Execute internal MCP tool |
| `GET` | `/api/mcp/external/tools` | List all tools (internal + admin) |
| `POST` | `/api/mcp/external/call` | Execute any tool (for external consumers) |

### OpenAI-Compatible

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/v1/models` | List available models |
| `POST` | `/v1/chat/completions` | Chat completions (routes to Claude CLI) |

### Quorum

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/api/quorum/ask` | Multi-model quorum question |

### Webhooks

| Method | Path | Purpose |
|---|---|---|
| `GET` | `/api/webhooks` | List webhooks |
| `POST` | `/api/webhooks` | Add webhook |
| `PUT` | `/api/webhooks` | Replace all webhooks |
| `DELETE` | `/api/webhooks/:index` | Delete webhook by index |

---

## 7. WebSocket Protocol

**Endpoint**: `ws://{host}/ws/{tmuxSessionName}`

**Upgrade**: The server intercepts HTTP upgrade, validates the tmux session name via regex `/^\/ws\/(.+)$/`, then promotes to WebSocket.

### Connection Flow

1. Server sanitizes tmux session name (alphanumeric, `_`, `-` only)
2. Verifies tmux session exists
3. Spawns `pty.spawn('tmux', ['attach-session', '-t', tmuxSession])` with xterm-256color
4. Bidirectional bridging:
   - **Server → Client**: raw PTY output (terminal escape sequences)
   - **Client → Server**: raw keystrokes OR JSON control messages

### Control Messages (Client → Server)

| Message | Format | Purpose |
|---|---|---|
| Resize | `{"type":"resize","cols":N,"rows":N}` | Resize PTY |
| Ping | `{"type":"ping"}` | Heartbeat |
| Input | raw string | Forwarded to PTY |

### Control Messages (Server → Client)

| Message | Format | Purpose |
|---|---|---|
| Pong | `{"type":"pong"}` | Heartbeat response |
| Error | `{"type":"error","message":"..."}` | Session not found |
| Detach | ANSI escape `[Session detached]` | PTY exited |

### Lifecycle

- On connect: increments `browserCount`, notifies keepalive, cancels tmux cleanup timer
- On disconnect: decrements `browserCount`, notifies keepalive, schedules tmux cleanup (default 30 min)
- Client sends heartbeat every 30s

---

## 8. MCP Integration

Blueprint integrates with the Claude CLI MCP protocol at two levels:

### 8.1 Internal MCP Server (`mcp-server.js`)

- **Transport**: stdio (JSON-RPC over stdin/stdout)
- **Registered in**: `~/.claude/settings.json` under `mcpServers.blueprint`
- **Purpose**: Every Claude CLI session launched by Blueprint can call Blueprint tools
- **How it works**: Receives JSON-RPC, forwards to `http://localhost:3000/api/mcp/call`, returns results

**Internal tools** (14 total):
- `blueprint_search_sessions` — full-text search across JSONL sessions
- `blueprint_summarize_session` — AI summary via Claude CLI
- `blueprint_list_sessions` — list sessions with metadata
- `blueprint_get_project_notes` / `blueprint_get_session_notes` — read notes
- `blueprint_get_tasks` / `blueprint_add_task` / `blueprint_complete_task` — task management
- `blueprint_get_project_claude_md` — read CLAUDE.md
- `blueprint_read_plan` / `blueprint_update_plan` — session plan files
- `blueprint_smart_compaction` — trigger smart compaction
- `blueprint_ask_quorum` — multi-model quorum
- `blueprint_send_message` — cross-session messaging via bridge files

### 8.2 External MCP API (`mcp-external.js`)

- **Transport**: HTTP (REST)
- **Purpose**: For external consumers (e.g., Hopper, Joshua26 ecosystem)
- **Endpoints**: `/api/mcp/external/tools`, `/api/mcp/external/call`
- **Additional admin tools** (8):
  - `blueprint_create_session` / `blueprint_delete_session`
  - `blueprint_set_session_state`
  - `blueprint_get_token_usage`
  - `blueprint_set_project_notes` / `blueprint_set_project_claude_md`
  - `blueprint_list_projects`
  - `blueprint_update_settings`

### 8.3 User-Configured MCP Servers

Blueprint manages the `mcpServers` key in `~/.claude/settings.json`. Users can add/remove MCP servers through the UI's settings panel, which are then available to all Claude CLI sessions.

---

## 9. Security Model

### Trust Boundary

Blueprint operates as a **single-user, local development tool** within a Docker container. It explicitly does not implement authentication or authorization:

- No API keys or tokens on HTTP endpoints
- No CORS restrictions
- Full filesystem access within the container
- `--dangerously-skip-permissions` passed to all Claude CLI invocations

### Container Isolation

- Runs as non-root user `hopper` (entrypoint drops privileges via `gosu`)
- Docker socket mount is optional and commented out by default, with a documented warning
- `SYS_ADMIN` and `SYS_PTRACE` capabilities are **not** required (unlike some sibling containers)
- `shm_size` not explicitly set (default 64MB)

### Input Handling

- **Command execution**: Uses `execFileSync`/`execFile` with argument arrays (no shell interpolation) for `claude`, `tmux`, `git`, `grep`, `curl`
- **Tmux session names**: Sanitized to `[a-zA-Z0-9_-]` only
- **Path traversal**: Plan file paths validated with `startsWith(planBase + sep)` check in `mcp-tools.js`; quorum `read_file`/`list_files` validate `startsWith(cwd + sep)`
- **Filesystem browsing**: `/api/browse` does not filter paths (single-user assumption)
- **Session IDs**: Smart compaction validates `[a-zA-Z0-9_-]+` pattern

### OAuth Token Management

- Credentials stored in `~/.claude/.credentials.json`
- Keepalive module proactively refreshes tokens before expiry by making small Claude CLI calls
- Token refresh is scheduled at 65-85% of remaining lifetime with randomized jitter
- Auth modal in UI guides re-authentication if tokens expire

### Bridge File Cleanup

- Delivered bridge files: deleted after 5 seconds
- Undelivered bridge files: deleted after 1 hour
- Startup cleanup: removes bridge files older than 2 hours

---

## 10. Configuration

### Runtime Settings (stored in SQLite `settings` table)

| Key | Default | Description |
|---|---|---|
| `default_model` | `claude-sonnet-4-6` | Default model for new sessions |
| `thinking_level` | `none` | Thinking level (`none`, `low`, `medium`, `high`) |
| `keepalive_mode` | `always` | `always`, `browser`, `idle` |
| `keepalive_idle_minutes` | `30` | Minutes before stopping keepalive when idle |
| `tasks_enabled` | `true` | Show tasks panel |
| `theme` | `dark` | UI theme |
| `font_size` | `14` | Terminal font size |
| `font_family` | Cascadia Code | Terminal font |
| `webhooks` | `[]` | JSON array of webhook configs |
| `quorum_lead_model` | `claude-opus-4-6` | Lead model for quorum |
| `quorum_fixed_junior` | `{model:"claude-sonnet-4-6"...}` | Fixed junior config |
| `quorum_additional_juniors` | `[]` | Additional junior model configs |
| `default_project_claude_md` | `""` | Template for new project CLAUDE.md |

### Claude CLI Settings (`~/.claude/settings.json`)

Blueprint manages:
- `mcpServers.blueprint` — auto-registered stdio MCP server
- `skipDangerousModePermissionPrompt: true` — suppresses permission dialog
- Additional user-configured MCP servers

### Claude Trust Config (`~/.claude/.claude.json`)

Blueprint manages:
- `hasCompletedOnboarding: true`
- `bypassPermissionsModeAccepted: true`
- `projects[path].hasTrustDialogAccepted: true` — per-project trust

### Startup Sequence

1. `ensureSettings()` — create `settings.json` if missing
2. `registerMcpServer()` — register Blueprint MCP in settings.json
3. `trustProjectDirs()` — mark all DB projects as trusted
4. `cleanupOrphanedTmuxSessions()` — kill stale `bp_*` tmux sessions
5. `cleanupOldBridgeFiles()` — remove bridge files > 2 hours old
6. `resolveStaleNewSessions()` — map leftover `new_*` IDs to real UUIDs
7. Start HTTP server on `0.0.0.0:3000`
8. Start keepalive
9. Start compaction monitor (30s interval)
