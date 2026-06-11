import {
  FAMILY_NAME_KEY
} from '../storage-keys.js';
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
  canCreateSleepingProposals,
  sortPartnersWithCurrentUserFirst
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


export function createProposalView(state, type = 'event', formState = {}) {
    // Check if current user has sleeping partner connections
    const canUseSleepingProposals = canCreateSleepingProposals(state.config, state.currentUser);
    const orderedPartners = sortPartnersWithCurrentUserFirst(
      state.config.partners,
      state.config,
      state.currentUser
    );

    // Populate partner options (checkboxes or select)
    let circleHtml = '';
    orderedPartners.forEach(partner => {
      if (partner.name === 'Guest User' || partner.username === 'guest') return;
      const passive = isPartnerPassive(partner);
      const selected = (formState.participants || []).includes(partner.name);
      const roleEntry = (formState.participantRoles || []).find(r => r.name === partner.name);
      const role = passive ? 'optional' : (roleEntry?.role || 'required');
      circleHtml += `
        <div class="circle-partner-option${selected ? ' selected' : ''}" data-partner-id="${partner.id}" data-name="${partner.name}" data-passive="${passive ? '1' : '0'}">
          <div class="profile-avatar partner-avatar-picker">
            <img src="${partner.avatar}" alt="${partner.name}"/>
            ${passive ? '<span class="passive-dot" title="Passive participant"></span>' : ''}
          </div>
          <span class="font-label-md">${partner.name.split(' ')[0]}</span>
          ${passive ? '<span class="font-label-sm passive-label">Passive</span>' : ''}
          ${selected && !passive ? `
            <button type="button" class="btn-text role-toggle-btn" data-partner-id="${partner.id}" data-name="${partner.name}">
              ${role === 'required' ? 'Required' : 'Optional'}
            </button>
          ` : ''}
        </div>
      `;
    });

    // Generate location / residences dropdown
    let locationHtml = '';
    if (type === 'sleeping') {
      let residenceOptions = '';
      state.config.residences.forEach(home => {
        residenceOptions += `<option value="${home.id}">${home.name}</option>`;
      });

      const defaultHome = state.config.residences[0];
      let bedroomOptions = '';
      if (defaultHome) {
        if (defaultHome.bedroomDetails && defaultHome.bedroomDetails.length > 0) {
          bedroomOptions = defaultHome.bedroomDetails.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        } else {
          for (let i = 0; i < defaultHome.bedrooms; i++) {
            bedroomOptions += `<option value="r${i + 1}">Bedroom ${i + 1}</option>`;
          }
        }
      }

      locationHtml = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); margin-bottom: var(--space-lg);">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="sleep-home-select">Residence</label>
            <select class="form-input" id="sleep-home-select" style="border-radius: var(--radius-default); border: 1px solid var(--outline);">
              ${residenceOptions}
            </select>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="sleep-room-select">Bedroom</label>
            <select class="form-input" id="sleep-room-select" style="border-radius: var(--radius-default); border: 1px solid var(--outline);">
              ${bedroomOptions}
            </select>
          </div>
        </div>
      `;
    } else if (type === 'batch_sleeping') {
      const nightCount = formState.batchNightCount || 3;
      const nightAssignments = formState.batchAssignments || [];
      const startDate = formState.batchStartDate || new Date().toISOString().split('T')[0];
      const start = new Date(startDate + 'T12:00:00');

      const renderAssignmentBlock = (assign, assignIndex, canRemove, priorParticipants = new Set()) => {
        const home = state.config.residences.find(h => h.id === assign.homeId) || state.config.residences[0];
        const bedrooms = getBedroomOptionsForHome(home);
        const homeOptions = state.config.residences.map(h =>
          `<option value="${h.id}" ${h.id === assign.homeId ? 'selected' : ''}>${h.name}</option>`
        ).join('');
        const roomOptions = bedrooms.map(r =>
          `<option value="${r.id}" ${r.id === assign.roomId ? 'selected' : ''}>${r.name}</option>`
        ).join('');
        const batchPartners = sortPartnersWithCurrentUserFirst(
          state.config.partners,
          state.config,
          state.currentUser
        );
        const partnerChecks = batchPartners.map(p => {
          const checked = (assign.participants || []).includes(p.name) ? 'checked' : '';
          const takenElsewhere = priorParticipants.has(p.name);
          const disabled = takenElsewhere ? 'disabled' : '';
          const disabledClass = takenElsewhere ? ' batch-partner-disabled' : '';
          return `
            <label class="batch-partner-label${disabledClass}" style="display: inline-flex; align-items: center; gap: 4px; font-size: 0.8rem; margin-right: 8px; cursor: pointer;">
              <input type="checkbox" class="batch-partner-cb" data-partner="${p.name}" ${checked} ${disabled} style="accent-color: var(--primary);"/>
              ${p.name.split(' ')[0]}
            </label>
          `;
        }).join('');

        return `
          <div class="batch-assignment-block" data-assign-index="${assignIndex}">
            <div class="batch-assignment-header">
              <span class="font-label-sm" style="font-weight: 600;">Room ${assignIndex + 1}</span>
              ${canRemove ? `<button type="button" class="btn-text btn-batch-remove-room" data-assign-index="${assignIndex}" style="color: var(--error); font-size: 0.75rem;">Remove</button>` : ''}
            </div>
            <div class="batch-night-fields">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Home</label>
                <select class="form-input batch-home-select">${homeOptions}</select>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label">Room</label>
                <select class="form-input batch-room-select">${roomOptions}</select>
              </div>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label">Sleeping Here</label>
              <div class="batch-partner-list">${partnerChecks}</div>
            </div>
          </div>
        `;
      };

      let batchRowsHtml = '';
      for (let i = 0; i < nightCount; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const dayLabel = d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const night = normalizeBatchNight(nightAssignments[i], state.config);
        const blocksHtml = (night.assignments || []).map((assign, j) => {
          const priorParticipants = new Set();
          for (let k = 0; k < j; k++) {
            (night.assignments[k].participants || []).forEach(name => priorParticipants.add(name));
          }
          return renderAssignmentBlock(assign, j, night.assignments.length > 1, priorParticipants);
        }).join('');

        batchRowsHtml += `
          <div class="batch-night-row" data-night-index="${i}">
            <div class="batch-night-header">
              <div>
                <span class="font-label-md" style="font-weight: 700;">Night ${i + 1}</span>
                <span class="font-label-sm" style="color: var(--on-surface-variant); margin-left: 8px;">${dayLabel}</span>
              </div>
              <div class="batch-night-actions">
                ${i > 0 ? `<button type="button" class="btn btn-outline btn-batch-copy" data-night-index="${i}" style="padding: 4px 10px; font-size: 0.75rem;">Copy Previous</button>` : ''}
                <button type="button" class="btn btn-outline btn-batch-add-room" data-night-index="${i}" style="padding: 4px 10px; font-size: 0.75rem;">+ Add Room</button>
              </div>
            </div>
            <div class="batch-night-assignments">${blocksHtml}</div>
          </div>
        `;
      }

      locationHtml = `
        <div class="form-group">
          <label class="form-label">Nightly Assignments</label>
          <div class="batch-sleeping-grid" id="batch-sleeping-grid">${batchRowsHtml}</div>
        </div>
      `;
    } else {
      locationHtml = `
        <div class="form-group">
          <label class="form-label" for="event-location">Location</label>
          <input class="form-input" id="event-location" placeholder="Search for location or address..." type="text"/>
        </div>
      `;
    }

    const polyFamilyName = localStorage.getItem(FAMILY_NAME_KEY) || 'The Poly Circle';

    const contextStartStr = formState.batchStartDate || new Date().toISOString().split('T')[0];
    const contextStart = new Date(contextStartStr + 'T12:00:00');
    const contextWeekStart = new Date(contextStart);
    contextWeekStart.setDate(contextStart.getDate() - contextStart.getDay());
    const contextNightCount = type === 'batch_sleeping'
      ? (formState.batchNightCount || 3)
      : (type === 'sleeping' ? 1 : 1);
    const proposedDateKeys = new Set();
    for (let n = 0; n < contextNightCount; n++) {
      const d = new Date(contextStart);
      d.setDate(contextStart.getDate() + n);
      proposedDateKeys.add(d.toDateString());
    }
    let microCalCellsHtml = '';
    for (let i = 0; i < 7; i++) {
      const d = new Date(contextWeekStart);
      d.setDate(contextWeekStart.getDate() + i);
      const isProposed = proposedDateKeys.has(d.toDateString());
      microCalCellsHtml += `
        <div class="micro-calendar-cell${isProposed ? ' active-cell' : ''}" data-date="${d.toISOString().split('T')[0]}">
          <span class="day-num">${d.getDate()}</span>
          ${isProposed ? '<div class="micro-cal-proposed">PROPOSED</div>' : ''}
        </div>
      `;
    }

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div>
          <h2 class="font-title-lg">New Proposal</h2>
          <p class="font-label-sm" id="draft-autosave-status" style="color: var(--on-surface-variant); margin-top: 2px;">Draft — changes save automatically</p>
        </div>
        <button type="button" class="btn btn-filled" id="btn-submit-proposal">Send Proposal</button>
      </div>

      <!-- Toggle Switch Event/Sleep/Batch -->
      <div class="switch-selector" style="flex-wrap: wrap;">
        <button class="switch-btn ${type === 'event' ? 'active' : ''}" id="btn-toggle-event">Event</button>
        ${canUseSleepingProposals ? `
          <button class="switch-btn ${type === 'sleeping' ? 'active' : ''}" id="btn-toggle-sleeping">Sleeping Arrangement</button>
          <button class="switch-btn ${type === 'batch_sleeping' ? 'active' : ''}" id="btn-toggle-batch-sleeping">Batch Sleeping</button>
        ` : `
          <button class="switch-btn" disabled style="opacity: 0.4; cursor: not-allowed; background-color: var(--surface-container-highest);" title="No sleeping connections configured for your profile.">Sleeping (Disabled)</button>
        `}
      </div>

      <!-- Live Logistics Rules Warning Banner -->
      <div class="banner-alert hidden" id="proposal-rules-banner">
        <span class="material-symbols-outlined banner-alert-icon">warning</span>
        <div style="flex-grow: 1;">
          <p class="banner-alert-title" id="banner-warning-title"></p>
          <div class="banner-alert-desc" id="banner-warning-desc"></div>
        </div>
        <button class="btn-icon-only" id="banner-warning-close" style="width: 28px; height: 28px; color: inherit;">
          <span class="material-symbols-outlined" style="font-size: 18px;">close</span>
        </button>
      </div>

      <!-- Form Inputs -->
      <section style="display: flex; flex-direction: column;">
        <!-- Title -->
        <div class="form-group">
          <label class="form-label" for="prop-title">Title / Description</label>
          <input class="form-input" id="prop-title" placeholder="${type === 'event' ? 'e.g. Dinner & Game Night' : 'e.g. Two-Week Rotation'}" type="text" value="${formState.draftTitle || ''}"/>
        </div>

        <div class="form-group">
          <label class="form-label" for="prop-notes">Notes</label>
          <textarea class="form-input" id="prop-notes" rows="3" placeholder="Optional context for reviewers (parking, dress code, etc.)" style="resize: vertical; min-height: 72px;">${formState.draftNotes || ''}</textarea>
        </div>

        ${type === 'event' ? `
        <div class="form-group" style="margin-bottom: var(--space-sm);">
          <label class="solo-event-toggle" style="display: flex; align-items: flex-start; gap: var(--space-sm); cursor: pointer; padding: var(--space-sm); background: var(--surface-container-high); border-radius: var(--radius-default);">
            <input type="checkbox" id="solo-event-checkbox" ${formState.soloEventMode ? 'checked' : ''} style="accent-color: var(--primary); margin-top: 2px;"/>
            <span>
              <strong class="font-label-md" style="display: block;">Just me — add directly to calendar</strong>
              <span class="font-label-sm" style="color: var(--on-surface-variant);">Personal events skip group review and are confirmed immediately.</span>
            </span>
          </label>
        </div>
        ` : ''}

        ${type !== 'batch_sleeping' && !(type === 'event' && formState.soloEventMode) ? `
        <!-- Poly Circle Selection -->
        <div class="form-group" id="invitees-section">
          <label class="form-label" style="margin-bottom: var(--space-sm);">${polyFamilyName} (Invitees)</label>
          <div style="display: flex; flex-wrap: wrap; gap: var(--space-lg); padding: var(--space-sm) 0;" id="circle-options-row">
            ${circleHtml}
          </div>
        </div>
        ` : ''}

        <!-- Date Inputs -->
        <div style="display: grid; grid-template-columns: 1fr; gap: var(--space-lg); margin-bottom: var(--space-lg);">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="prop-start-date">Start Date</label>
            <input class="form-input" id="prop-start-date" type="date" value="${formState.batchStartDate || new Date().toISOString().split('T')[0]}"/>
          </div>
          ${type === 'batch_sleeping' ? `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="prop-duration">Number of Nights</label>
            <input class="form-input" id="prop-duration" placeholder="e.g. 2" type="number" min="1" max="14" value="${formState.batchNightCount || 3}"/>
          </div>
          ` : type === 'event' ? `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
            ${render12HourTimePicker('prop-start', 'Start Time', 7, '00', 'PM')}
            ${render12HourTimePicker('prop-end', 'End Time', 10, '00', 'PM')}
          </div>
          ` : ''}
        </div>

        <!-- Dynamic Location block -->
        ${locationHtml}

        <!-- Schedule Context Mini-Calendar -->
        <div class="form-group" style="margin-top: var(--space-md);">
          <div style="display: flex; justify-content: space-between; margin-bottom: var(--space-sm);">
            <label class="form-label">Schedule Context</label>
            <span class="font-label-sm" style="color: var(--on-surface-variant);">Weekly conflict visualization</span>
          </div>
          <div class="impact-bar-container" style="background-color: var(--surface-container-lowest); border: 1px solid var(--outline-variant); padding: var(--space-md);">
            <div class="micro-calendar" id="micro-cal-grid">
              <div class="micro-calendar-header">S</div>
              <div class="micro-calendar-header">M</div>
              <div class="micro-calendar-header">T</div>
              <div class="micro-calendar-header">W</div>
              <div class="micro-calendar-header">T</div>
              <div class="micro-calendar-header">F</div>
              <div class="micro-calendar-header">S</div>
              ${microCalCellsHtml}
            </div>
            <div id="micro-cal-conflict-notice" class="font-label-sm micro-cal-conflict-notice" style="display: none;"></div>
          </div>
        </div>
      </section>
    `;
}