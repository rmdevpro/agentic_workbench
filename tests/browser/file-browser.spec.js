'use strict';

const { describe, it, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
let chromium;
try { ({ chromium } = require('playwright')); } catch { process.exit(0); }

const { resetBaseline } = require('../helpers/reset-state');
const SS = require('path').join(__dirname, 'screenshots');

describe('file browser (browser)', () => {
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

  it('BRW-09: file browser panel loads and shows tree container', async () => {
    await page.click('#panel-toggle');
    await page.click('[data-panel="files"]');
    assert.ok(await page.locator('#file-browser-tree').isVisible());
    await page.screenshot({ path: `${SS}/files--panel.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
