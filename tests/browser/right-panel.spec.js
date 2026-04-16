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

describe('right panel (browser)', () => {
  let browser, page;
  const errors = [];

  before(async () => {
    require('fs').mkdirSync(SS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });
  after(async () => {
    await writeCoverageReport('right-panel');
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

  it('UI-21: panel toggle show/hide adjusts layout', async () => {
    const panel = page.locator('#right-panel');
    assert.ok(
      !(await panel.evaluate((el) => el.classList.contains('open'))),
      'Panel should be closed initially',
    );
    const mainWidthBefore = await page.locator('#main').evaluate((el) => el.offsetWidth);
    await page.click('#panel-toggle');
    assert.ok(
      await panel.evaluate((el) => el.classList.contains('open')),
      'Panel must open on toggle click',
    );
    const mainWidthAfter = await page.locator('#main').evaluate((el) => el.offsetWidth);
    assert.ok(
      mainWidthAfter <= mainWidthBefore,
      `Main area width should decrease when panel opens (before: ${mainWidthBefore}, after: ${mainWidthAfter})`,
    );
    const panelWidth = await panel.evaluate((el) => el.offsetWidth);
    assert.ok(panelWidth > 0, 'Open panel must have visible width');
    await page.click('#panel-toggle');
    assert.ok(
      !(await panel.evaluate((el) => el.classList.contains('open'))),
      'Panel must close on second toggle',
    );
    await page.screenshot({ path: `${SS}/panel--toggle.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('panel tabs switch content between files and tasks', async () => {
    await page.click('#panel-toggle');

    // Switch to tasks tab
    await page.click('[data-panel="tasks"]');
    assert.ok(
      await page.locator('#panel-tasks').isVisible(),
      'Tasks panel must be visible after tab click',
    );
    assert.ok(
      !(await page.locator('#panel-files').isVisible()),
      'Files panel must be hidden when tasks is active',
    );
    const tasksHasUI = await page
      .locator(
        '#panel-tasks #task-tree, #panel-tasks input, #panel-tasks button',
      )
      .count();
    assert.ok(
      tasksHasUI > 0,
      'Tasks panel must contain task UI elements (tree, input, or buttons)',
    );

    // Switch back to files tab
    await page.click('[data-panel="files"]');
    assert.ok(
      await page.locator('#panel-files').isVisible(),
      'Files panel must be visible after tab click',
    );
    assert.ok(
      !(await page.locator('#panel-tasks').isVisible()),
      'Tasks panel must be hidden when files is active',
    );

    await page.screenshot({ path: `${SS}/panel--tabs.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
