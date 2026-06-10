/**
 * Google Calendar ↔ PolySchedule event serialization helpers.
 */

export const GCAL_CONFIG_SUMMARY = '[CONFIG] PolySchedule Core Settings';

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
    expandedEventIds: event.expandedEventIds
  };
  if (event.batchNights?.length) meta.batchNights = event.batchNights;
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
  let declinedBy;
  let declinedAt;
  let expandedEventIds;
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
      declinedBy = meta.declinedBy;
      declinedAt = meta.declinedAt;
      expandedEventIds = meta.expandedEventIds;
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
  if (declinedBy) event.declinedBy = declinedBy;
  if (declinedAt) event.declinedAt = declinedAt;
  if (expandedEventIds) event.expandedEventIds = expandedEventIds;

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

/** Whether an event should be written to Google Calendar. Batch parents stay app-only; sync expanded sleeping nights instead. */
export function shouldSyncEventToGCal(event) {
  return event?.type !== 'batch_sleeping';
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
    description: JSON.stringify(serializeEventMeta(event), null, 2)
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
