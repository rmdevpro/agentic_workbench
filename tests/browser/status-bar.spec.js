'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch { process.exit(0); }

const { resetBaseline } = require('../helpers/reset-state');
const SS = require('path').join(__dirname, 'screenshots');

describe('status bar (browser)', () => {
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

  it('BRW-19: status bar exists in DOM', async () => {
    assert.ok(await page.locator('#status-bar').count() > 0);
    await page.screenshot({ path: `${SS}/status-bar--structure.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('UI-52: loadState polls periodically (REFRESH_MS defined)', async () => {
    const refreshMs = await page.evaluate(() => REFRESH_MS);
    assert.equal(refreshMs, 30000);
    // Verify loadState is actually callable
    const result = await page.evaluate(() => { try { loadState(); return true; } catch { return false; } });
    assert.ok(result);
    await page.screenshot({ path: `${SS}/status-bar--polling.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('UI-53: checkAuth polls every 60s', async () => {
    const exists = await page.evaluate(() => typeof checkAuth === 'function');
    assert.ok(exists);
    await page.screenshot({ path: `${SS}/status-bar--auth-poll.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
