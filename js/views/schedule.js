import { escapeHtml } from '../escape.js';
import {
  formatLocalDateString,
  getMondayOfWeek,
  eventScheduleDayKey,
  sleepingNightStart,
  batchProposalToSleepingEvents
} from '../helpers.js';
import { getEventDisplayPolicy } from '../event-privacy.js';
import {
  WORKFLOW,
  getWorkflowState
} from '../proposal-workflow.js';
import {
  SCHEDULE_VIEW_COMPACT,
  SCHEDULE_VIEW_NORMAL,
  formatScheduleRangeLabel,
  getScheduleWeekCount,
  normalizeScheduleViewMode
} from '../schedule-view.js';


function eventPassesFilters(e, state) {
  if (state.filterPartner && state.filterPartner !== 'all') {
    const hasPartner = e.participants && e.participants.some((p) =>
      p.split(' ')[0].toLowerCase() === state.filterPartner.split(' ')[0].toLowerCase()
    );
    if (!hasPartner) return false;
  }
  return true;
}

function collectScheduleEvents(state, rangeStart, rangeEnd) {
  const viewerRef = state.currentUser?.id || state.currentUser?.name;
  const mon = new Date(rangeStart);
  mon.setHours(0, 0, 0, 0);
  const sun = new Date(rangeEnd);
  sun.setHours(23, 59, 59, 999);

  const isInDisplayRange = (e) => {
    const eDate = e.type === 'sleeping' ? sleepingNightStart(e) : new Date(e.start);
    return eDate >= mon && eDate <= sun;
  };

  const scheduleEvents = state.events.filter((e) => {
    const ws = getWorkflowState(e);
    const isCorrectRange = isInDisplayRange(e)
      && e.type !== 'batch_sleeping'
      && (e.status === 'confirmed' || ws === WORKFLOW.APPROVED || ws === WORKFLOW.PROPOSED);
    return isCorrectRange && eventPassesFilters(e, state);
  });

  state.events.forEach((batch) => {
    if (batch.type !== 'batch_sleeping' || getWorkflowState(batch) !== WORKFLOW.PROPOSED) return;
    if (!batch.batchNights?.length) return;
    batchProposalToSleepingEvents(batch).forEach((preview) => {
      preview.workflowState = WORKFLOW.PROPOSED;
      preview._scheduleNavigateId = batch.id;
      if (isInDisplayRange(preview) && eventPassesFilters(preview, state)) {
        scheduleEvents.push(preview);
      }
    });
  });

  return { scheduleEvents, viewerRef };
}

function renderEventCard(e, display, state, compact) {
  const isProposed = getWorkflowState(e) === WORKFLOW.PROPOSED;
  const proposedClass = isProposed ? ' is-proposed' : '';
  const cardId = e._scheduleNavigateId || e.id;
  const timeStr = new Date(e.start).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  });
  const attendeeMeta = display.showParticipants ? `${e.participants.length} Attendees` : 'Private';

  if (compact) {
    const statusSuffix = isProposed ? ' · Proposed' : '';
    return `
      <div class="card-event card-event--compact${proposedClass}${display.redacted ? ' is-private' : ''}" data-id="${cardId}">
        <div class="schedule-compact-line schedule-compact-line-primary">${escapeHtml(display.title)}</div>
        <div class="schedule-compact-line schedule-compact-line-secondary">${timeStr} · ${attendeeMeta}${statusSuffix}</div>
      </div>
    `;
  }

  let avatarsHtml = '';
  if (display.showParticipants) {
    e.participants.forEach((pName) => {
      const p = state.config.partners.find((part) => part.name === pName);
      if (p && p.avatar) {
        avatarsHtml += `<div class="avatar-stack-item"><img src="${escapeHtml(p.avatar)}" alt="${escapeHtml(pName)}"/></div>`;
      } else {
        avatarsHtml += `<div class="avatar-stack-item avatar-stack-fallback">${escapeHtml(pName[0])}</div>`;
      }
    });
  }

  return `
    <div class="card-event${proposedClass}${display.redacted ? ' is-private' : ''}" data-id="${cardId}">
      <div class="event-title">${escapeHtml(display.title)}</div>
      <div class="event-meta font-label-sm">${timeStr} · ${attendeeMeta}</div>
      ${avatarsHtml ? `<div class="avatar-stack">${avatarsHtml}</div>` : ''}
    </div>
  `;
}

function renderSleepingCard(e, display, compact) {
  const isProposed = getWorkflowState(e) === WORKFLOW.PROPOSED;
  const proposedClass = isProposed ? ' is-proposed' : '';
  const cardId = e._scheduleNavigateId || e.id;
  const sleepingText = display.showSleepingArrangement
    ? `${e.roomName || 'Room'}: ${(e.participants || []).join(' & ')}`
    : 'Private';
  const sleepingLabel = display.redacted && !display.showSleepingArrangement ? 'PRIVATE' : 'SLEEPING';

  if (compact) {
    const line2Parts = [];
    if (e.homeName) line2Parts.push(e.homeName);
    if (isProposed) line2Parts.push('Proposed');
    const line2 = line2Parts.length ? line2Parts.join(' · ') : 'Sleeping arrangement';
    return `
      <div class="card-sleeping card-sleeping--compact${proposedClass}${display.redacted ? ' is-private' : ''}" data-id="${cardId}">
        <div class="schedule-compact-line schedule-compact-line-primary">${escapeHtml(`${sleepingLabel} · ${sleepingText}`)}</div>
        <div class="schedule-compact-line schedule-compact-line-secondary">${escapeHtml(line2)}</div>
      </div>
    `;
  }

  return `
    <div class="card-sleeping${proposedClass}${display.redacted ? ' is-private' : ''}" data-id="${cardId}">
      <div class="sleeping-header">
        <span class="material-symbols-outlined" style="font-size: 16px;">bed</span>
        <span class="font-label-md">${sleepingLabel}</span>
      </div>
      <div class="sleeping-content">
        ${escapeHtml(sleepingText)}
      </div>
    </div>
  `;
}

function renderDayColumn(day, dayEvents, viewerRef, state, compact) {
  dayEvents.sort((a, b) => (a.type === 'sleeping' ? 1 : -1));

  let cardsHtml = '';
  if (dayEvents.length === 0) {
    const emptyHeight = compact ? '36px' : '60px';
    cardsHtml = `
      <div class="schedule-day-empty" style="height: ${emptyHeight};">
        No Events
      </div>
    `;
  } else {
    dayEvents.forEach((e) => {
      const display = getEventDisplayPolicy(e, viewerRef, state.config);
      cardsHtml += e.type === 'sleeping'
        ? renderSleepingCard(e, display, compact)
        : renderEventCard(e, display, state, compact);
    });
  }

  return `
    <div class="day-column${compact ? ' day-column--compact' : ''}">
      <div class="day-header">
        <span class="font-label-md day-name">${day.toLocaleString('default', { weekday: 'short' }).toUpperCase()} ${day.getDate()}</span>
        <span class="day-indicator ${dayEvents.length > 0 ? 'has-events' : ''}"></span>
      </div>
      ${cardsHtml}
    </div>
  `;
}

export function scheduleView(state, viewMode = SCHEDULE_VIEW_NORMAL) {
  const mode = normalizeScheduleViewMode(viewMode);
  const compact = mode === SCHEDULE_VIEW_COMPACT;
  const weekCount = getScheduleWeekCount(mode);
  const dayCount = weekCount * 7;

  const anchor = state.selectedDate ? new Date(state.selectedDate) : new Date();
  const startOfWeek = getMondayOfWeek(anchor);
  const now = new Date();

  const weekdays = [];
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(startOfWeek);
    d.setDate(startOfWeek.getDate() + i);
    weekdays.push(d);
  }

  const rangeEnd = new Date(startOfWeek);
  rangeEnd.setDate(startOfWeek.getDate() + dayCount - 1);

  const weekLabel = formatScheduleRangeLabel(startOfWeek, weekCount, now);
  const weekInputValue = formatLocalDateString(startOfWeek);
  const { scheduleEvents, viewerRef } = collectScheduleEvents(state, startOfWeek, rangeEnd);

  let daysHtml = '';
  for (let i = 0; i < dayCount; i++) {
    const day = weekdays[i];
    const dayKey = formatLocalDateString(day);
    const dayEvents = scheduleEvents.filter((e) => eventScheduleDayKey(e) === dayKey);
    daysHtml += renderDayColumn(day, dayEvents, viewerRef, state, compact);
  }

  const partnerOptions = (state.config?.partners || []).map((p) =>
    `<option value="${escapeHtml(p.name)}" ${state.filterPartner === p.name ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
  ).join('');

  const navLabel = compact ? 'two weeks' : 'week';
  const gridClass = compact ? 'week-grid week-grid--compact' : 'week-grid';

  return `
    <section class="filter-bar view-sticky-toolbar schedule-toolbar">
      <div class="week-nav">
        <button type="button" class="week-nav-btn btn-icon-only" id="btn-week-prev" aria-label="Previous ${navLabel}" data-nav-days="${dayCount}">
          <span class="material-symbols-outlined">chevron_left</span>
        </button>
        <div class="week-picker-wrap">
          <button type="button" class="toolbar-filter-chip" id="btn-week-picker">
            <span>${weekLabel}</span>
            <span class="material-symbols-outlined" style="font-size: 16px;">calendar_month</span>
          </button>
          <input type="date" id="input-week-selector" value="${weekInputValue}" tabindex="-1" aria-hidden="true"/>
        </div>
        <button type="button" class="week-nav-btn btn-icon-only" id="btn-week-next" aria-label="Next ${navLabel}" data-nav-days="${dayCount}">
          <span class="material-symbols-outlined">chevron_right</span>
        </button>
      </div>

      <div class="schedule-view-toggle switch-selector" role="group" aria-label="Schedule view mode">
        <button type="button" class="switch-btn ${mode === SCHEDULE_VIEW_NORMAL ? 'active' : ''}" id="btn-schedule-view-normal" data-schedule-view="${SCHEDULE_VIEW_NORMAL}">Normal</button>
        <button type="button" class="switch-btn ${mode === SCHEDULE_VIEW_COMPACT ? 'active' : ''}" id="btn-schedule-view-compact" data-schedule-view="${SCHEDULE_VIEW_COMPACT}">Compact</button>
      </div>

      <select class="toolbar-filter-chip" id="filter-partner-select" aria-label="Filter by partner">
        <option value="all" ${state.filterPartner === 'all' ? 'selected' : ''}>All Partners</option>
        ${partnerOptions}
      </select>
    </section>

    <section class="${gridClass}">
      ${daysHtml}
    </section>
  `;
}
