const { test, expect } = require('@playwright/test');

test.describe('Rules Engine Unit Tests', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to our local hosted PWA
    await page.goto('/');
  });

  test('should detect room capacity conflicts', async ({ page }) => {
    // Evaluate sleeping rules inside browser context
    const warnings = await page.evaluate(() => {
      // Import RulesEngine dynamically inside browser
      return import('./js/rules.js').then(({ RulesEngine }) => {
        const today = new Date();
        const getRelDate = (offset, hr) => {
          const d = new Date(today);
          d.setDate(today.getDate() + offset);
          d.setHours(hr, 0, 0, 0);
          return d.toISOString();
        };

        const existingEvents = [
          {
            id: 'e_existing',
            type: 'sleeping',
            start: getRelDate(0, 22), // Tonight
            end: getRelDate(1, 8),
            homeId: 'h1',
            roomId: 'r1',
            participants: ['Alex']
          }
        ];

        const proposal = {
          id: 'e_prop',
          type: 'sleeping',
          start: getRelDate(0, 22),
          end: getRelDate(1, 8),
          homeId: 'h1',
          roomId: 'r1',
          participants: ['Sam'] // Sam tries to book same room
        };

        const config = {
          residences: [{ id: 'h1', name: 'The Sanctuary', bedrooms: 3 }],
          partners: [
            { name: 'Alex', rules: {} },
            { name: 'Sam', rules: {} }
          ]
        };

        return RulesEngine.evaluateSleepingProposal(proposal, existingEvents, config, config.partners);
      });
    });

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].type).toBe('CAPACITY_CONFLICT');
    expect(warnings[0].message).toContain('Room conflict');
  });

  test('should detect batch partner max nights quota violation', async ({ page }) => {
    const warnings = await page.evaluate(() => {
      return import('./js/rules.js').then(({ RulesEngine }) => {
        // Anchor to Monday so all four nights fall in one ISO week (Mon–Sun).
        const weekStart = new Date(2026, 5, 8, 12, 0, 0);
        const dateStr = (offset) => {
          const d = new Date(weekStart);
          d.setDate(weekStart.getDate() + offset);
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
        };
        const batchProposal = {
          id: 'batch_test',
          type: 'batch_sleeping',
          start: weekStart.toISOString(),
          end: new Date(weekStart.getTime() + 4 * 86400000).toISOString(),
          batchNights: [0, 1, 2, 3].map(offset => ({
            date: dateStr(offset),
            assignments: [{
              homeId: 'h1',
              roomId: 'r1',
              homeName: 'The Sanctuary',
              roomName: 'North Bedroom',
              participants: ['Alex Rivera', 'Sam Davis']
            }]
          }))
        };
        const config = {
          residences: [{ id: 'h1', name: 'The Sanctuary', bedrooms: 3 }],
          partners: [
            { name: 'Alex Rivera', rules: { partnerLimits: { 'Sam Davis': { max: 3 } } } },
            { name: 'Sam Davis', rules: {} }
          ]
        };
        return RulesEngine.evaluateBatchSleepingProposal(batchProposal, [], config, config.partners);
      });
    });
    expect(warnings.some(w => w.type === 'PARTNER_MAX_LIMIT')).toBe(true);
  });

  test('should detect max partner nights quota violation', async ({ page }) => {
    const warnings = await page.evaluate(() => {
      return import('./js/rules.js').then(({ RulesEngine }) => {
        // Anchor to Monday so existing + proposed nights share one ISO week.
        const weekStart = new Date(2026, 5, 8, 12, 0, 0);
        const getRelDate = (offset, hr) => {
          const d = new Date(weekStart);
          d.setDate(weekStart.getDate() + offset);
          d.setHours(hr, 0, 0, 0);
          return d.toISOString();
        };

        // Existing events: 3 nights with Sam this week
        const existingEvents = [
          {
            id: 's1',
            type: 'sleeping',
            start: getRelDate(0, 22),
            end: getRelDate(1, 8),
            homeId: 'h1',
            roomId: 'r1',
            participants: ['Alex', 'Sam']
          },
          {
            id: 's2',
            type: 'sleeping',
            start: getRelDate(1, 22),
            end: getRelDate(2, 8),
            homeId: 'h1',
            roomId: 'r1',
            participants: ['Alex', 'Sam']
          },
          {
            id: 's3',
            type: 'sleeping',
            start: getRelDate(2, 22),
            end: getRelDate(3, 8),
            homeId: 'h1',
            roomId: 'r1',
            participants: ['Alex', 'Sam']
          }
        ];

        // Proposal: 2 more nights (total 5 nights)
        // Alex has max limit of 3 nights with Sam
        const proposal = {
          id: 'prop_new',
          type: 'sleeping',
          start: getRelDate(3, 22),
          end: getRelDate(5, 8), // 2 nights
          homeId: 'h1',
          roomId: 'r1',
          participants: ['Alex', 'Sam']
        };

        const config = {
          residences: [{ id: 'h1', name: 'The Sanctuary', bedrooms: 3 }],
          partners: [
            {
              name: 'Alex',
              rules: {
                partnerLimits: {
                  'Sam': { max: 3 }
                }
              }
            },
            { name: 'Sam', rules: {} }
          ]
        };

        return RulesEngine.evaluateSleepingProposal(proposal, existingEvents, config, config.partners);
      });
    });

    expect(warnings.length).toBeGreaterThan(0);
    expect(warnings[0].type).toBe('PARTNER_MAX_LIMIT');
    expect(warnings[0].message).toContain('They are sleeping with them');
    expect(warnings[0].message).toContain('exceeds their preferred limit of 3 nights/week with them');
  });
});
