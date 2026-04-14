# Using the Gemini CLI

Gemini CLI is available in the Blueprint container for code reviews, architectural critiques, and second opinions.

## Setup

Configure your API key in Blueprint Settings > Additional CLIs. The key is exported as `GOOGLE_API_KEY` at container startup.

## Basic Usage

### One-Shot Prompt

```bash
gemini -p "Review server.js for potential issues"
```

### Interactive Mode

```bash
gemini
```

Start from your project directory so Gemini has file access to the codebase.

### Resume a Session

```bash
gemini --list-sessions
gemini -r latest
gemini -r 3          # resume by index
```

## Common Use Cases

### Code Review
```bash
gemini -p "Review quorum.js for error handling gaps"
```

### Architecture Critique
```bash
gemini -p "I'm planning to add WebSocket multiplexing to the session manager. Review server.js and tell me if this is sound."
```

### Second Opinion (via blueprint_ask_cli)
From any Claude session, use the MCP tool:
```
Use blueprint_ask_cli with cli="gemini" and prompt="Review this approach..."
```

## Options

```bash
# Specific model
gemini -m gemini-2.5-flash-lite -p "Quick review"

# Auto-approve edits
gemini --approval-mode auto_edit

# YOLO mode (auto-approve everything — restrict in your prompt)
gemini -y -p "Do NOT modify any files. Just review server.js."

# JSON output
gemini -o json -p "List all API endpoints"
```

## File Access

Gemini can read files in the current working directory tree. It cannot access files outside CWD. To share external files, copy them into the project first.

## Known Limitations

- MCP tools may not work reliably in non-interactive (`-p`) mode — the CLI doesn't always complete the ReAct loop
- Shell commands (`run_shell_command`) are not available to subagents in non-interactive mode
- Use interactive mode for workflows that need shell access or MCP tools
