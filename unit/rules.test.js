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

describe('RulesEngine.evaluateEventPersonConflicts', () => {
  it('detects overlapping events with shared participants including proposer', () => {
    const conflicts = RulesEngine.evaluateEventPersonConflicts(
      {
        id: 'prop_new',
        type: 'event',
        title: 'Hang out',
        proposer: 'Michael Burton',
        participants: ['Michael Burton', 'Katie Thompson'],
        start: '2026-06-10T19:00:00.000Z',
        end: '2026-06-10T21:00:00.000Z'
      },
      [{
        id: 'e1',
        type: 'event',
        title: 'Date Night',
        status: 'confirmed',
        workflowState: 'approved',
        participants: ['Michael Burton', 'Katie Thompson'],
        start: '2026-06-10T19:30:00.000Z',
        end: '2026-06-10T22:00:00.000Z'
      }]
    );

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].type).toBe('PERSON_CONFLICT');
    expect(conflicts[0].people).toContain('Michael Burton');
    expect(conflicts[0].message).toContain('Date Night');
  });

  it('ignores non-overlapping events', () => {
    const conflicts = RulesEngine.evaluateEventPersonConflicts(
      {
        id: 'prop_new',
        type: 'event',
        proposer: 'Michael Burton',
        participants: ['Michael Burton'],
        start: '2026-06-10T19:00:00.000Z',
        end: '2026-06-10T21:00:00.000Z'
      },
      [{
        id: 'e1',
        type: 'event',
        title: 'Morning coffee',
        status: 'confirmed',
        participants: ['Michael Burton'],
        start: '2026-06-10T09:00:00.000Z',
        end: '2026-06-10T10:00:00.000Z'
      }]
    );
    expect(conflicts).toHaveLength(0);
  });
});
