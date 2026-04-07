# Blueprint

Web-based CLI workbench for AI coding agents. Wraps Claude Code CLI in a browser-accessible terminal with session management, collaboration tools, and integration APIs.

## Features

- **Tabbed multi-terminal** — xterm.js terminals with tmux persistence. Sessions survive browser disconnects and container restarts.
- **Session management** — Create, resume, rename, delete, archive, hide. Search across sessions. AI-powered session summaries.
- **Smart compaction** — Graduated context usage warnings (65/75/85%) with automatic compaction at 90%. Updates plan files and recovers context after compaction.
- **Collaboration** — Project notes, shared task lists, inter-session messaging via file bridge, project CLAUDE.md editing.
- **Quorum** — Multi-model review: configurable junior models (API-based ReAct agents with file read/search/web tools) + lead synthesis via Claude CLI.
- **OAuth keepalive** — Percentage-based token refresh scheduling. Tokens stay warm without manual intervention.
- **Integration APIs** — OpenAI-compatible chat endpoint, external MCP server (18 tools), outbound webhooks.
- **Settings** — Model, thinking level, appearance (dark/light theme, fonts), MCP servers, system prompts.

## Quick Start

```bash
docker build -t blueprint .
docker run -d \
  -p 3000:3000 \
  -v ~/.claude:/home/blueprint/.claude \
  -v /path/to/your/projects:/workspace \
  blueprint
```

Open `http://localhost:3000` in your browser. No authentication required for the UI.

### First Run

1. Open any session — if Claude Code is not authenticated, a banner will prompt you to run `/login`
2. Authenticate once — all sessions share the same credentials
3. The OAuth keepalive will keep tokens fresh automatically

## Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `PORT` | `3000` | Server port |
| `WORKSPACE` | `/workspace` | Directory containing project directories |
| `CLAUDE_HOME` | `/home/blueprint/.claude` | Claude Code config directory |
| `BLUEPRINT_DATA` | `/home/blueprint/.blueprint` | SQLite database directory |
| `KEEPALIVE_MODE` | `always` | Token keepalive: `always`, `browser`, `idle` |
| `KEEPALIVE_IDLE_MINUTES` | `30` | Idle timeout when mode is `idle` |

### Settings UI

Access settings via the gear icon in the sidebar:

- **Appearance** — Dark/light theme, terminal font size and family
- **Claude Code** — Default model, thinking level
- **Keepalive** — Mode and idle timeout
- **Quorum** — Lead model, fixed junior, additional junior models
- **MCP Servers** — Add/remove MCP servers for Claude Code
- **System Prompts** — Global CLAUDE.md and default project template

## API

### OpenAI-Compatible Chat

```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model": "claude-sonnet-4-6", "messages": [{"role": "user", "content": "hello"}]}'
```

Route to an existing session:
```bash
curl -X POST http://localhost:3000/v1/chat/completions \
  -d '{"model": "bp:SESSION_UUID", "messages": [{"role": "user", "content": "what are you working on?"}]}'
```

### MCP Tools

- **Internal** (14 tools, available to CLI sessions via stdio MCP server): search, summarize, list sessions, notes, tasks, CLAUDE.md, messaging, plan files, smart compaction, quorum
- **External** (18 tools, available via HTTP): all internal tools + session CRUD, settings, token usage

Tool discovery: `GET /api/mcp/external/tools`
Tool execution: `POST /api/mcp/external/call`

### Webhooks

```bash
# Add a webhook
curl -X POST http://localhost:3000/api/webhooks \
  -H "Content-Type: application/json" \
  -d '{"url": "http://your-server/hook", "events": ["session_created", "message_sent"], "mode": "full_content"}'
```

Events: `session_created`, `message_sent`, `task_added`, `task_completed`, `session_state_changed`

## Architecture

```
Browser (xterm.js) <--WebSocket--> Blueprint Server (Express + node-pty) <--PTY--> tmux <--> Claude CLI
                                        |
                                   SQLite (sessions, tasks, notes, settings)
                                        |
                                   MCP Server (stdio, for CLI sessions)
```

## License

MIT
