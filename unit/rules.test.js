import { describe, expect, it } from 'vitest';
import { RulesEngine } from '../js/rules.js';

const partners = [
  {
    id: 'p1',
    name: 'Alex Rivera',
    rules: {
      minSoloNights: 2,
      partnerLimits: { Sam: { min: 1, max: 3 } }
    }
  },
  {
    id: 'p2',
    name: 'Sam Davis',
    rules: { minSoloNights: 1 }
  }
];

describe('RulesEngine partner resolution', () => {
  const residences = [{ id: 'h1', name: 'Home', bedrooms: 2 }];
  const config = { residences };

  it('evaluates rules when participant uses first-name reference', () => {
    const warnings = RulesEngine.evaluateSleepingProposal(
      {
        type: 'sleeping',
        start: new Date('2026-06-10T22:00:00').toISOString(),
        end: new Date('2026-06-11T08:00:00').toISOString(),
        participants: ['Alex', 'Sam'],
        homeId: 'h1',
        roomId: 'r1'
      },
      [],
      config,
      partners
    );
    expect(Array.isArray(warnings)).toBe(true);
  });

  it('evaluates rules when participant uses partner id reference', () => {
    const warnings = RulesEngine.evaluateSleepingProposal(
      {
        type: 'sleeping',
        start: new Date('2026-06-10T22:00:00').toISOString(),
        end: new Date('2026-06-11T08:00:00').toISOString(),
        participants: ['p1', 'p2'],
        homeId: 'h1',
        roomId: 'r1'
      },
      [],
      config,
      partners
    );
    expect(Array.isArray(warnings)).toBe(true);
  });
});

describe('RulesEngine.hasBatchRoomConflicts', () => {
  it('returns true only when capacity conflicts are present', () => {
    expect(RulesEngine.hasBatchRoomConflicts([])).toBe(false);
    expect(RulesEngine.hasBatchRoomConflicts([{ type: 'SOLO_MIN_LIMIT' }])).toBe(false);
    expect(RulesEngine.hasBatchRoomConflicts([{ type: 'CAPACITY_CONFLICT' }])).toBe(true);
  });
});
