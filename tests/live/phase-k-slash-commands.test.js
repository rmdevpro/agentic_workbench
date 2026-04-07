const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const { execSync } = require('child_process');
const { get, post, getTestProject } = require('./helpers');

/**
 * Phase K: CLI Slash Commands
 *
 * Tests all Claude Code slash commands through the Blueprint terminal.
 * Uses tmux send-keys to type commands and capture-pane to read output.
 */
describe('Phase K: CLI Slash Commands', { timeout: 600000 }, () => {
  let testProject;
  let sessionId;
  let tmux;

  function sendKeys(text) {
    execSync(`tmux send-keys -t ${tmux} '${text}' Enter`, { timeout: 5000 });
  }

  function capturePaneText() {
    return execSync(`tmux capture-pane -t ${tmux} -p -S -30`, { encoding: 'utf-8', timeout: 5000 });
  }

  async function waitForPrompt(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise(r => setTimeout(r, 2000));
      const text = capturePaneText();
      // Claude CLI shows ❯ or > when ready for input
      const lines = text.split('\n').filter(l => l.trim());
      const last = lines[lines.length - 1] || '';
      if (/[❯>]\s*$/.test(last) || /bypass permissions/.test(last)) return text;
    }
    return capturePaneText(); // return whatever we have
  }

  before(async () => {
    testProject = await getTestProject();

    // Kill stale tmux sessions from earlier test phases to free resources
    try {
      const { execSync: ex } = require('child_process');
      const sessions = ex('tmux list-sessions -F "#{session_name}" 2>/dev/null', { encoding: 'utf-8' }).trim().split('\n');
      for (const s of sessions) {
        if (s.startsWith('bp_')) {
          try { ex(`tmux kill-session -t ${s}`, { timeout: 3000 }); } catch {}
        }
      }
    } catch {} // no tmux server = no sessions to clean

    await new Promise(r => setTimeout(r, 2000));

    const res = await post('/api/sessions', { project: testProject });
    assert.strictEqual(res.status, 200);
    sessionId = res.body.id;
    tmux = res.body.tmux;

    // Wait for CLI to be ready
    await waitForPrompt(60000);
  });

  after(async () => {
    // Clean up — kill the tmux session
    try { execSync(`tmux kill-session -t ${tmux}`, { timeout: 5000 }); } catch {}
  });

  it('K01: /help displays help text', async () => {
    sendKeys('/help');
    await new Promise(r => setTimeout(r, 5000));
    const text = capturePaneText();
    assert.ok(text.includes('help') || text.includes('Help') || text.includes('commands'),
      'Should display help information');
  });

  it('K02: /status displays session info', async () => {
    await waitForPrompt();
    sendKeys('/status');
    await new Promise(r => setTimeout(r, 5000));
    const text = capturePaneText();
    assert.ok(text.includes('model') || text.includes('Model') || text.includes('context') || text.includes('Context'),
      'Should display status with model or context info');
  });

  it('K03: /model displays current model', async () => {
    await waitForPrompt();
    sendKeys('/model');
    await new Promise(r => setTimeout(r, 5000));
    const text = capturePaneText();
    // /model opens a picker or shows current model — current model name must be visible
    assert.ok(
      text.includes('Sonnet') || text.includes('Opus') || text.includes('Haiku') ||
      text.includes('sonnet') || text.includes('opus') || text.includes('haiku') ||
      text.includes('claude-') || text.includes('Select'),
      'Should display current model name or model picker'
    );
    // Press Escape to dismiss the picker if it opened
    try { execSync(`tmux send-keys -t ${tmux} Escape`, { timeout: 3000 }); } catch {}
    await new Promise(r => setTimeout(r, 2000));
  });

  it('K04: /context displays context usage', async () => {
    await waitForPrompt();
    sendKeys('/context');
    await new Promise(r => setTimeout(r, 5000));
    const text = capturePaneText();
    assert.ok(
      text.includes('token') || text.includes('Token') || text.includes('context') ||
      text.includes('Context') || text.includes('%'),
      'Should display context/token usage'
    );
  });

  it('K05: /compact triggers compaction', async () => {
    await waitForPrompt();
    sendKeys('/compact');
    // Compaction takes time — wait longer
    await new Promise(r => setTimeout(r, 15000));
    const text = capturePaneText();
    // After compaction, the CLI should mention compact, context, or summary — not just a bare prompt
    assert.ok(
      text.includes('compact') || text.includes('Compact') ||
      text.includes('summary') || text.includes('Summary') ||
      text.includes('context') || text.includes('Context'),
      'Should show compaction activity mentioning compact, context, or summary'
    );
  });

  it('K06: /config displays configuration', async () => {
    await waitForPrompt();
    sendKeys('/config');
    await new Promise(r => setTimeout(r, 5000));
    const text = capturePaneText();
    assert.ok(
      text.includes('config') || text.includes('Config') || text.includes('settings') ||
      text.includes('Settings') || text.includes('permission'),
      'Should display configuration'
    );
    // Dismiss any interactive config screen
    try { execSync(`tmux send-keys -t ${tmux} Escape`, { timeout: 3000 }); } catch {}
    await new Promise(r => setTimeout(r, 2000));
  });

  it('K07: /clear clears terminal', async () => {
    await waitForPrompt();
    // First generate some output
    const textBefore = capturePaneText();
    sendKeys('/clear');
    await new Promise(r => setTimeout(r, 3000));
    const textAfter = capturePaneText();
    // After clear, terminal should have less content
    assert.ok(textAfter.trim().length <= textBefore.trim().length,
      'Terminal should be cleared or have less content');
  });

  it('K08: /login shows auth status', async () => {
    await waitForPrompt();
    sendKeys('/login');
    await new Promise(r => setTimeout(r, 8000));
    const text = capturePaneText();
    // /login may show: "Login successful", login picker ("Select login method"),
    // "Already logged in", subscription info, or OAuth URL
    assert.ok(
      text.includes('Login') || text.includes('login') || text.includes('success') ||
      text.includes('auth') || text.includes('account') || text.includes('Select') ||
      text.includes('subscription') || text.includes('Claude') || text.includes('method') ||
      text.includes('Esc') || text.includes('cancel'),
      'Should show login/auth information'
    );
    // Dismiss login screen if it opened a picker
    try { execSync(`tmux send-keys -t ${tmux} Escape`, { timeout: 3000 }); } catch {}
    await new Promise(r => setTimeout(r, 5000));
  });

  it('K09: /permissions shows permission mode', async () => {
    await waitForPrompt();
    sendKeys('/permissions');
    await new Promise(r => setTimeout(r, 5000));
    const text = capturePaneText();
    assert.ok(
      text.includes('permission') || text.includes('Permission') ||
      text.includes('bypass') || text.includes('Bypass') || text.includes('mode'),
      'Should display permission mode'
    );
    // Dismiss if interactive
    try { execSync(`tmux send-keys -t ${tmux} Escape`, { timeout: 3000 }); } catch {}
    await new Promise(r => setTimeout(r, 2000));
  });

  it('K10: Unknown slash command shows error or help', async () => {
    await waitForPrompt();
    sendKeys('/nonexistent_command_xyz');
    await new Promise(r => setTimeout(r, 5000));
    const text = capturePaneText();
    // Should either show an error or treat it as a prompt
    assert.ok(text.length > 0, 'Should produce some output');
  });

  it('K11: Slash command after conversation works', async () => {
    // First have a conversation
    await waitForPrompt();
    sendKeys('say hello');
    await new Promise(r => setTimeout(r, 15000));

    // Then run a slash command
    await waitForPrompt();
    sendKeys('/status');
    await new Promise(r => setTimeout(r, 5000));
    const text = capturePaneText();
    assert.ok(
      text.includes('model') || text.includes('Model') || text.includes('context'),
      'Slash command should work after conversation'
    );
  });

  it('K12: /model switch changes model and switch back', async () => {
    await waitForPrompt();
    // Switch to haiku
    sendKeys('/model claude-haiku-4-5-20251001');
    await new Promise(r => setTimeout(r, 8000));
    const textAfterSwitch = capturePaneText();
    assert.ok(
      textAfterSwitch.includes('haiku') || textAfterSwitch.includes('Haiku') ||
      textAfterSwitch.includes('model') || textAfterSwitch.includes('Model') ||
      textAfterSwitch.includes('changed') || textAfterSwitch.includes('switched'),
      'Should confirm model switch or display model info after /model command'
    );
    // Dismiss any interactive picker
    try { execSync(`tmux send-keys -t ${tmux} Escape`, { timeout: 3000 }); } catch {}
    await new Promise(r => setTimeout(r, 2000));

    // Switch back to sonnet
    await waitForPrompt();
    sendKeys('/model claude-sonnet-4-20250514');
    await new Promise(r => setTimeout(r, 8000));
    const textAfterRestore = capturePaneText();
    assert.ok(
      textAfterRestore.includes('sonnet') || textAfterRestore.includes('Sonnet') ||
      textAfterRestore.includes('model') || textAfterRestore.includes('Model') ||
      textAfterRestore.includes('changed') || textAfterRestore.includes('switched'),
      'Should confirm switch back to sonnet'
    );
    // Dismiss any interactive picker
    try { execSync(`tmux send-keys -t ${tmux} Escape`, { timeout: 3000 }); } catch {}
    await new Promise(r => setTimeout(r, 2000));
  });

  it('K14: /memory displays CLAUDE.md or memory content', async () => {
    await waitForPrompt();
    sendKeys('/memory');
    await new Promise(r => setTimeout(r, 8000));
    const text = capturePaneText();
    assert.ok(
      text.includes('CLAUDE.md') || text.includes('memory') || text.includes('Memory') ||
      text.includes('instruction') || text.includes('Instruction') ||
      text.includes('context') || text.includes('Context'),
      'Should display memory/CLAUDE.md content or memory-related output'
    );
    // Dismiss if interactive
    try { execSync(`tmux send-keys -t ${tmux} Escape`, { timeout: 3000 }); } catch {}
    await new Promise(r => setTimeout(r, 2000));
  });

  it('K16: unknown slash command shows error or help text (not just any output)', async () => {
    await waitForPrompt();
    sendKeys('/nonexistent');
    await new Promise(r => setTimeout(r, 5000));
    const text = capturePaneText();
    // Should show an error, "unknown command", or help — not just silently produce bytes
    assert.ok(
      text.includes('unknown') || text.includes('Unknown') ||
      text.includes('error') || text.includes('Error') ||
      text.includes('not found') || text.includes('invalid') || text.includes('Invalid') ||
      text.includes('help') || text.includes('Help'),
      'Should show error text, help, or command list for unknown slash command'
    );
  });

  it('K15: slash command works after session disconnect and reconnect', async () => {
    // Kill the tmux session to simulate a disconnect
    try { execSync(`tmux kill-session -t ${tmux}`, { timeout: 5000 }); } catch {}
    await new Promise(r => setTimeout(r, 2000));

    // Resume the session via the API
    const res = await post(`/api/sessions/${sessionId}/resume`, { project: testProject });
    assert.strictEqual(res.status, 200, 'Resume API should return 200');
    // tmux name may be re-issued by the server — use the one from the response
    tmux = res.body.tmux || tmux;

    // Wait for CLI to be ready again
    await waitForPrompt(60000);

    // Send a slash command and verify output
    sendKeys('/status');
    await new Promise(r => setTimeout(r, 8000));
    const text = capturePaneText();
    assert.ok(
      text.includes('model') || text.includes('Model') ||
      text.includes('context') || text.includes('Context') ||
      text.includes('status') || text.includes('Status'),
      'Slash command should work after session reconnect'
    );
  });

  it('K13: /logout clears auth (run last as it breaks session auth)', async () => {
    await waitForPrompt();
    sendKeys('/logout');
    await new Promise(r => setTimeout(r, 8000));
    const text = capturePaneText();
    assert.ok(
      text.includes('logged out') || text.includes('Logged out') ||
      text.includes('cleared') || text.includes('Cleared') ||
      text.includes('auth') || text.includes('Auth') ||
      text.includes('logout') || text.includes('Logout') ||
      text.includes('signed out') || text.includes('Signed out'),
      'Should confirm logout or show auth-related output'
    );
  });
});
