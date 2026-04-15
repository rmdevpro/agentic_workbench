# Using the Codex CLI

Codex CLI (OpenAI) is available in the Blueprint container for code reviews, debugging, and consultative second opinions.

## Setup

Configure your API key in Blueprint Settings > Additional CLIs (OpenAI / Codex API Key). The key is exported as `OPENAI_API_KEY` at container startup.

## Basic Usage

### One-Shot Prompt

```bash
codex exec "Review server.js for potential issues"
```

Short form: `codex e "prompt"`

### Interactive Mode

```bash
codex "Explain this codebase"
```

### Resume a Session

```bash
codex resume --last
codex exec resume --last "Follow-up question"
```

## Common Use Cases

### Code Review
```bash
codex exec "Review quorum.js against our error handling patterns"
```

### Debugging Help
```bash
codex exec "I'm getting this error: [paste]. Look at server.js and tell me what's wrong."
```

### Second Opinion (via blueprint_ask_cli)
From any Claude session, use the MCP tool:
```
Use blueprint_ask_cli with cli="codex" and prompt="Review this approach..."
```

### Multi-Turn Consultation
```bash
codex exec "I'm stuck on the WebSocket reconnection logic. Here's the error: [paste]"
codex exec resume --last "What if the heartbeat interval is too short?"
```

## Options

```bash
# Specific model
codex --model gpt-5.3-codex exec "Review this code"

# Working directory
codex --cd /mnt/workspace/my-project exec "Explain the codebase"

# JSON output (for scripting)
codex exec --json "List all API endpoints"

# Auto-approve file writes (use carefully — restrict in your prompt)
codex exec --yolo "Do NOT modify any files. Just review server.js."
```

## File Access

Codex defaults to a read-only sandbox. Use `--yolo` to allow file writes. Always include explicit filesystem restrictions in your prompt when using `--yolo`.

## Known Limitations

- Default sandbox is read-only — `--yolo` required for file writes
- Respect the filesystem safety warning: always restrict writes in your prompt
