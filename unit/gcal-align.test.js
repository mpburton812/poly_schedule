import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  needsGCalAlignment,
  markGCalAligned,
  collectEventsToSync,
  collectOrphanGCalIds,
  findMatchingSleepingEvent,
  GCAL_ALIGN_VERSION
} from '../js/gcal-align.js';
import { GCAL_ALIGN_VERSION_KEY } from '../js/storage-keys.js';
import { GCAL_CONFIG_SUMMARY } from '../js/gcal-sync.js';

vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
});

describe('needsGCalAlignment', () => {
  beforeEach(() => localStorage.clear());

  it('returns true until alignment version is recorded', () => {
    expect(needsGCalAlignment()).toBe(true);
    markGCalAligned();
    expect(needsGCalAlignment()).toBe(false);
    expect(localStorage.getItem(GCAL_ALIGN_VERSION_KEY)).toBe(String(GCAL_ALIGN_VERSION));
  });
});

describe('collectEventsToSync', () => {
  it('includes syncable events, proposed items, and expanded batch nights', () => {
    const events = [
      { id: 'gcal_batch', type: 'batch_sleeping', status: 'confirmed', workflowState: 'approved', expandedEventIds: ['night_1'] },
      { id: 'night_1', type: 'sleeping', status: 'confirmed', start: '2026-06-10T22:00:00.000Z', end: '2026-06-11T08:00:00.000Z' },
      { id: 'gcal_prop', type: 'event', status: 'pending', workflowState: 'proposed' },
      { id: 'gcal_evt', type: 'event', status: 'confirmed', workflowState: 'approved' }
    ];

    const syncMap = collectEventsToSync(events);
    expect(syncMap.has('gcal_batch')).toBe(false);
    expect(syncMap.has('night_1')).toBe(true);
    expect(syncMap.has('gcal_prop')).toBe(true);
    expect(syncMap.has('gcal_evt')).toBe(true);
  });
});

describe('collectOrphanGCalIds', () => {
  it('always treats legacy batch proposal parents as orphans', () => {
    const rawItems = [
      { id: 'batch_in_keep', summary: '[PROPOSAL-BATCH] Week Plan' },
      { id: 'prop_evt', summary: '[PROPOSAL] Dinner' }
    ];
    expect(collectOrphanGCalIds(rawItems, new Set(['batch_in_keep', 'prop_evt']))).toEqual(['batch_in_keep']);
  });

  it('returns GCal ids not in the keep set, excluding config events', () => {
    const rawItems = [
      { id: 'cfg', summary: GCAL_CONFIG_SUMMARY },
      { id: 'keep_me', summary: 'Dinner' },
      { id: 'legacy_batch', summary: '[PROPOSAL-BATCH] Week Plan' },
      { id: 'stale_sleep', summary: 'SLEEP: Room A: Alex' }
    ];
    const keepIds = new Set(['keep_me', 'night_1']);

    expect(collectOrphanGCalIds(rawItems, keepIds)).toEqual(['legacy_batch', 'stale_sleep']);
  });
});

describe('findMatchingSleepingEvent', () => {
  it('matches sleeping events by night, room, and participants', () => {
    const events = [{
      id: 'sleep_1',
      type: 'sleeping',
      title: 'SLEEP: Room A: Alex & Sam',
      start: '2026-06-10T22:00:00.000Z',
      end: '2026-06-11T08:00:00.000Z',
      homeId: 'h1',
      roomId: 'r1',
      participants: ['Alex', 'Sam']
    }];

    const candidate = {
      type: 'sleeping',
      title: 'SLEEP: Room A: Alex & Sam',
      start: '2026-06-10T22:00:00.000Z',
      homeId: 'h1',
      roomId: 'r1',
      participants: ['Sam', 'Alex']
    };

    expect(findMatchingSleepingEvent(events, candidate)?.id).toBe('sleep_1');
  });
});
