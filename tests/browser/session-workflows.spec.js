'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch { process.exit(0); }

const { resetBaseline, BASE_URL } = require('../helpers/reset-state');
const SS = require('path').join(__dirname, 'screenshots');

describe('session workflows (browser)', () => {
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

  it('BRW-25: empty state shows appropriate UI with hint', async () => {
    const emptyState = page.locator('#empty-state');
    if (await emptyState.isVisible()) {
      const text = await emptyState.textContent();
      assert.ok(text.includes('Select a session') || text.includes('create'));
    }
    await page.screenshot({ path: `${SS}/session--empty-state.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('BRW-30: no duplicate session modals from initial state', async () => {
    assert.equal(await page.locator('[id^="new-session-overlay-"]').count(), 0);
    await page.screenshot({ path: `${SS}/session--no-duplicate.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
