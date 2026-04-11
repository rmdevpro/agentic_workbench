'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch { process.exit(0); }

const { resetBaseline } = require('../helpers/reset-state');
const SS = require('path').join(__dirname, 'screenshots');

describe('reconnect (browser)', () => {
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

  it('UI-55: reconnect constants configured correctly', async () => {
    assert.equal(await page.evaluate(() => MAX_RECONNECT_DELAY), 30000);
    assert.equal(await page.evaluate(() => HEARTBEAT_MS), 30000);
    await page.screenshot({ path: `${SS}/reconnect--constants.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('BRW-24: resize does not crash or produce console errors', async () => {
    await page.setViewportSize({ width: 800, height: 600 });
    await page.waitForTimeout(200);
    await page.setViewportSize({ width: 1200, height: 800 });
    await page.waitForTimeout(200);
    await page.screenshot({ path: `${SS}/reconnect--resize.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
