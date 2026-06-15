/**
 * Recurring event / sleeping proposal helpers.
 */

export const RECURRENCE_FREQ = {
  DAILY: 'daily',
  WEEKLY: 'weekly',
  MONTHLY: 'monthly',
  YEARLY: 'yearly'
};

export const MAX_RECURRENCE_INSTANCES = 52;
export const DEFAULT_RECURRENCE_COUNT = 12;

const VALID_FREQ = new Set(Object.values(RECURRENCE_FREQ));

export function isRecurringProposal(event) {
  return !!(event?.recurrence?.frequency && VALID_FREQ.has(event.recurrence.frequency));
}

export function isRecurrenceInstance(event) {
  return !!(event?.recurrenceSeriesId);
}

export function normalizeRecurrence(recurrence) {
  if (!recurrence?.frequency || !VALID_FREQ.has(recurrence.frequency)) return null;
  const count = Math.min(
    MAX_RECURRENCE_INSTANCES,
    Math.max(2, parseInt(recurrence.count, 10) || DEFAULT_RECURRENCE_COUNT)
  );
  return { frequency: recurrence.frequency, count };
}

export function advanceDateByRecurrence(date, frequency) {
  const next = new Date(date);
  switch (frequency) {
    case RECURRENCE_FREQ.DAILY:
      next.setDate(next.getDate() + 1);
      break;
    case RECURRENCE_FREQ.WEEKLY:
      next.setDate(next.getDate() + 7);
      break;
    case RECURRENCE_FREQ.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      break;
    case RECURRENCE_FREQ.YEARLY:
      next.setFullYear(next.getFullYear() + 1);
      break;
    default:
      next.setDate(next.getDate() + 7);
  }
  return next;
}

/** @returns {Date[]} */
export function buildRecurrenceInstanceDates(startDate, recurrence) {
  const normalized = normalizeRecurrence(recurrence);
  if (!normalized) return [new Date(startDate)];

  const dates = [];
  let cursor = new Date(startDate);
  for (let i = 0; i < normalized.count; i += 1) {
    dates.push(new Date(cursor));
    cursor = advanceDateByRecurrence(cursor, normalized.frequency);
  }
  return dates;
}

function shiftIsoRange(startIso, endIso, instanceStart) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const durationMs = end.getTime() - start.getTime();
  const instanceEnd = new Date(instanceStart.getTime() + durationMs);
  return { start: instanceStart.toISOString(), end: instanceEnd.toISOString() };
}

/**
 * Expand an approved recurring parent into calendar instance records.
 * @param {object} parentEvent
 * @returns {object[]}
 */
export function expandRecurringToEvents(parentEvent) {
  if (!isRecurringProposal(parentEvent)) return [];

  const recurrence = normalizeRecurrence(parentEvent.recurrence);
  if (!recurrence) return [];

  const baseStart = new Date(parentEvent.start);
  const dates = buildRecurrenceInstanceDates(baseStart, recurrence);

  return dates.map((instanceStart, index) => {
    const { start, end } = shiftIsoRange(parentEvent.start, parentEvent.end, instanceStart);
    const id = `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${index}`;
    const instanceDate = instanceStart.toISOString().split('T')[0];
    const child = {
      ...JSON.parse(JSON.stringify(parentEvent)),
      id,
      start,
      end,
      recurrenceSeriesId: parentEvent.id,
      recurrenceInstanceIndex: index,
      recurrenceInstanceDate: instanceDate,
      workflowState: parentEvent.workflowState,
      status: parentEvent.status,
      expandedEventIds: [],
      recurrence: null
    };
    delete child.recurrence;
    if (child.type === 'sleeping') {
      child.title = `SLEEP: ${child.roomName}: ${(child.participants || []).join(' & ')}`;
    }
    return child;
  });
}

export function getRecurrenceSeriesInstances(events, seriesId) {
  return (events || [])
    .filter(e => e.recurrenceSeriesId === seriesId)
    .sort((a, b) => (a.recurrenceInstanceIndex || 0) - (b.recurrenceInstanceIndex || 0));
}

export function getFutureRecurrenceInstances(events, instance) {
  if (!instance?.recurrenceSeriesId) return [instance].filter(Boolean);
  const index = instance.recurrenceInstanceIndex ?? 0;
  return getRecurrenceSeriesInstances(events, instance.recurrenceSeriesId)
    .filter(e => (e.recurrenceInstanceIndex ?? 0) >= index);
}

/**
 * Ask user whether a recurring action applies to one instance or all future instances.
 * @returns {'instance' | 'future' | null}
 */
export function askRecurrenceScope(actionLabel) {
  const message = actionLabel === 'delete'
    ? 'Delete this occurrence only, or this and all future occurrences in the series?'
    : 'Re-draft this occurrence only, or this and all future occurrences in the series?';
  const choice = window.prompt(
    `${message}\n\nType "instance" for this one only, or "future" for this and all going forward.\n(Cancel to abort.)`,
    'instance'
  );
  if (choice === null) return null;
  const normalized = choice.trim().toLowerCase();
  if (normalized === 'instance' || normalized === 'this' || normalized === 'one') return 'instance';
  if (normalized === 'future' || normalized === 'all' || normalized === 'forward') return 'future';
  return null;
}
