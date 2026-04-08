# Blueprint Session Resume

**Date:** 2026-04-08
**CWD:** `C:\Users\j\projects\blueprint`
**Repo:** `jmorrissette-RMDC/blueprint` (git@github-jm:jmorrissette-RMDC/blueprint.git)
**Deploy host:** irina (192.168.1.110)
**Deploy path:** `/mnt/storage/projects/blueprint`
**Deploy command:** `ssh aristotle9@192.168.1.110 "cd /mnt/storage/projects/blueprint && git pull && docker stop blueprint && docker rm blueprint && docker compose up -d --build"`
**Container:** `blueprint` on port 7866, uses `joshua26_workspace` and `joshua26_storage` docker volumes
**URL:** http://192.168.1.110:7866

---

## What Was Done This Session

### Issue #13 — Bash terminal tab (CLOSED)
- Added `tmuxCreateBash()` in safe-exec.js — creates bash tmux session
- Added `POST /api/terminals` endpoint in server.js
- Added `>_` button in project header bar (next to count badge)
- Terminal tabs use `t_` prefix (not `term_`) to avoid tmux name collision
- Tab close triggers tmux cleanup after 30-minute delay
- Token polling skips `t_` prefix IDs

### Repo migration — Blueprint now deploys from its own repo
- Cloned `jmorrissette-RMDC/blueprint` on irina at `/mnt/storage/projects/blueprint`
- Fixed Dockerfile: `COPY` paths no longer reference `hopper-ui/` subdirectory
- Fixed docker-compose.yml: correct config with `joshua26_workspace` and `joshua26_storage` volumes
- Added `.dockerignore`
- **OLD:** `rmdevpro/hopper-eval` with `docker-compose.blueprint.yml` — DO NOT USE

### UI polish
- Moved "+ New Session" to compact `+` icon in project header bar
- Project header now shows: `PROJECT_NAME count + >_`

### Dockerfile: sudo for hopper
- Added `sudo` package and `hopper ALL=(ALL) NOPASSWD:ALL` to sudoers
- CLI sessions can now `sudo apt-get install`, configure SSH keys, etc.

### Ported from hopper-eval (were missing in blueprint repo)
- Fix #12: tmux mouse scrolling + history-limit 10000
- MCP server global registration in entrypoint.sh

### MCP servers added to container
- Blueprint MCP server registered globally via entrypoint.sh
- Malory and Hymie added manually via terminal: `claude mcp add --transport http --scope user malory http://192.168.1.120:9222/mcp` and `claude mcp add --transport http --scope user hymie http://192.168.1.130:9223/mcp`
- Note: Malory/Hymie are manual — they'll be lost on container rebuild. Should be added to entrypoint.sh.

---

## Open Issues — jmorrissette-RMDC/blueprint

| # | Title | Notes |
|---|-------|-------|
| 1 | Test OAuth flow end-to-end with Hymie | |
| 2 | Status bar tests — need real verification | |
| 3 | Add Hymie-based tests for popups, modals, auth | |
| 11 | Smart compaction: checker accepts too quickly | Also #127 on hopper-eval |

## Open Issues — rmdevpro/hopper-eval (may need migration)

| # | Title | Notes |
|---|-------|-------|
| 114 | Expose Ask Quorum as MCP tool | |
| 115 | Expose Smart Compaction as MCP tool | |
| 116 | Expose Inter-session Messages as MCP tool | |
| 117 | Expose Token Usage as MCP tool | |
| 118 | Expose Session Config (set) as MCP tool | |
| 119 | Expose Task reopen/delete as MCP tools | |
| 120 | Expose Project/Session Notes (write) as MCP tool | |
| 127 | Smart compaction: checker accepts too quickly | Duplicate of blueprint #11 |

---

## Pending Work (not started)

1. **Smart compaction smoke test** — `_runSmartCompaction()` was rewritten last session to follow `compaction-prep.md` exactly. Never tested end-to-end. Must read the FULL A-B conversation at every step.
2. **Add Malory/Hymie MCP to entrypoint.sh** — currently manual, lost on rebuild
3. **Migrate hopper-eval issues #114-#120** to jmorrissette-RMDC/blueprint
4. **Push hopper-eval compaction code changes** to blueprint repo (server.js `_runSmartCompaction` rewrite, safe-exec.js paste-buffer fixes, JSONL reader, etc. — many commits from the previous session that only exist in hopper-eval)
5. **SSH key setup** — container needs SSH keys to access irina/m5/hymie hosts

---

## Key Files

- `server.js` — main server, session management, `_runSmartCompaction()`
- `safe-exec.js` — tmux helpers (`tmuxCreateClaude`, `tmuxCreateBash`, `tmuxSendKeys`)
- `public/index.html` — single-page UI
- `config.js` — config loader with hot-reload
- `config/defaults.json` — externalized parameters
- `config/prompts/compaction-prep.md` — THE authoritative guide for Session B (process checker)
- `config/prompts/compaction-prep-to-agent.md` — prep prompt sent to Session A
- `config/prompts/compaction-resume.md` — recovery prompt sent to A after compaction
- `mcp-tools.js` — 20 MCP tools exposed to CLI sessions
- `mcp-server.js` — stdio MCP server registered globally
- `entrypoint.sh` — container startup, MCP registration
- `Dockerfile` — container build
- `docker-compose.yml` — deploy config with joshua26 volumes

## Critical Memories

- **Blueprint repo is jmorrissette-RMDC/blueprint** — NOT hopper-eval
- **Deploy with `docker compose up -d --build`** from `/mnt/storage/projects/blueprint` on irina
- **Container name is `blueprint`** — NOT `hopper-eval-hopper-ui`
- **compaction-prep.md is the guiding light** — every Blueprint message must match it exactly
- **Follow SDLC guides** — PROC-01 for bugs, PROC-02 for features
- **Use Malory for ALL verification** — never ask user to check their browser
