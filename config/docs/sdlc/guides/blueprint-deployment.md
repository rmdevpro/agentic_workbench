# Workbench Deployment Notes

This guide covers **workbench-specific** deployment behavior — what's inside the container, how the dev/prod indicator works, what `/data` looks like, how to install add-ons, how to authenticate.

**Host-level deployment procedure** (which host runs what, how images get built and registered, how compose files merge, how to set up a new bare-metal host) is **not** documented here. It lives in the **Admin** repo:

- `Admin/docs/infrastructure/INF-001-bare-metal-configuration.md` — host inventory, base config
- `Admin/docs/infrastructure/INF-002-storage-conventions.md` — `/srv/<service>/` and `/mnt/storage/<purpose>/` rules
- `Admin/docs/infrastructure/INF-003-container-deployment.md` — registry, compose-override pattern, dev-vs-prod
- `Admin/docs/runbooks/RUN-001-deployment.md` — step-by-step deploy procedure (build → push → pull → up)
- `Admin/docs/runbooks/RUN-002-host-setup.md` — bringing a new host to standard

Per-host compose overrides for the workbench live at `Admin/compose/<host>/workbench/docker-compose.override.yml`.

---

## Architecture

The workbench is a single-container application. All persistent state lives under one mount point: `/data` inside the container. The container image is identical for all deployment targets — the only thing that varies is the value of the `logo_variant` setting in the container's DB.

## Dev/Prod Indicator

**Principle**: dev vs prod is **solely the DB-stored `logo_variant` setting**. Never baked into folder names, image names, container names, env vars, Dockerfiles, or any other physical artifact.

| `logo_variant` value | Logo rendered | Intended use |
|---|---|---|
| `production` | red "Pro" lockup | live/production hosts |
| `development` | green "Dev" lockup | dev/test hosts |
| `default` | canonical blue lockup | public/shared deployments (e.g., HF Space) |

See `README.md` → "Logo Variant" for the underlying mechanism. The setting is swapped via `PUT /api/settings` or directly in SQLite; there is intentionally no UI.

## What's Inside `/data`

The entrypoint sets up the following structure under `/data`:

```
/data/
  .blueprint/           — SQLite database (blueprint.db), Qdrant vector data
  .claude/              — Claude CLI config, session JSONLs, MCP registrations
  .codex/               — Codex CLI config, session history
  .gemini/              — Gemini CLI config, session history
  .local/               — Persistent user-installed packages (see below)
  .ssh/                 — SSH keys and config for remote host access
  workspace/            — Project directories (docs, repos, etc.)
```

The host-side path that backs `/data` is determined by the per-host compose override (Admin repo). The container does not care.

## Installing Persistent Add-ons

The workbench supports installing additional tools that survive container rebuilds. Anything installed to `/data/.local/` persists on the volume. The entrypoint adds `/data/.local/bin` to `PATH` and `/data/.local/lib/node_modules` to `NODE_PATH` automatically.

### npm packages (e.g. Playwright MCP)

```bash
npm install --prefix /data/.local @playwright/mcp
npx playwright install chrome
```

The npm package installs to `/data/.local/node_modules/` and Chrome installs to `/data/.cache/ms-playwright/` — both on the persistent volume. After a container rebuild, they're still there.

### System packages (apt)

System packages installed via `apt-get` do **not** persist — they live in the container filesystem. For system-level tools that must always be present, add them to the `Dockerfile`. For tools needed only on a specific host, add them via the host's compose override (Admin repo).

### Registering MCP servers

After installing an MCP package, register it with Claude:

```bash
claude mcp add-json --scope user playwright '{"command":"npx","args":["-y","@playwright/mcp","--headless"]}'
```

This registration persists in `/data/.claude/` — no re-registration needed after rebuild.

## Authentication

On first start, Claude CLI has no credentials. To authenticate:

1. Create a project and Claude session in the UI
2. Claude will show "Not logged in · Please run /login"
3. Type `/login` in the terminal
4. Complete the OAuth flow in the browser
5. Auth persists in `/data/.claude/` — survives container rebuilds

Alternatively, copy credentials from an already-authenticated machine (with permission). For dev hosts that mirror prod data, credentials come along automatically with the data migration.

## Hugging Face Spaces

The workbench is also deployable as a Hugging Face Space. HF provides a persistent volume at `/data` automatically when persistent storage is enabled in the Space settings. HF builds the same `Dockerfile` as every other host; Space configuration lives in `README.huggingface.md`. The Space's logo_variant is typically left at `default`.

HF Space deployment doesn't go through the Admin-repo compose-override pipeline — it's a separate mechanism owned by the HF Spaces runtime.

## Seeding a Dev Host from Prod Data

Per Admin/RUN-001 §111-114, **data migration between hosts is a per-service concern**. For the workbench specifically, dev hosts are most useful when they run against a recent snapshot of prod's `/data`, so testing happens on real content rather than an empty database.

Procedure (on the dev host, with the dev container stopped):

```bash
rsync -aHAX --delete \
  --exclude='.blueprint/qdrant/.lock' \
  --exclude='*.wal' --exclude='*.shm' \
  <produser>@<prodhost>:/srv/workbench/ \
  /srv/workbench/

sudo chown -R 1000:2001 /srv/workbench

# Re-assert dev-mode logo after the rsync (which overwrote the setting):
sqlite3 /srv/workbench/.blueprint/blueprint.db \
  "INSERT OR REPLACE INTO settings(key, value) VALUES ('logo_variant', '\"development\"');"

# Start the dev container via the normal Admin-repo compose procedure
# (see Admin/RUN-001). Do NOT rebuild locally — pull the registry image.
```

The excludes cover files typically open on a live prod container (Qdrant lock, SQLite WAL/SHM). If a corrupted DB shows up at validation time, stop the prod container briefly and repeat the rsync for a clean snapshot.

Dev's `/data` will drift between rsyncs as the tester creates projects, writes files, accumulates junk — that drift is intentional. Re-run this procedure whenever you want a fresh snapshot. Not automatic; not tied to the deploy pipeline.

Credentials (Claude OAuth, API keys in settings DB) come along with the rsync, so the dev container is authenticated the moment it starts.

## Workspace Conventions

### Testing project

When using the workbench as a dev environment, designate one workspace directory (e.g., `/data/workspace/testing/`) as the scratch project. Throwaway experiments go there and get periodically cleaned, so dev experimentation doesn't pollute the rest of the workspace.

### Self-reference

A user inside the container may at some point clone the workbench's own repo into `/data/workspace/repos/agentic_workbench/` to work on it. **This is unrelated to the deploy process** — the deploy never reads from `/data/...` to build images. Treat that path purely as a user workspace clone.
