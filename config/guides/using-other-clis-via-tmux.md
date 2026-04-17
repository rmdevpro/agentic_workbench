# Using Other CLIs via Tmux

Blueprint containers include multiple AI CLIs: Claude, Gemini, and Codex. This guide covers how to interact with them from within a Claude session.

## Why Tmux

The `--print` / `-p` / `exec` modes are limited: no MCP tool access, no multi-turn conversation, and they can hang on permission prompts. Tmux gives you a full interactive session — file access, tool use, monitoring, and follow-ups.

## Pattern: Launch, Send, Read

```bash
# Launch a CLI in a named tmux session
tmux new-session -d -s helper -x 200 -y 50
tmux send-keys -t helper "claude --model haiku --dangerously-skip-permissions" Enter

# Wait for startup, then send a prompt
sleep 5
tmux send-keys -t helper "Your question or instruction here" Enter

# Read the output (check periodically)
tmux capture-pane -t helper -p -S -30 | tail -20

# Send follow-ups
tmux send-keys -t helper "Follow-up question" Enter

# Kill when done
tmux kill-session -t helper
```

## Important: Hide Sub-Sessions

When you launch a Claude sub-session via tmux, it will appear in Blueprint's session list in the left sidebar automatically. After launching, update the sub-session to hidden status so it does not clutter the user's session list:

```
Use blueprint_set_session_config with session_id="<sub-session-id>" and state="hidden"
```

## Gemini

Requires `GOOGLE_API_KEY` — set it in Blueprint Settings > API Keys.

```bash
tmux new-session -d -s gemini -x 200 -y 50
tmux send-keys -t gemini "gemini" Enter
sleep 3
tmux send-keys -t gemini "Review server.js for potential issues" Enter
tmux capture-pane -t gemini -p -S -30 | tail -20
tmux kill-session -t gemini
```

Options:
```bash
gemini -m gemini-2.5-flash-lite -p "Quick one-shot question"
gemini --approval-mode auto_edit  # auto-approve edits
```

## Codex

Requires `OPENAI_API_KEY` — set it in Blueprint Settings > API Keys.

```bash
tmux new-session -d -s codex -x 200 -y 50
tmux send-keys -t codex "codex" Enter
sleep 3
tmux send-keys -t codex "Review server.js for potential issues" Enter
tmux capture-pane -t codex -p -S -30 | tail -20
tmux kill-session -t codex
```

Options:
```bash
codex --model gpt-5.3-codex exec "Quick one-shot question"
codex --cd /mnt/workspace/my-project exec "Explain the codebase"
```

## blueprint_ask_cli MCP Tool

For simple one-shot questions without needing file access or tools, use the MCP tool from any Claude session:

```
Use blueprint_ask_cli with cli="gemini" and prompt="Your question here"
```

This uses non-interactive mode internally. For complex questions that need file access, use tmux instead.

## blueprint_ask_quorum

Ask all configured CLIs the same question and get a multi-model consensus:

```
Use blueprint_ask_quorum with question="Your question" and project="project-name"
```

## When Non-Interactive Mode is OK

- Simple one-shot questions that don't need tools or file access
- Scripted pipelines where you just need text output
- When you explicitly don't want the CLI to use tools

## Known Limitations

- Gemini MCP tools may not work reliably in non-interactive (`-p`) mode
- Codex default sandbox is read-only — `--yolo` required for file writes (restrict writes in your prompt)
- Non-interactive modes have limited tool access across all CLIs — prefer tmux for anything complex
