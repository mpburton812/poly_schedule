import { escapeHtml } from '../escape.js';
import {
  formatLocalDateString,
  getMondayOfWeek
} from '../helpers.js';
import { getEventDisplayPolicy } from '../event-privacy.js';
import {
  WORKFLOW,
  getWorkflowState
} from '../proposal-workflow.js';


export function scheduleView(state) {
    const anchor = state.selectedDate ? new Date(state.selectedDate) : new Date();
    const startOfWeek = getMondayOfWeek(anchor);
    const now = new Date();
    const thisWeekStart = getMondayOfWeek(now);
    const isCurrentWeek = startOfWeek.getTime() === thisWeekStart.getTime();

    const weekdays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekdays.push(d);
    }

    const monthName = startOfWeek.toLocaleString('default', { month: 'short' });
    const weekYearSuffix = startOfWeek.getFullYear() !== now.getFullYear()
      ? `, ${startOfWeek.getFullYear()}`
      : '';
    const weekLabel = `Week of ${monthName} ${startOfWeek.getDate()}${weekYearSuffix}`;
    const weekInputValue = formatLocalDateString(startOfWeek);

    const viewerRef = state.currentUser?.id || state.currentUser?.name;

    // Filter confirmed events for this week
    const weekEvents = state.events.filter(e => {
      const eDate = new Date(e.start);
      const mon = new Date(startOfWeek);
      mon.setHours(0,0,0,0);
      const sun = new Date(startOfWeek);
      sun.setDate(startOfWeek.getDate() + 7);
      sun.setHours(23,59,59,999);
      
      const ws = getWorkflowState(e);
      const isCorrectWeek = eDate >= mon && eDate < sun
        && e.type !== 'batch_sleeping'
        && (e.status === 'confirmed' || ws === WORKFLOW.APPROVED || ws === WORKFLOW.PROPOSED);
      if (!isCorrectWeek) return false;

      // Filter by selected partner
      if (state.filterPartner && state.filterPartner !== 'all') {
        const hasPartner = e.participants && e.participants.some(p => 
          p.split(' ')[0].toLowerCase() === state.filterPartner.split(' ')[0].toLowerCase()
        );
        if (!hasPartner) return false;
      }

      // Filter by selected house/residence
      if (state.filterResidence && state.filterResidence !== 'all') {
        if (e.type === 'sleeping') {
          if (e.homeId !== state.filterResidence) return false;
        } else {
          const resObj = state.config?.residences?.find(r => r.id === state.filterResidence);
          if (!resObj || !e.location || !e.location.toLowerCase().includes(resObj.name.toLowerCase())) {
            return false;
          }
        }
      }

      return true;
    });

    let daysHtml = '';

    for (let i = 0; i < 7; i++) {
      const day = weekdays[i];
      const dayStr = day.toDateString();

      const dayEvents = weekEvents.filter(e => {
        const startD = new Date(e.start);
        return startD.toDateString() === dayStr;
      });

      dayEvents.sort((a, b) => (a.type === 'sleeping' ? 1 : -1));

      let cardsHtml = '';
      if (dayEvents.length === 0) {
        cardsHtml = `
          <div style="height: 60px; display: flex; align-items: center; justify-content: center; border: 1px dashed var(--outline-variant); border-radius: var(--radius-default); color: var(--on-surface-variant); font-size: 0.75rem;">
            No Events
          </div>
        `;
      } else {
        dayEvents.forEach(e => {
          const isProposed = getWorkflowState(e) === WORKFLOW.PROPOSED;
          const proposedClass = isProposed ? ' is-proposed' : '';
          const display = getEventDisplayPolicy(e, viewerRef, state.config);

          if (e.type === 'sleeping') {
            const sleepingText = display.showSleepingArrangement
              ? `${e.roomName || 'Room'}: ${(e.participants || []).join(' & ')}`
              : 'Private';
            cardsHtml += `
              <div class="card-sleeping${proposedClass}${display.redacted ? ' is-private' : ''}" data-id="${e.id}">
                <div class="sleeping-header">
                  <span class="material-symbols-outlined" style="font-size: 16px;">bed</span>
                  <span class="font-label-md">${display.redacted && !display.showSleepingArrangement ? 'PRIVATE' : 'SLEEPING'}</span>
                </div>
                <div class="sleeping-content">
                  ${escapeHtml(sleepingText)}
                </div>
              </div>
            `;
          } else {
            let avatarsHtml = '';
            if (display.showParticipants) {
              e.participants.forEach(pName => {
                const p = state.config.partners.find(part => part.name === pName);
                const color = pName === 'Alex' ? 'var(--primary-fixed-dim)' : pName === 'Sam' ? 'var(--secondary-fixed-dim)' : 'var(--tertiary-fixed-dim)';
                if (p && p.avatar) {
                  avatarsHtml += `<div class="avatar-stack-item" style="background-color: ${color};"><img src="${escapeHtml(p.avatar)}" alt="${escapeHtml(pName)}"/></div>`;
                } else {
                  avatarsHtml += `<div class="avatar-stack-item" style="background-color: var(--outline-variant); font-size: 8px; color: var(--on-surface-variant); display: flex; align-items: center; justify-content: center; font-weight: bold;">${escapeHtml(pName[0])}</div>`;
                }
              });
            }

            const timeStr = new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
            const attendeeMeta = display.showParticipants ? `${e.participants.length} Attendees` : 'Private';
            cardsHtml += `
              <div class="card-event${proposedClass}${display.redacted ? ' is-private' : ''}" data-id="${e.id}">
                <div class="event-title">${escapeHtml(display.title)}</div>
                <div class="event-meta font-label-sm">${timeStr} • ${attendeeMeta}</div>
                ${avatarsHtml ? `<div class="avatar-stack">${avatarsHtml}</div>` : ''}
              </div>
            `;
          }
        });
      }

      daysHtml += `
        <div class="day-column">
          <div class="day-header">
            <span class="font-label-md day-name">${day.toLocaleString('default', { weekday: 'short' }).toUpperCase()} ${day.getDate()}</span>
            <span class="day-indicator ${dayEvents.length > 0 ? 'has-events' : ''}"></span>
          </div>
          ${cardsHtml}
        </div>
      `;
    }

    const partnerOptions = (state.config?.partners || []).map(p => 
      `<option value="${escapeHtml(p.name)}" ${state.filterPartner === p.name ? 'selected' : ''}>${escapeHtml(p.name)}</option>`
    ).join('');

    const residenceOptions = (state.config?.residences || []).map(r => 
      `<option value="${escapeHtml(r.id)}" ${state.filterResidence === r.id ? 'selected' : ''}>${escapeHtml(r.name)}</option>`
    ).join('');

    return `
      <!-- Filter and Week Selector Header -->
      <section class="filter-bar">
        <div class="week-nav">
          <button type="button" class="week-nav-btn btn-icon-only" id="btn-week-prev" aria-label="Previous week">
            <span class="material-symbols-outlined">chevron_left</span>
          </button>
          <div class="week-picker-wrap">
            <button type="button" class="chip active" id="btn-week-picker">
              <span>${weekLabel}</span>
              <span class="material-symbols-outlined" style="font-size: 16px;">calendar_month</span>
            </button>
            <input type="date" id="input-week-selector" value="${weekInputValue}" tabindex="-1" aria-hidden="true"/>
          </div>
          <button type="button" class="week-nav-btn btn-icon-only" id="btn-week-next" aria-label="Next week">
            <span class="material-symbols-outlined">chevron_right</span>
          </button>
          <button type="button" class="chip${isCurrentWeek ? ' is-muted' : ''}" id="btn-week-today"${isCurrentWeek ? ' disabled' : ''}>Today</button>
        </div>

        <div style="position: relative; display: inline-block;">
          <select class="chip" id="filter-partner-select" style="border: 1px solid var(--outline-variant); border-radius: var(--radius-full); padding: 4px 12px; font-family: var(--font-body); font-size: 0.875rem; background-color: var(--surface); color: var(--on-surface); cursor: pointer; outline: none; transition: background-color 0.2s, border-color 0.2s;">
            <option value="all" ${state.filterPartner === 'all' ? 'selected' : ''}>All Partners</option>
            ${partnerOptions}
          </select>
        </div>

        <div style="position: relative; display: inline-block;">
          <select class="chip" id="filter-residence-select" style="border: 1px solid var(--outline-variant); border-radius: var(--radius-full); padding: 4px 12px; font-family: var(--font-body); font-size: 0.875rem; background-color: var(--surface); color: var(--on-surface); cursor: pointer; outline: none; transition: background-color 0.2s, border-color 0.2s;">
            <option value="all" ${state.filterResidence === 'all' ? 'selected' : ''}>All Houses</option>
            ${residenceOptions}
          </select>
        </div>
      </section>

      <!-- Weekly Schedule (vertical) -->
      <section class="week-grid">
        ${daysHtml}
      </section>
    `;
}