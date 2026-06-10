import { describe, expect, it } from 'vitest';
import { dedupeDuplicateSleepingEvents, normalizeConfigPartners, renderBatchNightsReviewHtml } from '../js/helpers.js';

describe('normalizeConfigPartners', () => {
  it('restores empty sleeping rules from defaults', () => {
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
    expect(changed).toBe(true);
    expect(config.partners[0].rules.partnerLimits.Sam).toEqual({ min: 3, max: 3 });
  });
});

describe('dedupeDuplicateSleepingEvents', () => {
  it('removes duplicate confirmed sleeping events with the same night and room', () => {
    const events = [
      {
        id: 'sleep1',
        type: 'sleeping',
        title: 'SLEEP: Room A: Alex & Sam',
        start: '2026-06-10T22:00:00.000Z',
        end: '2026-06-11T08:00:00.000Z',
        homeId: 'h1',
        roomId: 'r1',
        participants: ['Alex', 'Sam']
      },
      {
        id: 'sleep2',
        type: 'sleeping',
        title: 'SLEEP: Room A: Alex & Sam',
        start: '2026-06-10T22:00:00.000Z',
        end: '2026-06-11T08:00:00.000Z',
        homeId: 'h1',
        roomId: 'r1',
        participants: ['Alex', 'Sam']
      }
    ];
    const { events: deduped, removedIds } = dedupeDuplicateSleepingEvents(events);
    expect(deduped).toHaveLength(1);
    expect(removedIds).toHaveLength(1);
  });
});

describe('renderBatchNightsReviewHtml', () => {
  it('lists nights with locations and participants', () => {
    const html = renderBatchNightsReviewHtml([
      {
        date: '2026-06-10',
        assignments: [{
          homeName: 'Lake House',
          roomName: 'North Bedroom',
          participants: ['Michael Burton', 'Katie Thompson']
        }]
      }
    ]);
    expect(html).toContain('NIGHT-BY-NIGHT PLAN');
    expect(html).toContain('Night 1');
    expect(html).toContain('Lake House · North Bedroom');
    expect(html).toContain('Michael, Katie');
  });
});
