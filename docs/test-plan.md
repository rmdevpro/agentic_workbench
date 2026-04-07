# Blueprint Test Plan

**Version:** 1.1
**Date:** 2026-03-31
**Status:** Active
**Discovery:** Multi-model audit by Claude (Sonnet 4.6), Gemini (2.5 Pro), Codex (GPT-5.3)
**Master List:** `docs/master-capability-list.md` (266 capabilities)

---

## 1. Discovery Phase Summary

### First Audit — Codebase Capability Discovery (2026-03-28)

Three independent CLIs audited the full Blueprint codebase (4,976 lines across 10 source files). Results:
- Gemini: 98 capabilities
- Codex: 258 capabilities (very granular error paths)
- Claude: 258 capabilities (structured by category)

Aggregated master list: **266 distinct testable capabilities** across API (51), WebSocket (9), MCP (31), UI (48), DB (32), Config (28), Error paths (65).

### Second Audit — UI Interaction Coverage (2026-03-31)

Three independent CLIs audited `public/index.html` (1,934 lines) and `server.js` (1,293 lines) for browser-level test scenarios. Results:

| Auditor | File | Focus |
|---------|------|-------|
| Claude (Opus 4.6) | `docs/ui-audit-claude.md` | Gap analysis + full interaction inventory by component (34 sections) |
| Gemini CLI | `docs/ui-audit-gemini.md` | Interaction matrix, input validation, state management, accessibility |
| Codex (GPT-5.3) | `docs/ui-audit-codex.md` | Every clickable element + edge cases, stress tests, recovery, persistence |

Combined these three audits produce **568 UI test scenarios** covering all 48 UI capabilities plus cross-cutting concerns (race conditions, reconnection, accessibility, security sanitization). Phase H has been expanded to reference these scenarios — see section 6.

---

## 2. Engineering Requirements Gate

**Gate status: NOT PASSED** — backend tests pass but UI testing (Phases H, K) is incomplete.

Blueprint is a UI application. Backend tests verify plumbing; UI tests verify the product works. The gate does not pass until ALL phases pass, with Phases H and K as the primary acceptance criteria.

### Backend (prerequisite)
- [x] Mock tests pass — **140/140** (Phases: auth, DB, keepalive, MCP protocol, OpenAI, quorum, session parsing, token usage, webhooks)
- [x] Live API tests pass — **175/179** (Phases A–J + K: infrastructure, sessions, collaboration, MCP tools, integration, WebSocket, projects, adversarial, session lifecycle, extended, slash commands)
- [x] Phase K slash command tests — **11/16** implemented (5 missing: /model switch, /logout, /memory, reconnect, smart-compact)
- [x] No hardcoded credentials in source
- [ ] All dependencies pinned to exact versions in package.json
- [ ] Code formatting verified (no linter configured yet — needs ESLint or similar)
- [ ] No lint errors in source

### UI (the actual gate)
- [x] **Phase H: UI browser tests pass** — 452/460 passing (98.3%)
- [ ] **Phase K: CLI slash commands** — 11/16 implemented, 5 missing
- [ ] **Phase I (real-world): 3 apps built through the GUI** — proves end-to-end usability

Phase H and K are not optional. They are the tests that prove Blueprint works for a user. If the UI breaks — sessions don't open, status bar is wrong, modals don't close, scrolling fails — the product is broken regardless of how many API tests pass.

---

## 3. Test Strategy: Two Layers

### Mock Tests (Unit)
Test logic with mocked dependencies. Run anywhere, no infrastructure.

**What to mock:** SQLite database, filesystem operations, `execSync` calls to Claude CLI and tmux, HTTP fetch calls.

**What to test:**
- JSONL parsing logic (session metadata extraction, token counting)
- Database operations (all CRUD, migrations, settings)
- Auth status checking logic (credential parsing, expiry detection)
- Keepalive scheduling math (percentage-based intervals)
- Webhook dispatch logic (event filtering, payload modes)
- OpenAI response formatting
- Bridge file naming and cleanup scheduling
- Quorum tool implementations (read_file path traversal guard, etc.)
- MCP protocol message handling
- Input validation on all API endpoints

### Live Tests (Integration)
Test against a deployed Blueprint instance. Exercise the full stack.

**What "deployed" means:** Container running Blueprint on `G:\workspace` (Linux host via WSL2/Docker) with:
- Real Claude CLI with valid OAuth credentials
- At least one project directory mounted
- SQLite database
- tmux available

**Deployment note:** Tests were migrated from Windows Docker Desktop to `G:\workspace` on the Linux host. Windows Docker Desktop had volume mount issues that prevented live tests from running. All live phases (A–J) now run against the `G:\workspace`-based deployment. See section 13 for details.

**Test phases (ordered by dependency):**

| Phase | Name | Depends On | What It Tests |
|-------|------|------------|---------------|
| A | Infrastructure | Nothing | Server starts, health, auth status, static files served |
| B | Sessions | Phase A | Create, resume, list, rename, delete, archive, hide |
| C | Collaboration | Phase B | Notes, tasks, messages, CLAUDE.md, plan files |
| D | MCP Tools | Phase B | All 14 internal + 8 external MCP tools |
| E | Integration | Phase B | OpenAI endpoint, token usage, smart compaction, quorum |
| F | Terminal | Phase A | WebSocket PTY connection, input/output, resize, reconnect |
| G | Smart Features | Phase B | Token counting, smart compaction, keepalive, session search, summary |
| H | UI | Phase A | Browser-based testing (568 scenarios from three CLI audits) |
| I | Session Lifecycle | Phase A | Instant create, UUID resolution, JSONL polling, name survival |
| J | Browse & Admin | Phase B | Filesystem browse, project remove, config, auth, external MCP |
| K | CLI Slash Commands | Phase F | All slash commands through Blueprint terminal |
| L | Context Stress | Phase K | Progressive context fill, smart compaction, 3 full cycles |

---

## 4. Test Infrastructure

### 4.1 Full Suite Starts From Zero

The complete test suite MUST begin by tearing down the container and rebuilding it. Running tests against a container that has been up with accumulated state misses ephemerality bugs — the exact class of bugs that keep breaking Blueprint (onboarding re-triggering, permissions wrong on fresh mount, symlinks stale, DB migrations failing on fresh volumes, session resolution state lost on restart).

**Test suite startup sequence:**
1. `docker compose down` — stop and remove container
2. `docker compose build` — rebuild image from source
3. `docker compose up -d` — start fresh container
4. Wait for health check (`/api/state` returns 200)
5. Run mock tests (inside container)
6. Run live tests (against fresh container)
7. Run UI tests (Malory against fresh container)

This ensures every test run verifies the full lifecycle: image build → container startup → entrypoint → server init → feature use.

### 4.2 Isolation Strategy
- Container name: `blueprint` on port 7866
- Workspace volume: `G:\workspace\blueprint\` with `data/`, `.claude/`, `projects/`
- NFS volume from irina for `/storage`
- Uses the same Dockerfile as production
- Tests run inside the container (mock) and against it (live, UI)

### 4.3 Configuration
- Claude model: uses whatever model the CLI defaults to (Sonnet 4.6)
- OAuth credentials: must be valid in `/workspace/.claude/.credentials.json`
- Keepalive: starts in `browser` mode (stops when no browsers connected)
- Quorum: use Haiku for all models during tests (cheapest)

### 4.4 Data Loading
- At least one project must be registered in the DB (entrypoint adds projects from `/workspace/projects/`)
- Session fixture checks if test data exists before loading
- Stale `new_*` sessions cleaned on startup automatically

### 4.5 Stack Lifecycle
- Full suite: tear down + rebuild + fresh start (section 4.1)
- Iteration during development: leave container running, re-run specific test phases
- `--fresh` flag to force fresh deployment even in dev iteration mode

---

## 5. Coverage Targets

### 5.1 By Layer
Every item in the master capability list (266) must reach REAL or MOCK coverage. Target: zero NONE.

**Current state (2026-03-31):** 149 covered (56%), 117 at NONE.

| Status | Count |
|--------|-------|
| BOTH | 11 |
| REAL | 93 |
| MOCK | 45 |
| NONE | 117 |
| **Total** | **266** |

Primary NONE gap: UI features 92–141 (all 48 require browser automation), DB migrations 144–148, most Config entries, and untested 500-level error paths.

### 5.2 By Type
| Type | Total | Mock | Live | Notes |
|------|-------|------|------|-------|
| API endpoints | 51 | Input validation, response format | Full request/response | All endpoints tested both ways |
| WebSocket | 9 | Protocol messages | PTY connection, I/O | Live only for real terminal |
| MCP tools | 31 | Input/output format | Full tool execution | Live for tools that call Claude CLI |
| UI features | 48 | — | Malory browser tests (568 scenarios) | Live only |
| DB operations | 32 | All CRUD | Verify via direct DB query | Mock for logic, live for integration |
| Config | 28 | Default parsing | Applied behavior | Both |
| Error paths | 65 | All validation | Key server errors | Mostly mock |

---

## 6. Test Cases by Component

### Phase A: Infrastructure

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| A01 | Server starts | Live | Deploy container | HTTP 200 on GET / | Response status |
| A02 | Static files served | Live | GET /lib/xterm/lib/xterm.js | 200 with JS content | Content-Type header |
| A03 | Auth status — valid | Live | Valid credentials | `{valid: true}` | JSON response |
| A04 | Auth status — missing | Live | No credentials file | `{valid: false, reason: 'no_credentials_file'}` | JSON response |
| A05 | Settings defaults | Live | Fresh DB | All defaults present | JSON response fields |
| A06 | Workspace trust | Live | After startup | .claude.json has trust entries for workspace dirs | File content |
| A07 | MCP tools list | Live | GET /api/mcp/tools | All internal tools listed | Count |
| A08 | External MCP tools list | Live | GET /api/mcp/external/tools | All tools listed | Count |
| A09 | Models list | Live | GET /v1/models | Claude models in OpenAI format | JSON structure |
| A10 | Keepalive status | Live | GET /api/keepalive/status | Mode and state returned | JSON response |

### Phase B: Sessions

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| B01 | Create session | Live | POST /api/sessions {project} | tmux session created, session ID returned | tmux list-sessions |
| B02 | List sessions | Live | GET /api/state after B01 | Session appears in project list | JSON response |
| B03 | Resume session | Live | POST /api/sessions/:id/resume | tmux session exists or created | tmux has-session |
| B04 | Rename session | Live | PUT /api/sessions/:id/name | Name updated in DB | GET config confirms |
| B05 | Delete session | Live | DELETE /api/sessions/:id | tmux killed, JSONL deleted, DB row gone | All three verified |
| B06 | Archive session | Live | PUT config {state:'archived'} | Session hidden from active filter | GET /api/state filter |
| B07 | Hide session | Live | PUT config {state:'hidden'} | Session hidden from all+active | GET /api/state filter |
| B08 | Session config full | Live | PUT config with all fields | All fields persisted | GET config |
| B09 | Create — missing project | Mock | POST /api/sessions {} | 400 error | Response status |
| B10 | Delete — missing project | Mock | DELETE /api/sessions/:id {} | 400 error | Response status |

### Phase C: Collaboration

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| C01 | Write project notes | Live | PUT /api/projects/:name/notes | Notes persisted | GET notes confirms |
| C02 | Write session notes | Live | PUT /api/sessions/:id/notes | Notes persisted | GET notes confirms |
| C03 | Add task | Live | POST /api/projects/:name/tasks | Task in DB | GET tasks confirms |
| C04 | Complete task | Live | PUT /api/tasks/:id/complete | Status = done, completed_at set | GET tasks |
| C05 | Reopen task | Live | PUT /api/tasks/:id/reopen | Status = todo, completed_at null | GET tasks |
| C06 | Delete task | Live | DELETE /api/tasks/:id | Task gone | GET tasks count |
| C07 | Send message | Live | POST /api/projects/:name/messages | Message in DB | GET messages |
| C08 | Read project CLAUDE.md | Live | GET /api/projects/:name/claude-md | File content | Compare with disk |
| C09 | Write project CLAUDE.md | Live | PUT /api/projects/:name/claude-md | Written to disk | Read file |
| C10 | Read/write global CLAUDE.md | Live | GET/PUT /api/claude-md/global | Persisted to ~/.claude/CLAUDE.md | File content |
| C11 | Read plan file | Live | Create plan then read | Content matches | MCP tool |
| C12 | Update plan file | Live | Write then read | Content matches | File on disk |
| C13 | Default template applied | Live | New project without CLAUDE.md | Template content written | GET claude-md |
| C14 | MCP servers read | Live | GET /api/mcp-servers | mcpServers from settings.json | JSON response |
| C15 | MCP servers write | Live | PUT /api/mcp-servers | Written to settings.json | GET confirms |
| C16 | Keepalive mode change | Live | PUT /api/keepalive/mode {mode:'idle'} | Mode updated | GET status confirms |
| C17 | Webhook list | Live | GET /api/webhooks | Array returned | JSON response |
| C18 | Webhook add | Live | POST /api/webhooks | Saved | GET confirms |
| C19 | Webhook delete | Live | DELETE /api/webhooks/0 | Removed | GET confirms |
| C20 | Search | Live | GET /api/search?q=known_keyword | Results with snippets | Result count > 0 |
| C21 | Webhooks replace | Live | PUT /api/webhooks [] | Array replaced | GET confirms |
| C22 | Webhook fire on event | Live | Create session | Webhook endpoint hit | Mock receiver |
| C23 | Settings write | Live | PUT /api/settings | Setting persisted | GET confirms |

### Phase D: MCP Tools

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| D01 | search_sessions | Live | Search for known keyword | Matching sessions returned | Result count > 0 |
| D02 | list_sessions | Live | List project with sessions | Sessions returned with metadata | Result array |
| D03 | summarize_session | Live | Summarize session with messages | Non-empty summary text | Response content |
| D04 | get_project_notes | Live | After writing notes | Notes content matches | Response |
| D05 | get_session_notes | Live | After writing notes | Notes content matches | Response |
| D06 | get_tasks | Live | After adding tasks | Tasks returned | Response |
| D07 | add_task | Live | Add via MCP | Task created with created_by='agent' | DB check |
| D08 | complete_task | Live | Complete via MCP | Status = done | DB check |
| D09 | get_project_claude_md | Live | Read existing file | Content matches disk | Compare |
| D10 | read_plan | Live | After update_plan | Content matches | Response |
| D11 | update_plan | Live | Write plan | File created on disk | File exists |
| D12 | send_message — delivered | Live | Send to running session | Bridge file created, delivered | Response + file |
| D13 | send_message — not running | Live | Send to stopped session | Saved in DB, not delivered | Response |
| D14 | External: create_session | Live | Create via external API | tmux session created | tmux check |
| D15 | External: delete_session | Live | Delete via external API | All artifacts removed | Verify |
| D16 | External: set_session_state | Live | Change state | State updated | GET config |
| D17 | External: get_token_usage | Live | Get tokens for session | Token count returned | Response |
| D18 | External: list_projects | Live | List all | Projects returned | Response |
| D19 | External: update_settings | Live | Set a setting | Persisted | GET settings |
| D20 | MCP stdio: initialize | Mock | JSON-RPC initialize | Protocol version response | Response format |
| D21 | MCP stdio: tools/list | Mock | JSON-RPC tools/list | All tools listed | Count |
| D22 | MCP stdio: unknown method | Mock | Unknown method | -32601 error | Error code |
| D23 | External: set_project_notes | Live | Write notes via external API | Notes persisted | GET confirms |
| D24 | External: set_project_claude_md | Live | Write CLAUDE.md via external API | Written to disk | File content |
| D25 | Unknown internal tool | Live | POST /api/mcp/call {tool:'bad'} | 404 error | Response status |
| D26 | Unknown external tool | Live | POST /api/mcp/external/call {tool:'bad'} | 404 error | Response status |

### Phase E: Integration

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| E01 | OpenAI — new session | Live | POST /v1/chat/completions | Response in OpenAI format | JSON structure |
| E02 | OpenAI — resume session | Live | model: "bp:<id>" | Response from resumed session | Context-aware answer |
| E03 | OpenAI — streaming | Live | stream: true | SSE chunks + [DONE] | Response format |
| E04 | OpenAI — missing messages | Mock | No messages array | 400 error | Response |
| E05 | OpenAI — models list | Live | GET /v1/models | Model list | Response |
| E06 | Token usage | Live | GET /api/sessions/:id/tokens | Non-zero input_tokens | Response |
| E07 | Token — skip synthetic | Mock | JSONL with synthetic entry | Returns real model count | Logic |
| E08 | Session summary | Live | POST /api/sessions/:id/summary | Non-empty summary text | Response content |
| E09 | Smart compaction | Live | POST /api/sessions/:id/smart-compact | compacted: true or false (session running) | Response |
| E10 | Quorum — basic | Live | POST /api/quorum/ask | Junior files + lead synthesis | File paths exist |

### Phase F: Terminal

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| F01 | WebSocket connect | Live | Connect to /ws/:tmux | Connection opens | WS state |
| F02 | Receive terminal output | Live | After connect | Claude CLI banner visible | Content check |
| F03 | Send input | Live | Send keystroke | Echoed in terminal | Output check |
| F04 | Resize | Live | Send resize JSON | No error | PTY accepts |
| F05 | Heartbeat | Live | Send ping | Receive pong | Response |
| F06 | Invalid tmux session | Live | Connect to nonexistent | Error JSON + close | Response |
| F07 | Session persists disconnect | Live | Disconnect + reconnect | tmux still running | tmux check |

### Phase G: Smart Features

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| G01 | Token counting | Live | Session with messages | Non-zero token count | API response |
| G02 | Token — skip synthetic | Mock | JSONL with synthetic entry | Returns real model's count | Logic test |
| G03 | Session search | Live | Search known keyword | Results with snippets | Response |
| G04 | Session search — short query | Mock | Query < 2 chars | Empty results | Response |
| G05 | Keepalive scheduling | Mock | Token with known expiry | Schedule at 65-85% | Timing check |
| G06 | Keepalive — expired token | Mock | expiresAt = 0 | Immediate refresh | Behavior |
| G07 | Auth check — valid | Mock | Valid credentials JSON | {valid: true} | Logic |
| G08 | Auth check — missing | Mock | No file | {valid: false} | Logic |
| G09 | Compaction nudge 65% | Mock | 65% usage | Advisory message generated | File check |
| G10 | Compaction auto 90% | Mock | 90% usage | Auto-compact triggered | Function called |

### Phase H: UI (Browser via Malory) — 568 Scenarios

Phase H is driven by three CLI UI audits (see `docs/ui-audit-claude.md`, `docs/ui-audit-gemini.md`, `docs/ui-audit-codex.md`). The original 18 hand-written scenarios (H01–H18) are preserved below as a baseline; all 568 audit scenarios must also be executed.

**Original Phase H baseline (H01–H18):**

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| H01 | Page loads | Live | Navigate to URL | Title = "Blueprint" | Page title |
| H02 | Projects in sidebar | Live | After load | Project names visible | Snapshot |
| H03 | Sessions in sidebar | Live | Expand project | Session names visible | Snapshot |
| H04 | Filter — active | Live | Click Active | Archived hidden | Snapshot |
| H05 | Filter — archived | Live | Click Archived | Only archived shown | Snapshot |
| H06 | New session | Live | Click + New Session | Tab opens, terminal connected | Snapshot + WS |
| H07 | Tab switch | Live | Open 2 sessions, click tabs | Terminal switches | Snapshot |
| H08 | Close tab | Live | Click X on tab | Tab removed, session persists | Snapshot + API |
| H09 | Settings modal | Live | Click gear | Modal opens with settings | Snapshot |
| H10 | Right panel | Live | Click hamburger | Panel opens | Snapshot |
| H11 | Notes auto-save | Live | Type in notes | Saved after debounce | API verify |
| H12 | Add task | Live | Type + Enter | Task appears | Snapshot |
| H13 | Auth banner | Live | Remove credentials | Banner shows | Snapshot |
| H14 | Status bar | Live | Open session | Model + context shown | Snapshot |
| H15 | Session search | Live | Type in search box | Results appear | Snapshot |
| H16 | Session summary | Live | Click info icon | Summary modal | Snapshot |
| H17 | Config editor | Live | Click pencil | Config overlay | Snapshot |
| H18 | Theme toggle | Live | Switch to light | UI changes | Visual check |

**Extended UI audit scenarios (from `docs/ui-audit-*.md`):**

The three audit documents collectively define 568 additional scenarios across these categories:
- Every clickable element and expected behavior (sidebar, tabs, terminal, status bar, right panel, settings modal, overlays)
- Input validation and edge cases (text fields, empty inputs, large content, rapid typing)
- State management (filter/sort persistence, expand/collapse, tab state, session lifecycle)
- WebSocket connection lifecycle (connect, disconnect, reconnect, exponential backoff)
- Race conditions and timing (debounce, polling, concurrent actions)
- Stress tests (many tabs, rapid open/close, long content)
- Recovery scenarios (server restart, network interruption, auth expiry mid-session)
- Security and input sanitization (XSS in session names, SQL injection via UI fields)
- Accessibility (keyboard navigation, ARIA roles, focus management)
- Cross-feature interactions (filter + search, settings change affecting open terminals)
- Data persistence (notes survive page reload, theme survives refresh)
- Error paths triggered through UI (add project failure, create session failure)

**Execution:** Run the 568 audit scenarios as Playwright/Malory tests, using the audit documents as the specification. Each audit document section maps to a Playwright test file.

### Phase I: Session Lifecycle (Deep Dive)

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| I01 | Instant create returns temp ID | Live | POST /api/sessions | Temp ID returned immediately | Response shape |
| I02 | UUID resolution via polling | Live | Poll /api/state after create | Real UUID appears within 30s | State matches |
| I03 | Temp rename survives to real session | Live | Rename before UUID resolves | Name persists | GET config |
| I04 | JSONL created after session start | Live | Wait for JSONL | File exists in workspace | Filesystem |
| I05 | WS connects to newly created session | Live | Connect immediately | Connection succeeds | WS state |
| I06 | Name survives reconnect | Live | Disconnect + reconnect | Session name unchanged | GET config |

### Phase J: Browse and Admin

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| J01 | Browse filesystem | Live | File tree API | Directory listing returned | Response |
| J02 | File tree nested | Live | Expand subdirectory | Nested listing returned | Response |
| J03 | Remove project | Live | POST /api/projects (remove path) | Project removed from DB | GET /api/state |
| J04 | Session notes round-trip | Live | Write + read session notes | Content matches | GET confirms |
| J05 | Session config round-trip | Live | Write all config fields | All persisted | GET confirms |
| J06 | Token usage edge cases | Live | Session with no JSONL | tokens: null | Response |
| J07 | State details | Live | GET /api/state | Full project + session structure | JSON shape |
| J08 | External MCP auth | Live | Call external tool | Authenticated, result returned | Response |
| J09 | Keepalive mode + browser count | Live | Connect browser, check count | browserCount increments | GET status |
| J10 | Auth login probe | Live | POST /api/auth/login | Valid response | Response status |
| J11 | 404 on missing session | Live | GET config for nonexistent ID | 404 | Response status |
| J12 | 400 on blank name | Live | PUT name with empty string | 400 | Response status |

### Phase K: CLI Slash Commands

Test all slash commands through the Blueprint terminal. Requires a live Claude session in tmux.

| ID | Scenario | Layer | Input | Expected | Verification |
|----|----------|-------|-------|----------|--------------|
| K01 | /help | Live | Type /help in terminal | Help text displayed | Terminal output |
| K02 | /status | Live | Type /status | Session status info displayed | Terminal output |
| K03 | /model | Live | Type /model | Current model displayed or model list | Terminal output |
| K04 | /model switch | Live | Type /model claude-haiku-4-5 | Model changed for session | Terminal output |
| K05 | /login | Live | Type /login | Auth flow initiated or already logged in | Terminal output |
| K06 | /logout | Live | Type /logout | Session auth cleared | Terminal output |
| K07 | /compact | Live | Type /compact | Context compacted | Terminal output + JSONL change |
| K08 | /context | Live | Type /context | Context usage displayed | Terminal output |
| K09 | /config | Live | Type /config | Config displayed | Terminal output |
| K10 | /permissions | Live | Type /permissions | Permission mode shown | Terminal output |
| K11 | /memory | Live | Type /memory | Memory/CLAUDE.md content shown | Terminal output |
| K12 | /clear | Live | Type /clear | Terminal cleared | Visual |
| K13 | Slash command after disconnect | Live | Disconnect, reconnect, send /status | Command works after reconnect | Terminal output |
| K14 | Unknown slash command | Live | Type /nonexistent | Error or help text | Terminal output |
| K15 | Slash command with smart compact trigger | Live | /compact via smart-compact endpoint | Coordinated compaction | Logs + API response |

---

## 7. Endpoint and Tool Testing — Full Parameter Variation

Every API endpoint and MCP tool must be tested with full parameter variation, not just a single minimal-parameter happy path. For each endpoint:

- **All required parameters present** — happy path
- **Each required parameter missing** — verify 400 with descriptive error
- **Invalid types** — string where number expected, number where string expected, object where array expected
- **Boundary values** — empty strings, very long strings (10k+ chars), zero, negative numbers, max integers
- **Special characters** — HTML/script tags, SQL injection strings, null bytes, unicode, emoji
- **Realistic payloads** — not just `{text: "test"}` but content that resembles actual usage

Phase H (adversarial) covers injection and boundary testing for a subset of endpoints. This section requires that EVERY endpoint in the master capability list (1–51) has parameter variation coverage. Endpoints currently missing full variation testing:

| Endpoint | What's Missing |
|----------|---------------|
| POST /api/projects | git clone URL with special chars, path with spaces, very long name |
| POST /api/sessions/:id/resume | resume with invalid session format, resume deleted session |
| PUT /api/sessions/:id/config | all fields null, all fields max length, conflicting state values |
| POST /api/sessions/:id/summary | valid session but empty JSONL, session with 10k messages |
| POST /api/sessions/:id/smart-compact | session at 0% context, session already compacting |
| POST /v1/chat/completions | streaming mode, X-Blueprint-Session header, bp: prefix with invalid ID |
| POST /api/quorum/ask | very long question, question with code blocks |
| POST /api/mcp/call | each of the 14 tools with missing/invalid args |
| POST /api/mcp/external/call | each of the 8 admin tools with missing/invalid args |

---

## 8. Pipeline End-to-End Verification

Blueprint's smart compaction is a multi-stage pipeline. Each stage must be verified independently, not just the final outcome.

### 8.1 Smart Compaction Pipeline Stages

| Stage | What Happens | How to Verify |
|-------|-------------|---------------|
| 1. Token monitoring | Compaction monitor polls every 30s | Container logs show poll activity |
| 2. Threshold detection | Token % crosses 65/75/85/90 | Correct nudge level selected |
| 3. Bridge file creation | Nudge message written to `BLUEPRINT_DATA/bridges/` | File exists on disk |
| 4. Bridge file injection | File path sent to tmux via `tmuxSendKeys` | tmux capture shows file path |
| 5. Plan prep (90% only) | Helper CLI reads plan, writes "Resume From Here" | Plan file updated on disk |
| 6. /compact sent | `tmuxSendKeys` sends `/compact` | tmux capture shows `/compact` |
| 7. Completion polling | Poll tmux pane for CLI prompt (❯) every 2s, 30s timeout | Prompt detected or timeout |
| 8. Recovery | Plan file path sent to session | tmux capture shows plan path |

### 8.2 Completion Detection

- **Poll indicator:** last non-empty line in tmux pane matches `/^\s*[❯>]\s*$/`
- **Poll frequency:** every 2 seconds
- **Timeout:** 30 seconds
- **Stall detection:** if no prompt appears within 30s, proceed with recovery anyway and log warning

### 8.3 Session ID Resolution Pipeline

| Stage | What Happens | How to Verify |
|-------|-------------|---------------|
| 1. Temp ID created | `new_<timestamp>` returned to client | POST /api/sessions response |
| 2. JSONL polling | `readdir` every 2s for new .jsonl files | Server logs |
| 3. DB migration | Name/notes/state copied from temp to real entry | DB query |
| 4. Temp entry deleted | `deleteSession(tmpId)` called | DB query |
| 5. tmux renamed | `tmux rename-session` to match real UUID | tmux list-sessions |
| 6. Frontend resolution | `loadState()` detects new ID, migrates tab | Browser console log |

---

## 9. Non-Deterministic System Testing

### 7.1 Behavioral Assertions
- Session summary (E08): assert non-empty string, don't check exact text
- Quorum (E10): assert files exist and have content, don't check quality
- Search (G03): assert result count > 0 for known content

### 7.2 LLM-as-Judge
- Session summary quality: judge evaluates whether summary accurately reflects conversation content. Rating: GOOD/ACCEPTABLE/POOR. Minimum: ACCEPTABLE.
- Quorum synthesis quality: judge evaluates whether lead synthesis addresses all junior responses. Minimum: ACCEPTABLE.

---

## 10. Gray-Box Verification

| Technique | Where Used |
|-----------|------------|
| SQLite direct query | Verify session state, task status, notes content, settings |
| tmux list-sessions | Verify session lifecycle (created, running, killed) |
| Filesystem check | Bridge files created/cleaned up, CLAUDE.md written, plan files |
| Container logs | Keepalive activity, webhook dispatch, errors |

---

## 11. Runtime Issue Logging

All findings logged as GitHub Issues on the Blueprint repo:
- **bug** — test assertion failure
- **warning** — non-fatal unexpected behavior
- **performance** — latency or resource concerns

Severity thresholds:
- LLM judge rating POOR → bug
- Response time > 30s for non-LLM operations → performance
- Unexpected 500 error in logs → bug

**Issues logged to date:** #54–#59 (filed 2026-03-31, covering deployment architecture, session lifecycle, and status bar behavior).

---

## 12. Failure Investigation Strategy

Per WPR-105 §11:
1. Root cause before fix — read actual error, trace actual code path
2. Full analysis before action — server logs, DB state, actual response
3. Second CLI opinion on non-trivial bugs — present evidence to another CLI
4. Never weaken tests — fix the code, not the test
5. Verify every fix — re-run failing test + full suite

---

## 13. Phase I (Real-World GUI Testing)

Three actual containerized applications built entirely through the Blueprint GUI using Malory browser automation. No shortcuts — every action must go through the terminal UI. If git, docker, npm, or any tool fails through the GUI, it is a Blueprint failure.

### App 1: Hello API
- Create folder in /workspace via terminal
- Write Express server with GET / and GET /health
- Write Dockerfile, docker-compose.yml, package.json
- Build and run the container via terminal
- Test the endpoints via curl in the terminal
- Fix any issues through the terminal

### App 2: Simple static site
- Create folder via terminal
- Write HTML/CSS files
- Write nginx Dockerfile and docker-compose.yml
- Build, run, verify via terminal

### App 3: Python Flask API with SQLite
- Create folder via terminal
- Write Flask app with CRUD endpoints
- Write requirements.txt, Dockerfile, docker-compose.yml
- Build, run, test all CRUD via terminal
- Fix any issues through the terminal

**Rules:**
- ALL actions through the Blueprint terminal (no direct file edits, no SSH, no git commands outside the terminal)
- Give the CLI agent NATURAL PROMPTS like a real user would — describe the goal, not the steps. Do NOT dictate specific commands, file contents, or implementation details. Let the agent figure it out. The test is whether a user can work naturally through Blueprint.
- If something doesn't work through the GUI, it's a Blueprint bug — log as GitHub Issue
- Test session switching, tab management, status bar updates during the builds
- Test session resume after deliberately disconnecting mid-build

**Feature exercise requirements during each build:**
- Use project notes to track build progress
- Use tasks to create and check off build steps
- Use session search to find related sessions
- Use session summary to verify context
- Use CLAUDE.md panel to set project instructions
- Use ask quorum for code review of the app before deploying
- Use rename to give sessions meaningful names
- Use archive to clean up completed sessions
- Use the status bar to monitor context usage
- Test tab switching between multiple sessions during the build
- Deliberately disconnect and reconnect mid-build to test persistence
- Use the settings panel to change model/theme during the build
- Use git (commit, push, pull) through the terminal for each app
- Deploy each app via docker commands through the terminal
- Use SSH through the terminal to verify deployments on remote hosts

---

## 14. Phase L: Context Stress Testing

Progressive stress testing of Blueprint's context management — smart compaction, token tracking, and session continuity under load. Follows the context stress testing methodology in `Joshua26/docs/guides/context-stress-testing-guide.md`.

### Approach

Two-phase approach per SDLC-07, adapted for Blueprint's threshold-based nudge system:

1. **Threshold verification** — append JSONL entries with precise `usage.input_tokens` values to cross each threshold (65/75/85/90%) individually. Wait ≥35s between each for the 30s compaction monitor to detect the crossing. Verify the correct nudge bridge file appears at each threshold. This is deterministic and takes ~2 minutes per cycle.

2. **Live conversation quality** — after verifying the monitor works, use live conversation through the Blueprint terminal to fill context naturally and verify status bar tracking, cold recall after compaction, and session continuity.

**Critical**: the `checkCompactionNeeds()` function uses `if-else-if` — only ONE threshold fires per poll cycle. Each threshold MUST be crossed individually with a monitor poll between them. A single large prompt that jumps from 0% to 90% will only trigger auto-compact, never the advisory/warning/urgent nudges.

### Progressive Tiers

For 200k context (standard Sonnet):
- 130k (65%) → advisory nudge
- 150k (75%) → warning nudge  
- 170k (85%) → urgent nudge
- 180k (90%) → auto-compact trigger

For 1M context (Opus / Sonnet 1M):
- 650k (65%) → advisory nudge
- 750k (75%) → warning nudge
- 850k (85%) → urgent nudge
- 900k (90%) → auto-compact trigger

### At Each Threshold

| ID | Scenario | Input | Expected | Verification |
|----|----------|-------|----------|--------------|
| L01 | 65% advisory nudge | Fill to 65% context | Bridge file with advisory message sent to session | Container logs + tmux capture |
| L02 | 75% warning nudge | Fill to 75% context | Bridge file with warning message sent to session | Container logs + tmux capture |
| L03 | 85% urgent nudge | Fill to 85% context | Bridge file with urgent message sent to session | Container logs + tmux capture |
| L04 | 90% auto-compact trigger | Fill to 90% context | `runSmartCompaction` called automatically | Container logs + /compact sent |
| L05 | Status bar tracks growth | During filling | Context bar grows, color changes (green→amber→red) | Screenshot at each threshold |
| L06 | Smart compaction plan prep | Auto-compact fires | Helper CLI reads plan and writes "Resume From Here" | Plan file updated |
| L07 | Smart compaction recovery | After /compact completes | Plan file path sent back to session | tmux capture |
| L08 | Context drops after compaction | Post-compact | Token count drops significantly | /api/sessions/:id/tokens |
| L09 | Session usable after compaction | Post-compact | CLI responds to prompts with context from before compaction | Terminal output |
| L10 | Cold recall after compaction | Post-compact | Ask about content from before compaction | Behavioral assertion |

### Topic Pivots

Every 20% of the context budget, inject a topic pivot:
- Send: "Pick a completely different topic from a vastly different field and time period. Introduce it in detail."
- This creates semantic islands that stress the compaction's ability to preserve diverse content.

### Repeat Cycles

The test must trigger smart compaction at least **3 full cycles** (fill → compact → fill → compact → fill → compact). Each cycle verifies:
- Nudges fire at correct thresholds
- Auto-compact triggers at 90%
- Context drops after compaction
- CLI remains functional after compaction
- Status bar accurately reflects the new context level
- Cold recall probes pass for content from earlier cycles

### Monitoring

- Token count via `/api/sessions/:id/tokens` polled every 30s
- Container logs for `[compact]` entries
- Status bar screenshots at each threshold crossing
- tmux pane capture for bridge file content
- Quality rating via LLM judge on cold recall responses

### Prerequisite

GitHub Issue #55 must be resolved before Phase L can run. The CLI's native auto-compaction must be disabled so Blueprint's smart compaction system controls the process. If the CLI compacts on its own, Blueprint's nudges never fire and this entire phase is untestable.

---

## 15. What Is Not Tested

- **Multi-user concurrency** — Blueprint is single-user by design. Not a gap.
- **Gemini/Codex CLI integration** — Blueprint currently wraps Claude only. Phase 4 future work.

### Blockers (must be resolved, not skipped)

- **OAuth full flow** — blocked on Issue #58 (install Anthropic Computer Use Demo for browser automation that passes Cloudflare). Once installed, the full OAuth redirect flow must be tested end-to-end.
- **CLI auto-compaction conflict** — blocked on Issue #55. Must be resolved before Phase L stress testing can run.
- **Phase H UI tests** — 460 browser tests implemented via Playwright, 452 passing (98.3%). Visual review pipeline with Haiku built.
- **Phase K slash command tests** — 11/16 implemented. Missing: /model switch, /logout, /memory, reconnect, smart-compact coordination.

---

## 16. Deployment Architecture Note

### Windows Docker → G:\workspace Migration

Live tests originally targeted a Windows Docker Desktop deployment. This was abandoned due to volume mount issues: Docker Desktop on Windows could not reliably mount `C:\Users\j\...` paths into Linux containers, causing the workspace and credential directories to be empty inside the container. All 148 live tests were failing with 404/500 errors because the Blueprint server had no projects and no Claude credentials.

**Fix:** All live tests were migrated to run against a Blueprint instance deployed on `G:\workspace` (a Linux filesystem path accessible from WSL2). The Docker Compose stack runs natively under WSL2 with Linux volume semantics, resolving all mount issues.

**Impact on test infrastructure:**
- Live tests now connect to the WSL2-hosted Blueprint instance at its configured port
- Mock tests are unaffected (no deployment dependency)
- The test fixture that checks "is the stack running?" now checks the WSL2 endpoint

This is documented here because any future CI/CD setup must use a Linux or WSL2 host for live tests. Windows Docker Desktop volume mounts are not reliable for this workload.

---

## 17. Traceability Matrix

| Test File | Phase | Capabilities Covered |
|-----------|-------|---------------------|
| `tests/mock/auth.test.js` | — | 30, 241, 242, 243, 244 |
| `tests/mock/compaction-monitor.test.js` | G | 26 (internal logic: thresholds 65/75/85/90%) |
| `tests/mock/db.test.js` | — | 149–173 |
| `tests/mock/db-extended.test.js` | — | 142, 143, 154, 157, 158 |
| `tests/mock/keepalive.test.js` | G | 32, 33, 178, 179, 248, 249 |
| `tests/mock/mcp-protocol.test.js` | D | 83, 84, 86, 259 |
| `tests/mock/openai-compat.test.js` | E | 50, 51 |
| `tests/mock/quorum-tools.test.js` | — | 87, 88, 89, 255 |
| `tests/mock/session-dirs.test.js` | — | Internal helpers (no capability number) |
| `tests/mock/session-meta-cache.test.js` | — | Internal helpers (no capability number) |
| `tests/mock/session-parsing.test.js` | — | Internal helpers (no capability number) |
| `tests/mock/token-usage.test.js` | E/G | 25, 78 |
| `tests/mock/webhooks.test.js` | — | 41, 42, 43, 44 |
| `tests/mock/webhooks-delivery.test.js` | — | 41, 42, 43, 44, 250, 251 |
| `tests/live/phase-a.*` | A | 1, 2, 3, 4, 6, 30, 34, 45, 47, 50 |
| `tests/live/phase-b.*` | B | 15, 16, 17, 18, 19, 20, 21, 203, 204, 205 |
| `tests/live/phase-c.*` | C | 7–14, 27–29, 32, 33, 35–44 |
| `tests/live/phase-d.*` | D | 61–71, 75–82, 225, 226 |
| `tests/live/phase-e.*` | E | 24, 25, 26, 49, 50, 51, 216, 217 |
| `tests/live/phase-f.*` | F | 52, 53, 55, 56, 57 |
| `tests/live/phase-g.*` | G | 5, 22, 23, 31, 197, 198 |
| `tests/live/phase-h.*` | H | 202–228 (security/validation) |
| `tests/live/phase-i.*` | I | 15 (session lifecycle deep dive) |
| `tests/live/phase-j.*` | J | 5 (remove), browse, misc capabilities |
| `tests/live/phase-k.*` | K | CLI slash commands through terminal (0/15 implemented — BLOCKED) |
| `docs/ui-audit-claude.md` | H | UI capabilities 92–141 (browser automation required) |
| `docs/ui-audit-gemini.md` | H | UI capabilities 92–141 (browser automation required) |
| `docs/ui-audit-codex.md` | H | UI capabilities 92–141 (browser automation required) |

**Coverage status:** 149/266 covered (56%). Updated after each test run by re-running the coverage mapping in `docs/master-capability-list.md`.
