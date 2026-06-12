/**
 * Event visibility and per-user display redaction.
 */

import { findPartnerByRef, partnerRefsMatch } from './helpers.js';
import { participantNames } from './proposal-workflow.js';

export const VISIBILITY = {
  STANDARD: 'standard',
  PRIVATE: 'private',
  SUPER_PRIVATE: 'super_private'
};

export function getEventVisibility(event) {
  const v = event?.visibility;
  if (v === VISIBILITY.PRIVATE || v === VISIBILITY.SUPER_PRIVATE) return v;
  return VISIBILITY.STANDARD;
}

export function isPrivateVisibility(event) {
  const v = getEventVisibility(event);
  return v === VISIBILITY.PRIVATE || v === VISIBILITY.SUPER_PRIVATE;
}

export function eventParticipantNames(event) {
  const fromRoles = participantNames(event?.participantRoles || []);
  const fromList = event?.participants || [];
  return [...new Set([...fromRoles, ...fromList].filter(Boolean))];
}

export function isEventInvitee(event, userRef, config) {
  if (!event || !userRef) return false;
  if (event.proposer && partnerRefsMatch(config, event.proposer, userRef)) return true;
  return eventParticipantNames(event).some((name) => partnerRefsMatch(config, name, userRef));
}

/** Private mode: non-invitees may still see sleeping arrangement details. */
export function canUserSeeSleepingArrangement(event, userRef, config) {
  if (!event || event.type !== 'sleeping') return false;
  if (getEventVisibility(event) === VISIBILITY.STANDARD) return true;
  if (isEventInvitee(event, userRef, config)) return true;
  if (getEventVisibility(event) === VISIBILITY.PRIVATE) return true;
  return false;
}

export function canUserSeeEventDetails(event, userRef, config) {
  if (!event) return false;
  if (getEventVisibility(event) === VISIBILITY.STANDARD) return true;
  return isEventInvitee(event, userRef, config);
}

/**
 * @returns {{ redacted: boolean, title: string, showSleepingArrangement: boolean, showParticipants: boolean, showLocation: boolean, showNotes: boolean, showComments: boolean }}
 */
export function getEventDisplayPolicy(event, userRef, config) {
  if (canUserSeeEventDetails(event, userRef, config)) {
    return {
      redacted: false,
      title: event.title || 'Untitled',
      showSleepingArrangement: event.type === 'sleeping',
      showParticipants: true,
      showLocation: true,
      showNotes: true,
      showComments: true
    };
  }

  const showSleepingArrangement = canUserSeeSleepingArrangement(event, userRef, config);

  return {
    redacted: true,
    title: 'Private',
    showSleepingArrangement,
    showParticipants: false,
    showLocation: false,
    showNotes: false,
    showComments: false
  };
}

/** Build a person-schedule conflict line, redacting private events for non-invitees. */
export function buildPersonConflictMessage(overlappingPeople = [], otherEvent, viewerRef, config) {
  const names = overlappingPeople.map((name) => name.split(' ')[0]).join(', ');
  const verb = overlappingPeople.length === 1 ? 'is' : 'are';

  if (!canUserSeeEventDetails(otherEvent, viewerRef, config)) {
    return `${names} ${verb} also scheduled for a Private Appointment at that time.`;
  }

  const timeOpts = { hour: 'numeric', minute: '2-digit', hour12: true };
  const startOther = new Date(otherEvent.start);
  const endOther = new Date(otherEvent.end);
  const title = otherEvent.title || 'Untitled Event';
  return `${names} ${verb} also scheduled for "${title}" (${startOther.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })} · ${startOther.toLocaleTimeString(undefined, timeOpts)}–${endOther.toLocaleTimeString(undefined, timeOpts)}).`;
}
