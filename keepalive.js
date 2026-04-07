const { readFileSync } = require('fs');
const { join } = require('path');
const safe = require('./safe-exec');

const WORKSPACE = safe.WORKSPACE;
const CLAUDE_HOME = safe.CLAUDE_HOME;
const REFRESH_THRESHOLD = 0.85; // Refresh if >= 85% of lifetime elapsed
const CHECK_RANGE_LOW = 0.65; // Schedule check between 65-85% of lifetime
const CHECK_RANGE_HIGH = 0.85;
const FALLBACK_INTERVAL_MS = 30 * 60 * 1000; // If can't read expiry, ping every 30 min

// Mode: 'always' (default) | 'browser' (stop when no browsers) | 'idle' (stop after inactivity timeout)
let mode = process.env.KEEPALIVE_MODE || 'browser';
let idleTimeoutMs = parseInt(process.env.KEEPALIVE_IDLE_MINUTES || '30') * 60 * 1000;
let idleTimer = null;

let running = false;
let timer = null;
let turn = 'a';

function getTokenExpiry() {
  try {
    const raw = readFileSync(join(CLAUDE_HOME, '.credentials.json'), 'utf-8');
    const creds = JSON.parse(raw);
    return creds.claudeAiOauth?.expiresAt || 0;
  } catch {
    return 0;
  }
}

function msUntilExpiry() {
  const expiresAt = getTokenExpiry();
  if (!expiresAt) return 0;
  return expiresAt - Date.now();
}

// Dead functions removed per code review (M1)

function claudeQuery(message) {
  try {
    return safe.claudeExec(
      ['--print', '--no-session-persistence', '--model', 'haiku', message],
      { cwd: WORKSPACE, timeout: 30000 }
    ).trim();
  } catch (err) {
    console.error('[keepalive] Claude query failed:', err.message?.substring(0, 100));
    return null;
  }
}

function doRefresh() {
  try {
    if (turn === 'a') {
      const q = claudeQuery('Ask a short interesting question. Just the question.');
      if (q) {
        const a = claudeQuery(q);
        if (a) console.log(`[keepalive] Refreshed — Q: "${q.substring(0, 40)}..." A: "${a.substring(0, 40)}..."`);
      }
      turn = 'b';
    } else {
      const q = claudeQuery('Tell me a one-sentence fun fact.');
      if (q) console.log(`[keepalive] Refreshed — "${q.substring(0, 60)}..."`);
      turn = 'a';
    }
  } catch (err) {
    console.error('[keepalive] Refresh error:', err.message);
  }
}

function scheduleFromRemaining(remaining) {
  if (!running) return;

  if (remaining <= 0) {
    // Expired or unreadable — refresh immediately
    console.log('[keepalive] Token expired or unreadable — refreshing now');
    doRefresh();
    // Re-read after refresh
    const newRemaining = msUntilExpiry();
    if (newRemaining > 0) {
      scheduleFromRemaining(newRemaining);
    } else {
      console.log(`[keepalive] Fallback — next check in ${FALLBACK_INTERVAL_MS / 60000}min`);
      timer = setTimeout(check, FALLBACK_INTERVAL_MS);
    }
    return;
  }

  // Calculate what percentage of remaining time to wait
  // Pick a random point between 65-85% of remaining time
  const fraction = CHECK_RANGE_LOW + Math.random() * (CHECK_RANGE_HIGH - CHECK_RANGE_LOW);
  const sleepMs = Math.max(60000, remaining * fraction); // At least 1 minute
  const remainMins = Math.round(remaining / 60000);
  const sleepMins = Math.round(sleepMs / 60000);
  const pct = Math.round(fraction * 100);

  console.log(`[keepalive] Token valid for ${remainMins}min — next check at ${pct}% (${sleepMins}min)`);
  timer = setTimeout(check, sleepMs);
}

function check() {
  if (!running) return;

  const remaining = msUntilExpiry();

  // If remaining is less than 15% of what a reasonable lifetime looks like, refresh
  // Since we scheduled at 65-85%, if we're here and remaining is small, time to refresh
  if (remaining <= 0) {
    console.log('[keepalive] Token expired — refreshing');
    doRefresh();
    const newRemaining = msUntilExpiry();
    scheduleFromRemaining(newRemaining);
  } else {
    // We're at the check point — refresh now and reschedule
    const mins = Math.round(remaining / 60000);
    console.log(`[keepalive] Check — ${mins}min remaining — refreshing`);
    doRefresh();
    const newRemaining = msUntilExpiry();
    scheduleFromRemaining(newRemaining);
  }
}

module.exports = {
  start() {
    if (running) return;
    running = true;
    const remaining = msUntilExpiry();
    const mins = remaining > 0 ? Math.round(remaining / 60000) : 0;
    console.log(`[keepalive] Started (mode: ${mode}) — token expires in ${mins}min`);
    // Schedule based on remaining time
    scheduleFromRemaining(remaining);
  },

  stop() {
    if (!running) return;
    running = false;
    if (timer) { clearTimeout(timer); timer = null; }
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    console.log('[keepalive] Stopped');
  },

  isRunning() {
    return running;
  },

  getMode() {
    return mode;
  },

  getStatus() {
    const remaining = msUntilExpiry();
    return {
      running,
      mode,
      token_expires_in_minutes: remaining > 0 ? Math.round(remaining / 60000) : 0,
      token_expires_at: new Date(getTokenExpiry()).toISOString(),
    };
  },

  setMode(newMode, idleMinutes) {
    mode = newMode;
    if (idleMinutes) idleTimeoutMs = idleMinutes * 60 * 1000;
    console.log(`[keepalive] Mode set to: ${mode}` + (mode === 'idle' ? ` (${idleMinutes || idleTimeoutMs / 60000}min)` : ''));
  },

  onBrowserConnect() {
    if (mode === 'browser' && !running) this.start();
    if (mode === 'idle') {
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      if (!running) this.start();
    }
  },

  onBrowserDisconnect(remainingBrowsers) {
    if (mode === 'browser' && remainingBrowsers === 0) this.stop();
    if (mode === 'idle' && remainingBrowsers === 0) {
      console.log(`[keepalive] No browsers — stopping in ${idleTimeoutMs / 60000}min`);
      idleTimer = setTimeout(() => {
        console.log('[keepalive] Idle timeout reached');
        this.stop();
      }, idleTimeoutMs);
    }
  },
};
