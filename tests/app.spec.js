const { test, expect } = require('@playwright/test');

async function loginAs(page, username, password) {
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  await page.click('#btn-login');
  await expect(page.locator('.week-grid')).toBeVisible({ timeout: 10000 });
}

async function loginAsAdmin(page) {
  await loginAs(page, 'alex', 'password123');
}

async function clickNav(page, href) {
  const desktopLink = page.locator(`.sidebar-nav a[href="${href}"]`);
  const mobileLink = page.locator(`.bottom-nav a[href="${href}"]`);
  if (await desktopLink.isVisible()) {
    await desktopLink.click();
  } else {
    await mobileLink.click();
  }
}

async function clickAdminNav(page) {
  const desktopAdmin = page.locator('#side-nav-admin');
  const mobileAdmin = page.locator('#mobile-nav-admin');
  if (await desktopAdmin.isVisible()) {
    await desktopAdmin.click();
  } else {
    await mobileAdmin.click();
  }
}

test.describe('PolySchedule UI E2E Flow Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForSelector('#login-form, .week-grid', { timeout: 10000 });
    const loginForm = page.locator('#login-form');
    if (await loginForm.isVisible()) {
      await loginAsAdmin(page);
    }
  });

  test('should load application and render dashboard', async ({ page }) => {
    await expect(page.locator('.logo-text')).toContainText('PolySchedule');
    await expect(page.locator('.week-grid')).toBeVisible();
    await expect(page.locator('.day-column')).toHaveCount(7);
    await expect(page.locator('.card-event').first()).toBeVisible();
    await expect(page.locator('.card-sleeping').first()).toBeVisible();
  });

  test('should show login page when not authenticated', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#login-username')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
  });

  test('should support logout and return to login page', async ({ page }) => {
    await page.click('#avatar-container');
    await expect(page.locator('#app-modal')).toHaveClass(/open/);
    await page.click('#modal-btn-logout');
    await expect(page.locator('#login-form')).toBeVisible({ timeout: 5000 });
  });

  test('should support SPA navigation to other tabs', async ({ page }) => {
    await clickNav(page, '#proposals');
    await expect(page.url()).toContain('#proposals');
    await expect(page.locator('.tabs-nav')).toBeVisible();

    await clickNav(page, '#logistics');
    await expect(page.url()).toContain('#logistics');
    await expect(page.locator('text=Collective Profiles')).toBeVisible();

    await page.click('#avatar-container');
    await expect(page.locator('#app-modal')).toHaveClass(/open/);
    await expect(page.locator('text=Connection Settings')).toBeVisible();
  });

  test('should support creating a new event proposal', async ({ page }) => {
    await page.click('#fab-quick-add');
    await expect(page.url()).toContain('#create');
    await expect(page.locator('#btn-create-back')).toHaveCount(0);
    await page.fill('#prop-title', 'Weekly Family Dinner');
    await page.locator('.circle-partner-option[data-name="Sam Davis"]').click();
    await page.selectOption('#prop-start-hour', '6');
    await page.selectOption('#prop-start-minute', '00');
    await page.selectOption('#prop-start-ampm', 'PM');
    await page.selectOption('#prop-end-hour', '9');
    await page.selectOption('#prop-end-minute', '00');
    await page.selectOption('#prop-end-ampm', 'PM');
    await page.click('#btn-submit-proposal');
    await expect(page.url()).toContain('#proposals');
    await expect(page.locator('text=Weekly Family Dinner')).toBeVisible();
  });

  test('should trigger rules warning banner on sleep limits', async ({ page }) => {
    await page.click('#fab-quick-add');
    await page.click('#btn-toggle-sleeping');
    await page.fill('#prop-title', 'Extended Cabin Trip');
    await page.locator('.circle-partner-option[data-name="Sam Davis"]').click();
    await page.fill('#prop-duration', '4');
    const warningBanner = page.locator('#proposal-rules-banner');
    await expect(warningBanner).not.toHaveClass(/hidden/);
    await expect(warningBanner).toContainText('Extended Stay Alert');
  });

  test('should handle voting on a proposal', async ({ page }) => {
    await clickNav(page, '#proposals');
    const firstProposalCard = page.locator('.proposal-card').first();
    await expect(firstProposalCard).toBeVisible();
    const acceptBtn = firstProposalCard.locator('text=Accept');
    page.on('dialog', async dialog => {
      await dialog.accept('I am excited!');
    });
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      await expect(page.locator('#toast-container')).toContainText('Vote submitted');
    }
  });

  test('should redirect non-admins away from #admin', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await loginAs(page, 'sam', 'password123');
    await page.goto('/#admin');
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('#admin');
  });

  test('should show Admin nav links only for admins', async ({ page }) => {
    const adminNav = page.locator('#side-nav-admin, #mobile-nav-admin');
    await expect(adminNav.first()).toBeVisible();

    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await loginAs(page, 'sam', 'password123');
    await expect(page.locator('#side-nav-admin')).toBeHidden();
    await expect(page.locator('#mobile-nav-admin')).toBeHidden();
  });

  test('should support editing profile settings', async ({ page }) => {
    await page.click('#avatar-container');
    await page.fill('#setting-display-name', 'Alex R. Rivera');
    await page.fill('#setting-username', 'alexrr');
    await page.fill('#setting-password', 'newsecretpwd');
    await page.locator('#setting-avatar-options .avatar-option').nth(2).click();
    await page.click('#btn-save-profile');
    await expect(page.locator('#toast-container')).toContainText('Profile updated');
    await expect(page.locator('h3:has-text("Alex R. Rivera")')).toBeVisible();
  });

  test('should support modifying group name in admin panel', async ({ page }) => {
    await clickAdminNav(page);
    await expect(page.url()).toContain('#admin');
    await expect(page.locator('text=Group Settings')).toBeVisible();
    await page.fill('#admin-poly-family-name', 'Rivera Poly Circle');
    await page.click('#btn-save-group-name');
    await expect(page.locator('#toast-container')).toContainText('Group name saved');
    await page.click('#fab-quick-add');
    await expect(page.locator('text=Rivera Poly Circle (Invitees)')).toBeVisible();
  });

  test('should support adding an active partner with sleeping rules', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.click('#btn-add-partner');
    await expect(page.locator('#new-partner-home option[value=""]')).toHaveCount(1);
    await page.fill('#new-partner-name', 'Robin Williams');
    await page.fill('#new-partner-username', 'robin');
    await page.fill('#new-partner-password', 'password123');
    await page.selectOption('#new-partner-role', 'User');
    await page.locator('#new-partner-avatar-options .avatar-option').nth(1).click();
    await page.locator('.sleeping-partner-checkbox[data-partner-name="Sam Davis"]').check();
    const samDetails = page.locator('.sleeping-partner-checkbox[data-partner-name="Sam Davis"]').locator('xpath=ancestor::div[contains(@style,"border")]').locator('.partner-min-nights');
    await samDetails.fill('2');
    await page.locator('.sleeping-partner-checkbox[data-partner-name="Sam Davis"]').locator('xpath=ancestor::div[contains(@style,"border")]').locator('.partner-max-nights').fill('5');
    await page.fill('#new-partner-solo-nights', '3');
    await page.click('#btn-submit-partner');
    await expect(page.url()).toContain('#logistics');
    await expect(page.getByRole('heading', { name: 'Robin Williams' })).toBeVisible();
  });

  test('should support adding a passive partner', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.click('#btn-add-partner');
    await page.click('#btn-partner-type-passive');
    await page.fill('#new-partner-name', 'Taylor Passive');
    await page.click('#btn-submit-partner');
    await expect(page.url()).toContain('#logistics');
    await expect(page.getByRole('heading', { name: 'Taylor Passive' })).toBeVisible();
    await expect(page.locator('text=PASSIVE').first()).toBeVisible();
  });

  test('should block sleeping proposal option if user has no sleeping partners', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await loginAs(page, 'jordan', 'password123');
    await page.click('#fab-quick-add');
    const sleepingBtn = page.locator('button:has-text("Sleeping (Disabled)")');
    await expect(sleepingBtn).toBeVisible();
    await expect(sleepingBtn).toBeDisabled();
  });

  test('should support adding a home with rooms and associated partners', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.click('#btn-add-home');
    await page.fill('#new-home-name', 'Mountain Cabin');
    await page.fill('#new-home-bedrooms-count', '2');
    await page.locator('.bedroom-name-input[data-index="0"]').fill('Red Room');
    await page.locator('.bedroom-name-input[data-index="1"]').fill('Blue Room');
    await page.locator('.home-associated-partner[data-partner-name="Alex Rivera"]').check();
    await page.click('#btn-submit-home');
    await page.waitForURL(/#logistics/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Mountain Cabin' })).toBeVisible();
    await expect(page.locator('text=Red Room, Blue Room').first()).toBeVisible();
  });

  test('should return to add partner after creating home from default home dropdown', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.click('#btn-add-partner');
    await page.fill('#new-partner-name', 'Chris Newhome');
    await page.selectOption('#new-partner-home', '__create_new__');
    await expect(page.url()).toContain('#add-home');
    await page.fill('#new-home-name', 'Chris Place');
    await page.click('#btn-submit-home');
    await expect(page.url()).toContain('#add-partner');
    await expect(page.locator('#new-partner-name')).toHaveValue('Chris Newhome');
    await expect(page.locator('#new-partner-home')).toHaveValue(/h/);
  });

  test('should not show Sleep Rules on logistics page', async ({ page }) => {
    await clickNav(page, '#logistics');
    await expect(page.locator('text=Sleep Rules')).toHaveCount(0);
  });

  test('should support editing an existing home as admin', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.locator('.btn-edit-home').first().click();
    await expect(page.url()).toContain('#edit-home');
    await page.fill('#edit-home-name', 'The Sanctuary Updated');
    await page.click('#btn-save-edit-home');
    await expect(page.url()).toContain('#logistics');
    await expect(page.getByRole('heading', { name: 'The Sanctuary Updated' })).toBeVisible();
  });

  test('should support activating a passive partner', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.click('#btn-add-partner');
    await page.click('#btn-partner-type-passive');
    await page.fill('#new-partner-name', 'Pat ToActivate');
    await page.click('#btn-submit-partner');
    await page.click('#btn-activate-partner');
    await page.selectOption('#activate-partner-select', { label: 'Pat ToActivate' });
    await page.fill('#activate-username', 'pat');
    await page.fill('#activate-password', 'password123');
    await page.click('#btn-submit-activate');
    await expect(page.url()).toContain('#logistics');
    await expect(page.getByRole('heading', { name: 'Pat ToActivate' })).toBeVisible();
  });

  test('should show real system logs in admin panel', async ({ page }) => {
    await clickAdminNav(page);
    await expect(page.locator('text=System Administration Log')).toBeVisible();
    await expect(page.locator('#console-logs-body .console-line').first()).toBeVisible();
    await expect(page.locator('#console-logs-body')).not.toContainText('Cron: Backup completed to cloud node-7');
  });
});
