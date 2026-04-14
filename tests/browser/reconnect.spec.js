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

describe('reconnect (browser)', () => {
  let browser, page;
  const errors = [];

  before(async () => {
    require('fs').mkdirSync(SS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });
  after(async () => {
    await writeCoverageReport('reconnect');
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

  it('UI-55: reconnect logic has correct constants and connectTab creates WebSocket', async () => {
    assert.equal(await page.evaluate(() => MAX_RECONNECT_DELAY), 30000);
    assert.equal(await page.evaluate(() => HEARTBEAT_MS), 30000);
    const hasConnectTab = await page.evaluate(() => typeof connectTab === 'function');
    assert.ok(
      hasConnectTab,
      'connectTab function must be defined — this is the WebSocket connection/reconnect handler',
    );

    // Behavioral: create a tab entry first, then call connectTab to verify WebSocket creation.
    const result = await page.evaluate(() => {
      let wsUrl = null;
      let wsCreated = false;
      const OrigWS = window.WebSocket;
      window.WebSocket = function (url, ...args) {
        wsUrl = url;
        wsCreated = true;
        const ws = new OrigWS(url, ...args);
        setTimeout(() => {
          try {
            ws.close();
          } catch {}
        }, 100);
        return ws;
      };
      window.WebSocket.prototype = OrigWS.prototype;
      try {
        // Create a fake tab entry so connectTab has something to work with
        if (typeof createTab === 'function') {
          createTab('ui55_test_tab', 'ui55_tmux', 'UI55 Test', 'test_project');
        }
        connectTab('ui55_test_tab');
      } catch {
        /* may throw on missing terminal — that's OK */
      }
      window.WebSocket = OrigWS;
      return { wsUrl, wsCreated };
    });
    assert.ok(
      result.wsCreated,
      'connectTab must attempt to create a WebSocket connection when tab exists',
    );
    assert.ok(
      result.wsUrl && result.wsUrl.includes('ws'),
      `connectTab must connect to a WebSocket URL, got: ${result.wsUrl}`,
    );
    await page.screenshot({ path: `${SS}/reconnect--constants.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('BRW-24: resize triggers terminal fit without crash or layout break', async () => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(300);
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(300);
    // Behavioral: verify the viewport actually changed and layout adapted
    const afterState = await page.evaluate(() => ({
      width: window.innerWidth,
      height: window.innerHeight,
      sidebarVisible: document.getElementById('sidebar')?.offsetWidth > 0,
      mainVisible: document.getElementById('main')?.offsetWidth > 0,
    }));
    assert.equal(afterState.width, 1200, 'Viewport width must match after resize');
    assert.ok(afterState.sidebarVisible, 'Sidebar must remain visible after resize');
    assert.ok(afterState.mainVisible, 'Main content area must remain visible after resize');
    await page.screenshot({ path: `${SS}/reconnect--resize.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
