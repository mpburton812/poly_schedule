/**
 * Google Calendar ↔ PolySchedule event serialization helpers.
 */

import { formatAppDateTime } from './helpers.js';
import { WORKFLOW, getWorkflowState } from './proposal-workflow.js';

export const GCAL_CONFIG_SUMMARY = '[CONFIG] PolySchedule Core Settings';

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
  const base = stripProposalPrefix(event.title || 'Untitled Event');
  const prefix = proposalTitlePrefix(event);
  return prefix ? `${prefix}${base}` : base;
}

/** Pack PolySchedule fields stored in a GCal event description. */
export function serializeEventMeta(event) {
  const meta = {
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
    notes: event.notes || ''
  };
  if (event.batchNights?.length) meta.batchNights = event.batchNights;
  if (event.personConflicts?.length) meta.personConflicts = event.personConflicts;
  return meta;
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
  let notes = '';
  let location = item.location || '';

  const rawTitle = item.summary || 'Untitled Event';

  if (item.description?.trim().startsWith('{')) {
    try {
      const meta = JSON.parse(item.description);
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
      notes = meta.notes || '';
    } catch {
      // Plain-text description — fall through to heuristics below.
    }
  }

  if (participants.length === 0) {
    participants = (item.attendees || []).map(a => a.displayName || a.email.split('@')[0]);
  }

  const title = stripProposalPrefix(rawTitle);

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

  return event;
}

/** Whether the app should boot connected to Google Calendar. */
export function resolveSyncBootstrapMode() {
  const wantsSync = localStorage.getItem('polyschedule_mode') === 'sync';
  const hasToken = !!localStorage.getItem('polyschedule_access_token');
  const hasCreds = !!localStorage.getItem('polyschedule_client_id')
    && !!localStorage.getItem('polyschedule_api_key');
  return wantsSync && hasCreds && hasToken ? 'sync' : 'offline';
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
  const start = new Date(event.start);
  if (Number.isNaN(start.getTime())) return false;
  if (event.type === 'sleeping' || event.type === 'batch_sleeping') {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startDay = new Date(start);
    startDay.setHours(0, 0, 0, 0);
    return startDay < today;
  }
  return start.getTime() < Date.now();
}

export function pastScheduleWarning(event) {
  if (!isPastScheduledEvent(event)) return null;
  const start = new Date(event.start);
  const when = event.type === 'sleeping'
    ? formatAppDateTime(start).split(',')[0].trim()
    : formatAppDateTime(start);
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
  const startSource = typeof event.start === 'string' && !event.start.includes('T')
    ? new Date(`${event.start}T12:00:00`)
    : new Date(event.start);
  const y = startSource.getFullYear();
  const m = String(startSource.getMonth() + 1).padStart(2, '0');
  const d = String(startSource.getDate()).padStart(2, '0');
  const dateStr = `${y}-${m}-${d}`;
  const endDay = new Date(startSource);
  endDay.setDate(endDay.getDate() + 1);
  const endStr = `${endDay.getFullYear()}-${String(endDay.getMonth() + 1).padStart(2, '0')}-${String(endDay.getDate()).padStart(2, '0')}`;
  return {
    start: { date: dateStr },
    end: { date: endStr }
  };
}

export function formatGCalResource(event) {
  const base = {
    summary: formatGCalSummary(event),
    location: event.location || '',
    description: JSON.stringify(serializeEventMeta(event), null, 2),
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
