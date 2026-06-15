import { describe, expect, it } from 'vitest';
import {
  RECURRENCE_FREQ,
  buildRecurrenceInstanceDates,
  expandRecurringToEvents,
  getFutureRecurrenceInstances,
  isRecurringProposal,
  normalizeRecurrence
} from '../js/recurrence.js';
import {
  canUserRedraftEvent,
  isProposalApprover,
  WORKFLOW
} from '../js/proposal-workflow.js';

describe('recurrence helpers', () => {
  it('builds weekly instance dates', () => {
    const start = new Date('2026-06-09T19:00:00');
    const dates = buildRecurrenceInstanceDates(start, { frequency: RECURRENCE_FREQ.WEEKLY, count: 3 });
    expect(dates).toHaveLength(3);
    expect(dates[1].getDate()).toBe(16);
    expect(dates[2].getDate()).toBe(23);
  });

  it('expands recurring parent into linked instances', () => {
    const parent = {
      id: 'prop_series_1',
      type: 'event',
      title: 'Weekly Game Night',
      start: '2026-06-09T19:00:00.000Z',
      end: '2026-06-09T22:00:00.000Z',
      workflowState: WORKFLOW.APPROVED,
      status: 'confirmed',
      recurrence: { frequency: 'weekly', count: 2 },
      participants: ['Alex Rivera'],
      proposer: 'Alex Rivera'
    };
    const expanded = expandRecurringToEvents(parent);
    expect(expanded).toHaveLength(2);
    expect(expanded[0].recurrenceSeriesId).toBe('prop_series_1');
    expect(expanded[0].recurrenceInstanceIndex).toBe(0);
    expect(expanded[1].recurrenceInstanceIndex).toBe(1);
    expect(expanded[0].recurrence).toBeUndefined();
  });

  it('finds future recurrence instances from an index', () => {
    const events = [
      { id: 'a', recurrenceSeriesId: 'series', recurrenceInstanceIndex: 0 },
      { id: 'b', recurrenceSeriesId: 'series', recurrenceInstanceIndex: 1 },
      { id: 'c', recurrenceSeriesId: 'series', recurrenceInstanceIndex: 2 }
    ];
    const future = getFutureRecurrenceInstances(events, events[1]);
    expect(future.map(e => e.id)).toEqual(['b', 'c']);
  });

  it('normalizes recurrence count bounds', () => {
    expect(normalizeRecurrence({ frequency: 'daily', count: 1 })?.count).toBe(2);
    expect(normalizeRecurrence({ frequency: 'daily', count: 99 })?.count).toBe(52);
    expect(isRecurringProposal({ recurrence: { frequency: 'weekly', count: 4 } })).toBe(true);
  });
});

describe('canUserRedraftEvent', () => {
  const config = { partners: [] };

  it('allows proposer on approved events', () => {
    const event = {
      type: 'event',
      workflowState: WORKFLOW.APPROVED,
      proposer: 'Alex Rivera',
      responses: { 'Alex Rivera': { status: 'accept' } }
    };
    expect(canUserRedraftEvent(event, 'Alex Rivera', config)).toBe(true);
  });

  it('allows approver who accepted', () => {
    const event = {
      type: 'event',
      workflowState: WORKFLOW.APPROVED,
      proposer: 'Alex Rivera',
      responses: {
        'Alex Rivera': { status: 'accept' },
        'Sam Davis': { status: 'accept' }
      }
    };
    expect(isProposalApprover(event, 'Sam Davis', config)).toBe(true);
    expect(canUserRedraftEvent(event, 'Sam Davis', config)).toBe(true);
  });

  it('blocks users who did not approve', () => {
    const event = {
      type: 'event',
      workflowState: WORKFLOW.APPROVED,
      proposer: 'Alex Rivera',
      responses: {
        'Alex Rivera': { status: 'accept' },
        'Sam Davis': { status: 'accept' }
      }
    };
    expect(canUserRedraftEvent(event, 'Jordan Lee', config)).toBe(false);
  });
});
