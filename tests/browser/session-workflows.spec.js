'use strict';

const { describe, it, before, after, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  process.exit(0);
}

const { resetBaseline, BASE_URL: _BASE_URL } = require('../helpers/reset-state');
const { startCoverage, stopCoverage, writeCoverageReport } = require('../helpers/browser-coverage');
const SS = require('path').join(__dirname, 'screenshots');

describe('session workflows (browser)', () => {
  let browser, page;
  const errors = [];

  before(async () => {
    require('fs').mkdirSync(SS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });
  after(async () => {
    await writeCoverageReport('session-workflows');
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

  it('BRW-25: empty state shows actionable UI with hint text', async () => {
    const emptyState = page.locator('#empty-state');
    // Hard assertion: empty state MUST be visible on initial load with no session open.
    // If it is not visible, loadState() or the UI is broken — this must not pass silently.
    assert.ok(
      await emptyState.isVisible(),
      'Empty state (#empty-state) must be visible on initial page load when no session is open',
    );
    const text = await emptyState.textContent();
    assert.ok(
      text.includes('Select a session') || text.includes('create') || text.includes('new'),
      'Empty state must contain actionable hint text',
    );
    const hasAction = await page
      .locator('#empty-state a, #empty-state button, #empty-state [onclick]')
      .count();
    const hasHintText =
      text.includes('Select') ||
      text.includes('create') ||
      text.includes('sidebar') ||
      text.includes('project') ||
      text.includes('Ctrl') ||
      text.includes('+');
    assert.ok(
      hasAction > 0 || hasHintText,
      'Empty state should provide an action (button/link) or instructional hint text directing users to the sidebar',
    );
    await page.screenshot({ path: `${SS}/session--empty-state.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('BRW-30: rapid new-session clicks do not create duplicate modals', async () => {
    // Verify no overlays exist initially
    assert.equal(
      await page.locator('[id^="new-session-overlay-"]').count(),
      0,
      'No session overlays should exist on initial page load',
    );
    // Wait for seed data to load (project groups with new-session buttons)
    await page.waitForFunction(() => document.querySelectorAll('.new-btn').length > 0, {
      timeout: 15000,
    });
    const newBtn = page.locator('.new-btn').first();
    assert.ok(
      (await newBtn.count()) > 0,
      'At least one new-session button must exist in the sidebar',
    );
    // Rapid double-click — use force:true on second click because the first click
    // opens an overlay that intercepts pointer events (correct double-click prevention).
    // We verify the app creates at most one overlay, not that Playwright can click through them.
    await newBtn.click({ clickCount: 1 });
    await newBtn.click({ clickCount: 1, force: true, timeout: 2000 }).catch(() => {});
    await page.waitForTimeout(500);
    // Verify at most one overlay was created (no duplicates)
    const overlayCount = await page.locator('[id^="new-session-overlay-"]').count();
    assert.ok(
      overlayCount <= 1,
      `Rapid clicks must not create duplicate modals (found ${overlayCount})`,
    );
    await page.screenshot({ path: `${SS}/session--no-duplicate.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
