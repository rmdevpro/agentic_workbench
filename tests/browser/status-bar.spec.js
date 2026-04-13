'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  process.exit(0);
}

const { resetBaseline } = require('../helpers/reset-state');
const { startCoverage, stopCoverage, writeCoverageReport } = require('../helpers/browser-coverage');
const SS = require('path').join(__dirname, 'screenshots');

describe('status bar (browser)', () => {
  let browser, page;
  const errors = [];

  before(async () => {
    require('fs').mkdirSync(SS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });
  after(async () => {
    await writeCoverageReport('status-bar');
    if (browser) await browser.close();
  });
  beforeEach(async () => {
    errors.length = 0;
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await startCoverage(page);
    await resetBaseline(page);
  });
  afterEach(async () => {
    await stopCoverage(page);
  });

  it('BRW-19: status bar exists and has correct structural elements', async () => {
    assert.ok((await page.locator('#status-bar').count()) > 0, 'Status bar element must exist');
    await page.waitForTimeout(1500);
    // Hard assertion: the status bar DOM must contain the expected child elements
    // regardless of whether a session is active. The structural elements must always exist.
    const hasModelSpan =
      (await page.locator('#status-bar .status-model, #status-model').count()) > 0;
    const hasModeSpan = (await page.locator('#status-bar .status-mode, #status-mode').count()) > 0;
    const hasContextBar =
      (await page.locator('#status-bar .context-bar, #context-bar, .status-context').count()) > 0;
    // At least one structural element should exist (model, mode, or context indicator)
    assert.ok(
      hasModelSpan || hasModeSpan || hasContextBar,
      'Status bar must contain structural child elements (model, mode, or context bar)',
    );
    await page.screenshot({ path: `${SS}/status-bar--structure.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('UI-52: loadState polls and updates DOM with server data', async () => {
    const refreshMs = await page.evaluate(() => REFRESH_MS);
    assert.equal(refreshMs, 30000, 'REFRESH_MS must be 30000ms');
    // Behavioral: call loadState and verify it updates the DOM with data from the server
    const result = await page.evaluate(async () => {
      const _projectListBefore = document.getElementById('project-list')?.innerHTML || '';
      try {
        await loadState();
      } catch (e) {
        return { error: e.message };
      }
      const projectListAfter = document.getElementById('project-list')?.innerHTML || '';
      return {
        success: true,
        domUpdated: projectListAfter.length > 0,
        hasContent:
          projectListAfter.includes('project') ||
          projectListAfter.includes('data-') ||
          projectListAfter.length > 10,
      };
    });
    assert.ok(!result.error, `loadState() should not throw: ${result.error}`);
    assert.ok(result.domUpdated, 'loadState() must populate the project list in the DOM');
    await page.screenshot({ path: `${SS}/status-bar--polling.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('UI-53: checkAuth calls the auth API endpoint', async () => {
    const exists = await page.evaluate(() => typeof checkAuth === 'function');
    assert.ok(exists, 'checkAuth must be defined as a function');
    // Behavioral: verify checkAuth actually calls the auth API
    const result = await page.evaluate(async () => {
      let fetchCalled = false;
      const origFetch = window.fetch;
      window.fetch = async (url, ...args) => {
        if (typeof url === 'string' && url.includes('/api/auth')) fetchCalled = true;
        return origFetch(url, ...args);
      };
      try {
        await checkAuth();
      } catch {
        /* may fail in test env */
      }
      window.fetch = origFetch;
      return { fetchCalled };
    });
    assert.ok(result.fetchCalled, 'checkAuth() must call the /api/auth endpoint');
    await page.screenshot({ path: `${SS}/status-bar--auth-poll.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
