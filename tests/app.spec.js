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

  test('should redirect non-admins away from #admin', async ({ page }) => {
    // Set localStorage user to Sam Davis (who is a User, not Admin)
    await page.addInitScript(() => {
      localStorage.setItem('polyschedule_user_profile', JSON.stringify({
        id: 'p2',
        name: 'Sam Davis',
        username: 'sam',
        password: 'password123',
        email: 'sam@example.com',
        picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'
      }));
    });
    
    await page.goto('/#admin');
    await expect(page.url()).toContain('#schedule');
  });

  test('should show Admin nav links only for admins', async ({ page }) => {
    // For admin (default: Alex)
    await page.goto('/');
    await expect(page.locator('#side-nav-admin')).toBeVisible();
    await expect(page.locator('#mobile-nav-admin')).toBeVisible();

    // For non-admin (Sam)
    await page.addInitScript(() => {
      localStorage.setItem('polyschedule_user_profile', JSON.stringify({
        id: 'p2',
        name: 'Sam Davis',
        username: 'sam',
        password: 'password123',
        email: 'sam@example.com',
        picture: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80'
      }));
    });
    await page.goto('/');
    await expect(page.locator('#side-nav-admin')).not.toBeVisible();
    await expect(page.locator('#mobile-nav-admin')).not.toBeVisible();
  });

  test('should support editing profile settings', async ({ page }) => {
    await page.goto('/');
    
    // Open user profile modal
    await page.click('#avatar-container');
    await expect(page.locator('#app-modal')).toHaveClass(/open/);

    // Edit details
    await page.fill('#setting-display-name', 'Alex R. Rivera');
    await page.fill('#setting-username', 'alexrr');
    await page.fill('#setting-password', 'newsecretpwd');

    // Select the third avatar option
    await page.locator('#setting-avatar-options .avatar-option').nth(2).click();

    // Click save profile
    await page.click('#btn-save-profile');

    // Verify success toast
    await expect(page.locator('#toast-container')).toContainText('Profile updated');

    // Verify display name in profile modal header is updated
    await expect(page.locator('h3:has-text("Alex R. Rivera")')).toBeVisible();
  });

  test('should support modifying Poly Family Name in admin panel', async ({ page }) => {
    await page.goto('/');
    
    // Navigate to admin
    await page.click('a[href="#admin"]');
    await expect(page.url()).toContain('#admin');

    // Fill in family name
    await page.fill('#admin-poly-family-name', 'Rivera Poly Circle');

    // Navigate to Create Proposal view via FAB
    await page.click('#fab-quick-add');
    await expect(page.url()).toContain('#create');

    // Check that family name label matches
    await expect(page.locator('text=Rivera Poly Circle (Invitees)')).toBeVisible();
  });

  test('should support adding a partner with settings and sleeping rules', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="#logistics"]');
    await page.click('#btn-add-partner');
    await expect(page.url()).toContain('#add-partner');

    await page.fill('#new-partner-name', 'Robin Williams');
    await page.fill('#new-partner-username', 'robin');
    await page.fill('#new-partner-password', 'password123');
    await page.selectOption('#new-partner-role', 'User');

    // Select avatar (click 2nd one)
    await page.locator('#new-partner-avatar-options .avatar-option').nth(1).click();

    // Check Sam Davis as sleeping partner
    const samCheckbox = page.locator('.sleeping-partner-checkbox[data-partner-name="Sam Davis"]');
    await samCheckbox.check();

    // Fill partner nights limits
    const partnerCard = page.locator('div', { has: page.locator('input[data-partner-name="Sam Davis"]') });
    await partnerCard.locator('.partner-min-nights').fill('2');
    await partnerCard.locator('.partner-max-nights').fill('5');

    // Fill solo nights limit
    await page.fill('#new-partner-solo-nights', '3');

    // Click submit
    await page.click('#btn-submit-partner');

    // Verify redirected back to logistics
    await expect(page.url()).toContain('#logistics');
    
    // Verify partner is added in list
    await expect(page.locator('text=Robin Williams')).toBeVisible();
  });

  test('should block sleeping proposal option if user has no sleeping partners', async ({ page }) => {
    // Log in as Casey Chen (who has rules = {} and no partnerLimits)
    await page.addInitScript(() => {
      localStorage.setItem('polyschedule_user_profile', JSON.stringify({
        id: 'p4',
        name: 'Casey Chen',
        username: 'casey',
        password: 'password123',
        email: 'casey@example.com',
        picture: 'https://images.unsplash.com/photo-1522075469751-3a6694fb2f61?w=150&auto=format&fit=crop&q=80'
      }));
    });

    await page.goto('/');
    await page.click('#fab-quick-add');
    await expect(page.url()).toContain('#create');

    // The sleeping switch button should be disabled
    const sleepingBtn = page.locator('button:has-text("Sleeping (Disabled)")');
    await expect(sleepingBtn).toBeVisible();
    await expect(sleepingBtn).toBeDisabled();
  });

  test('should support adding a home with rooms and associated partners', async ({ page }) => {
    await page.goto('/');
    await page.click('a[href="#logistics"]');
    await page.click('#btn-add-home');
    await expect(page.url()).toContain('#add-home');

    await page.fill('#new-home-name', 'Mountain Cabin');
    await page.fill('#new-home-address', '123 Forest Rd, Mt Hood OR');
    await page.fill('#new-home-bedrooms-count', '2');
    
    // Fill custom bedroom names
    await page.locator('.bedroom-name-input[data-index="0"]').fill('Red Room');
    await page.locator('.bedroom-name-input[data-index="1"]').fill('Blue Room');

    // Associate Alex Rivera
    await page.locator('.home-associated-partner[data-partner-name="Alex Rivera"]').check();

    // Click submit
    await page.click('#btn-submit-home');

    // Verify redirected back to logistics
    await expect(page.url()).toContain('#logistics');
    
    // Verify home details are in list
    await expect(page.locator('text=Mountain Cabin')).toBeVisible();
    await expect(page.locator('text=Red Room, Blue Room')).toBeVisible();
    await expect(page.locator('text=Associated: Alex Rivera')).toBeVisible();
  });
});
