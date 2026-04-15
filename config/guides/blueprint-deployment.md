# Blueprint Deployment Guide

How to deploy Blueprint containers for testing without disrupting production or other test instances.

## Infrastructure

- **irina** (192.168.1.110): Storage leader, ZFS, NFS server. Production Blueprint runs here.
- **M5** (192.168.1.120): Compute node, 256GB RAM. Test deployments go here.
- **SSH access**: `ssh aristotle9@192.168.1.120` — key-based auth, no password needed, user is in docker group.

## Test Deployment Steps

### 1. Push your branch
```bash
git push -u origin feature/your-branch
```

### 2. Clone on M5
```bash
ssh aristotle9@192.168.1.120 "mkdir -p /home/aristotle9/blueprint-YOUR-NAME && cd /home/aristotle9/blueprint-YOUR-NAME && git clone --branch feature/your-branch --single-branch https://github.com/rmdevpro/blueprint.git ."
```

Use a unique directory name so you don't collide with other test deployments (e.g. `blueprint-easy-fixes`, `blueprint-refactor`).

### 3. Create a test compose file

Do NOT use the default `docker-compose.yml` — it references production volumes. Create `docker-compose.test.yml` with:

- **Unique container name** (e.g. `blueprint-your-name`)
- **Unique port** — check what's in use first: `ssh aristotle9@192.168.1.120 "docker ps --format '{{.Ports}}' | grep -o '0.0.0.0:[0-9]*' | sort"`
  - Production: 7866
  - Existing tests may use: 7867, 7868
  - Pick the next available
- **Fresh named volumes** — never use production volumes (`joshua26_workspace`, `joshua26_storage`)

Example:
```yaml
services:
  blueprint:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: blueprint-your-name
    ports:
      - "7868:3000"
    volumes:
      - your_name_workspace:/mnt/workspace
      - your_name_storage:/mnt/storage
    environment:
      - CLAUDE_HOME=/mnt/workspace/blueprint/.claude
      - CLAUDE_CONFIG_DIR=/mnt/workspace/blueprint/.claude
      - BLUEPRINT_DATA=/mnt/workspace/blueprint/data
      - HOME=/home/hopper
      - MAX_TMUX_SESSIONS=50
    restart: unless-stopped

volumes:
  your_name_workspace:
  your_name_storage:
```

### 4. Build and deploy
```bash
ssh aristotle9@192.168.1.120 "cd /home/aristotle9/blueprint-YOUR-NAME && docker compose -f docker-compose.test.yml build && docker compose -f docker-compose.test.yml up -d"
```

### 5. Inject Claude credentials

The container needs Claude OAuth credentials to run CLI sessions. Copy from the current production container:

```bash
cat /workspace/blueprint/.claude/.credentials.json | ssh aristotle9@192.168.1.120 "docker exec -i blueprint-your-name sh -c 'mkdir -p /mnt/workspace/blueprint/.claude && cat > /mnt/workspace/blueprint/.claude/.credentials.json'"
```

### 6. Verify
```bash
# Check logs
ssh aristotle9@192.168.1.120 "docker logs blueprint-your-name 2>&1 | tail -10"

# Check API
curl -s http://192.168.1.120:PORT/api/state | python3 -c "import json,sys; d=json.load(sys.stdin); print('workspace:', d['workspace'], '| projects:', len(d['projects']))"

# Check mounts
curl -s http://192.168.1.120:PORT/api/mounts
```

## Update an existing test deployment

```bash
ssh aristotle9@192.168.1.120 "cd /home/aristotle9/blueprint-YOUR-NAME && git pull && docker compose -f docker-compose.test.yml build && docker compose -f docker-compose.test.yml up -d"
```

Note: credentials persist in the volume — no need to re-inject after rebuild unless you wipe volumes with `-v`.

## Wipe and start fresh

```bash
ssh aristotle9@192.168.1.120 "cd /home/aristotle9/blueprint-YOUR-NAME && docker compose -f docker-compose.test.yml down -v"
```

The `-v` flag deletes the named volumes. You'll need to re-inject credentials after.

## Testing with Malory

Malory (headless Playwright MCP) can test the UI but has a known issue: if multiple Blueprint instances are running on the same host, Malory's browser context may redirect between ports. Workaround: stop other instances during UI testing, or use curl for API tests.

API testing pattern:
```bash
BASE=http://192.168.1.120:PORT
curl -s $BASE/api/state
curl -s -X POST $BASE/api/mkdir -H 'Content-Type: application/json' -d '{"path":"/mnt/workspace/test"}'
```

## Cleanup

When done testing, stop and remove the container and volumes:
```bash
ssh aristotle9@192.168.1.120 "cd /home/aristotle9/blueprint-YOUR-NAME && docker compose -f docker-compose.test.yml down -v && cd / && rm -rf /home/aristotle9/blueprint-YOUR-NAME"
```
