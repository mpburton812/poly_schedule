const { test, expect } = require('@playwright/test');
const { installE2EHouseholdSeed } = require('./helpers');

async function loginAs(page, username, password) {
  await page.fill('#login-username', username);
  await page.fill('#login-password', password);
  await page.click('#btn-login');
  await expect(page.locator('.week-grid')).toBeVisible({ timeout: 10000 });
}

test.describe('Proposal Workflow Unit Tests', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('declines when a required participant rejects', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { evaluateProposedProposal, WORKFLOW } = await import('./js/proposal-workflow.js');
      return evaluateProposedProposal({
        type: 'event',
        workflowState: WORKFLOW.PROPOSED,
        participantRoles: [
          { name: 'Alex Rivera', role: 'required' },
          { name: 'Sam Davis', role: 'required' }
        ],
        responses: {
          'Alex Rivera': { status: 'accept' },
          'Sam Davis': { status: 'reject' }
        }
      }, { partners: [] });
    });
    expect(result.transition).toBe('declined');
    expect(result.declinedBy).toBe('Sam Davis');
  });

  test('optional reject does not decline proposal', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { evaluateProposedProposal, WORKFLOW } = await import('./js/proposal-workflow.js');
      return evaluateProposedProposal({
        type: 'event',
        workflowState: WORKFLOW.PROPOSED,
        participantRoles: [
          { name: 'Alex Rivera', role: 'required' },
          { name: 'Sam Davis', role: 'required' },
          { name: 'Jordan Smith', role: 'optional' }
        ],
        responses: {
          'Alex Rivera': { status: 'accept' },
          'Sam Davis': { status: 'pending' },
          'Jordan Smith': { status: 'reject' }
        }
      }, { partners: [] });
    });
    expect(result.transition).toBeNull();
    expect(result.transition).not.toBe('declined');
  });

  test('approves event when required voters accept or abstain', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { evaluateProposedProposal, WORKFLOW } = await import('./js/proposal-workflow.js');
      return evaluateProposedProposal({
        type: 'event',
        workflowState: WORKFLOW.PROPOSED,
        participantRoles: [
          { name: 'Alex Rivera', role: 'required' },
          { name: 'Sam Davis', role: 'required' },
          { name: 'Jordan Smith', role: 'required' }
        ],
        responses: {
          'Alex Rivera': { status: 'accept' },
          'Sam Davis': { status: 'accept' },
          'Jordan Smith': { status: 'abstain' }
        }
      }, { partners: [] });
    });
    expect(result.transition).toBe('approved');
  });

  test('sleeping proposals require accept votes (no abstain path)', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { evaluateProposedProposal, WORKFLOW } = await import('./js/proposal-workflow.js');
      return evaluateProposedProposal({
        type: 'sleeping',
        workflowState: WORKFLOW.PROPOSED,
        participantRoles: [
          { name: 'Alex Rivera', role: 'required' },
          { name: 'Sam Davis', role: 'required' }
        ],
        responses: {
          'Alex Rivera': { status: 'accept' },
          'Sam Davis': { status: 'abstain' }
        }
      }, { partners: [] });
    });
    expect(result.transition).toBeNull();
  });

  test('passive partners are excluded from required voters', async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { getRequiredVoters } = await import('./js/proposal-workflow.js');
      return getRequiredVoters([
        { name: 'Alex Rivera', role: 'required' },
        { name: 'Casey Chen', role: 'optional' }
      ], {
        partners: [{ name: 'Casey Chen', passive: true }]
      });
    });
    expect(result).toEqual(['Alex Rivera']);
  });

  test('normalizeConfigPartners restores empty sleeping rules from defaults', async ({ page }) => {
    const repaired = await page.evaluate(async () => {
      const { normalizeConfigPartners } = await import('./js/helpers.js');
      const config = {
        partners: [{
          id: 'p1',
          name: 'Alex Rivera',
          rules: { minSoloNights: 2, partnerLimits: {} }
        }]
      };
      const defaults = {
        partners: [{
          id: 'p1',
          name: 'Alex Rivera',
          rules: { minSoloNights: 2, partnerLimits: { Sam: { min: 3, max: 3 } } }
        }]
      };
      const changed = normalizeConfigPartners(config, defaults);
      return {
        changed,
        limits: config.partners[0].rules.partnerLimits
      };
    });
    expect(repaired.changed).toBe(true);
    expect(repaired.limits.Sam).toEqual({ min: 3, max: 3 });
  });

  test('reopen declined proposal creates a new draft id', async ({ page }) => {
    const ids = await page.evaluate(async () => {
      const { CalendarSync } = await import('./js/calendar.js');
      const { WORKFLOW } = await import('./js/proposal-workflow.js');
      await CalendarSync.init('offline', null, () => {});
      const declined = {
        id: 'decline_test_1',
        title: 'Declined Test',
        type: 'event',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
        proposer: 'Alex Rivera',
        workflowState: WORKFLOW.DECLINED,
        status: 'rejected',
        participantRoles: [{ name: 'Alex Rivera', role: 'required' }],
        participants: ['Alex Rivera'],
        responses: { 'Alex Rivera': { status: 'accept' } }
      };
      CalendarSync.events.push(declined);
      const draft = await CalendarSync.reopenDeclinedProposal('decline_test_1');
      return { oldId: 'decline_test_1', newId: draft.id, stillExists: CalendarSync.events.some(e => e.id === 'decline_test_1') };
    });
    expect(ids.newId).not.toBe(ids.oldId);
    expect(ids.stillExists).toBe(false);
  });
});

test.describe('Proposal Workflow UI', () => {
  test.beforeEach(async ({ page }) => {
    await installE2EHouseholdSeed(page);
    await page.goto('/');
    await page.waitForSelector('#login-form, .week-grid', { timeout: 10000 });
    if (await page.locator('#login-form').isVisible()) {
      await loginAs(page, 'mpburton', 'password');
    }
  });

  test('shows workflow swimlane tabs', async ({ page }) => {
    await page.locator('.sidebar-nav a[href="#proposals"], .bottom-nav a[href="#proposals"]').first().click();
    await expect(page.locator('#btn-tab-drafts')).toBeVisible();
    await expect(page.locator('#btn-tab-proposed')).toBeVisible();
    await expect(page.locator('#btn-tab-resolved')).toBeVisible();
    await expect(page.locator('#btn-tab-archived')).toBeVisible();
    await expect(page.locator('#btn-tab-approved')).toHaveCount(0);
    await expect(page.locator('#btn-tab-declined')).toHaveCount(0);
  });

  test('creates draft on FAB and submits to proposed tab', async ({ page }) => {
    await page.click('#fab-quick-add');
    await expect(page.url()).toContain('#create');
    await page.waitForSelector('#prop-title');
    await expect(page.url()).toContain('draft=');
    await page.fill('#prop-title', 'Workflow Draft Dinner');
    await page.locator('.circle-partner-option[data-name="Katie Thompson"]').click();
    await page.selectOption('#prop-start-hour', '6');
    await page.selectOption('#prop-start-minute', '00');
    await page.selectOption('#prop-start-ampm', 'PM');
    await page.selectOption('#prop-end-hour', '9');
    await page.selectOption('#prop-end-minute', '00');
    await page.selectOption('#prop-end-ampm', 'PM');
    await page.click('#btn-submit-proposal');
    await expect(page.url()).toContain('#proposals');
    await expect(page.locator('#btn-tab-proposed')).toHaveClass(/active/);
    await expect(page.locator('text=Workflow Draft Dinner')).toBeVisible();
  });

  test('retracts proposed proposal back to drafts', async ({ page }) => {
    await page.click('#fab-quick-add');
    await page.waitForSelector('#prop-title');
    await page.fill('#prop-title', 'Retract Test Dinner');
    await page.locator('.circle-partner-option[data-name="Katie Thompson"]').click();
    await page.selectOption('#prop-start-hour', '6');
    await page.selectOption('#prop-start-minute', '00');
    await page.selectOption('#prop-start-ampm', 'PM');
    await page.selectOption('#prop-end-hour', '9');
    await page.selectOption('#prop-end-minute', '00');
    await page.selectOption('#prop-end-ampm', 'PM');
    await page.click('#btn-submit-proposal');
    await expect(page.locator('text=Retract Test Dinner')).toBeVisible();

    page.once('dialog', dialog => dialog.accept());
    await page.locator('.proposal-card', { hasText: 'Retract Test Dinner' }).locator('.retract-proposal-btn').click();
    await expect(page.locator('#btn-tab-drafts')).toHaveClass(/active/, { timeout: 10000 });
    await expect(page.locator('text=Retract Test Dinner')).toBeVisible();
  });

  test('archives approved proposal from resolved tab', async ({ page }) => {
    await page.evaluate(async () => {
      const { CalendarSync } = await import('./js/calendar.js');
      const { state } = await import('./js/app/state.js');
      const { WORKFLOW } = await import('./js/proposal-workflow.js');
      CalendarSync.events.push({
        id: 'ui_archive_test',
        title: 'Archive UI Test',
        type: 'event',
        start: new Date().toISOString(),
        end: new Date(Date.now() + 3600000).toISOString(),
        proposer: 'Michael Burton',
        workflowState: WORKFLOW.APPROVED,
        status: 'confirmed',
        participantRoles: [
          { name: 'Michael Burton', role: 'required' },
          { name: 'Katie Thompson', role: 'required' }
        ],
        participants: ['Michael Burton', 'Katie Thompson'],
        responses: {
          'Michael Burton': { status: 'accept' },
          'Katie Thompson': { status: 'accept' }
        }
      });
      localStorage.setItem('polyschedule_local_events', JSON.stringify(CalendarSync.events));
      state.events = CalendarSync.events;
    });

    await page.locator('.sidebar-nav a[href="#proposals"], .bottom-nav a[href="#proposals"]').first().click();
    await page.click('#btn-tab-resolved');
    await expect(page.locator('text=Archive UI Test')).toBeVisible();
    await expect(page.locator('#prop-ui_archive_test')).toContainText('APPROVED');
    await page.locator('.archive-proposal-btn[data-id="ui_archive_test"]').click();
    await expect(page.locator('#btn-tab-archived')).toHaveClass(/active/);
    await expect(page.locator('text=Archive UI Test')).toBeVisible();
    await expect(page.locator('#prop-ui_archive_test')).toContainText('ARCHIVED');
  });
});
