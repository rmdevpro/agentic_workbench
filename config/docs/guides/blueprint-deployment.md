# Blueprint Deployment Guide

## Architecture

Blueprint is a single container application. All persistent data lives under one mount point: `/data` inside the container. This includes the database, Claude session files, workspace projects, configuration, and Qdrant vector data.

The container image is identical for all deployment targets. The only thing that changes is where `/data` comes from.

## Deployment Targets

### Hugging Face Spaces

HF provides a persistent volume at `/data`. The HF runtime mounts it automatically when persistent storage is enabled in the Space settings.

No compose file needed — HF builds from `Dockerfile.huggingface` and `README.huggingface.md` provides the Space configuration.

### Local / Docker Compose (Joshua26 ecosystem)

On Joshua26 hosts, Blueprint's data lives at `/mnt/workspace/blueprint/` per ERQ-005 §3. The compose file bind-mounts this to `/data` inside the container:

```yaml
services:
  blueprint:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: blueprint
    ports:
      - "6342:3000"
    volumes:
      - /mnt/workspace/blueprint:/data
    restart: unless-stopped
```

Before first deployment, create the host directory:
```bash
sudo mkdir -p /mnt/workspace/blueprint
sudo chown 1000:2001 /mnt/workspace/blueprint
```

### Standalone (any machine)

On any machine with Docker, pick a host path for data persistence:

```yaml
services:
  blueprint:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "3000:3000"
    volumes:
      - /path/to/blueprint-data:/data
    restart: unless-stopped
```

## What's Inside `/data`

The entrypoint sets up the following structure under `/data`:

```
/data/
  blueprint.db          — SQLite database (projects, sessions, tasks, settings)
  .claude/              — Claude CLI config, session JSONLs, MCP registrations
  workspace/            — Project directories
  qdrant/               — Vector search data
```

## Authentication

On first start, Claude CLI has no credentials. To authenticate:

1. Create a project and Claude session in the UI
2. Claude will show "Not logged in · Please run /login"
3. Type `/login` in the terminal
4. Complete the OAuth flow in the browser
5. Auth persists in `/data/.claude/` — survives container rebuilds

Alternatively, copy credentials from an already-authenticated machine (with permission).

## Optional: Shared Storage

To expose NFS or other shared storage in Blueprint's file browser and project picker, mount it under `/mnt` inside the container:

```yaml
volumes:
  - /mnt/workspace/blueprint:/data
  - /mnt/storage:/mnt/storage:ro
```

This is additive — Blueprint works without it. The `/api/mounts` endpoint automatically discovers directories under `/mnt`.
