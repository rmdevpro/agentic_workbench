'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch { process.exit(0); }

const { resetBaseline } = require('../helpers/reset-state');
const SS = require('path').join(__dirname, 'screenshots');

describe('usability (browser)', () => {
  let browser, page;
  const errors = [];

  before(async () => { require('fs').mkdirSync(SS, { recursive: true }); browser = await chromium.launch({ headless: true }); });
  after(async () => { if (browser) await browser.close(); });
  beforeEach(async () => {
    errors.length = 0;
    const ctx = await browser.newContext();
    page = await ctx.newPage();
    page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', e => errors.push(e.message));
    await resetBaseline(page);
  });

  it('USR-01: full page renders without errors', async () => {
    // Verify key structural elements are present
    assert.ok(await page.locator('#sidebar').isVisible());
    assert.ok(await page.locator('#main').isVisible());
    assert.ok(await page.locator('#tab-bar').isVisible());
    await page.screenshot({ path: `${SS}/usability--full-page.png`, fullPage: true });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('USR-03: theme setting persists after reload', async () => {
    await page.click('#sidebar-footer button');
    await page.locator('#setting-theme').selectOption('blueprint-dark');
    await page.waitForTimeout(600);
    await page.click('.settings-close');
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);
    // Programmatic assertion: check CSS variable reflects blueprint-dark theme
    const bg = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim());
    assert.ok(bg.includes('081220'), `Expected blueprint-dark theme after reload, got bg: ${bg}`);
    await page.screenshot({ path: `${SS}/usability--settings-persist.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('Escape key closes settings modal', async () => {
    await page.click('#sidebar-footer button');
    assert.ok(await page.locator('#settings-modal').evaluate(el => el.classList.contains('visible')));
    await page.keyboard.press('Escape');
    assert.ok(!(await page.locator('#settings-modal').evaluate(el => el.classList.contains('visible'))));
    await page.screenshot({ path: `${SS}/usability--escape-close.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
