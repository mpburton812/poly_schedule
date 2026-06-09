const { test, expect } = require('@playwright/test');

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
    await page.goto('/');
    await page.waitForSelector('#login-form, .week-grid', { timeout: 10000 });
    if (await page.locator('#login-form').isVisible()) {
      await loginAs(page, 'alex', 'password123');
    }
  });

  test('shows workflow swimlane tabs', async ({ page }) => {
    await page.locator('.sidebar-nav a[href="#proposals"], .bottom-nav a[href="#proposals"]').first().click();
    await expect(page.locator('#btn-tab-drafts')).toBeVisible();
    await expect(page.locator('#btn-tab-proposed')).toBeVisible();
    await expect(page.locator('#btn-tab-approved')).toBeVisible();
    await expect(page.locator('#btn-tab-archived')).toBeVisible();
    await expect(page.locator('#btn-tab-declined')).toBeVisible();
  });

  test('creates draft on FAB and submits to proposed tab', async ({ page }) => {
    await page.click('#fab-quick-add');
    await expect(page.url()).toContain('#create');
    await page.waitForSelector('#prop-title');
    await expect(page.url()).toContain('draft=');
    await page.fill('#prop-title', 'Workflow Draft Dinner');
    await page.locator('.circle-partner-option[data-name="Sam Davis"]').click();
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
});
