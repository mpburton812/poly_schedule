import { RulesEngine } from '../rules.js';
import {
  DEFAULT_AVATARS,
  isPartnerPassive,
  renderHomeSelectOptions,
  renderAvatarPickerHtml,
  render12HourTimePicker,
  responseStatusLabel,
  defaultBatchAssignment,
  defaultBatchNight,
  normalizeBatchNight,
  getBedroomOptionsForHome,
  getCurrentUserPartner,
  hasSleepingPartnerConnections,
  partnerRefsMatch
} from '../helpers.js';
import {
  WORKFLOW,
  filterProposalsForTab,
  getWorkflowState,
  allowsAbstain,
  isPassivePerson,
  getAutoArchiveDays,
  isCalendarEvent
} from '../proposal-workflow.js';


export function scheduleView(state) {
    const today = state.selectedDate ? new Date(state.selectedDate) : new Date();
    // Monday of current week
    const dayOfWeek = today.getDay();
    const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const startOfWeek = new Date(today.setDate(diff));
    
    const weekdays = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      weekdays.push(d);
    }

    const monthName = startOfWeek.toLocaleString('default', { month: 'short' });
    const weekLabel = `Week of ${monthName} ${startOfWeek.getDate()}`;

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

    // Extract pending proposals for summary
    const pendingProposals = state.events.filter(e =>
      getWorkflowState(e) === WORKFLOW.PROPOSED &&
      (e.proposer === state.currentUser?.name ||
        (e.participantRoles || []).some(p => partnerRefsMatch(state.config, p.name, state.currentUser?.id || state.currentUser?.name)))
    );

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

          if (e.type === 'sleeping') {
            cardsHtml += `
              <div class="card-sleeping${proposedClass}" data-id="${e.id}">
                <div class="sleeping-header">
                  <span class="material-symbols-outlined" style="font-size: 16px;">bed</span>
                  <span class="font-label-md">SLEEPING</span>
                </div>
                <div class="sleeping-content">
                  ${e.roomName || 'Room'}: ${e.participants.join(' & ')}
                </div>
              </div>
            `;
          } else {
            let avatarsHtml = '';
            e.participants.forEach(pName => {
              const p = state.config.partners.find(part => part.name === pName);
              const color = pName === 'Alex' ? 'var(--primary-fixed-dim)' : pName === 'Sam' ? 'var(--secondary-fixed-dim)' : 'var(--tertiary-fixed-dim)';
              if (p && p.avatar) {
                avatarsHtml += `<div class="avatar-stack-item" style="background-color: ${color};"><img src="${p.avatar}" alt="${pName}"/></div>`;
              } else {
                avatarsHtml += `<div class="avatar-stack-item" style="background-color: var(--outline-variant); font-size: 8px; color: var(--on-surface-variant); display: flex; align-items: center; justify-content: center; font-weight: bold;">${pName[0]}</div>`;
              }
            });

            const timeStr = new Date(e.start).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit', hour12: true });
            cardsHtml += `
              <div class="card-event${proposedClass}" data-id="${e.id}">
                <div class="event-title">${e.title}</div>
                <div class="event-meta font-label-sm">${timeStr} • ${e.participants.length} Attendees</div>
                <div class="avatar-stack">${avatarsHtml}</div>
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

    // Proposals Center mini summary
    let proposalsListHtml = '';
    if (pendingProposals.length === 0) {
      proposalsListHtml = `
        <div style="grid-column: span 3; text-align: center; padding: var(--space-lg) 0; border: 1px dashed var(--outline-variant); border-radius: var(--radius-md); color: var(--on-surface-variant); font-size: 0.85rem;">
          No pending proposals. You're all caught up!
        </div>
      `;
    } else {
      pendingProposals.slice(0, 3).forEach(p => {
        const countAccepted = Object.values(p.responses || {}).filter(r => r.status === 'accept').length;
        const totalVotes = Object.keys(p.responses || {}).length;
        const awaitName = Object.keys(p.responses || {}).find(k => p.responses[k].status === 'pending') || 'Others';
        const typeBadge = p.type === 'sleeping' ? 'bed' : p.type === 'batch_sleeping' ? 'date_range' : 'forum';
        
        proposalsListHtml += `
          <div class="bento-card proposal-summary-card" data-id="${p.id}" style="cursor: pointer; flex-direction: row; gap: var(--space-md); align-items: center; border: 1px solid var(--outline-variant); background-color: var(--surface); transition: background-color 0.2s;">
            <div style="background-color: rgba(166,57,58,0.1); color: var(--primary); padding: 12px; border-radius: var(--radius-md); display: flex; align-items: center; justify-content: center;">
              <span class="material-symbols-outlined">${typeBadge}</span>
            </div>
            <div>
              <h4 class="font-title-lg" style="font-size: 1rem; font-weight: 700;">${p.title}</h4>
              <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 2px;">${countAccepted}/${totalVotes} voted. Awaiting ${awaitName}.</p>
            </div>
          </div>
        `;
      });
    }

    const partnerOptions = (state.config?.partners || []).map(p => 
      `<option value="${p.name}" ${state.filterPartner === p.name ? 'selected' : ''}>${p.name}</option>`
    ).join('');

    const residenceOptions = (state.config?.residences || []).map(r => 
      `<option value="${r.id}" ${state.filterResidence === r.id ? 'selected' : ''}>${r.name}</option>`
    ).join('');

    return `
      <!-- Filter and Week Selector Header -->
      <section class="filter-bar">
        <div class="week-selector-container" style="position: relative; display: inline-block;">
          <button class="chip active" id="btn-week-selector">
            <span>${weekLabel}</span>
            <span class="material-symbols-outlined" style="font-size: 16px;">expand_more</span>
          </button>
          <input type="date" id="input-week-selector" value="${startOfWeek.toISOString().split('T')[0]}" style="position: absolute; top: 0; left: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer;"/>
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

      <!-- Active Proposals Section -->
      <section style="margin-top: var(--space-xl);">
        <h3 class="font-headline-lg" style="margin-bottom: var(--space-md); font-size: 1.5rem; font-weight: 700; color: var(--on-surface);">Active Proposals</h3>
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: var(--space-md);">
          ${proposalsListHtml}
        </div>
      </section>
    `;
}