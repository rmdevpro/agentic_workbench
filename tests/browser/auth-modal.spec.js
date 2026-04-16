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

describe('auth modal (browser)', () => {
  let browser, page;
  const errors = [];

  before(async () => {
    require('fs').mkdirSync(SS, { recursive: true });
    browser = await chromium.launch({ headless: true });
  });
  after(async () => {
    await writeCoverageReport('auth-modal');
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

  it('auth modal structure and close button', async () => {
    assert.ok(
      (await page.locator('#auth-modal').count()) > 0,
      'Auth modal element must exist in DOM',
    );
    assert.ok((await page.locator('#auth-code-input').count()) > 0, 'Auth code input must exist');
    assert.ok(
      (await page.locator('#auth-code-submit').count()) > 0,
      'Auth code submit button must exist',
    );
    assert.ok((await page.locator('.modal-close').count()) > 0, 'Modal close button must exist');
    // Behavioral: make the modal visible, then verify close button dismisses it
    await page.evaluate(() => {
      const modal = document.getElementById('auth-modal');
      if (modal) modal.classList.add('visible');
    });
    assert.ok(
      await page.locator('#auth-modal').evaluate((el) => el.classList.contains('visible')),
      'Auth modal must be visible after programmatic show',
    );
    await page.click('.modal-close');
    assert.ok(
      !(await page.locator('#auth-modal').evaluate((el) => el.classList.contains('visible'))),
      'Clicking close button must hide the auth modal',
    );
    await page.screenshot({ path: `${SS}/auth--structure.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('BRW-27: auth banner appears when credentials invalid', async () => {
    await page.waitForTimeout(2000);
    const bannerExists = (await page.locator('#auth-banner').count()) > 0;
    assert.ok(bannerExists, 'Auth banner must appear when credentials are invalid');
    const bannerText = await page.locator('#auth-banner').textContent();
    assert.ok(bannerText.length > 0, 'Auth banner must contain text describing the auth state');
    await page.screenshot({ path: `${SS}/auth--banner-check.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });

  it('BRW-28: auth URL extraction works via real checkForAuthIssue in browser', async () => {
    const result = await page.evaluate(() => {
      if (typeof checkForAuthIssue !== 'function') {
        return { error: 'checkForAuthIssue function not found in page context' };
      }
      if (typeof ptyOutputBuffer === 'undefined') {
        return { error: 'ptyOutputBuffer not found in page context' };
      }
      const testTabId = 'brw28_test_tab';
      const testData =
        '\x1b[31mhttps://claude.com/cai/oauth/authorize?code=test123\x1b[0m some text Paste code here';
      ptyOutputBuffer.set(testTabId, testData);

      let capturedUrl = null;
      const origShowAuthModal = typeof showAuthModal === 'function' ? showAuthModal : null;
      window.showAuthModal = (url) => {
        capturedUrl = url;
      };

      try {
        checkForAuthIssue(testTabId);
      } catch (e) {
        return { error: `checkForAuthIssue threw: ${e.message}` };
      } finally {
        if (origShowAuthModal) window.showAuthModal = origShowAuthModal;
        ptyOutputBuffer.delete(testTabId);
      }

      return { url: capturedUrl };
    });

    assert.ok(!result.error, `Browser-side error: ${result.error}`);
    assert.ok(result.url, 'checkForAuthIssue must detect the OAuth URL and call showAuthModal');
    assert.ok(
      result.url.startsWith('https://claude.com/cai/oauth/authorize?'),
      `Extracted URL must be a valid OAuth URL, got: ${result.url}`,
    );
    assert.ok(
      result.url.includes('code=test123'),
      `Extracted URL must preserve query parameters, got: ${result.url}`,
    );
    await page.screenshot({ path: `${SS}/auth--url-extraction.png` });
    assert.equal(errors.length, 0, errors.join(', '));
  });
});
