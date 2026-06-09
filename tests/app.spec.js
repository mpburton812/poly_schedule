const { test, expect } = require('@playwright/test');

test.describe('PolySchedule UI E2E Flow Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to SPA
    await page.goto('/');
  });

  test('should load application and render dashboard', async ({ page }) => {
    // Check main title
    await expect(page.locator('.logo-text')).toContainText('PolySchedule');

    // Verify Schedule View (default view) is rendered
    await expect(page.locator('.week-grid')).toBeVisible();
    await expect(page.locator('.day-column').first()).toBeVisible();

    // Verify confirmed cards are rendered
    await expect(page.locator('.card-event').first()).toBeVisible();
    await expect(page.locator('.card-sleeping').first()).toBeVisible();
  });

  test('should support SPA navigation to other tabs', async ({ page }) => {
    // 1. Navigate to Proposals view (clicking mobile bottom nav link)
    await page.click('a[href="#proposals"]');
    await expect(page.url()).toContain('#proposals');
    await expect(page.locator('.tabs-nav')).toBeVisible();
    await expect(page.locator('#btn-tab-pending')).toBeVisible();

    // 2. Navigate to Logistics view
    await page.click('a[href="#logistics"]');
    await expect(page.url()).toContain('#logistics');
    await expect(page.locator('text=Collective Profiles')).toBeVisible();
    await expect(page.locator('text=Homes & Spaces')).toBeVisible();

    // 3. Open user profile modal (settings pop-up)
    await page.click('#avatar-container');
    await expect(page.locator('#app-modal')).toHaveClass(/open/);
    await expect(page.locator('text=Connection Settings')).toBeVisible();
  });

  test('should support creating a new event proposal', async ({ page }) => {
    // Navigate to Create Proposal view via FAB
    await page.click('#fab-quick-add');
    await expect(page.url()).toContain('#create');

    // Fill title
    await page.fill('#prop-title', 'Weekly Family Dinner');

    // Select partner 'Sam' (invitee)
    const samOption = page.locator('.circle-partner-option[data-name="Sam Davis"]');
    await expect(samOption).toBeVisible();
    await samOption.click();

    // Enter details
    await page.fill('#prop-duration', '18:00 - 21:00');
    
    // Submit proposal
    await page.click('#btn-submit-proposal');

    // Verify redirect to Proposals Center
    await expect(page.url()).toContain('#proposals');

    // Verify new proposal is in list
    await expect(page.locator('text=Weekly Family Dinner')).toBeVisible();
  });

  test('should trigger rules warning banner on sleep limits', async ({ page }) => {
    // Navigate to Create Proposal view via FAB
    await page.click('#fab-quick-add');
    await expect(page.url()).toContain('#create');

    // Toggle to Sleeping Arrangement
    await page.click('#btn-toggle-sleeping');

    // Fill title
    await page.fill('#prop-title', 'Extended Cabin Trip');

    // Select partner 'Sam Davis' (invitee)
    const samOption = page.locator('.circle-partner-option[data-name="Sam Davis"]');
    await samOption.click();

    // Input duration: 4 nights (Alex has preferred limit of 3 nights/week with Sam)
    await page.fill('#prop-duration', '4');

    // Verify warning banner displays
    const warningBanner = page.locator('#proposal-rules-banner');
    await expect(warningBanner).not.toHaveClass(/hidden/);
    await expect(warningBanner).toContainText('Extended Stay Alert');
  });

  test('should handle voting on a proposal', async ({ page }) => {
    // Navigate to Proposals Center
    await page.click('a[href="#proposals"]');

    // Open first pending proposal
    const firstProposalCard = page.locator('.proposal-card').first();
    await expect(firstProposalCard).toBeVisible();

    // Wait and click Accept if it's visible (offline seeded data)
    const acceptBtn = firstProposalCard.locator('text=Accept');
    
    // Mock the prompt response for comment
    page.on('dialog', async dialog => {
      expect(dialog.message()).toContain('Add an optional comment');
      await dialog.accept('I am excited!');
    });

    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      // Verify success notification / toast
      await expect(page.locator('#toast-container')).toBeVisible();
      await expect(page.locator('#toast-container')).toContainText('Vote submitted');
    }
  });
});
