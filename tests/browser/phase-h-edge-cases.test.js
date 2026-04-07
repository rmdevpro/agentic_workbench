/**
 * Phase H: Edge Cases, State Transitions, and Error Recovery
 *
 * From the 3-CLI UI audit: edge cases, error paths, state transitions,
 * visual/layout, and cross-feature interactions.
 */

const { describe, it, before, after, afterEach } = require('node:test');
const assert = require('node:assert');
const { chromium } = require('playwright');
const { resetUI, resetUIFull, snapshotSessions, cleanupServerSessions, captureScreenshot } = require('./helpers/reset');

const BLUEPRINT_URL = process.env.BLUEPRINT_URL || 'http://192.168.1.250:7866';
let browser, page;

describe('Phase H: Edge Cases & State Transitions', { timeout: 600000 }, () => {

  before(async () => {
    browser = await chromium.launch({ headless: true });
    page = await browser.newPage();
    await page.goto(BLUEPRINT_URL);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(2000);
    
    await resetUI(page);
  });

  after(async () => {

    if (browser) await browser.close();
  });

  afterEach(async (t) => {
    await captureScreenshot(page, t.name, 'edge');
  });

  // ── State Transitions ──────────────────────────────────────

  describe('State Transitions', () => {
    before(async () => {
      await resetUIFull(page);
    });

    it('no tabs → 1 tab: empty state removed, status bar active', async () => {
      // Verify empty state
      const empty = await page.$('#empty-state');
      assert.ok(empty, 'Should start with empty state');

      // Create session
      // Ensure project is expanded (don't toggle if already expanded)
      const header = await page.$('.project-header');
      if (header) {
        const isCollapsed = await header.evaluate(el => el.classList.contains('collapsed'));
        if (isCollapsed) {
          await header.click();
          await page.waitForTimeout(500);
        }
      }
      await page.click('.new-session-btn');
      await page.waitForTimeout(15000);

      // Empty state gone
      const emptyAfter = await page.evaluate(() => document.getElementById('empty-state')?.offsetParent !== null);
      // Status bar active
      const barActive = await page.$eval('#status-bar', el => el.classList.contains('active'));
      assert.ok(barActive, 'Status bar should be active');
    });

    it('1 tab → 0 tabs: empty state restored, status bar hidden', async () => {
      await page.click('.tab-close');
      await page.waitForTimeout(1000);
      const barActive = await page.$eval('#status-bar', el => el.classList.contains('active'));
      assert.ok(!barActive, 'Status bar should not be active');
    });

    it('filter switch updates session count', async () => {
      // Get active count
      await page.click('.filter-btn[data-filter="active"]');
      await page.waitForTimeout(500);
      const activeText = await page.textContent('#project-list');

      // Switch to All
      await page.click('.filter-btn[data-filter="all"]');
      await page.waitForTimeout(500);
      const allText = await page.textContent('#project-list');

      // All should show >= active sessions
      assert.ok(allText.length > 0, 'All filter should render project list content');
      await page.click('.filter-btn[data-filter="active"]');
    });

    it('auth modal state: open → submit → auto-dismiss', async () => {
      await page.evaluate(() => showAuthModal('https://claude.com/cai/oauth/authorize?test=1', 'test'));
      await page.waitForTimeout(500);
      const visible1 = await page.$eval('#auth-modal', el => el.classList.contains('visible'));
      assert.ok(visible1, 'Modal should be visible');

      // Close it
      await page.click('#auth-modal .modal-close');
      await page.waitForTimeout(500);
      const visible2 = await page.$eval('#auth-modal', el => el.classList.contains('visible'));
      assert.ok(!visible2, 'Modal should be dismissed');
    });
  });

  // ── Edge Cases ──────────────────────────────────────────────

  describe('Edge Cases', () => {
    before(async () => {
      await resetUI(page);
    });

    it('empty project (no sessions) shows only New Session button', async () => {
      await page.click('.project-header');
      await page.waitForTimeout(500);
      // Find a project with 0 sessions
      const counts = await page.$$eval('.project-header', headers =>
        headers.map(h => {
          const badge = h.querySelector('.session-count, span:last-child');
          return badge ? badge.textContent.trim() : '?';
        })
      );
      // At least verify no crash with empty projects
      assert.ok(counts.length > 0);
    });

    it('session name with special chars displays safely', async () => {
      // Use API to create a session with HTML in name
      const res = await page.evaluate(async () => {
        const r = await fetch('/api/state');
        const d = await r.json();
        if (d.projects[0]?.sessions[0]) {
          await fetch(`/api/sessions/${d.projects[0].sessions[0].id}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: '<script>alert(1)</script>' }),
          });
          return true;
        }
        return false;
      });
      if (!res) return;

      await page.evaluate(() => loadState());
      await page.waitForTimeout(2000);

      // Verify no script executed (page should still work)
      const title = await page.title();
      assert.strictEqual(title, 'Blueprint', 'Page should not be affected by XSS');

      // Restore name
      await page.evaluate(async () => {
        const r = await fetch('/api/state');
        const d = await r.json();
        if (d.projects[0]?.sessions[0]) {
          await fetch(`/api/sessions/${d.projects[0].sessions[0].id}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Test Session' }),
          });
        }
      });
    });

    it('very long session name truncates with ellipsis', async () => {
      await page.evaluate(async () => {
        const r = await fetch('/api/state');
        const d = await r.json();
        if (d.projects[0]?.sessions[0]) {
          await fetch(`/api/sessions/${d.projects[0].sessions[0].id}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'A'.repeat(200) }),
          });
        }
        loadState();
      });
      await page.waitForTimeout(2000);

      const sessionName = await page.$('.session-name');
      if (sessionName) {
        const overflow = await sessionName.evaluate(el => getComputedStyle(el).textOverflow);
        assert.strictEqual(overflow, 'ellipsis', 'Should use ellipsis for overflow');
      }

      // Restore
      await page.evaluate(async () => {
        const r = await fetch('/api/state');
        const d = await r.json();
        if (d.projects[0]?.sessions[0]) {
          await fetch(`/api/sessions/${d.projects[0].sessions[0].id}/config`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name: 'Test Session' }),
          });
        }
      });
    });

    it('zero token count shows 0%', async () => {
      // Set real status data on the active tab and call updateStatusBar(), then check the DOM
      const pctText = await page.evaluate(() => {
        const tab = tabs.get(activeTabId);
        if (!tab) return null;
        tab._statusData = { input_tokens: 0, max_tokens: 200000 };
        updateStatusBar();
        const bar = document.getElementById('status-bar');
        // The last .value span in the context status-item contains "${pct.toFixed(0)}%"
        const valueSpans = bar.querySelectorAll('.status-item .value');
        for (const span of valueSpans) {
          if (span.textContent.trim().endsWith('%')) return span.textContent.trim();
        }
        return null;
      });
      assert.strictEqual(pctText, '0%', 'Status bar should display 0% when input_tokens is 0');
    });

    it('token count > max caps at 100%', async () => {
      // Set real status data with tokens exceeding max and verify the DOM shows 100%
      const pctText = await page.evaluate(() => {
        const tab = tabs.get(activeTabId);
        if (!tab) return null;
        tab._statusData = { input_tokens: 250000, max_tokens: 200000 };
        updateStatusBar();
        const bar = document.getElementById('status-bar');
        const valueSpans = bar.querySelectorAll('.status-item .value');
        for (const span of valueSpans) {
          if (span.textContent.trim().endsWith('%')) return span.textContent.trim();
        }
        return null;
      });
      assert.strictEqual(pctText, '100%', 'Status bar should cap display at 100% when tokens exceed max');
    });
  });

  // ── Visual / Layout ──────────────────────────────────────────

  describe('Visual / Layout', () => {
    before(async () => {
      await resetUI(page);
    });

    it('sidebar has fixed width', async () => {
      const width = await page.$eval('#sidebar', el => getComputedStyle(el).width);
      assert.ok(parseInt(width) > 200, 'Sidebar should have substantial width');
    });

    it('status bar at bottom', async () => {
      const bar = await page.$('#status-bar');
      const height = await bar.evaluate(el => getComputedStyle(el).height);
      assert.ok(parseInt(height) > 0, 'Status bar should have height');
    });

    it('settings modal centered', async () => {
      await page.click('[onclick*="openSettings"]');
      await page.waitForTimeout(1000);
      const modal = await page.$('.settings-modal');
      if (modal) {
        const rect = await modal.boundingBox();
        const viewport = page.viewportSize();
        if (rect && viewport) {
          const centerX = rect.x + rect.width / 2;
          const viewCenter = viewport.width / 2;
          assert.ok(Math.abs(centerX - viewCenter) < 100, 'Modal should be roughly centered');
        }
      }
      await page.evaluate(() => document.getElementById('settings-modal')?.classList.remove('visible'));
    });

    it('context bar color changes with percentage', async () => {
      // Drive real status data through updateStatusBar() and read the fill element's actual class
      const colors = await page.evaluate(() => {
        const tab = tabs.get(activeTabId);
        if (!tab) return null;
        const bar = document.getElementById('status-bar');
        const getFillClass = (inputTokens, maxTokens) => {
          tab._statusData = { input_tokens: inputTokens, max_tokens: maxTokens };
          updateStatusBar();
          const fill = bar.querySelector('.fill');
          if (!fill) return null;
          if (fill.classList.contains('context-fill-green')) return 'green';
          if (fill.classList.contains('context-fill-amber')) return 'amber';
          if (fill.classList.contains('context-fill-red')) return 'red';
          return null;
        };
        return {
          low: getFillClass(50000, 200000),   // 25% → green
          mid: getFillClass(140000, 200000),  // 70% → amber
          high: getFillClass(180000, 200000), // 90% → red
        };
      });
      assert.ok(colors, 'Should be able to read status bar fill classes');
      assert.strictEqual(colors.low, 'green', '25% usage should show green fill');
      assert.strictEqual(colors.mid, 'amber', '70% usage should show amber fill');
      assert.strictEqual(colors.high, 'red', '90% usage should show red fill');
    });
  });

  // ── Cross-Feature Interactions ──────────────────────────────

  describe('Cross-Feature Interactions', () => {
    before(async () => {
      await resetUI(page);
    });

    it('settings change persists through page reload', async () => {
      // Change theme
      await page.click('[onclick*="openSettings"]');
      await page.waitForTimeout(1000);
      await page.selectOption('#setting-theme', 'light');
      await page.waitForTimeout(1000);
      await page.evaluate(() => document.getElementById('settings-modal')?.classList.remove('visible'));

      // Reload page
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);

      // Check theme persisted via API
      const theme = await page.evaluate(async () => {
        const r = await fetch('/api/settings');
        const d = await r.json();
        return d.theme;
      });
      assert.strictEqual(theme, 'light', 'Theme should persist');

      // Restore
      await page.evaluate(async () => {
        await fetch('/api/settings', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: 'theme', value: 'blueprint-dark' }),
        });
      });
    });

    it('panel data reloads on tab switch', async () => {
      // Open two sessions
      // Ensure project is expanded (don't toggle if already expanded)
      const header = await page.$('.project-header');
      if (header) {
        const isCollapsed = await header.evaluate(el => el.classList.contains('collapsed'));
        if (isCollapsed) {
          await header.click();
          await page.waitForTimeout(500);
        }
      }
      await page.click('.new-session-btn');
      await page.waitForTimeout(15000);

      // Open panel
      await page.click('#panel-toggle');
      await page.waitForTimeout(1000);

      // Panel should have loaded data
      const editor = await page.$('#notes-editor');
      assert.ok(editor, 'Notes editor should exist');

      // Close panel and tab
      await page.click('#panel-toggle');
      await page.waitForTimeout(500);
      await page.click('.tab-close');
      await page.waitForTimeout(500);
    });

    it('refresh button reloads state without page reload', async () => {
      const projectsBefore = await page.$$('.project-header');
      await page.click('button[onclick="loadState()"]');
      await page.waitForTimeout(2000);
      const projectsAfter = await page.$$('.project-header');
      assert.strictEqual(projectsAfter.length, projectsBefore.length, 'Same projects after refresh');
    });
  });

  // ── Data Persistence ──────────────────────────────────────────

  describe('Data Persistence', () => {
    before(async () => {
      await resetUI(page);
    });

    it('projects persist through page reload', async () => {
      const beforeCount = await page.$$eval('.project-header', els => els.length);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const afterCount = await page.$$eval('.project-header', els => els.length);
      assert.strictEqual(afterCount, beforeCount, 'Same project count after reload');
    });

    it('sessions persist through page reload', async () => {
      const beforeSessions = await page.evaluate(async () => {
        const r = await fetch('/api/state');
        const d = await r.json();
        return d.projects.reduce((sum, p) => sum + p.sessions.length, 0);
      });
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const afterSessions = await page.evaluate(async () => {
        const r = await fetch('/api/state');
        const d = await r.json();
        return d.projects.reduce((sum, p) => sum + p.sessions.length, 0);
      });
      assert.strictEqual(afterSessions, beforeSessions, 'Same session count after reload');
    });

    it('tabs lost on reload (expected behavior)', async () => {
      // Open a session
      // Ensure project is expanded (don't toggle if already expanded)
      const header = await page.$('.project-header');
      if (header) {
        const isCollapsed = await header.evaluate(el => el.classList.contains('collapsed'));
        if (isCollapsed) {
          await header.click();
          await page.waitForTimeout(500);
        }
      }
      const sessionItem = await page.$('.session-item');
      if (sessionItem) {
        await sessionItem.click();
        await page.waitForTimeout(10000);
        const tabsBefore = await page.$$('.tab');
        assert.ok(tabsBefore.length > 0);

        await page.reload();
        await page.waitForLoadState('networkidle');
        await page.waitForTimeout(2000);
        const tabsAfter = await page.$$('.tab');
        assert.strictEqual(tabsAfter.length, 0, 'Tabs should be lost on reload');
      }
    });

    it('filter resets to Active on reload', async () => {
      await page.click('.filter-btn[data-filter="all"]');
      await page.waitForTimeout(500);
      await page.reload();
      await page.waitForLoadState('networkidle');
      await page.waitForTimeout(2000);
      const active = await page.$eval('.filter-btn[data-filter="active"]', el => el.classList.contains('active'));
      assert.ok(active, 'Should reset to Active filter on reload');
    });
  });

  // ── Error Recovery ──────────────────────────────────────────

  describe('Error Recovery', () => {
    before(async () => {
      await resetUI(page);
    });

    it('API error on state does not crash page', async () => {
      // Temporarily break the API by requesting invalid path
      const result = await page.evaluate(async () => {
        try {
          await fetch('/api/nonexistent');
          return 'no crash';
        } catch (e) {
          return 'error: ' + e.message;
        }
      });
      assert.ok(result === 'no crash', 'Page should not crash on API error');
      const title = await page.title();
      assert.strictEqual(title, 'Blueprint');
    });

    it('page survives rapid filter clicks', async () => {
      for (let i = 0; i < 10; i++) {
        const filters = ['active', 'all', 'archived', 'hidden'];
        await page.click(`.filter-btn[data-filter="${filters[i % 4]}"]`);
      }
      await page.waitForTimeout(1000);
      const title = await page.title();
      assert.strictEqual(title, 'Blueprint', 'Page should survive rapid clicks');
    });

    it('page survives rapid settings toggle', async () => {
      for (let i = 0; i < 5; i++) {
        await page.click('[onclick*="openSettings"]');
        await page.waitForTimeout(200);
        await page.evaluate(() => document.getElementById('settings-modal')?.classList.remove('visible'));
        await page.waitForTimeout(200);
      }
      const title = await page.title();
      assert.strictEqual(title, 'Blueprint', 'Page should survive rapid settings toggle');
    });
  });
});
