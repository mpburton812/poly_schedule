import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  stripProposalPrefix,
  serializeEventMeta,
  parseGCalEventItem,
  formatGCalSummary,
  formatGCalResource,
  formatSleepingAllDayDates,
  shouldSyncEventToGCal,
  shouldRemoveEventFromGCal,
  gcalColorIdForEvent,
  gcalStatusForEvent,
  isPastScheduledEvent,
  pastScheduleWarning,
  GCAL_COLOR_PROPOSED,
  GCAL_COLOR_EVENT_APPROVED,
  GCAL_COLOR_SLEEPING_APPROVED,
  resolveSyncBootstrapMode,
  isLocalEventId,
  mergeGCalWithLocalEvents,
  GCAL_CONFIG_SUMMARY
} from '../js/gcal-sync.js';

const storage = vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
  return { local };
});

describe('stripProposalPrefix', () => {
  it('removes proposal prefixes from titles', () => {
    expect(stripProposalPrefix('[PROPOSAL] Dinner')).toBe('Dinner');
    expect(stripProposalPrefix('[PROPOSAL-SLEEP] Lake House')).toBe('Lake House');
  });
});

describe('serializeEventMeta / parseGCalEventItem', () => {
  it('round-trips workflow metadata through GCal description JSON', () => {
    const source = {
      id: 'evt_1',
      title: 'Team Dinner',
      type: 'event',
      status: 'pending',
      workflowState: 'proposed',
      proposer: 'Alex Rivera',
      participantRoles: [{ name: 'Alex Rivera', role: 'required' }],
      participants: ['Alex Rivera', 'Sam Davis'],
      responses: { 'Alex Rivera': { status: 'accept', comment: '' } },
      start: '2026-06-10T18:00:00.000Z',
      end: '2026-06-10T21:00:00.000Z'
    };

    const gcalItem = {
      id: 'gcal_abc',
      summary: formatGCalSummary(source),
      description: JSON.stringify(serializeEventMeta(source), null, 2),
      start: { dateTime: source.start },
      end: { dateTime: source.end },
      location: ''
    };

    const parsed = parseGCalEventItem(gcalItem);
    expect(parsed.title).toBe('Team Dinner');
    expect(parsed.workflowState).toBe('proposed');
    expect(parsed.participantRoles).toEqual(source.participantRoles);
    expect(parsed.responses['Alex Rivera'].status).toBe('accept');
  });

  it('skips config events', () => {
    expect(parseGCalEventItem({ summary: GCAL_CONFIG_SUMMARY })).toBeNull();
  });
});

describe('isLocalEventId', () => {
  it('detects local draft and event ids', () => {
    expect(isLocalEventId('prop_123')).toBe(true);
    expect(isLocalEventId('e_456')).toBe(true);
    expect(isLocalEventId('s1')).toBe(true);
    expect(isLocalEventId('p_s1')).toBe(true);
    expect(isLocalEventId('abc123google')).toBe(false);
  });
});

describe('shouldSyncEventToGCal', () => {
  it('syncs approved events and sleeping nights', () => {
    expect(shouldSyncEventToGCal({ type: 'event', status: 'confirmed', workflowState: 'approved' })).toBe(true);
    expect(shouldSyncEventToGCal({ type: 'sleeping', status: 'confirmed', workflowState: 'approved' })).toBe(true);
    expect(shouldSyncEventToGCal({ type: 'event', status: 'confirmed' })).toBe(true);
  });

  it('syncs proposed items as tentative calendar rows', () => {
    expect(shouldSyncEventToGCal({ type: 'event', status: 'pending', workflowState: 'proposed' })).toBe(true);
    expect(shouldSyncEventToGCal({ type: 'sleeping', status: 'pending', workflowState: 'proposed' })).toBe(true);
  });

  it('does not sync drafts, declined items, or batch sleeping parents', () => {
    expect(shouldSyncEventToGCal({ type: 'event', status: 'draft', workflowState: 'draft' })).toBe(false);
    expect(shouldSyncEventToGCal({ type: 'event', status: 'rejected', workflowState: 'declined' })).toBe(false);
    expect(shouldSyncEventToGCal({
      type: 'batch_sleeping',
      status: 'pending',
      workflowState: 'proposed'
    })).toBe(false);
    expect(shouldSyncEventToGCal({
      type: 'batch_sleeping',
      status: 'confirmed',
      workflowState: 'approved',
      expandedEventIds: ['gcal_1']
    })).toBe(false);
  });
});

describe('shouldRemoveEventFromGCal', () => {
  it('removes draft and declined proposals from Google Calendar', () => {
    expect(shouldRemoveEventFromGCal({ type: 'event', workflowState: 'draft' })).toBe(true);
    expect(shouldRemoveEventFromGCal({ type: 'event', workflowState: 'declined' })).toBe(true);
    expect(shouldRemoveEventFromGCal({ type: 'event', workflowState: 'proposed' })).toBe(false);
    expect(shouldRemoveEventFromGCal({ type: 'event', workflowState: 'approved' })).toBe(false);
  });
});

describe('formatGCalResource colors and status', () => {
  it('uses yellow tentative for proposed events', () => {
    const resource = formatGCalResource({
      title: 'Dinner',
      type: 'event',
      workflowState: 'proposed',
      status: 'pending',
      start: '2026-06-10T18:00:00.000Z',
      end: '2026-06-10T21:00:00.000Z'
    });
    expect(resource.colorId).toBe(GCAL_COLOR_PROPOSED);
    expect(resource.status).toBe('tentative');
    expect(resource.summary).toBe('[PROPOSAL] Dinner');
  });

  it('uses green confirmed for approved events', () => {
    const resource = formatGCalResource({
      title: 'Dinner',
      type: 'event',
      workflowState: 'approved',
      status: 'confirmed',
      start: '2026-06-10T18:00:00.000Z',
      end: '2026-06-10T21:00:00.000Z'
    });
    expect(resource.colorId).toBe(GCAL_COLOR_EVENT_APPROVED);
    expect(resource.status).toBe('confirmed');
    expect(resource.summary).toBe('Dinner');
  });

  it('uses blue confirmed for approved sleeping nights', () => {
    const resource = formatGCalResource({
      title: 'SLEEP: Room A: Alex & Sam',
      type: 'sleeping',
      workflowState: 'approved',
      status: 'confirmed',
      start: '2026-06-10T22:00:00.000Z',
      end: '2026-06-11T08:00:00.000Z'
    });
    expect(resource.colorId).toBe(GCAL_COLOR_SLEEPING_APPROVED);
    expect(resource.status).toBe('confirmed');
  });
});

describe('isPastScheduledEvent', () => {
  it('detects past timed events and sleeping nights', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00.000Z'));
    expect(isPastScheduledEvent({
      type: 'event',
      start: '2026-06-10T11:00:00.000Z',
      end: '2026-06-10T12:00:00.000Z'
    })).toBe(true);
    expect(isPastScheduledEvent({
      type: 'event',
      start: '2026-06-10T13:00:00.000Z',
      end: '2026-06-10T14:00:00.000Z'
    })).toBe(false);
    expect(isPastScheduledEvent({
      type: 'sleeping',
      start: '2026-06-09T22:00:00.000Z',
      end: '2026-06-10T08:00:00.000Z'
    })).toBe(true);
    vi.useRealTimers();
  });

  it('builds a past schedule warning message', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-10T12:00:00.000Z'));
    const warning = pastScheduleWarning({
      type: 'event',
      start: '2026-06-10T11:00:00.000Z',
      end: '2026-06-10T12:00:00.000Z'
    });
    expect(warning?.type).toBe('PAST_SCHEDULE');
    expect(warning?.message).toContain('past');
    vi.useRealTimers();
  });
});

describe('mergeGCalWithLocalEvents', () => {
  it('keeps local drafts alongside synced calendar rows', () => {
    const merged = mergeGCalWithLocalEvents(
      [
        { id: 'gcal_1', type: 'event', status: 'confirmed', workflowState: 'approved', title: 'Dinner' },
        { id: 'gcal_2', type: 'event', status: 'pending', workflowState: 'proposed', title: 'Pending from gcal' }
      ],
      [
        { id: 'prop_1', type: 'event', status: 'draft', workflowState: 'draft', title: 'Draft hangout' },
        { id: 'prop_2', type: 'event', status: 'pending', workflowState: 'proposed', title: 'Pending hangout' }
      ]
    );
    expect(merged).toHaveLength(4);
    expect(merged.find(e => e.id === 'prop_1')?.title).toBe('Draft hangout');
    expect(merged.find(e => e.id === 'gcal_2')?.title).toBe('Pending from gcal');
    expect(merged.find(e => e.id === 'prop_2')?.title).toBe('Pending hangout');
  });
});

describe('formatGCalResource sleeping events', () => {
  it('uses all-day dates for sleeping events', () => {
    const resource = formatGCalResource({
      title: 'SLEEP: Room A: Alex & Sam',
      type: 'sleeping',
      start: '2026-06-10T22:00:00.000Z',
      end: '2026-06-11T08:00:00.000Z',
      status: 'confirmed'
    });
    expect(resource.start).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(resource.end).toEqual({ date: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) });
    expect(resource.start.dateTime).toBeUndefined();
  });

  it('uses timed events for regular events', () => {
    const resource = formatGCalResource({
      title: 'Dinner',
      type: 'event',
      start: '2026-06-10T18:00:00.000Z',
      end: '2026-06-10T21:00:00.000Z',
      status: 'confirmed'
    });
    expect(resource.start.dateTime).toBeTruthy();
    expect(resource.end.dateTime).toBeTruthy();
  });
});

describe('formatSleepingAllDayDates', () => {
  it('sets exclusive end date for one-night sleep', () => {
    const { start, end } = formatSleepingAllDayDates({
      start: '2026-06-10T22:00:00.000Z'
    });
    expect(start.date).toBeTruthy();
    expect(end.date).toBeTruthy();
    expect(end.date > start.date).toBe(true);
  });
});

describe('resolveSyncBootstrapMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns sync when mode, credentials, and token are present', () => {
    localStorage.setItem('polyschedule_mode', 'sync');
    localStorage.setItem('polyschedule_client_id', 'client');
    localStorage.setItem('polyschedule_api_key', 'key');
    localStorage.setItem('polyschedule_access_token', 'token');
    expect(resolveSyncBootstrapMode()).toBe('sync');
  });

  it('returns offline when token is missing', () => {
    localStorage.setItem('polyschedule_mode', 'sync');
    localStorage.setItem('polyschedule_client_id', 'client');
    localStorage.setItem('polyschedule_api_key', 'key');
    expect(resolveSyncBootstrapMode()).toBe('offline');
  });
});
