'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch { process.exit(0); }

const { resetBaseline } = require('../helpers/reset-state');
const SS = require('path').join(__dirname, 'screenshots');

describe('right panel (browser)', () => {
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

  it('UI-21: panel toggle show/hide', async () => {
    const panel = page.locator('#right-panel');
    assert.ok(!(await panel.evaluate(el => el.classList.contains('open'))));
    await page.click('#panel-toggle');
    assert.ok(await panel.evaluate(el => el.classList.contains('open')));
    await page.click('#panel-toggle');
    assert.ok(!(await panel.evaluate(el => el.classList.contains('open'))));
    await page.screenshot({ path: `${SS}/panel--toggle.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('panel tabs switch content sections', async () => {
    await page.click('#panel-toggle');
    await page.click('[data-panel="notes"]');
    assert.ok(await page.locator('#panel-notes').isVisible());
    assert.ok(!(await page.locator('#panel-tasks').isVisible()));
    await page.click('[data-panel="tasks"]');
    assert.ok(await page.locator('#panel-tasks').isVisible());
    assert.ok(!(await page.locator('#panel-notes').isVisible()));
    await page.click('[data-panel="messages"]');
    assert.ok(await page.locator('#panel-messages').isVisible());
    await page.screenshot({ path: `${SS}/panel--tabs.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
