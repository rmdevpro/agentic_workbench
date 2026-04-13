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

  it('UI-55: reconnect logic has correct constants and connectTab function', async () => {
    assert.equal(await page.evaluate(() => MAX_RECONNECT_DELAY), 30000);
    assert.equal(await page.evaluate(() => HEARTBEAT_MS), 30000);
    // Hard assertion: connectTab must specifically exist — it is the real reconnect function.
    // The previous version used a disjunction of 4 function names which was too permissive.
    const hasConnectTab = await page.evaluate(() => typeof connectTab === 'function');
    assert.ok(
      hasConnectTab,
      'connectTab function must be defined — this is the WebSocket connection/reconnect handler',
    );
    // Verify connectTab has reconnect logic by checking it references the backoff constants
    const fnSource = await page.evaluate(() => connectTab.toString());
    assert.ok(
      fnSource.includes('MAX_RECONNECT_DELAY') ||
        fnSource.includes('reconnect') ||
        fnSource.includes('onclose'),
      'connectTab must contain reconnect/backoff logic (references MAX_RECONNECT_DELAY, reconnect, or onclose)',
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
