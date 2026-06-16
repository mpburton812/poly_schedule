const { test, expect } = require('@playwright/test');
const { installE2EHouseholdSeed } = require('./helpers');

async function loginAs(page, username, password) {
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  await page.click('#btn-login');
  await expect(page.locator('.week-grid')).toBeVisible({ timeout: 10000 });
}

async function loginAsAdmin(page) {
  await loginAs(page, 'mpburton', 'password');
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

async function createEventProposal(page, title, participantName = 'Katie Thompson') {
  await page.click('#fab-quick-add');
  await page.waitForSelector('#prop-title');
  await page.fill('#prop-title', title);
  await page.locator(`.circle-partner-option[data-name="${participantName}"]`).click();
  await page.selectOption('#prop-start-hour', '6');
  await page.selectOption('#prop-start-minute', '00');
  await page.selectOption('#prop-start-ampm', 'PM');
  await page.selectOption('#prop-end-hour', '9');
  await page.selectOption('#prop-end-minute', '00');
  await page.selectOption('#prop-end-ampm', 'PM');
  await page.click('#btn-submit-proposal');
  await expect(page.url()).toContain('#proposals');
}

async function injectProposedEvent(page, {
  title,
  proposer = 'Michael Burton',
  pendingVoter = 'Katie Thompson'
}) {
  await page.evaluate(async ({ title, proposer, pendingVoter }) => {
    const { CalendarSync } = await import('./js/calendar.js');
    const { state } = await import('./js/app/state.js');
    const { WORKFLOW } = await import('./js/proposal-workflow.js');
    const start = new Date();
    start.setDate(start.getDate() + 2);
    start.setHours(18, 0, 0, 0);
    const end = new Date(start);
    end.setHours(21, 0, 0, 0);
    const proposal = {
      id: `prop_e2e_${Date.now()}`,
      title,
      type: 'event',
      start: start.toISOString(),
      end: end.toISOString(),
      location: "Michael's Place",
      participants: [proposer, pendingVoter],
      participantRoles: [
        { name: proposer, role: 'required' },
        { name: pendingVoter, role: 'required' }
      ],
      proposer,
      workflowState: WORKFLOW.PROPOSED,
      status: 'pending',
      revision: 1,
      responses: {
        [proposer]: { status: 'accept', comment: '' },
        [pendingVoter]: { status: 'pending', comment: '' }
      }
    };
    CalendarSync.events.push(proposal);
    state.events = CalendarSync.events;
    localStorage.setItem('polyschedule_events', JSON.stringify(CalendarSync.events));
    const { requestRender } = await import('./js/app/render-bus.js');
    requestRender();
  }, { title, proposer, pendingVoter });
}

test.describe('PolySchedule UI E2E Flow Tests', () => {
  test.beforeEach(async ({ page }) => {
    await installE2EHouseholdSeed(page);
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
    await expect(page.locator('#btn-week-prev')).toBeVisible();
    await expect(page.locator('#btn-week-next')).toBeVisible();
    await expect(page.locator('#filter-partner-select')).toBeVisible();
    await expect(page.locator('#btn-week-picker')).toBeVisible();
  });

  test('should navigate between weeks on the schedule', async ({ page }) => {
    const labelBefore = await page.locator('#btn-week-picker').innerText();
    await page.click('#btn-week-next');
    await expect(page.locator('#btn-week-picker')).not.toHaveText(labelBefore);
    await page.click('#btn-week-prev');
    await expect(page.locator('#btn-week-picker')).toHaveText(labelBefore);
  });

  test('should show proposal type section headers on create form', async ({ page }) => {
    await page.click('#fab-quick-add');
    await expect(page.getByRole('heading', { name: 'Events' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Sleeping Arrangements' })).toBeVisible();
  });

  test('should support compact schedule view with two weeks', async ({ page }) => {
    await expect(page.locator('.day-column')).toHaveCount(7);
    await page.click('#btn-schedule-view-compact');
    await expect(page.locator('.week-grid--compact')).toBeVisible();
    await expect(page.locator('.day-column')).toHaveCount(14);

    const labelBefore = await page.locator('#btn-week-picker').innerText();
    await page.click('#btn-week-next');
    const labelAfter = await page.locator('#btn-week-picker').innerText();
    expect(labelAfter).not.toBe(labelBefore);

    await page.click('#btn-week-prev');
    await expect(page.locator('#btn-week-picker')).toHaveText(labelBefore);
    await page.click('#btn-schedule-view-normal');
    await expect(page.locator('.day-column')).toHaveCount(7);
  });

  test('should show privacy options when creating a proposal', async ({ page }) => {
    await page.click('#fab-quick-add');
    await expect(page.locator('#prop-visibility-tabs')).toBeVisible();
    await page.click('[data-visibility="private"]');
    await expect(page.locator('#prop-visibility')).toHaveValue('private');
    await expect(page.locator('#prop-visibility-hint')).toContainText('Only invitees');
  });

  test('should show login page when not authenticated', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await expect(page.locator('#login-form')).toBeVisible();
    await expect(page.locator('#login-username')).toBeVisible();
    await expect(page.locator('#login-password')).toBeVisible();
    await expect(page.locator('#link-initial-setup')).toHaveCount(0);
    await expect(page.locator('text=Ask your administrator')).toBeVisible();
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
    await expect(page.locator('text=Edit Profile')).toBeVisible();
  });

  test('should support creating a new event proposal', async ({ page }) => {
    await page.click('#fab-quick-add');
    await expect(page.url()).toContain('#create');
    await page.waitForSelector('#prop-title');
    await expect(page.locator('#btn-create-back')).toHaveCount(0);
    await page.fill('#prop-title', 'Weekly Family Dinner');
    await page.locator('.circle-partner-option[data-name="Katie Thompson"]').click();
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

  test('should show Batch Sleeping option for users with sleeping partners', async ({ page }) => {
    await page.click('#fab-quick-add');
    await expect(page.locator('#btn-toggle-batch-sleeping')).toBeVisible();
  });

  test('should create a batch sleeping proposal', async ({ page }) => {
    await page.click('#fab-quick-add');
    await page.waitForSelector('#prop-title');
    await page.click('#btn-toggle-batch-sleeping');
    await page.fill('#prop-duration', '3');
    await page.fill('#prop-title', 'June Rotation Plan');
    const rows = page.locator('.batch-night-row');
    await expect(rows).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await rows.nth(i).locator('.batch-partner-cb[data-partner="Michael Burton"]').check();
      await rows.nth(i).locator('.batch-partner-cb[data-partner="Katie Thompson"]').check();
    }
    await page.click('#btn-submit-proposal');
    await expect(page.url()).toContain('#proposals');
    await expect(page.locator('text=June Rotation Plan')).toBeVisible();
    await expect(page.locator('text=BATCH SLEEPING')).toBeVisible();
  });

  test('should warn on batch sleeping when partner max nights exceeded', async ({ page }) => {
    const warnings = await page.evaluate(() => {
      return import('./js/rules.js').then(({ RulesEngine }) => {
        const monday = new Date();
        const day = monday.getDay();
        monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1));
        const dateStr = (offset) => {
          const d = new Date(monday);
          d.setDate(monday.getDate() + offset);
          return d.toISOString().split('T')[0];
        };
        const config = JSON.parse(localStorage.getItem('polyschedule_local_config') || '{}');
        return RulesEngine.evaluateBatchSleepingProposal({
          id: 'batch_test',
          type: 'batch_sleeping',
          batchNights: [0, 1, 2, 3, 4].map((offset) => ({
            date: dateStr(offset),
            assignments: [{
              homeId: 'h1',
              roomId: 'r1',
              homeName: "Michael's Place",
              roomName: "Michael's Bedroom",
              participants: ['Michael Burton', 'Katie Thompson']
            }]
          }))
        }, [], config, config.partners);
      });
    });
    expect(warnings.some((w) => w.type === 'PARTNER_MAX_LIMIT')).toBe(true);
  });

  test('should trigger rules warning banner on sleep limits', async ({ page }) => {
    const warnings = await page.evaluate(() => {
      return import('./js/rules.js').then(({ RulesEngine }) => {
        const monday = new Date();
        const day = monday.getDay();
        monday.setDate(monday.getDate() - day + (day === 0 ? -6 : 1));
        monday.setHours(22, 0, 0, 0);
        const end = new Date(monday);
        end.setDate(monday.getDate() + 5);
        end.setHours(8, 0, 0, 0);
        const config = JSON.parse(localStorage.getItem('polyschedule_local_config') || '{}');
        return RulesEngine.evaluateSleepingProposal({
          id: 'temp_create',
          type: 'sleeping',
          start: monday.toISOString(),
          end: end.toISOString(),
          participants: ['Michael Burton', 'Katie Thompson'],
          homeId: 'h1',
          roomId: 'r1',
          roomName: "Michael's Bedroom"
        }, [], config, config.partners);
      });
    });
    expect(warnings.some((w) => w.type === 'PARTNER_MAX_LIMIT')).toBe(true);
  });

  test('should handle voting on a proposal', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await loginAs(page, 'kthompson', 'password');
    await injectProposedEvent(page, { title: 'Vote Test Dinner' });
    await clickNav(page, '#proposals');
    const proposalCard = page.locator('.proposal-card', { hasText: 'Vote Test Dinner' });
    await expect(proposalCard).toBeVisible();
    const acceptBtn = proposalCard.locator('.vote-btn[data-vote="accept"]');
    page.on('dialog', async dialog => {
      await dialog.accept('I am excited!');
    });
    if (await acceptBtn.isVisible()) {
      await acceptBtn.click();
      await expect(page.locator('#toast-container')).toContainText(/Vote submitted|Proposal approved/);
    }
  });

  test('should show Abstain option on proposal responses', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await loginAs(page, 'kthompson', 'password');
    await injectProposedEvent(page, { title: 'Abstain Test Dinner' });
    await clickNav(page, '#proposals');
    await expect(
      page.locator('.proposal-card', { hasText: 'Abstain Test Dinner' }).locator('.vote-btn[data-vote="abstain"]')
    ).toBeVisible();
  });

  test('should confirm proposal when all votes are accept or abstain', async ({ page }) => {
    const confirmed = await page.evaluate(async () => {
      const { getProposalOutcome } = await import('./js/helpers.js');
      const responses = {
        'Michael Burton': { status: 'accept', comment: '' },
        'Katie Thompson': { status: 'accept', comment: '' },
        'Jordan Lee': { status: 'abstain', comment: 'Maybe next time' }
      };
      return getProposalOutcome(responses) === 'confirmed';
    });
    expect(confirmed).toBe(true);
  });

  test('should update proposer name when display name changes', async ({ page }) => {
    await createEventProposal(page, 'Proposer Rename Test');
    await page.click('#avatar-container');
    await page.fill('#setting-display-name', 'Michael M. Burton');
    await page.fill('#setting-username', 'mpburton2');
    await page.fill('#setting-password', 'newsecretpwd');
    await page.click('#btn-save-profile');
    await clickNav(page, '#proposals');
    await expect(
      page.locator('.proposal-card', { hasText: 'Proposer Rename Test' })
    ).toContainText('Michael M. Burton');
  });

  test('should redirect non-admins away from #admin', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await loginAs(page, 'jordan', 'password');
    await page.goto('/#admin');
    await page.waitForTimeout(500);
    expect(page.url()).not.toContain('#admin');
  });

  test('should show Admin nav links only for admins', async ({ page }) => {
    const adminNav = page.locator('#side-nav-admin, #mobile-nav-admin');
    await expect(adminNav.first()).toBeVisible();

    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await loginAs(page, 'jordan', 'password');
    await expect(page.locator('#side-nav-admin')).toBeHidden();
    await expect(page.locator('#mobile-nav-admin')).toBeHidden();
  });

  test('should show Google Calendar credentials only on admin page', async ({ page }) => {
    await clickAdminNav(page);
    await expect(page.locator('#admin-google-calendar-settings')).toBeVisible();
    await expect(page.locator('#admin-google-client-id')).toHaveCount(0);
    await expect(page.locator('#btn-save-google-credentials')).toHaveCount(0);
    await expect(page.locator('#btn-test-google-calendar')).toBeVisible();

    await page.click('#avatar-container');
    const modal = page.locator('#app-modal.open');
    await expect(modal.locator('#admin-google-client-id')).toHaveCount(0);
    await expect(modal.locator('#setting-client-id')).toHaveCount(0);
  });

  test('non-admin profile should not expose Google credential fields', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await loginAs(page, 'jordan', 'password');
    await page.click('#avatar-container');
    await expect(page.locator('#setting-client-id')).toHaveCount(0);
    await expect(page.locator('#admin-google-client-id')).toHaveCount(0);
    await expect(page.locator('text=System Administration Log')).toHaveCount(0);
  });

  test('should support editing profile settings', async ({ page }) => {
    await page.click('#avatar-container');
    await page.fill('#setting-display-name', 'Michael M. Burton');
    await page.fill('#setting-username', 'mpburton2');
    await page.fill('#setting-password', 'newsecretpwd');
    await page.locator('#setting-avatar-options .avatar-option').nth(2).click();
    await page.click('#btn-save-profile');
    await expect(page.locator('#toast-container')).toContainText('Profile updated');
    await expect(page.locator('h3:has-text("Michael M. Burton")')).toBeVisible();
  });

  test('should apply color theme from profile modal', async ({ page }) => {
    await page.click('#avatar-container');
    const modal = page.locator('#app-modal.open');
    await expect(modal.locator('.theme-swatch[data-color-theme="mint"]')).toBeVisible();
    await modal.locator('.theme-swatch[data-color-theme="blueberry"]').click();
    await expect(page.locator('#toast-container')).toContainText('Blueberry applied');
    await expect(page.locator('html')).toHaveAttribute('data-color-theme', 'blueberry');
  });

  test('should support modifying group name in admin panel', async ({ page }) => {
    await clickAdminNav(page);
    await expect(page.url()).toContain('#admin');
    await expect(page.locator('text=Group Settings')).toBeVisible();
    await page.fill('#admin-poly-family-name', 'Burton Poly Circle');
    await page.click('#btn-save-group-name');
    await expect(page.locator('#toast-container')).toContainText('Group name saved');
    await page.click('#fab-quick-add');
    await expect(page.locator('text=Burton Poly Circle (Invitees)')).toBeVisible();
  });

  test('should support adding an active partner with sleeping rules', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.click('#btn-add-partner');
    await page.fill('#new-partner-name', 'Robin Williams');
    await page.fill('#new-partner-username', 'robin');
    await page.fill('#new-partner-password', 'password123');
    await page.selectOption('#new-partner-role', 'User');
    await page.locator('#new-partner-avatar-options .avatar-option').nth(1).click();
    await page.locator('.sleeping-partner-checkbox[data-partner-name="Katie Thompson"]').check();
    const katieDetails = page.locator('.sleeping-partner-checkbox[data-partner-name="Katie Thompson"]').locator('xpath=ancestor::div[contains(@style,"border")]').locator('.partner-min-nights');
    await katieDetails.fill('2');
    await page.locator('.sleeping-partner-checkbox[data-partner-name="Katie Thompson"]').locator('xpath=ancestor::div[contains(@style,"border")]').locator('.partner-max-nights').fill('5');
    await page.fill('#new-partner-solo-nights', '3');
    await page.click('#btn-submit-partner');
    await page.waitForURL(/#logistics/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Robin Williams' })).toBeVisible();
  });

  test('should support adding a passive partner', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.click('#btn-add-partner');
    await page.click('#btn-partner-type-passive');
    await page.fill('#new-partner-name', 'Taylor Passive');
    await page.click('#btn-submit-partner');
    await page.waitForURL(/#logistics/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Taylor Passive' })).toBeVisible();
    await expect(page.locator('text=PASSIVE').first()).toBeVisible();
  });

  test('should block batch sleeping option if user has no sleeping partners', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await loginAs(page, 'jordan', 'password');
    await page.click('#fab-quick-add');
    await page.waitForSelector('#prop-title');
    await expect(page.locator('#btn-toggle-batch-sleeping')).toHaveCount(0);
  });

  test('should block sleeping proposal option if user has no sleeping partners', async ({ page }) => {
    await page.evaluate(() => localStorage.clear());
    await page.goto('/');
    await loginAs(page, 'jordan', 'password');
    await page.click('#fab-quick-add');
    await page.waitForSelector('#prop-title');
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
    await page.locator('.home-associated-partner[data-partner-name="Michael Burton"]').check();
    await page.click('#btn-submit-home');
    await page.waitForURL(/#logistics/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Mountain Cabin' })).toBeVisible();
    await expect(page.locator('text=Red Room, Blue Room').first()).toBeVisible();
  });

  test('should show partner homes from home associations on logistics', async ({ page }) => {
    await clickNav(page, '#logistics');
    const michaelCard = page.locator('.partner-card-editable', { hasText: 'Michael Burton' });
    await expect(michaelCard).toContainText('Homes:');
    await expect(michaelCard).toContainText("Michael's Place");
  });

  test('should not show Sleep Rules on logistics page', async ({ page }) => {
    await clickNav(page, '#logistics');
    await expect(page.locator('text=Sleep Rules')).toHaveCount(0);
  });

  test('should support editing an existing home as admin', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.locator('.btn-edit-home').first().click();
    await expect(page.url()).toContain('#edit-home');
    await page.fill('#edit-home-name', "Michael's Place Updated");
    await page.fill('#edit-home-address', '123 Main St');
    await page.click('#btn-save-edit-home');
    await page.waitForURL(/#logistics/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: "Michael's Place Updated" })).toBeVisible();
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
    await page.waitForURL(/#logistics/, { timeout: 10000 });
    await expect(page.getByRole('heading', { name: 'Pat ToActivate' })).toBeVisible();
  });

  test('should show real system logs in admin panel', async ({ page }) => {
    await clickAdminNav(page);
    await expect(page.getByRole('heading', { name: 'System Administration Log' })).toBeVisible();
    await expect(page.locator('#console-logs-body .console-line').first()).toBeVisible();
    await expect(page.locator('#console-logs-body')).not.toContainText('Cron: Backup completed to cloud node-7');
  });

  test('should allow admin to delete a passive partner', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.locator('.btn-edit-partner[data-partner-id="p4"]').click();
    await expect(page.url()).toContain('#edit-partner');
    page.on('dialog', dialog => dialog.accept());
    await page.click('#btn-delete-edit-partner');
    await expect(page.url()).toContain('#logistics');
    await expect(page.getByRole('heading', { name: 'Bailey' })).toHaveCount(0);
  });

  test('should allow admin to delete a home', async ({ page }) => {
    await clickNav(page, '#logistics');
    await page.locator('.btn-edit-home[data-home-id="h2"]').click();
    await expect(page.url()).toContain('#edit-home');
    page.on('dialog', dialog => dialog.accept());
    await page.click('#btn-delete-edit-home');
    await expect(page.url()).toContain('#logistics');
    await expect(page.getByRole('heading', { name: "Katie's Place" })).toHaveCount(0);
  });

  test('should support batch sleeping copy previous and add room', async ({ page }) => {
    await page.goto('/#create');
    await page.waitForSelector('#btn-toggle-batch-sleeping');
    await page.click('#btn-toggle-batch-sleeping');
    await page.fill('#prop-duration', '2');
    await page.waitForSelector('.batch-night-row');
    const night1 = page.locator('.batch-night-row').nth(0);
    await night1.locator('.batch-partner-cb[data-partner="Michael Burton"]').check();
    await page.locator('.btn-batch-copy').click();
    await expect(page.locator('.batch-night-row').nth(1).locator('.batch-partner-cb[data-partner="Michael Burton"]')).toBeChecked();
    await page.locator('.btn-batch-add-room').first().click();
    await expect(page.locator('.batch-assignment-block')).toHaveCount(3);
  });
});
