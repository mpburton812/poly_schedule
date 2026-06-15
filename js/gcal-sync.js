import {
  CLIENT_ID_KEY,
  API_KEY_KEY,
  ACCESS_TOKEN_KEY
} from './storage-keys.js';
/**
 * Google Calendar ↔ PolySchedule event serialization helpers.
 */

import { formatAppDateTime, parseLocalDateString, formatLocalDateString, sleepingNightStart, sleepingNightEnd, sleepingNightLocalDate } from './helpers.js';
import { WORKFLOW, getWorkflowState } from './proposal-workflow.js';
import { isPrivateVisibility } from './event-privacy.js';
import { formatGCalDescription, normalizeEventComments } from './event-comments.js';

export const GCAL_CONFIG_SUMMARY = '[CONFIG] PolySchedule Core Settings';
export const GCAL_META_PROPERTY = 'polyschedule_meta';

/** Parse a failed Google REST response into a short, user-facing message. */
export async function googleApiErrorFromResponse(res, fallback) {
  let detail = '';
  try {
    const text = await res.text();
    if (text) {
      try {
        const data = JSON.parse(text);
        const err = data?.error;
        if (err?.message) detail = err.message;
        const reason = err?.errors?.[0]?.reason;
        if (reason && !detail.includes(reason)) {
          detail = detail ? `${detail} (${reason})` : reason;
        }
      } catch {
        detail = text.slice(0, 240);
      }
    }
  } catch {
    // ignore read failures
  }
  const base = detail || fallback || 'Google Calendar API error';
  const message = `${base} (HTTP ${res.status})`;
  const error = new Error(message);
  error.status = res.status;
  if (res.status === 401) error.code = 'GOOGLE_AUTH_EXPIRED';
  if (res.status === 403) error.code = 'GOOGLE_FORBIDDEN';
  if (res.status === 404) error.code = 'GOOGLE_NOT_FOUND';
  if (res.status === 400) error.code = 'GOOGLE_BAD_REQUEST';
  return error;
}

/** Lightweight Calendar API probe for admin diagnostics. */
export async function probeGoogleCalendarConnection({ accessToken, apiKey, calendarId = 'primary' }) {
  if (!accessToken || !apiKey) {
    return {
      ok: false,
      status: 0,
      error: 'Missing Google access token or API key. Click Sync Google after saving credentials.',
      code: 'GOOGLE_CREDENTIALS_INCOMPLETE'
    };
  }

  const params = new URLSearchParams({ maxResults: '1', key: apiKey });
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params}`;

  try {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${accessToken}` } });
    if (res.ok) return { ok: true, status: res.status };
    const err = await googleApiErrorFromResponse(res, 'Calendar API test failed');
    return { ok: false, status: res.status, error: err.message, code: err.code };
  } catch (e) {
    return { ok: false, status: 0, error: e.message, code: 'NETWORK_ERROR' };
  }
}

/** Google Calendar preset colors (calendar colorId). */
export const GCAL_COLOR_PROPOSED = '5';
export const GCAL_COLOR_EVENT_APPROVED = '10';
export const GCAL_COLOR_SLEEPING_APPROVED = '9';

const PROPOSAL_PREFIXES = ['[PROPOSAL-BATCH] ', '[PROPOSAL-SLEEP] ', '[PROPOSAL] '];

export function stripProposalPrefix(title = '') {
  for (const prefix of PROPOSAL_PREFIXES) {
    if (title.startsWith(prefix)) return title.slice(prefix.length);
  }
  return title;
}

export function proposalTitlePrefix(event) {
  const ws = event.workflowState;
  const isOpenProposal = event.status === 'pending' || event.status === 'draft'
    || ws === 'proposed' || ws === 'draft';
  if (!isOpenProposal) return '';
  if (event.type === 'sleeping') return '[PROPOSAL-SLEEP] ';
  if (event.type === 'batch_sleeping') return '[PROPOSAL-BATCH] ';
  return '[PROPOSAL] ';
}

export function formatGCalSummary(event) {
  if (isPrivateVisibility(event)) {
    const prefix = proposalTitlePrefix(event);
    return prefix ? `${prefix}Private` : 'Private';
  }
  const base = stripProposalPrefix(event.title || 'Untitled Event');
  const prefix = proposalTitlePrefix(event);
  return prefix ? `${prefix}${base}` : base;
}

/** Pack PolySchedule fields stored in a GCal event description. */
export function serializeEventMeta(event) {
  const meta = {
    title: event.title || '',
    type: event.type || 'event',
    status: event.status || 'confirmed',
    workflowState: event.workflowState,
    participantRoles: event.participantRoles,
    revision: event.revision,
    proposer: event.proposer || '',
    submittedBy: event.submittedBy || '',
    responses: event.responses || {},
    participants: event.participants || [],
    roomName: event.roomName || '',
    homeName: event.homeName || '',
    roomId: event.roomId || '',
    homeId: event.homeId || '',
    location: event.location || '',
    approvedAt: event.approvedAt,
    archivedAt: event.archivedAt,
    autoArchiveAt: event.autoArchiveAt,
    submittedAt: event.submittedAt,
    declinedBy: event.declinedBy,
    declinedAt: event.declinedAt,
    expandedEventIds: event.expandedEventIds,
    notes: event.notes || '',
    visibility: event.visibility || 'standard',
    comments: normalizeEventComments(event.comments)
  };
  if (event.recurrence) meta.recurrence = event.recurrence;
  if (event.recurrenceSeriesId) meta.recurrenceSeriesId = event.recurrenceSeriesId;
  if (event.recurrenceInstanceIndex != null) meta.recurrenceInstanceIndex = event.recurrenceInstanceIndex;
  if (event.recurrenceInstanceDate) meta.recurrenceInstanceDate = event.recurrenceInstanceDate;
  if (event.batchNights?.length) meta.batchNights = event.batchNights;
  if (event.personConflicts?.length) meta.personConflicts = event.personConflicts;
  return meta;
}

function parseMetaFromGCalItem(item) {
  const packed = item?.extendedProperties?.shared?.[GCAL_META_PROPERTY];
  if (packed) {
    try {
      return JSON.parse(packed);
    } catch {
      // fall through to legacy description JSON
    }
  }
  if (item.description?.trim().startsWith('{')) {
    try {
      return JSON.parse(item.description);
    } catch {
      return null;
    }
  }
  return null;
}

/** @deprecated Prefer extendedProperties; kept for tests importing serialize output directly. */
export function packEventMetaJson(event) {
  return JSON.stringify(serializeEventMeta(event));
}

/** Parse a Google Calendar API event into a PolySchedule record. */
export function parseGCalEventItem(item) {
  if (!item || item.summary === GCAL_CONFIG_SUMMARY) return null;

  let type = 'event';
  let status = 'confirmed';
  let roomName = '';
  let homeName = '';
  let roomId = '';
  let homeId = '';
  let proposer = '';
  let responses = {};
  let participants = [];
  let participantRoles;
  let workflowState;
  let revision;
  let batchNights;
  let approvedAt;
  let archivedAt;
  let autoArchiveAt;
  let submittedAt;
  let submittedBy;
  let declinedBy;
  let declinedAt;
  let expandedEventIds;
  let personConflicts;
  let visibility;
  let comments;
  let recurrence;
  let recurrenceSeriesId;
  let recurrenceInstanceIndex;
  let recurrenceInstanceDate;

  const rawTitle = item.summary || 'Untitled Event';

  const meta = parseMetaFromGCalItem(item);
  let notes = '';
  let location = item.location || '';
  let storedTitle = '';

  if (meta) {
    storedTitle = meta.title || '';
    type = meta.type || type;
    status = meta.status || status;
    workflowState = meta.workflowState;
    participantRoles = meta.participantRoles;
    revision = meta.revision;
    roomName = meta.roomName || roomName;
    homeName = meta.homeName || homeName;
    roomId = meta.roomId || roomId;
    homeId = meta.homeId || homeId;
    location = meta.location || location;
    proposer = meta.proposer || proposer;
    responses = meta.responses || responses;
    participants = meta.participants || participants;
    batchNights = meta.batchNights;
    approvedAt = meta.approvedAt;
    archivedAt = meta.archivedAt;
    autoArchiveAt = meta.autoArchiveAt;
    submittedAt = meta.submittedAt;
    submittedBy = meta.submittedBy;
    declinedBy = meta.declinedBy;
    declinedAt = meta.declinedAt;
    expandedEventIds = meta.expandedEventIds;
    personConflicts = meta.personConflicts;
    notes = meta.notes || notes;
    visibility = meta.visibility;
    comments = meta.comments;
    recurrence = meta.recurrence;
    recurrenceSeriesId = meta.recurrenceSeriesId;
    recurrenceInstanceIndex = meta.recurrenceInstanceIndex;
    recurrenceInstanceDate = meta.recurrenceInstanceDate;
  } else if (item.description?.trim() && !item.description.trim().startsWith('{')) {
    notes = item.description.trim();
  }

  if (participants.length === 0) {
    participants = (item.attendees || []).map(a => a.displayName || a.email.split('@')[0]);
  }

  const title = storedTitle || stripProposalPrefix(rawTitle);

  if (!type || type === 'event') {
    if (rawTitle.toUpperCase().includes('SLEEP') || rawTitle.startsWith('[PROPOSAL-SLEEP]')) {
      type = 'sleeping';
    }
  }

  if (!workflowState) {
    if (rawTitle.startsWith('[PROPOSAL') || status === 'pending') {
      status = 'pending';
    }
  }

  const event = {
    id: item.id,
    title,
    type,
    start: item.start.dateTime || item.start.date,
    end: item.end.dateTime || item.end.date,
    location,
    roomId,
    homeId,
    roomName,
    homeName,
    participants,
    proposer,
    status,
    responses
  };

  if (type === 'sleeping' && item.start?.date && !item.start.dateTime) {
    event.start = sleepingNightStart({ start: item.start.date }).toISOString();
    event.end = sleepingNightEnd({ start: item.start.date }).toISOString();
  }

  if (workflowState) event.workflowState = workflowState;
  if (participantRoles) event.participantRoles = participantRoles;
  if (revision != null) event.revision = revision;
  if (batchNights) event.batchNights = batchNights;
  if (approvedAt) event.approvedAt = approvedAt;
  if (archivedAt) event.archivedAt = archivedAt;
  if (autoArchiveAt) event.autoArchiveAt = autoArchiveAt;
  if (submittedAt) event.submittedAt = submittedAt;
  if (submittedBy) event.submittedBy = submittedBy;
  if (declinedBy) event.declinedBy = declinedBy;
  if (declinedAt) event.declinedAt = declinedAt;
  if (expandedEventIds) event.expandedEventIds = expandedEventIds;
  if (personConflicts?.length) event.personConflicts = personConflicts;
  if (notes) event.notes = notes;
  if (visibility) event.visibility = visibility;
  if (comments?.length) event.comments = normalizeEventComments(comments);
  if (recurrence) event.recurrence = recurrence;
  if (recurrenceSeriesId) event.recurrenceSeriesId = recurrenceSeriesId;
  if (recurrenceInstanceIndex != null) event.recurrenceInstanceIndex = recurrenceInstanceIndex;
  if (recurrenceInstanceDate) event.recurrenceInstanceDate = recurrenceInstanceDate;

  return event;
}

/** Whether Calendar API writes can be attempted (sync mode + credentials). */
export function canWriteToGoogleCalendar({ mode, accessToken, apiKey } = {}) {
  return mode === 'sync' && !!accessToken && !!apiKey;
}

/** Whether the app should sync with Google Calendar on startup. */
export function shouldSyncWithGoogleCalendar() {
  const hasToken = !!localStorage.getItem(ACCESS_TOKEN_KEY);
  const hasCreds = !!localStorage.getItem(CLIENT_ID_KEY)
    && !!localStorage.getItem(API_KEY_KEY);
  return hasCreds && hasToken;
}

/** @deprecated Use shouldSyncWithGoogleCalendar */
export function resolveSyncBootstrapMode() {
  return shouldSyncWithGoogleCalendar() ? 'sync' : 'cache';
}

/** Whether an event id is a local-only placeholder not yet in Google Calendar. */
export function isLocalEventId(eventId) {
  if (typeof eventId !== 'string') return false;
  if (/^prop_/.test(eventId) || /^e_/.test(eventId)) return true;
  // Demo seed ids (s1, p_s1, p_e1, etc.)
  if (/^[ps]\d+$/i.test(eventId)) return true;
  if (/^p_[es]\d+$/i.test(eventId)) return true;
  return false;
}

/** Whether delete should call the Google Calendar API for this event id. */
export function shouldAttemptGCalDelete(eventId) {
  return !isLocalEventId(eventId);
}

/** Whether an event should be written to Google Calendar (proposed tentative or approved). */
export function shouldSyncEventToGCal(event) {
  if (!event || event.type === 'batch_sleeping') return false;
  if (event.recurrence?.frequency && !event.recurrenceSeriesId) return false;
  const ws = getWorkflowState(event);
  if (ws === WORKFLOW.PROPOSED || ws === WORKFLOW.APPROVED) return true;
  if (!ws && event.status === 'confirmed') return true;
  return false;
}

/** Whether a calendar row should be removed from Google Calendar. */
export function shouldRemoveEventFromGCal(event) {
  if (!event || event.type === 'batch_sleeping') return false;
  const ws = getWorkflowState(event);
  return ws === WORKFLOW.DRAFT || ws === WORKFLOW.DECLINED;
}

export function gcalColorIdForEvent(event) {
  const ws = getWorkflowState(event);
  if (ws === WORKFLOW.PROPOSED) return GCAL_COLOR_PROPOSED;
  if (event.type === 'sleeping') return GCAL_COLOR_SLEEPING_APPROVED;
  return GCAL_COLOR_EVENT_APPROVED;
}

export function gcalStatusForEvent(event) {
  return getWorkflowState(event) === WORKFLOW.PROPOSED ? 'tentative' : 'confirmed';
}

/** True when the scheduled start is already in the past. */
export function isPastScheduledEvent(event) {
  if (!event?.start) return false;
  if (event.type === 'sleeping' || event.type === 'batch_sleeping') {
    const startDay = sleepingNightStart(event);
    if (Number.isNaN(startDay.getTime())) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const nightDay = new Date(startDay);
    nightDay.setHours(0, 0, 0, 0);
    return nightDay < today;
  }
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return false;
  return start.getTime() < Date.now();
}

export function pastScheduleWarning(event) {
  if (!isPastScheduledEvent(event)) return null;
  const when = event.type === 'sleeping'
    ? formatAppDateTime(sleepingNightStart(event)).split(',')[0].trim()
    : formatAppDateTime(new Date(event.start));
  return {
    type: 'PAST_SCHEDULE',
    message: `This proposal is scheduled in the past (${when}). Reviewers will be alerted.`
  };
}

/** Merge Google Calendar rows with app-local drafts and open proposals. */
export function mergeGCalWithLocalEvents(gcalEvents = [], localEvents = []) {
  const byId = new Map((gcalEvents || []).map(event => [event.id, event]));
  for (const local of localEvents || []) {
    if (!shouldSyncEventToGCal(local)) {
      byId.set(local.id, local);
      continue;
    }
    if (isLocalEventId(local.id) && !byId.has(local.id)) {
      byId.set(local.id, local);
    }
  }
  return Array.from(byId.values());
}

/** All-day date range for a sleeping night (GCal end date is exclusive). */
export function formatSleepingAllDayDates(event) {
  const dateStr = sleepingNightLocalDate(event);
  const endDay = parseLocalDateString(dateStr, 12, 0, 0, 0);
  endDay.setDate(endDay.getDate() + 1);
  return {
    start: { date: dateStr },
    end: { date: formatLocalDateString(endDay) }
  };
}

export function formatGCalResource(event) {
  const metaJson = packEventMetaJson(event);
  const base = {
    summary: formatGCalSummary(event),
    location: isPrivateVisibility(event) ? '' : (event.location || ''),
    description: formatGCalDescription(event),
    extendedProperties: {
      shared: {
        [GCAL_META_PROPERTY]: metaJson
      }
    },
    colorId: gcalColorIdForEvent(event),
    status: gcalStatusForEvent(event)
  };

  if (event.type === 'sleeping') {
    return { ...base, ...formatSleepingAllDayDates(event) };
  }

  return {
    ...base,
    start: {
      dateTime: new Date(event.start).toISOString(),
      timeZone: 'America/New_York'
    },
    end: {
      dateTime: new Date(event.end).toISOString(),
      timeZone: 'America/New_York'
    }
  };
}
