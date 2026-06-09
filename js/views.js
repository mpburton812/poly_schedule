import { RulesEngine } from './rules.js';
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
  getBedroomOptionsForHome
} from './helpers.js';
import {
  WORKFLOW,
  filterProposalsForTab,
  getWorkflowState,
  allowsAbstain,
  isPassivePerson,
  getAutoArchiveDays,
  isCalendarEvent
} from './proposal-workflow.js';

export { DEFAULT_AVATARS };

export const Views = {
  /**
   * Renders the Weekly Schedule View
   */
  schedule(state) {
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
      
      const isCorrectWeek = eDate >= mon && eDate < sun
        && e.type !== 'batch_sleeping'
        && (e.status === 'confirmed' || getWorkflowState(e) === WORKFLOW.APPROVED);
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
        (e.participantRoles || []).some(p => p.name === state.currentUser?.name))
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
          if (e.type === 'sleeping') {
            cardsHtml += `
              <div class="card-sleeping" data-id="${e.id}">
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
              <div class="card-event" data-id="${e.id}">
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
  },

  /**
   * Renders the Proposals Center View
   */
  proposals(state, activeTab = 'proposed') {
    const userName = state.currentUser?.name;
    const filtered = filterProposalsForTab(state.events, activeTab, userName, state.config);

    const tabLabels = {
      drafts: 'Drafts',
      proposed: 'Proposed',
      approved: 'Approved',
      archived: 'Archived',
      declined: 'Declined'
    };

    let listHtml = '';
    if (filtered.length === 0) {
      listHtml = `
        <div style="text-align: center; padding: 48px 0; color: var(--on-surface-variant);">
          <span class="material-symbols-outlined" style="font-size: 48px; opacity: 0.3;">checklist_rtl</span>
          <p class="font-title-lg" style="margin-top: var(--space-sm);">No proposals in "${tabLabels[activeTab] || activeTab}"</p>
        </div>
      `;
    } else {
      filtered.forEach(p => {
        const ws = getWorkflowState(p);
        const isProposer = p.proposer === userName;
        const isReceiver = !isProposer;
        const userVote = p.responses?.[userName]?.status || 'pending';
        const canVote = ws === WORKFLOW.PROPOSED && isReceiver && userVote === 'pending' && p.responses?.[userName];

        const startDate = new Date(p.start);
        const dayStart = new Date(startDate);
        dayStart.setHours(0, 0, 0, 0);
        const dayEnd = new Date(dayStart);
        dayEnd.setDate(dayEnd.getDate() + 1);

        const existingOnDay = state.events.filter(e => {
          if (e.id === p.id) return false;
          if (!isCalendarEvent(e)) return false;
          const eStart = new Date(e.start);
          return eStart >= dayStart && eStart < dayEnd;
        });

        const toImpactSegment = (eventStart, eventEnd) => {
          const startH = new Date(eventStart).getHours() + new Date(eventStart).getMinutes() / 60;
          const endH = new Date(eventEnd).getHours() + new Date(eventEnd).getMinutes() / 60;
          const left = Math.max(0, Math.min(100, ((startH - 8) / 16) * 100));
          const width = Math.max(8, Math.min(100 - left, ((endH - startH) / 16) * 100));
          return { left, width };
        };

        let existingSegmentsHtml = '';
        existingOnDay.forEach(e => {
          const seg = toImpactSegment(e.start, e.end);
          existingSegmentsHtml += `<div class="impact-segment existing" style="width: ${seg.width}%; left: ${seg.left}%;"></div>`;
        });

        const proposedSeg = toImpactSegment(p.start, p.end);
        const dateStr = startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const timeStr = `${startDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })} - ${new Date(p.end).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}`;

        const roleMap = Object.fromEntries((p.participantRoles || []).map(r => [r.name, r.role]));
        let responsesHtml = '';
        Object.keys(p.responses || {}).forEach(k => {
          const r = p.responses[k];
          const isPending = r.status === 'pending';
          const isReject = r.status === 'reject';
          const isAbstain = r.status === 'abstain';
          const icon = isPending ? 'pending' : isReject ? 'cancel' : isAbstain ? 'do_not_disturb_on' : 'check_circle';
          const colorClass = isPending ? 'text-outline' : isReject ? 'var(--error)' : isAbstain ? 'var(--on-surface-variant)' : 'var(--secondary)';
          const nameLabel = k === userName ? 'You' : k.split(' ')[0];
          const roleLabel = roleMap[k] === 'optional' ? ' · Optional' : ' · Required';
          const passiveLabel = isPassivePerson(k, state.config) ? ' · Passive' : '';

          responsesHtml += `
            <div style="margin-bottom: var(--space-xs);">
              <div class="review-user-row">
                <div class="review-user-info">
                  <span class="material-symbols-outlined" style="color: ${colorClass}; font-size: 18px;">${icon}</span>
                  <span>${nameLabel}<span class="font-label-sm" style="color: var(--on-surface-variant);">${roleLabel}${passiveLabel}</span></span>
                </div>
                <span class="font-label-sm" style="color: var(--on-surface-variant);">${responseStatusLabel(r.status)}</span>
              </div>
              ${r.comment ? `<p class="review-comment">"${r.comment}"</p>` : ''}
            </div>
          `;
        });

        let actionsHtml = '';
        if (ws === WORKFLOW.DRAFT && isProposer) {
          actionsHtml = `
            <div style="display: flex; gap: var(--space-base); margin-top: var(--space-md); flex-wrap: wrap;">
              <button class="btn btn-filled edit-draft-btn" data-id="${p.id}" style="flex: 1; min-width: 120px;">Continue Editing</button>
              <button class="btn btn-error delete-draft-btn" data-id="${p.id}" style="flex: 1; min-width: 120px;">Delete Draft</button>
            </div>
          `;
        } else if (ws === WORKFLOW.PROPOSED) {
          if (canVote) {
            const abstainBtn = allowsAbstain(p.type)
              ? `<button class="btn btn-outline vote-btn" data-id="${p.id}" data-vote="abstain" style="flex: 1; min-width: 90px;">Abstain</button>`
              : '';
            actionsHtml = `
              <div style="display: flex; gap: var(--space-base); margin-top: var(--space-md); flex-wrap: wrap;">
                <button class="btn btn-filled vote-btn" data-id="${p.id}" data-vote="accept" style="flex: 1; min-width: 90px;">Accept</button>
                ${abstainBtn}
                <button class="btn btn-outline vote-btn" data-id="${p.id}" data-vote="reject" style="flex: 1; min-width: 90px;">Reject</button>
              </div>
            `;
          } else if (isProposer) {
            actionsHtml = `
              <div style="display: flex; gap: var(--space-base); margin-top: var(--space-md); flex-wrap: wrap;">
                <button class="btn btn-error cancel-proposal-btn" data-id="${p.id}" style="flex: 1; min-width: 120px;">Cancel Proposal</button>
                <button class="btn btn-outline retract-proposal-btn" data-id="${p.id}" style="flex: 1; min-width: 120px;">Retract to Draft</button>
              </div>
            `;
          } else if (isReceiver && userVote !== 'pending') {
            const voteColor = userVote === 'accept' ? 'var(--secondary)' : userVote === 'abstain' ? 'var(--on-surface-variant)' : 'var(--error)';
            actionsHtml = `
              <div style="margin-top: var(--space-md); padding: var(--space-sm); background-color: var(--surface-container-high); border-radius: var(--radius-default); text-align: center; color: var(--on-surface-variant); font-size: 0.85rem;">
                You voted: <strong style="color: ${voteColor};">${responseStatusLabel(userVote).toUpperCase()}</strong>. Waiting on others.
              </div>
            `;
          }
        } else if (ws === WORKFLOW.APPROVED && isProposer) {
          actionsHtml = `
            <div style="display: flex; gap: var(--space-base); margin-top: var(--space-md);">
              <button class="btn btn-outline archive-proposal-btn" data-id="${p.id}" style="flex: 1;">Archive</button>
            </div>
          `;
        } else if (ws === WORKFLOW.DECLINED && isProposer) {
          actionsHtml = `
            <div style="display: flex; gap: var(--space-base); margin-top: var(--space-md); flex-wrap: wrap;">
              <button class="btn btn-filled reopen-proposal-btn" data-id="${p.id}" style="flex: 1; min-width: 120px;">Reopen as Draft</button>
              <button class="btn btn-error delete-declined-btn" data-id="${p.id}" style="flex: 1; min-width: 120px;">Delete</button>
            </div>
          `;
        }

        const statusBadgeMap = {
          [WORKFLOW.DECLINED]: `<span class="font-label-sm" style="background-color: var(--error-container); color: var(--error); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold; margin-left: 8px;">DECLINED</span>`,
          [WORKFLOW.APPROVED]: `<span class="font-label-sm" style="background-color: var(--secondary-container); color: var(--secondary); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold; margin-left: 8px;">APPROVED</span>`,
          [WORKFLOW.ARCHIVED]: `<span class="font-label-sm" style="background-color: var(--surface-container-highest); color: var(--on-surface-variant); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold; margin-left: 8px;">ARCHIVED</span>`,
          [WORKFLOW.DRAFT]: `<span class="font-label-sm" style="background-color: var(--tertiary-container); color: var(--on-tertiary-container); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold; margin-left: 8px;">DRAFT</span>`
        };
        const statusBadge = statusBadgeMap[ws] || '';

        listHtml += `
          <div class="proposal-card ${p.type === 'sleeping' || p.type === 'batch_sleeping' ? 'sleeping' : ''}" id="prop-${p.id}">
            <div class="proposal-header">
              <div>
                <span class="proposal-badge ${p.type === 'batch_sleeping' ? 'batch' : p.type}">${p.type === 'batch_sleeping' ? 'BATCH SLEEPING' : p.type.toUpperCase()} PROPOSAL</span>
                <h3 class="font-title-lg" style="margin-top: 4px; font-weight: 700; color: var(--on-surface);">${p.title}${statusBadge}</h3>
              </div>
              <div style="text-align: right;">
                <span class="font-label-sm" style="color: var(--on-surface-variant); display: block;">PROPOSED BY</span>
                <span class="font-body-md" style="font-weight: 600;">${p.proposer}</span>
              </div>
            </div>

            <div style="display: grid; grid-template-columns: 1fr; gap: var(--space-md); margin-top: var(--space-xs);">
              <div class="proposal-meta-row">
                <div class="proposal-meta-item">
                  <span class="material-symbols-outlined" style="font-size: 18px;">schedule</span>
                  <span>${dateStr} • ${timeStr}</span>
                </div>
                <div class="proposal-meta-item">
                  <span class="material-symbols-outlined" style="font-size: 18px;">${p.type === 'sleeping' || p.type === 'batch_sleeping' ? 'bed' : 'location_on'}</span>
                  <span>${p.type === 'batch_sleeping'
                    ? `${(p.batchNights || []).length} nights · ${new Date(p.start).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${new Date(p.end).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`
                    : p.type === 'sleeping' ? `${p.homeName || 'Home'}: ${p.roomName || 'Room'}` : p.location || 'No location set'}</span>
                </div>
              </div>

              <div class="impact-bar-container">
                <div class="impact-bar-title">${startDate.toLocaleString(undefined, { weekday: 'short' }).toUpperCase()} SCHEDULE IMPACT</div>
                <div class="impact-bar">
                  ${existingSegmentsHtml}
                  <div class="impact-segment proposed" style="width: ${proposedSeg.width}%; left: ${proposedSeg.left}%;"></div>
                </div>
                <div class="impact-scale">
                  <span>08:00</span>
                  <span>16:00</span>
                  <span>00:00</span>
                </div>
              </div>
            </div>

            <div class="review-box" style="margin-top: var(--space-sm);">
              ${responsesHtml || '<p class="font-label-sm" style="color: var(--on-surface-variant);">No responses yet.</p>'}
            </div>

            ${actionsHtml}
          </div>
        `;
      });
    }

    const tabs = ['drafts', 'proposed', 'approved', 'archived', 'declined'];
    const tabsHtml = tabs.map(tab => `
      <button class="tab-button ${activeTab === tab ? 'active' : ''}" id="btn-tab-${tab}">${tabLabels[tab]}</button>
    `).join('');

    return `
      <nav class="tabs-nav">
        ${tabsHtml}
      </nav>

      <section style="display: flex; flex-direction: column; gap: var(--space-lg);">
        ${listHtml}
      </section>
    `;
  },

  /**
   * Renders the Create Proposal View
   */
  createProposal(state, type = 'event', formState = {}) {
    // Check if current user has sleeping partner connections
    const currentUserProfile = state.config?.partners?.find(p => p.name === state.currentUser?.name);
    const hasSleepingPartners = currentUserProfile && currentUserProfile.rules && currentUserProfile.rules.partnerLimits && Object.keys(currentUserProfile.rules.partnerLimits).length > 0;

    // Populate partner options (checkboxes or select)
    let circleHtml = '';
    state.config.partners.forEach(partner => {
      const passive = isPartnerPassive(partner);
      const selected = (formState.participants || []).includes(partner.name);
      const roleEntry = (formState.participantRoles || []).find(r => r.name === partner.name);
      const role = passive ? 'optional' : (roleEntry?.role || 'required');
      circleHtml += `
        <div class="circle-partner-option" data-name="${partner.name}" data-passive="${passive ? '1' : '0'}" style="display: flex; flex-direction: column; align-items: center; gap: var(--space-xs); cursor: pointer; transition: opacity var(--transition-speed); opacity: ${selected ? '1' : '0.6'};">
          <div class="profile-avatar partner-avatar-picker" style="width: 56px; height: 56px; border: 2px solid ${selected ? 'var(--primary)' : 'var(--outline-variant)'}; border-radius: var(--radius-full); overflow: hidden; position: relative;">
            <img src="${partner.avatar}" alt="${partner.name}"/>
            ${passive ? '<span class="passive-dot" title="Passive participant"></span>' : ''}
          </div>
          <span class="font-label-md">${partner.name.split(' ')[0]}</span>
          ${passive ? '<span class="font-label-sm passive-label">Passive</span>' : ''}
          ${selected && !passive ? `
            <button type="button" class="btn-text role-toggle-btn" data-name="${partner.name}" style="font-size: 0.65rem; padding: 2px 6px; color: var(--primary);">
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
        const partnerChecks = state.config.partners.map(p => {
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

    const polyFamilyName = localStorage.getItem('polyschedule_poly_family_name') || 'The Poly Circle';

    const contextStartStr = formState.batchStartDate || new Date().toISOString().split('T')[0];
    const contextStart = new Date(contextStartStr + 'T12:00:00');
    const contextWeekStart = new Date(contextStart);
    contextWeekStart.setDate(contextStart.getDate() - contextStart.getDay());
    const contextNightCount = type === 'batch_sleeping'
      ? (formState.batchNightCount || 3)
      : (type === 'sleeping' ? (formState.batchNightCount || 1) : 1);
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
        <button class="btn btn-filled" id="btn-submit-proposal">Send Proposal</button>
      </div>

      <!-- Toggle Switch Event/Sleep/Batch -->
      <div class="switch-selector" style="flex-wrap: wrap;">
        <button class="switch-btn ${type === 'event' ? 'active' : ''}" id="btn-toggle-event">Event</button>
        ${hasSleepingPartners ? `
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

        ${type !== 'batch_sleeping' ? `
        <!-- Poly Circle Selection -->
        <div class="form-group">
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
          ${type === 'sleeping' || type === 'batch_sleeping' ? `
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="prop-duration">Number of Nights</label>
            <input class="form-input" id="prop-duration" placeholder="e.g. 2" type="number" min="1" max="14" value="${formState.batchNightCount || (type === 'batch_sleeping' ? 3 : 1)}"/>
          </div>
          ` : `
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
            ${render12HourTimePicker('prop-start', 'Start Time', 7, '00', 'PM')}
            ${render12HourTimePicker('prop-end', 'End Time', 10, '00', 'PM')}
          </div>
          `}
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
  },

  /**
   * Renders the Logistics & Configuration View
   */
  logistics(state) {
    const showAdmin = state.currentUser ? (state.config?.partners?.find(p => p.id === state.currentUser.id)?.role === 'Admin') : false;

    let profilesHtml = '';
    state.config.partners.forEach(partner => {
      const passive = isPartnerPassive(partner);
      let badge = '';
      if (passive) {
        badge = `<span class="font-label-sm" style="background-color: var(--surface-container-highest); color: var(--on-surface-variant); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold;">PASSIVE</span>`;
      } else if (partner.role === 'Admin') {
        badge = `<span class="font-label-sm" style="background-color: var(--secondary-container); color: var(--on-secondary-container); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold;">ADMIN</span>`;
      }
      const defaultHomeObj = state.config.residences.find(r => r.id === partner.defaultHome);
      const homeName = defaultHomeObj ? defaultHomeObj.name : 'None';
      const editBtn = showAdmin ? `
        <button class="btn btn-outline btn-edit-partner" data-partner-id="${partner.id}" style="padding: 4px 12px; font-size: 0.75rem; flex-shrink: 0;">
          <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
        </button>
      ` : '';

      profilesHtml += `
        <div class="bento-card partner-card" data-partner-id="${partner.id}" style="flex-direction: row; gap: var(--space-md); align-items: center; border: 1px solid var(--outline-variant); padding: var(--space-md);">
          <div class="profile-avatar" style="width: 56px; height: 56px; border-radius: var(--radius-full); overflow: hidden; flex-shrink: 0;">
            <img src="${partner.avatar || DEFAULT_AVATARS[0]}" alt="${partner.name}"/>
          </div>
          <div style="flex-grow: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-sm);">
              <h4 class="font-title-lg" style="font-size: 1.05rem; font-weight: 700;">${partner.name}</h4>
              ${badge}
            </div>
            <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 2px;">Default Home: <strong style="color: var(--secondary);">${homeName}</strong></p>
            ${passive ? '<p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: 2px;">Not using the app — scheduling only</p>' : ''}
          </div>
          ${editBtn}
        </div>
      `;
    });

    let homesHtml = '';
    state.config.residences.forEach(home => {
      // Bedrooms list
      let bedroomsStr = '';
      if (home.bedroomDetails) {
        bedroomsStr = home.bedroomDetails.map(r => r.name).join(', ');
      } else {
        // Fallback bedroom names
        bedroomsStr = Array.from({ length: home.bedrooms }, (_, i) => `Bedroom ${i + 1}`).join(', ');
      }

      // Associated people list
      let peopleStr = '';
      if (home.associatedPeople && home.associatedPeople.length > 0) {
        peopleStr = `<div class="font-body-md" style="font-size: 0.8rem; color: var(--on-surface-variant); margin-top: 4px;">
          <span style="font-weight: bold;">Associated:</span> ${home.associatedPeople.join(', ')}
        </div>`;
      } else {
        // Fallback: check which partners have defaultHome === home.id
        const associated = state.config.partners.filter(p => p.defaultHome === home.id).map(p => p.name.split(' ')[0]);
        if (associated.length > 0) {
          peopleStr = `<div class="font-body-md" style="font-size: 0.8rem; color: var(--on-surface-variant); margin-top: 4px;">
            <span style="font-weight: bold;">Associated:</span> ${associated.join(', ')}
          </div>`;
        }
      }

      homesHtml += `
        <div class="bento-card home-card ${showAdmin ? 'home-card-editable' : ''}" data-home-id="${home.id}" style="padding: var(--space-md); background-color: var(--surface-container-high); border: none; ${showAdmin ? 'cursor: pointer;' : ''} transition: border 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="display: flex; gap: var(--space-md); flex-grow: 1;">
              <div style="width: 44px; height: 44px; background-color: var(--primary-fixed); color: var(--on-primary-fixed); border-radius: var(--radius-default); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <span class="material-symbols-outlined">${home.name.toLowerCase().includes('loft') || home.name.toLowerCase().includes('apartment') ? 'apartment' : 'bungalow'}</span>
              </div>
              <div>
                <h4 class="font-title-lg" style="font-size: 1.05rem; font-weight: 700;">${home.name}</h4>
                <p class="font-label-sm" style="color: var(--on-surface-variant);">${home.address}</p>
                <div class="font-body-md" style="font-size: 0.8rem; color: var(--on-surface-variant); margin-top: 4px;">
                  <span style="font-weight: bold;">Rooms:</span> ${bedroomsStr}
                </div>
                ${peopleStr}
              </div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-xs);">
              <span class="font-label-sm" style="color: var(--secondary); font-weight: bold; display: flex; align-items: center; gap: 4px;">
                <span style="width: 6px; height: 6px; border-radius: var(--radius-full); background-color: var(--secondary); display: inline-block;"></span>
                ${home.bedrooms} Bedrooms
              </span>
              ${showAdmin ? `<button class="btn btn-outline btn-edit-home" data-home-id="${home.id}" style="padding: 4px 10px; font-size: 0.75rem;"><span class="material-symbols-outlined" style="font-size: 14px;">edit</span> Edit</button>` : ''}
            </div>
          </div>
        </div>
      `;
    });

    return `
      <div class="mb-xl" style="margin-bottom: var(--space-xl);">
        <h2 class="font-headline-lg">Logistics & Configuration</h2>
        <p class="font-body-lg" style="color: var(--on-surface-variant); margin-top: 4px; max-width: 650px;">
          Manage collective residences, sleeping quotas, partner preferences, and convert passive partners to active users.
        </p>
      </div>

      <div class="bento-grid">
        <!-- Collective Profiles -->
        <section class="bento-span-12" style="display: flex; flex-direction: column; gap: var(--space-md);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-sm);">
            <h3 class="font-title-lg" style="display: flex; align-items: center; gap: var(--space-base); font-weight: 700;">
              <span class="material-symbols-outlined text-primary">group</span> Collective Profiles
            </h3>
            <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
              <button class="btn btn-outline" id="btn-activate-partner" style="padding: var(--space-xs) var(--space-md); font-size: 0.85rem;">
                <span class="material-symbols-outlined" style="font-size: 16px;">person_check</span> Activate Passive Partner
              </button>
              <button class="btn btn-filled" id="btn-add-partner" style="padding: var(--space-xs) var(--space-md); font-size: 0.85rem;">
                <span class="material-symbols-outlined" style="font-size: 16px;">person_add</span> Add Partner
              </button>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-md);">
            ${profilesHtml}
          </div>
        </section>

        <!-- Homes & Locations -->
        <section class="bento-span-12" style="display: flex; flex-direction: column; gap: var(--space-md);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="font-title-lg" style="display: flex; align-items: center; gap: var(--space-base); font-weight: 700;">
              <span class="material-symbols-outlined text-primary">home_work</span> Homes & Spaces
            </h3>
            <button class="btn btn-outline" id="btn-add-home" style="padding: var(--space-xs) var(--space-md); font-size: 0.85rem; border-color: var(--primary); color: var(--primary);">
              <span class="material-symbols-outlined" style="font-size: 16px;">add_home</span> Add Home
            </button>
          </div>
          <div style="display: flex; flex-direction: column; gap: var(--space-base);">
            ${homesHtml}
          </div>
        </section>
      </div>
    `;
  },

  /**
   * Renders the Settings View
   */
  settings(state) {
    const isOffline = state.isOffline;
    const clientId = localStorage.getItem('polyschedule_client_id') || '';
    const apiKey = localStorage.getItem('polyschedule_api_key') || '';
    const calendarId = localStorage.getItem('polyschedule_calendar_id') || 'primary';
    
    return `
      <div class="mb-xl" style="margin-bottom: var(--space-xl);">
        <h2 class="font-headline-lg">Settings & Integrations</h2>
        <p class="font-body-lg" style="color: var(--on-surface-variant); margin-top: 4px;">
          Configure API credentials, choose synchronization profiles, and verify local storage states.
        </p>
      </div>

      <section style="max-width: 600px; display: flex; flex-direction: column; gap: var(--space-xl);">
        <!-- Sync Mode Selection -->
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-xs);">Connection Mode</h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Choose whether to operate completely offline (caching configurations in local storage) or sync in real-time with your shared Google Calendar.
          </p>
          
          <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
            <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-sm); background-color: ${isOffline ? 'var(--surface-container-high)' : 'transparent'}; border-radius: var(--radius-default);">
              <input type="radio" name="mode-select" value="offline" ${isOffline ? 'checked' : ''} style="accent-color: var(--primary);"/>
              <div>
                <strong style="display: block; font-size: 0.95rem;">Offline / Local Storage Mode</strong>
                <span class="font-body-md" style="color: var(--on-surface-variant);">No external setup needed. Data persists locally inside your browser.</span>
              </div>
            </label>
            <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-sm); background-color: ${!isOffline ? 'var(--surface-container-high)' : 'transparent'}; border-radius: var(--radius-default);">
              <input type="radio" name="mode-select" value="sync" ${!isOffline ? 'checked' : ''} style="accent-color: var(--primary);"/>
              <div>
                <strong style="display: block; font-size: 0.95rem;">Google Calendar API Sync Mode</strong>
                <span class="font-body-md" style="color: var(--on-surface-variant);">Syncs schedule and proposals directly to a Google Calendar. Requires client API keys.</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Google Calendar API Setup (Conditional) -->
        <div class="bento-card" id="api-keys-section" style="padding: var(--space-lg); border: 1px solid var(--outline-variant); display: ${isOffline ? 'none' : 'flex'}; flex-direction: column; gap: var(--space-md);">
          <h3 class="font-title-lg" style="font-weight: 700;">Google API Credentials</h3>
          <p class="font-body-md" style="color: var(--on-surface-variant);">
            To connect, enter your Google OAuth 2.0 Client ID and API Key from the Google Cloud Console.
          </p>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-client-id">OAuth 2.0 Client ID</label>
            <input class="form-input" id="setting-client-id" placeholder="xxxxxx.apps.googleusercontent.com" type="text" value="${clientId}"/>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-api-key">API Key</label>
            <input class="form-input" id="setting-api-key" placeholder="AIzaSy..." type="password" value="${apiKey}"/>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-calendar-id">Calendar ID (Optional)</label>
            <input class="form-input" id="setting-calendar-id" placeholder="primary" type="text" value="${calendarId}"/>
            <span class="font-label-sm" style="color: var(--on-surface-variant); margin-top: 4px;">defaults to 'primary' (your main login calendar)</span>
          </div>

          <button class="btn btn-filled" id="btn-save-credentials" style="align-self: flex-start; margin-top: var(--space-sm);">Save Credentials</button>
        </div>

        <!-- App Reset Details -->
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--error-container); background-color: rgba(186, 26, 26, 0.02);">
          <h3 class="font-title-lg" style="font-weight: 700; color: var(--error);">Reset Data</h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Clears all local storage settings, cached events, profiles, and API credentials, resetting the app to default.
          </p>
          <button class="btn btn-error" id="btn-reset-app" style="align-self: flex-start;">Clear Local Data</button>
        </div>
      </section>
    `;
  },

  admin(state) {
    const polyFamilyName = localStorage.getItem('polyschedule_poly_family_name') || 'The Poly Circle';
    const autoArchiveDays = getAutoArchiveDays();
    const logsHtml = (state.logs || []).map(log => {
      const color = log.type === 'error' ? 'var(--error)' : log.type === 'warning' ? 'var(--tertiary)' : 'inherit';
      return `<p class="console-line"><span class="console-time">[${log.time}]</span> <span style="color: ${color};">${log.message}</span></p>`;
    }).join('') || '<p class="console-line" style="color: var(--on-surface-variant);">No system events logged yet.</p>';

    return `
      <div class="mb-xl" style="margin-bottom: var(--space-xl);">
        <h2 class="font-headline-lg">System Administration</h2>
        <p class="font-body-lg" style="color: var(--on-surface-variant); margin-top: 4px;">
          Configure global settings and review real operational system logs.
        </p>
      </div>

      <section style="max-width: 800px; display: flex; flex-direction: column; gap: var(--space-xl);">
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Group Settings</h3>
          <div class="form-group" style="margin-bottom: var(--space-md);">
            <label class="form-label" for="admin-poly-family-name">Name</label>
            <input class="form-input" id="admin-poly-family-name" placeholder="The Poly Circle" type="text" value="${polyFamilyName}"/>
          </div>
          <button class="btn btn-filled" id="btn-save-group-name" style="align-self: flex-start;">Save Name</button>
        </div>

        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Proposal Archive</h3>
          <div class="form-group" style="margin-bottom: var(--space-md);">
            <label class="form-label" for="admin-auto-archive-days">Auto-archive approved proposals after (days)</label>
            <input class="form-input" id="admin-auto-archive-days" type="number" min="0" max="365" value="${autoArchiveDays}"/>
            <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-xs);">Set to 0 to disable automatic archiving (manual only).</p>
          </div>
          <button class="btn btn-filled" id="btn-save-auto-archive" style="align-self: flex-start;">Save Archive Setting</button>
        </div>

        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm);">
            <span class="material-symbols-outlined text-primary">terminal</span> System Administration Log
          </h3>
          <div class="console-container">
            <div class="console-header">
              <span class="font-label-sm">Operational Log (${(state.logs || []).length} entries)</span>
            </div>
            <div class="console-body" id="console-logs-body" style="max-height: 280px; overflow-y: auto;">
              ${logsHtml}
            </div>
            <div class="console-action-row">
              <button class="btn-outline" id="btn-export-logs" style="background: transparent; border: none; font-family: var(--font-mono); font-size: 0.75rem; color: rgba(255,255,255,0.6); cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">download</span> Export Logs
              </button>
            </div>
          </div>
        </div>
      </section>
    `;
  },

  addPartner(state, partnerType = 'active') {
    const isPassive = partnerType === 'passive';

    let partnersHtml = '';
    state.config.partners.forEach(partner => {
      partnersHtml += `
        <div style="border: 1px solid var(--outline-variant); padding: var(--space-md); border-radius: var(--radius-md); background-color: var(--surface-container-low); display: flex; flex-direction: column; gap: var(--space-sm);">
          <label style="display: flex; align-items: center; gap: var(--space-md); font-weight: bold; cursor: pointer;">
            <input type="checkbox" class="sleeping-partner-checkbox" data-partner-name="${partner.name}" style="accent-color: var(--primary); width: 18px; height: 18px;"/>
            <span>${partner.name}</span>
          </label>
          <div class="sleeping-partner-details" style="display: none; flex-direction: column; gap: var(--space-xs); margin-left: 28px; border-left: 2px solid var(--primary-container); padding-left: var(--space-md);">
            <div style="display: flex; gap: var(--space-md);">
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">Min Nights</label>
                <input class="form-input partner-min-nights" type="number" min="0" max="7" value="1" style="padding: 4px 8px; font-size: 0.8rem;"/>
              </div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">Max Nights</label>
                <input class="form-input partner-max-nights" type="number" min="0" max="7" value="3" style="padding: 4px 8px; font-size: 0.8rem;"/>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    const activeFieldsHtml = isPassive ? '' : `
            <div class="grid grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="new-partner-username">Username</label>
                <input class="form-input" id="new-partner-username" placeholder="e.g. robin" type="text"/>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="new-partner-password">Default Password</label>
                <input class="form-input" id="new-partner-password" placeholder="e.g. password123" type="password"/>
              </div>
            </div>

            <div class="form-group" style="margin-top: var(--space-sm);">
              <label class="form-label" for="new-partner-role">Role</label>
              <select class="form-input" id="new-partner-role">
                <option value="User">User</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
    `;

    const sleepingSectionHtml = isPassive ? '' : `
        <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
          <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
            <h3 class="font-title-lg" style="font-weight: 700; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Sleeping Partner Connections</h3>
            <div class="form-group" id="solo-nights-group" style="display: none;">
              <label class="form-label" for="new-partner-solo-nights">Min Solo Nights</label>
              <input class="form-input" id="new-partner-solo-nights" type="number" min="0" max="7" value="2"/>
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-md); margin-top: var(--space-xs);">
              ${partnersHtml}
            </div>
          </div>
        </div>
    `;

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-add-partner-back" aria-label="Cancel">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 class="font-title-lg">${isPassive ? 'Add Passive Partner' : 'Add Active Partner'}</h2>
        </div>
        <button class="btn btn-filled" id="btn-submit-partner">Save Partner</button>
      </div>

      <div class="switch-selector" style="margin-bottom: var(--space-lg); max-width: 400px;">
        <button class="switch-btn ${!isPassive ? 'active' : ''}" id="btn-partner-type-active">Active User</button>
        <button class="switch-btn ${isPassive ? 'active' : ''}" id="btn-partner-type-passive">Passive Partner</button>
      </div>

      <input type="hidden" id="new-partner-type" value="${partnerType}"/>

      <div style="display: grid; grid-template-columns: 1fr; md:grid-template-columns: 2fr 1fr; gap: var(--space-xl); max-width: 900px;">
        <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
          <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
            <h3 class="font-title-lg" style="font-weight: 700; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Profile Information</h3>
            <div class="form-group">
              <label class="form-label" for="new-partner-name">Display Name</label>
              <input class="form-input" id="new-partner-name" placeholder="e.g. Robin Williams" type="text"/>
            </div>
            ${activeFieldsHtml}
            <div class="form-group" style="margin-top: var(--space-sm);">
              <label class="form-label" for="new-partner-home">Default Home</label>
              <select class="form-input" id="new-partner-home">
                ${renderHomeSelectOptions(state.config.residences, '')}
              </select>
            </div>
            ${isPassive ? '<p class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.85rem;">Passive partners appear in scheduling but cannot log in.</p>' : ''}
          </div>
          <div class="bento-card" style="padding: var(--space-lg);">
            <h3 class="font-title-lg" style="font-weight: 700; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs); margin-bottom: var(--space-md);">Select Avatar</h3>
            ${renderAvatarPickerHtml('', 'new-partner-avatar-options')}
          </div>
        </div>
        ${sleepingSectionHtml}
      </div>
    `;
  },

  addHome(state) {
    // Generate partner checkboxes for association
    let partnersHtml = '';
    state.config.partners.forEach(partner => {
      partnersHtml += `
        <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-xs);">
          <input type="checkbox" class="home-associated-partner" data-partner-name="${partner.name}" style="accent-color: var(--primary); width: 18px; height: 18px;"/>
          <span>${partner.name}</span>
        </label>
      `;
    });

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-add-home-back" aria-label="Cancel">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 class="font-title-lg">Add New Home & Space</h2>
        </div>
        <button class="btn btn-filled" id="btn-submit-home">Save Home</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr; md:grid-template-columns: 2fr 1fr; gap: var(--space-xl); max-width: 900px;">
        <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
          <!-- Core residence fields -->
          <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
            <h3 class="font-title-lg" style="font-weight: 700; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Home Details</h3>
            
            <div class="form-group">
              <label class="form-label" for="new-home-name">Home Name</label>
              <input class="form-input" id="new-home-name" placeholder="e.g. Mountain Retreat" type="text"/>
            </div>

            <div class="form-group">
              <label class="form-label" for="new-home-address">Address <span class="font-label-sm" style="color: var(--on-surface-variant);">(Optional)</span></label>
              <input class="form-input" id="new-home-address" placeholder="e.g. 742 Evergreen Terrace" type="text"/>
            </div>

            <div class="form-group">
              <label class="form-label" for="new-home-bedrooms-count">Number of Bedrooms</label>
              <input class="form-input" id="new-home-bedrooms-count" type="number" min="1" max="10" value="1"/>
            </div>

            <!-- Optional Bedroom Names Container -->
            <div style="display: flex; flex-direction: column; gap: var(--space-sm); margin-top: var(--space-sm);" id="bedroom-names-container">
              <h4 class="font-label-md" style="font-weight: bold;">Bedroom Names (Optional)</h4>
              <div class="form-group" style="margin-bottom: 0;">
                <input class="form-input bedroom-name-input" placeholder="Bedroom 1 Name (e.g. Master Suite)" type="text" data-index="0"/>
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
          <!-- Associated partners -->
          <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
            <h3 class="font-title-lg" style="font-weight: 700; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Associated People</h3>
            <p class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.8rem; margin-bottom: var(--space-xs);">
              Select which people are associated with or reside at this home.
            </p>
            <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
              ${partnersHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  },

  login(state) {
    return `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; padding: var(--space-lg);">
        <div class="bento-card" id="login-form" style="width: 100%; max-width: 400px; padding: var(--space-xl); border: 1px solid var(--outline-variant);">
          <div style="text-align: center; margin-bottom: var(--space-lg);">
            <span class="material-symbols-outlined" style="font-size: 48px; color: var(--primary);">calendar_month</span>
            <h2 class="font-headline-lg" style="margin-top: var(--space-sm); font-weight: 700;">PolySchedule</h2>
            <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 4px;">Sign in to manage your schedule</p>
          </div>
          <div class="form-group">
            <label class="form-label" for="login-username">Username</label>
            <input class="form-input" id="login-username" type="text" autocomplete="username" placeholder="Enter username"/>
          </div>
          <div class="form-group">
            <label class="form-label" for="login-password">Password</label>
            <input class="form-input" id="login-password" type="password" autocomplete="current-password" placeholder="Enter password"/>
          </div>
          <button class="btn btn-filled" id="btn-login" style="width: 100%; margin-top: var(--space-sm);">Log In</button>
          <p class="font-label-sm" style="color: var(--on-surface-variant); text-align: center; margin-top: var(--space-md);">Demo: alex / password123</p>
        </div>
      </div>
    `;
  },

  editPartner(state, partnerId) {
    const partner = state.config.partners.find(p => p.id === partnerId);
    if (!partner) return '<p>Partner not found.</p>';
    const passive = isPartnerPassive(partner);

    let sleepingHtml = '';
    if (!passive) {
      let partnersCheckHtml = '';
      state.config.partners.filter(p => p.id !== partnerId).forEach(p => {
        const limit = partner.rules?.partnerLimits?.[p.name] || partner.rules?.partnerLimits?.[p.name.split(' ')[0]];
        const checked = limit ? 'checked' : '';
        partnersCheckHtml += `
          <div style="border: 1px solid var(--outline-variant); padding: var(--space-md); border-radius: var(--radius-md);">
            <label style="display: flex; align-items: center; gap: var(--space-md); font-weight: bold; cursor: pointer;">
              <input type="checkbox" class="sleeping-partner-checkbox" data-partner-name="${p.name}" ${checked} style="accent-color: var(--primary); width: 18px; height: 18px;"/>
              <span>${p.name}</span>
            </label>
            <div class="sleeping-partner-details" style="display: ${checked ? 'flex' : 'none'}; flex-direction: column; gap: var(--space-xs); margin-left: 28px; margin-top: var(--space-xs);">
              <div style="display: flex; gap: var(--space-md);">
                <div class="form-group" style="flex: 1; margin-bottom: 0;">
                  <label class="form-label" style="font-size: 0.75rem;">Min Nights</label>
                  <input class="form-input partner-min-nights" type="number" min="0" max="7" value="${limit?.min || 1}" style="padding: 4px 8px; font-size: 0.8rem;"/>
                </div>
                <div class="form-group" style="flex: 1; margin-bottom: 0;">
                  <label class="form-label" style="font-size: 0.75rem;">Max Nights</label>
                  <input class="form-input partner-max-nights" type="number" min="0" max="7" value="${limit?.max || 3}" style="padding: 4px 8px; font-size: 0.8rem;"/>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      sleepingHtml = `
        <div class="bento-card" style="padding: var(--space-lg);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Sleeping Rules</h3>
          <div class="form-group">
            <label class="form-label" for="edit-partner-solo-nights">Min Solo Nights</label>
            <input class="form-input" id="edit-partner-solo-nights" type="number" min="0" max="7" value="${partner.rules?.minSoloNights ?? partner.rules?.maxSoloNights ?? 2}"/>
          </div>
          <div style="display: flex; flex-direction: column; gap: var(--space-sm); margin-top: var(--space-md);">${partnersCheckHtml}</div>
        </div>
      `;
    }

    const activeFields = passive ? '' : `
      <div class="grid grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="edit-partner-username">Username</label>
          <input class="form-input" id="edit-partner-username" type="text" value="${partner.username || ''}"/>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="edit-partner-password">Password</label>
          <input class="form-input" id="edit-partner-password" type="password" value="${partner.password || ''}"/>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="edit-partner-role">Role</label>
        <select class="form-input" id="edit-partner-role">
          <option value="User" ${partner.role === 'User' || (!partner.role || (partner.role !== 'Admin')) ? 'selected' : ''}>User</option>
          <option value="Admin" ${partner.role === 'Admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
    `;

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-edit-partner-back"><span class="material-symbols-outlined">arrow_back</span></button>
          <h2 class="font-title-lg">Edit Partner: ${partner.name}</h2>
        </div>
        <div style="display: flex; gap: var(--space-sm);">
          <button class="btn btn-outline" id="btn-delete-edit-partner" style="color: var(--error); border-color: var(--error);">Delete Partner</button>
          <button class="btn btn-filled" id="btn-save-edit-partner">Save Changes</button>
        </div>
      </div>
      <input type="hidden" id="edit-partner-id" value="${partner.id}"/>
      <div style="display: grid; gap: var(--space-xl); max-width: 900px;">
        <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
          <div class="form-group"><label class="form-label" for="edit-partner-name">Display Name</label>
            <input class="form-input" id="edit-partner-name" type="text" value="${partner.name}"/></div>
          ${activeFields}
          <div class="form-group">
            <label class="form-label" for="edit-partner-home">Default Home</label>
            <select class="form-input" id="edit-partner-home">${renderHomeSelectOptions(state.config.residences, partner.defaultHome)}</select>
          </div>
          ${renderAvatarPickerHtml(partner.avatar, 'edit-partner-avatar-options')}
        </div>
        ${sleepingHtml}
      </div>
    `;
  },

  editHome(state, homeId) {
    const home = state.config.residences.find(h => h.id === homeId);
    if (!home) return '<p>Home not found.</p>';

    let bedroomInputs = '';
    const count = home.bedrooms || home.bedroomDetails?.length || 1;
    for (let i = 0; i < count; i++) {
      const bedName = home.bedroomDetails?.[i]?.name || `Bedroom ${i + 1}`;
      bedroomInputs += `<div class="form-group" style="margin-bottom: var(--space-xs);"><input class="form-input bedroom-name-input" type="text" data-index="${i}" value="${bedName}"/></div>`;
    }

    let partnersHtml = '';
    state.config.partners.forEach(partner => {
      const associated = home.associatedPeople?.includes(partner.name) || partner.defaultHome === home.id;
      partnersHtml += `
        <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-xs);">
          <input type="checkbox" class="home-associated-partner" data-partner-name="${partner.name}" ${associated ? 'checked' : ''} style="accent-color: var(--primary); width: 18px; height: 18px;"/>
          <span>${partner.name}</span>
        </label>
      `;
    });

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-edit-home-back"><span class="material-symbols-outlined">arrow_back</span></button>
          <h2 class="font-title-lg">Edit Home: ${home.name}</h2>
        </div>
        <div style="display: flex; gap: var(--space-sm);">
          <button class="btn btn-outline" id="btn-delete-edit-home" style="color: var(--error); border-color: var(--error);">Delete Home</button>
          <button class="btn btn-filled" id="btn-save-edit-home">Save Changes</button>
        </div>
      </div>
      <input type="hidden" id="edit-home-id" value="${home.id}"/>
      <div style="display: grid; gap: var(--space-xl); max-width: 900px; grid-template-columns: 2fr 1fr;">
        <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
          <div class="form-group"><label class="form-label" for="edit-home-name">Home Name</label>
            <input class="form-input" id="edit-home-name" type="text" value="${home.name}"/></div>
          <div class="form-group"><label class="form-label" for="edit-home-address">Address</label>
            <input class="form-input" id="edit-home-address" type="text" value="${home.address}"/></div>
          <div class="form-group"><label class="form-label" for="edit-home-bedrooms-count">Number of Bedrooms</label>
            <input class="form-input" id="edit-home-bedrooms-count" type="number" min="1" max="10" value="${count}"/></div>
          <div id="bedroom-names-container"><h4 class="font-label-md" style="font-weight: bold;">Bedroom Names</h4>${bedroomInputs}</div>
        </div>
        <div class="bento-card" style="padding: var(--space-lg);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Associated People</h3>
          <div style="display: flex; flex-direction: column; gap: var(--space-xs);">${partnersHtml}</div>
        </div>
      </div>
    `;
  },

  activatePartner(state) {
    const passivePartners = state.config.partners.filter(isPartnerPassive);
    const options = passivePartners.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    let sleepingHtml = '';
    state.config.partners.filter(p => !isPartnerPassive(p)).forEach(partner => {
      sleepingHtml += `
        <div style="border: 1px solid var(--outline-variant); padding: var(--space-md); border-radius: var(--radius-md);">
          <label style="display: flex; align-items: center; gap: var(--space-md); font-weight: bold; cursor: pointer;">
            <input type="checkbox" class="sleeping-partner-checkbox" data-partner-name="${partner.name}" style="accent-color: var(--primary); width: 18px; height: 18px;"/>
            <span>${partner.name}</span>
          </label>
          <div class="sleeping-partner-details" style="display: none; flex-direction: column; gap: var(--space-xs); margin-left: 28px; margin-top: var(--space-xs);">
            <div style="display: flex; gap: var(--space-md);">
              <div class="form-group" style="flex: 1; margin-bottom: 0;"><label class="form-label" style="font-size: 0.75rem;">Min Nights</label>
                <input class="form-input partner-min-nights" type="number" min="0" max="7" value="1"/></div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;"><label class="form-label" style="font-size: 0.75rem;">Max Nights</label>
                <input class="form-input partner-max-nights" type="number" min="0" max="7" value="3"/></div>
            </div>
          </div>
        </div>
      `;
    });

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-activate-partner-back"><span class="material-symbols-outlined">arrow_back</span></button>
          <h2 class="font-title-lg">Activate Passive Partner</h2>
        </div>
        <button class="btn btn-filled" id="btn-submit-activate">Activate Partner</button>
      </div>
      <div style="max-width: 700px; display: flex; flex-direction: column; gap: var(--space-lg);">
        <div class="bento-card" style="padding: var(--space-lg);">
          <div class="form-group">
            <label class="form-label" for="activate-partner-select">Select Passive Partner</label>
            <select class="form-input" id="activate-partner-select">
              ${passivePartners.length ? options : '<option value="">No passive partners available</option>'}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); margin-top: var(--space-md);">
            <div class="form-group" style="margin-bottom: 0;"><label class="form-label" for="activate-username">Username</label>
              <input class="form-input" id="activate-username" type="text"/></div>
            <div class="form-group" style="margin-bottom: 0;"><label class="form-label" for="activate-password">Password</label>
              <input class="form-input" id="activate-password" type="password"/></div>
          </div>
          <div class="form-group" style="margin-top: var(--space-md);">
            <label class="form-label" for="activate-role">Role</label>
            <select class="form-input" id="activate-role"><option value="User">User</option><option value="Admin">Admin</option></select>
          </div>
        </div>
        <div class="bento-card" style="padding: var(--space-lg);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Sleeping Partner Connections</h3>
          <div class="form-group" id="solo-nights-group" style="display: none;">
            <label class="form-label" for="activate-solo-nights">Min Solo Nights</label>
            <input class="form-input" id="activate-solo-nights" type="number" min="0" max="7" value="2"/>
          </div>
          <div style="display: flex; flex-direction: column; gap: var(--space-sm);">${sleepingHtml}</div>
        </div>
      </div>
    `;
  }
};
