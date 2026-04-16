---
title: Blueprint
emoji: 🔧
colorFrom: blue
colorTo: purple
sdk: docker
app_port: 7860
fullWidth: true
---

# Blueprint

Web-based CLI workbench for AI coding agents. Manage Claude Code sessions, projects, and tasks from your browser.

## Quick Start

1. Click **Duplicate this Space** to create your own copy
2. Make your Space **private**
3. Add your `ANTHROPIC_API_KEY` as a Space Secret
4. Your instance is ready

## Security

Blueprint auto-detects whether it's running on a public or private HF Space:

- **Public Space** — all access is blocked with a landing page. No credentials can be entered or stored.
- **Private Space** — full access. Optionally set `BLUEPRINT_USER` and `BLUEPRINT_PASS` as Space Secrets to add password protection.
- **Self-hosted** (docker-compose) — full access, no auth gate.

## Notes

- Free Spaces sleep after ~15 min of inactivity — tmux sessions will be lost on wake
- No Docker-in-Docker support (container build features are disabled)
