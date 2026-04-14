/**
 * Browser test baseline reset + visual evidence capture.
 *
 * resetUI(page) — light cleanup: dismiss overlays, close panel, refresh sidebar.
 * resetUIFull(page) — full cleanup: also closes all tabs.
 * captureScreenshot(page, testName, suiteName) — save screenshot for visual review.
 * setupScreenshotCapture(page, suiteName) — wire afterEach to auto-capture.
 *
 * Required by WPR-105 §4.4: "Browser tests must reset to a known baseline
 * between test sections."
 */

const { mkdirSync } = require('fs');
const { join } = require('path');

// Test results default to workspace; configurable via defaults.json testResultsDir
const config = (() => { try { return JSON.parse(require('fs').readFileSync(join(__dirname, '..', '..', '..', 'config', 'defaults.json'), 'utf-8')); } catch { return {}; } })();
const STORAGE_BASE = config.testResultsDir || (process.platform === 'win32' ? 'Z:\\test-results' : '/mnt/workspace/.test-results');
const RUN_TIMESTAMP = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
const RESULTS_DIR = join(STORAGE_BASE, 'test-results', 'blueprint', RUN_TIMESTAMP, 'screenshots');
mkdirSync(RESULTS_DIR, { recursive: true });

// Store snapshot in Node.js process (survives page.reload)
let _originalSessionIds = new Set();

async function resetUI(page) {
  await page.evaluate(() => {
    document.getElementById('settings-modal')?.classList.remove('visible');
    document.getElementById('auth-modal')?.classList.remove('visible');
    if (typeof dismissAuthModal === 'function') try { dismissAuthModal(); } catch (_) {}
    document.querySelectorAll(
      '[id^="config-overlay"], [id^="summary-overlay"], [id^="dir-picker"]'
    ).forEach(e => e.remove());

    if (typeof panelOpen !== 'undefined' && panelOpen) {
      panelOpen = false;
      document.getElementById('right-panel')?.classList.remove('open');
    }

    if (typeof renderSidebar === 'function') renderSidebar._lastHash = null;
    if (typeof loadState === 'function') loadState();
  });

  await page.waitForTimeout(500);
}

async function resetUIFull(page) {
  await page.evaluate(() => {
    if (typeof tabs !== 'undefined') {
      for (const id of [...tabs.keys()]) {
        try { closeTab(id); } catch (_) {}
      }
    }
  });
  await resetUI(page);
}

/**
 * Capture a screenshot with a descriptive filename.
 * Files go to test-results/{suite}--{test}.png
 */
async function captureScreenshot(page, testName, suiteName) {
  const safe = (s) => s.replace(/[^a-zA-Z0-9_-]/g, '_').substring(0, 80);
  const filename = `${safe(suiteName)}--${safe(testName)}.png`;
  try {
    await page.screenshot({ path: join(RESULTS_DIR, filename), fullPage: false });
  } catch (_) {}
}

async function snapshotSessions(page) {
  const ids = await page.evaluate(async () => {
    const r = await fetch('/api/state');
    const data = await r.json();
    const sessionIds = [];
    for (const p of data.projects || []) {
      for (const s of p.sessions || []) {
        sessionIds.push(s.id);
      }
    }
    return sessionIds;
  });
  if (_originalSessionIds.size === 0) {
    _originalSessionIds = new Set(ids);
  }
}

async function cleanupServerSessions(page) {
  const originals = [..._originalSessionIds];
  await page.evaluate(async (originalIds) => {
    const r = await fetch('/api/state');
    const data = await r.json();
    for (const p of data.projects || []) {
      for (const s of p.sessions || []) {
        if (!originalIds.includes(s.id)) {
          try {
            await fetch(`/api/sessions/${s.id}/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ state: 'hidden' }) });
          } catch (_) {}
        }
      }
    }
  }, originals);
  await page.waitForTimeout(500);
}

/**
 * Wait for a session to be ready (new_* resolved to real UUID).
 * Listens for the 'session-ready' CustomEvent dispatched by loadState().
 * Falls back to polling activeTabId if event doesn't fire within timeout.
 */
async function waitForSessionReady(page, timeoutMs = 30000) {
  const resolved = await page.evaluate((timeout) => {
    return new Promise((resolve) => {
      // Check if already resolved
      if (typeof activeTabId !== 'undefined' && activeTabId && !activeTabId.startsWith('new_')) {
        resolve(activeTabId);
        return;
      }
      // Listen for event + poll as fallback (handles race where event fires before listener)
      let done = false;
      const finish = (id) => { if (!done) { done = true; clearTimeout(timer); clearInterval(poller); resolve(id); } };
      const timer = setTimeout(() => finish(null), timeout);
      document.addEventListener('session-ready', (e) => finish(e.detail?.id || null), { once: true });
      const poller = setInterval(() => {
        if (typeof activeTabId !== 'undefined' && activeTabId && !activeTabId.startsWith('new_')) {
          finish(activeTabId);
        }
      }, 500);
    });
  }, timeoutMs);
  return resolved;
}

module.exports = { resetUI, resetUIFull, captureScreenshot, waitForSessionReady, snapshotSessions, cleanupServerSessions };
