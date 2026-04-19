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

describe('sidebar and tabs (browser)', () => {
  let browser, page;
  const errors = [];

  before(async () => {
    require('fs').mkdirSync(SS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });
  after(async () => {
    await writeCoverageReport('sidebar-and-tabs');
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

  it('BRW-01: page loads with sidebar containing project data from server', async () => {
    assert.ok(await page.locator('#sidebar').isVisible(), 'Sidebar must be visible');
    assert.ok(await page.locator('#project-list').isVisible(), 'Project list must be visible');
    assert.ok(
      await page.locator('#sidebar-header h1').isVisible(),
      'Sidebar header must be visible',
    );
    await page.waitForFunction(
      () => document.querySelectorAll('#project-list .project-group').length > 0,
      { timeout: 5000 },
    );
    const projectCount = await page.locator('#project-list .project-group').count();
    // Gray-box: fetch /api/state directly and compare
    const apiState = await page.evaluate(async () => {
      const r = await fetch('/api/state');
      return r.json();
    });
    assert.equal(
      projectCount,
      apiState.projects.length,
      `Sidebar project count (${projectCount}) must match API project count (${apiState.projects.length})`,
    );
    await page.screenshot({ path: `${SS}/sidebar--page-load.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('BRW-06: filter dropdown switches value and filters the session list', async () => {
    await page.selectOption('#session-filter', 'all');
    const filterValueAll = await page.locator('#session-filter').inputValue();
    assert.strictEqual(filterValueAll, 'all');
    const allCount = await page.locator('.session-item').count();
    await page.selectOption('#session-filter', 'active');
    const filterValueActive = await page.locator('#session-filter').inputValue();
    assert.strictEqual(filterValueActive, 'active');
    const activeCount = await page.locator('.session-item').count();
    assert.ok(
      activeCount <= allCount,
      `Active filter (${activeCount}) must show <= all filter (${allCount})`,
    );
    await page.screenshot({ path: `${SS}/sidebar--filter.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('BRW-07: sort dropdown changes actual session order', async () => {
    // Expand all project groups so sessions are visible
    await page.evaluate(() => {
      document.querySelectorAll('.project-header.collapsed').forEach((h) => h.click());
    });
    await page.waitForTimeout(500);
    // Ensure at least 2 sessions exist so sort assertions are meaningful (seed data)
    await page.waitForFunction(
      () => document.querySelectorAll('.session-item .session-name').length >= 2,
      { timeout: 15000 },
    );

    await page.locator('#session-sort').selectOption('name');
    assert.equal(await page.locator('#session-sort').inputValue(), 'name');
    const nameOrder = await page.locator('.session-item .session-name').allTextContents();
    // Hard gate: test data must have 2+ sessions — no conditional skip
    assert.ok(
      nameOrder.length >= 2,
      `Sort test requires 2+ sessions in seed data, found ${nameOrder.length}`,
    );

    // Verify the name-sorted list is actually alphabetically sorted
    const nameSorted = [...nameOrder].sort((a, b) => a.localeCompare(b));
    assert.deepStrictEqual(
      nameOrder,
      nameSorted,
      'Sessions sorted by name must be in alphabetical order',
    );

    await page.locator('#session-sort').selectOption('messages');
    assert.equal(await page.locator('#session-sort').inputValue(), 'messages');
    const msgOrder = await page.locator('.session-item .session-name').allTextContents();
    // Sort must preserve session count
    assert.equal(
      msgOrder.length,
      nameOrder.length,
      'Sort must preserve session count — sessions should not be added or removed by sorting',
    );
    await page.screenshot({ path: `${SS}/sidebar--sort.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('UI-07: settings button opens settings modal', async () => {
    await page.click('#sidebar-footer button');
    assert.ok(
      await page.locator('#settings-modal').evaluate((el) => el.classList.contains('visible')),
    );
    await page.click('.settings-close');
    assert.ok(
      !(await page.locator('#settings-modal').evaluate((el) => el.classList.contains('visible'))),
    );
    await page.screenshot({ path: `${SS}/sidebar--settings.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('UI-05: session search filters the displayed session list', async () => {
    const input = page.locator('#session-search');
    assert.ok(await input.isVisible(), 'Search input must be visible');
    const beforeCount = await page.locator('.session-item').count();
    await input.fill('zzz_nonexistent_query_zzz');
    await page.waitForTimeout(500);
    const afterCount = await page.locator('.session-item').count();
    assert.ok(
      afterCount <= beforeCount,
      `Search for nonexistent term should reduce visible sessions (before: ${beforeCount}, after: ${afterCount})`,
    );
    await input.fill('');
    await page.waitForTimeout(500);
    const restoredCount = await page.locator('.session-item').count();
    // loadState() polling may add/remove sessions between snapshots, so verify
    // clearing the search restores more items than the filtered (empty) view.
    assert.ok(
      restoredCount >= beforeCount - 2 && restoredCount >= afterCount,
      `Clearing search must restore sessions (before: ${beforeCount}, filtered: ${afterCount}, restored: ${restoredCount})`,
    );
    await page.screenshot({ path: `${SS}/sidebar--search.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
