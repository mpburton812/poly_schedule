/**
 * One-time Google Calendar alignment — removes legacy batch parents,
 * orphans, and re-syncs events to match the normalized app database.
 */

import { GCAL_CONFIG_SUMMARY, shouldSyncEventToGCal } from './gcal-sync.js';
import { sleepingEventFingerprint } from './helpers.js';

export const GCAL_ALIGN_VERSION = 4;
export const GCAL_ALIGN_VERSION_KEY = 'polyschedule_gcal_align_version';

export function needsGCalAlignment() {
  return localStorage.getItem(GCAL_ALIGN_VERSION_KEY) !== String(GCAL_ALIGN_VERSION);
}

export function markGCalAligned() {
  localStorage.setItem(GCAL_ALIGN_VERSION_KEY, String(GCAL_ALIGN_VERSION));
}

/** Events that should exist as rows in Google Calendar after alignment. */
export function collectEventsToSync(events = []) {
  const sync = new Map();
  for (const event of events) {
    if (shouldSyncEventToGCal(event)) {
      sync.set(event.id, event);
    }
    for (const childId of event.expandedEventIds || []) {
      const child = events.find(e => e.id === childId);
      if (child) sync.set(childId, child);
    }
  }
  return sync;
}

/** GCal item ids that are not part of the desired synced set (includes legacy batch parents). */
export function collectOrphanGCalIds(rawItems = [], keepIds = new Set()) {
  const orphans = [];
  for (const item of rawItems) {
    if (!item?.id || item.summary === GCAL_CONFIG_SUMMARY) continue;
    const summary = item.summary || '';
    if (summary.startsWith('[PROPOSAL-BATCH]')) {
      orphans.push(item.id);
      continue;
    }
    if (!keepIds.has(item.id)) orphans.push(item.id);
  }
  return orphans;
}

export function findMatchingSleepingEvent(events, candidate) {
  const fp = sleepingEventFingerprint(candidate);
  if (!fp) return null;
  return (events || []).find(e => e.type === 'sleeping' && sleepingEventFingerprint(e) === fp) || null;
}
