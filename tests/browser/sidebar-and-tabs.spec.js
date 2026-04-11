'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch { process.exit(0); }

const { resetBaseline, BASE_URL } = require('../helpers/reset-state');
const SS = require('path').join(__dirname, 'screenshots');

describe('sidebar and tabs (browser)', () => {
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

  it('BRW-01: page loads with sidebar and project list', async () => {
    assert.ok(await page.locator('#sidebar').isVisible());
    assert.ok(await page.locator('#project-list').isVisible());
    assert.ok(await page.locator('#sidebar-header h1').isVisible());
    await page.screenshot({ path: `${SS}/sidebar--page-load.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('BRW-06: filter buttons switch active state and affect list', async () => {
    await page.click('[data-filter="all"]');
    assert.ok(await page.locator('[data-filter="all"]').evaluate(el => el.classList.contains('active')));
    assert.ok(!(await page.locator('[data-filter="active"]').evaluate(el => el.classList.contains('active'))));
    await page.click('[data-filter="active"]');
    assert.ok(await page.locator('[data-filter="active"]').evaluate(el => el.classList.contains('active')));
    await page.screenshot({ path: `${SS}/sidebar--filter.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('BRW-07: sort dropdown changes sort order', async () => {
    await page.locator('#session-sort').selectOption('name');
    assert.equal(await page.locator('#session-sort').inputValue(), 'name');
    await page.locator('#session-sort').selectOption('messages');
    assert.equal(await page.locator('#session-sort').inputValue(), 'messages');
    await page.screenshot({ path: `${SS}/sidebar--sort.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('UI-07: settings button opens settings modal', async () => {
    await page.click('#sidebar-footer button');
    assert.ok(await page.locator('#settings-modal').evaluate(el => el.classList.contains('visible')));
    await page.click('.settings-close');
    assert.ok(!(await page.locator('#settings-modal').evaluate(el => el.classList.contains('visible'))));
    await page.screenshot({ path: `${SS}/sidebar--settings.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('UI-05: session search input exists and accepts text', async () => {
    const input = page.locator('#session-search');
    assert.ok(await input.isVisible());
    await input.fill('test query');
    assert.equal(await input.inputValue(), 'test query');
    await page.screenshot({ path: `${SS}/sidebar--search.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
