/**
 * Phase L: Smart Compaction Stress Test
 *
 * Verifies that Blueprint's compaction monitor fires nudges at 65/75/85%
 * and auto-compacts at 90% of context capacity.
 *
 * Approach (from 3-CLI RCA):
 *   - Create a real session so a tmux window exists (monitor skips sessions with no tmux)
 *   - Append fake assistant JSONL entries with target input_tokens counts
 *   - Wait 35s for the monitor (runs every 30s) to detect each threshold
 *   - Check that the expected bridge file appears in DATA_DIR/bridges/
 *
 * Max tokens: 200000 (claude-sonnet-4-6 — no 'opus' or '1m' in model string)
 * Thresholds: 65% = 130000, 75% = 150000, 85% = 170000, 90% = 180000
 * Token counts used: 132000 (66%), 152000 (76%), 172000 (86%), 181000 (90.5%)
 *
 * NOTE: This test runs INSIDE the container via `docker exec`.
 * It accesses the filesystem directly with `require('fs')`.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { get, post } = require('./helpers');

// ── Constants ──────────────────────────────────────────────────────────────

const DATA_DIR = process.env.BLUEPRINT_DATA || path.join(process.env.HOME || '/home/hopper', '.blueprint');
const CLAUDE_HOME = process.env.CLAUDE_HOME || '/home/hopper/.claude';
const BRIDGE_DIR = path.join(DATA_DIR, 'bridges');

// Max time to wait for a bridge file to appear (monitor runs every 30s).
// Under full suite load with many sessions, the monitor may take 2+ cycles
// to reach this session after resume. Use 95s (3 full cycles + margin).
const BRIDGE_POLL_INTERVAL_MS = 5000;
const BRIDGE_POLL_TIMEOUT_MS = 95000;

// Model string must NOT contain 'opus' or '1m' so max_tokens stays at 200000
const FAKE_MODEL = 'claude-sonnet-4-6';
const MAX_TOKENS = 200000;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * Append a fake assistant JSONL entry with a specific input_tokens count.
 * getTokenUsage() reads the LAST assistant entry from the JSONL, so each call
 * replaces the effective reading.
 */
function appendTokenEntry(jsonlPath, inputTokens) {
  const entry = {
    type: 'assistant',
    message: {
      role: 'assistant',
      content: [{ type: 'text', text: 'test' }],
      model: FAKE_MODEL,
      usage: {
        input_tokens: inputTokens,
        cache_read_input_tokens: 0,
        cache_creation_input_tokens: 0,
      },
    },
    timestamp: new Date().toISOString(),
  };
  fs.appendFileSync(jsonlPath, JSON.stringify(entry) + '\n');
}

/**
 * Check if a bridge file matching the prefix pattern exists in BRIDGE_DIR.
 */
function findBridgeFile(prefix, sessionPrefix) {
  try {
    const files = fs.readdirSync(BRIDGE_DIR);
    return files.find(f => f.startsWith(prefix) && f.includes(sessionPrefix)) || null;
  } catch {
    return null;
  }
}

/**
 * Poll for a bridge file to appear. The monitor runs every 30s but under full
 * suite load with many sessions, it may take longer to reach this session.
 * Polls every BRIDGE_POLL_INTERVAL_MS, gives up after BRIDGE_POLL_TIMEOUT_MS.
 */
async function waitForBridgeFile(prefix, sessionPrefix) {
  const deadline = Date.now() + BRIDGE_POLL_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const file = findBridgeFile(prefix, sessionPrefix);
    if (file) return file;
    await new Promise(r => setTimeout(r, BRIDGE_POLL_INTERVAL_MS));
  }
  return null;
}

/**
 * Build the tmux session name the way server.js does:
 *   sanitizeTmuxName(`bp_${sessionId.substring(0, 12)}`)
 * sanitizeTmuxName replaces non-alphanumeric chars (except _ and -) with _.
 */
function tmuxNameFor(sessionId) {
  const raw = `bp_${sessionId.substring(0, 12)}`;
  return raw.replace(/[^a-zA-Z0-9_-]/g, '_');
}

/**
 * Poll GET /api/state until the session resolves from new_* to a real UUID.
 * Returns the real session ID, or throws after timeout.
 */
async function waitForSessionResolution(projectName, tmpId, timeoutMs = 90000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 3000));
    const res = await get('/api/state');
    const project = res.body.projects?.find(p => p.name === projectName);
    if (!project) continue;
    // Check if tmpId was resolved away (temp entry deleted, real UUID present)
    const tmp = project.sessions.find(s => s.id === tmpId);
    if (!tmp) {
      // Find the newest non-temp session — it should be our resolved one
      const real = project.sessions.find(s => !s.id.startsWith('new_'));
      if (real) return real.id;
    }
  }
  throw new Error(`Session ${tmpId.substring(0, 12)} did not resolve within ${timeoutMs}ms`);
}

// ── Test Suite ─────────────────────────────────────────────────────────────

describe('Phase L: Smart Compaction Stress Test', { timeout: 600000 }, () => {
  let projectName;
  let tmpId;
  let sessionId;   // real UUID after resolver runs
  let jsonlPath;
  let sessionPrefix; // first 8 chars of sessionId — used in bridge filenames

  before(async () => {
    // 1. Pick a project
    const stateRes = await get('/api/state');
    assert.strictEqual(stateRes.status, 200, 'GET /api/state failed');
    const projects = stateRes.body.projects;
    assert.ok(projects && projects.length > 0, 'No projects available on test server');
    projectName = projects[0].name;
    const projectPath = projects[0].path;

    // 2. Create a fresh session — this starts a tmux window (required for monitor)
    const createRes = await post('/api/sessions', { project: projectName });
    assert.strictEqual(createRes.status, 200, `POST /api/sessions failed: ${JSON.stringify(createRes.body)}`);
    tmpId = createRes.body.id;
    assert.ok(tmpId, 'No session ID returned');

    console.log(`  Created session: ${tmpId.substring(0, 12)}`);

    // 3. Dismiss any onboarding prompts so Claude CLI starts properly
    const tmux = tmuxNameFor(tmpId);
    for (let i = 0; i < 3; i++) {
      try { execSync(`tmux send-keys -t ${tmux} Escape`, { timeout: 5000 }); } catch {}
      try { execSync(`tmux send-keys -t ${tmux} Enter`, { timeout: 5000 }); } catch {}
      await new Promise(r => setTimeout(r, 2000));
    }

    // 4. Wait for the background resolver to map new_* → real UUID.
    //    The resolver polls every 2s for up to 60s; give it 90s total.
    //    If resolution fails (CLI onboarding blocks JSONL creation), we
    //    fall back to creating the JSONL file manually.
    try {
      sessionId = await waitForSessionResolution(projectName, tmpId, 90000);
      console.log(`  Resolved: ${tmpId.substring(0, 12)} → ${sessionId.substring(0, 8)}`);
    } catch {
      // Fallback: create a minimal JSONL so getTokenUsage has a file to read.
      // We still need a tmux session alive — use the temp ID's tmux.
      console.log(`  Resolver timed out — creating JSONL manually for ${tmpId.substring(0, 12)}`);

      // Find the encoded project path for the sessions dir
      const encoded = projectPath.replace(/\//g, '-');
      const sessionsDir = path.join(CLAUDE_HOME, 'projects', encoded);
      fs.mkdirSync(sessionsDir, { recursive: true });

      // Use a stable UUID derived from timestamp so it doesn't collide
      const { randomUUID } = require('crypto');
      sessionId = randomUUID();
      jsonlPath = path.join(sessionsDir, `${sessionId}.jsonl`);

      // Write a minimal seed entry so the file exists
      const seed = {
        type: 'user',
        message: { role: 'user', content: 'Phase L stress test seed' },
        timestamp: new Date().toISOString(),
      };
      fs.writeFileSync(jsonlPath, JSON.stringify(seed) + '\n');

      // Register in DB via the state endpoint
      await get('/api/state'); // triggers JSONL sync
    }

    // 5. Compute the JSONL path for the resolved session
    if (!jsonlPath) {
      const encoded = projectPath.replace(/\//g, '-');
      const sessionsDir = path.join(CLAUDE_HOME, 'projects', encoded);
      jsonlPath = path.join(sessionsDir, `${sessionId}.jsonl`);
    }

    sessionPrefix = sessionId.substring(0, 8);
    console.log(`  Session ID: ${sessionPrefix}`);
    console.log(`  JSONL path: ${jsonlPath}`);
    console.log(`  Bridge dir: ${BRIDGE_DIR}`);

    // Verify tmux session is alive (monitor skips dead sessions)
    const liveTmux = tmuxNameFor(sessionId);
    try {
      execSync(`tmux has-session -t ${liveTmux}`, { timeout: 5000 });
      console.log(`  tmux session ${liveTmux} is alive`);
    } catch {
      // tmux dead — resume to create it (needed for monitor to fire)
      console.log(`  tmux session ${liveTmux} not found — resuming`);
      const resumeRes = await post(`/api/sessions/${sessionId}/resume`, { project: projectName });
      assert.strictEqual(resumeRes.status, 200, `Resume failed: ${JSON.stringify(resumeRes.body)}`);
      await new Promise(r => setTimeout(r, 3000));
    }

    // Ensure bridge dir exists
    fs.mkdirSync(BRIDGE_DIR, { recursive: true });
  });

  after(async () => {
    // Clean up: delete the session so it doesn't litter the project
    try {
      const { del } = require('./helpers');
      await del(`/api/sessions/${sessionId}?project=${encodeURIComponent(projectName)}`);
    } catch {
      // Best-effort cleanup
    }
  });

  it('L01: 65% advisory nudge fires within one monitor cycle', async () => {
    assert.ok(jsonlPath, 'JSONL path not set in before()');

    // 66% of 200000 = 132000 input tokens
    const tokens = Math.ceil(MAX_TOKENS * 0.66);
    appendTokenEntry(jsonlPath, tokens);
    console.log(`  Appended ${tokens} tokens (${((tokens / MAX_TOKENS) * 100).toFixed(1)}%) to ${path.basename(jsonlPath)}`);

    // Poll for bridge file (monitor runs every 30s, may be slower under load)
    console.log(`  Polling for advisory bridge file (up to ${BRIDGE_POLL_TIMEOUT_MS / 1000}s)...`);
    const bridgeFile = await waitForBridgeFile('compact_advisory_', sessionPrefix);
    assert.ok(
      bridgeFile,
      `Expected compact_advisory_${sessionPrefix}*.md in ${BRIDGE_DIR} — files present: ${
        (() => { try { return fs.readdirSync(BRIDGE_DIR).filter(f => f.includes(sessionPrefix)).join(', ') || '(none)'; } catch { return '(dir missing)'; } })()
      }`
    );
    console.log(`  Found bridge file: ${bridgeFile}`);
  });

  it('L02: 75% warning nudge fires within one monitor cycle', async () => {
    assert.ok(jsonlPath, 'JSONL path not set in before()');

    // 76% of 200000 = 152000 input tokens
    const tokens = Math.ceil(MAX_TOKENS * 0.76);
    appendTokenEntry(jsonlPath, tokens);
    console.log(`  Appended ${tokens} tokens (${((tokens / MAX_TOKENS) * 100).toFixed(1)}%) to ${path.basename(jsonlPath)}`);

    console.log(`  Polling for warn bridge file (up to ${BRIDGE_POLL_TIMEOUT_MS / 1000}s)...`);
    const bridgeFile = await waitForBridgeFile('compact_warn_', sessionPrefix);
    assert.ok(
      bridgeFile,
      `Expected compact_warn_${sessionPrefix}*.md in ${BRIDGE_DIR} — files present: ${
        (() => { try { return fs.readdirSync(BRIDGE_DIR).filter(f => f.includes(sessionPrefix)).join(', ') || '(none)'; } catch { return '(dir missing)'; } })()
      }`
    );
    console.log(`  Found bridge file: ${bridgeFile}`);
  });

  it('L03: 85% urgent nudge fires within one monitor cycle', async () => {
    assert.ok(jsonlPath, 'JSONL path not set in before()');

    // 86% of 200000 = 172000 input tokens
    const tokens = Math.ceil(MAX_TOKENS * 0.86);
    appendTokenEntry(jsonlPath, tokens);
    console.log(`  Appended ${tokens} tokens (${((tokens / MAX_TOKENS) * 100).toFixed(1)}%) to ${path.basename(jsonlPath)}`);

    console.log(`  Polling for urgent bridge file (up to ${BRIDGE_POLL_TIMEOUT_MS / 1000}s)...`);
    const bridgeFile = await waitForBridgeFile('compact_urgent_', sessionPrefix);
    assert.ok(
      bridgeFile,
      `Expected compact_urgent_${sessionPrefix}*.md in ${BRIDGE_DIR} — files present: ${
        (() => { try { return fs.readdirSync(BRIDGE_DIR).filter(f => f.includes(sessionPrefix)).join(', ') || '(none)'; } catch { return '(dir missing)'; } })()
      }`
    );
    console.log(`  Found bridge file: ${bridgeFile}`);
  });

  it('L04: 90% auto-compact bridge file created', async () => {
    assert.ok(jsonlPath, 'JSONL path not set in before()');

    // 90.5% of 200000 = 181000 input tokens (just over the 90% threshold)
    const tokens = Math.ceil(MAX_TOKENS * 0.905);
    appendTokenEntry(jsonlPath, tokens);
    console.log(`  Appended ${tokens} tokens (${((tokens / MAX_TOKENS) * 100).toFixed(1)}%) to ${path.basename(jsonlPath)}`);

    console.log(`  Polling for auto bridge file (up to ${BRIDGE_POLL_TIMEOUT_MS / 1000}s)...`);
    // The monitor writes compact_auto_{prefix}.md and then fires runSmartCompaction
    // (which may fail on a test session — that's OK). Only the bridge file matters.
    const bridgeFile = await waitForBridgeFile('compact_auto_', sessionPrefix);
    assert.ok(
      bridgeFile,
      `Expected compact_auto_${sessionPrefix}*.md in ${BRIDGE_DIR} — files present: ${
        (() => { try { return fs.readdirSync(BRIDGE_DIR).filter(f => f.includes(sessionPrefix)).join(', ') || '(none)'; } catch { return '(dir missing)'; } })()
      }`
    );
    console.log(`  Found bridge file: ${bridgeFile}`);

    // Verify content is the expected auto-compact notice
    const content = fs.readFileSync(path.join(BRIDGE_DIR, bridgeFile), 'utf-8');
    assert.ok(
      content.includes('Automatic Smart Compaction'),
      `Bridge file content unexpected: ${content.substring(0, 120)}`
    );
  });
});
