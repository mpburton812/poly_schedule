/**
 * Detect Google Calendar changes made outside PolySchedule and alert household members.
 */

import { GCAL_CONFIG_SUMMARY, isLocalEventId } from './gcal-sync.js';
import { participantNames, getWorkflowState, WORKFLOW } from './proposal-workflow.js';
import { findPartnerByRef, findPartnerByCalendarEmail, normalizeEmail } from './helpers.js';

function eventLabel(event) {
  if (!event) return 'An event';
  if (event.type === 'sleeping') {
    const who = (event.participants || []).join(' & ') || 'participants';
    return `${event.roomName || 'Sleeping'}: ${who}`;
  }
  return event.title || 'Untitled event';
}

function isTrackableCalendarEvent(event) {
  if (!event?.id || isLocalEventId(event.id)) return false;
  if (event.type === 'batch_sleeping') return false;
  const ws = getWorkflowState(event);
  if (ws === WORKFLOW.DRAFT || ws === WORKFLOW.DECLINED || ws === WORKFLOW.ARCHIVED) return false;
  return true;
}

function snapshotTrackableEvents(events = []) {
  const map = new Map();
  for (const event of events) {
    if (isTrackableCalendarEvent(event)) map.set(event.id, event);
  }
  return map;
}

export function resolveGCalActor(gcalItem, config) {
  if (!gcalItem) return { label: null, partnerId: null, email: null };

  const email = normalizeEmail(gcalItem.organizer?.email || gcalItem.creator?.email);
  const googleId = gcalItem.organizer?.id || gcalItem.creator?.id || null;
  const displayName = gcalItem.organizer?.displayName || gcalItem.creator?.displayName || null;

  if (email) {
    const byEmail = findPartnerByCalendarEmail(config, email);
    if (byEmail) {
      return { label: byEmail.name, partnerId: byEmail.id, email, googleId };
    }
  }

  if (displayName) {
    const byName = findPartnerByRef(config, displayName);
    if (byName) {
      return { label: byName.name, partnerId: byName.id, email, googleId };
    }
    return { label: displayName, partnerId: null, email, googleId };
  }

  if (email) {
    return { label: email.split('@')[0], partnerId: null, email, googleId };
  }

  return { label: null, partnerId: null, email: null, googleId };
}

function collectEventStakeholderIds(event, config) {
  const ids = new Set();
  const names = new Set([
    ...participantNames(event.participantRoles || []),
    ...(event.participants || [])
  ]);
  if (event.proposer) names.add(event.proposer);
  for (const name of names) {
    const partner = findPartnerByRef(config, name);
    if (partner?.id) ids.add(partner.id);
  }
  return ids;
}

function allHouseholdPartnerIds(config) {
  return (config?.partners || [])
    .filter((p) => p?.id)
    .map((p) => p.id);
}

function isMutedLocalMutation(eventId, locallyMutedIds) {
  if (!eventId || !locallyMutedIds) return false;
  if (typeof locallyMutedIds.has === 'function') return locallyMutedIds.has(eventId);
  return false;
}

function findAddedEvents(previousMap, nextMap, locallyMutedIds) {
  const added = [];
  for (const [id, event] of nextMap) {
    if (previousMap.has(id)) continue;
    if (isMutedLocalMutation(id, locallyMutedIds)) continue;
    added.push(event);
  }
  return added;
}

function findRemovedEvents(previousMap, nextMap, locallyMutedIds) {
  const removed = [];
  for (const [id, event] of previousMap) {
    if (nextMap.has(id)) continue;
    if (isMutedLocalMutation(id, locallyMutedIds)) continue;
    removed.push(event);
  }
  return removed;
}

function gcalItemForEvent(eventId, gcalItems = []) {
  return (gcalItems || []).find((item) => item?.id === eventId && item.summary !== GCAL_CONFIG_SUMMARY) || null;
}

/**
 * Compare previous vs next event sets after a GCal pull.
 * @returns {Promise<{ added: Array<{ event, actor }>, removed: Array<{ event, actor }> }>}
 */
export async function detectGCalExternalChanges({
  previousEvents = [],
  nextEvents = [],
  config = null,
  locallyMutedIds = null,
  fetchCancelledItem = null,
  gcalItems = []
} = {}) {
  if (!config) return { added: [], removed: [] };

  const previousMap = snapshotTrackableEvents(previousEvents);
  const nextMap = snapshotTrackableEvents(nextEvents);
  if (previousMap.size === 0) return { added: [], removed: [] };

  const addedEvents = findAddedEvents(previousMap, nextMap, locallyMutedIds);
  const removedEvents = findRemovedEvents(previousMap, nextMap, locallyMutedIds);

  const added = addedEvents.map((event) => {
    const item = gcalItemForEvent(event.id, gcalItems);
    return { event, actor: resolveGCalActor(item, config) };
  });

  const removed = [];
  for (const event of removedEvents) {
    let item = gcalItemForEvent(event.id, gcalItems);
    if (!item && typeof fetchCancelledItem === 'function') {
      try {
        item = await fetchCancelledItem(event.id);
      } catch {
        item = null;
      }
    }
    removed.push({ event, actor: resolveGCalActor(item, config) });
  }

  return { added, removed };
}

export {
  eventLabel,
  isTrackableCalendarEvent,
  snapshotTrackableEvents,
  collectEventStakeholderIds,
  allHouseholdPartnerIds
};
