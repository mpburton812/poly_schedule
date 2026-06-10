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
  partnerRefsMatch,
  renderBatchNightsReviewHtml
} from '../helpers.js';
import {
  WORKFLOW,
  filterProposalsForTab,
  getWorkflowState,
  allowsAbstain,
  isPassivePerson,
  getAutoArchiveDays,
  isCalendarEvent,
  getResponseForParticipant,
  resolveParticipantRoleName
} from '../proposal-workflow.js';


export function proposalsView(state, activeTab = 'proposed') {
    const userName = state.currentUser?.name;
    const userRef = state.currentUser?.id || userName;
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
        const isProposer = partnerRefsMatch(state.config, p.proposer, userRef);
        const isReceiver = !isProposer;
        const responseKey = resolveParticipantRoleName(state.config, userRef, p.participantRoles) || userName;
        const userResponse = getResponseForParticipant(p, responseKey, state.config);
        const userVote = userResponse?.status || 'pending';
        const canVote = ws === WORKFLOW.PROPOSED && isReceiver && userVote === 'pending' && !!userResponse;

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
        const timeOpts = { hour: 'numeric', minute: '2-digit', hour12: true };
        const timeStr = `${startDate.toLocaleTimeString(undefined, timeOpts)} - ${new Date(p.end).toLocaleTimeString(undefined, timeOpts)}`;

        const roleMap = Object.fromEntries((p.participantRoles || []).map(r => [r.name, r.role]));
        let responsesHtml = '';
        Object.keys(p.responses || {}).forEach(k => {
          const r = p.responses[k];
          const isPending = r.status === 'pending';
          const isReject = r.status === 'reject';
          const isAbstain = r.status === 'abstain';
          const icon = isPending ? 'pending' : isReject ? 'cancel' : isAbstain ? 'do_not_disturb_on' : 'check_circle';
          const colorClass = isPending ? 'text-outline' : isReject ? 'var(--error)' : isAbstain ? 'var(--on-surface-variant)' : 'var(--secondary)';
          const nameLabel = partnerRefsMatch(state.config, k, userRef) ? 'You' : k.split(' ')[0];
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
        const batchNightsHtml = p.type === 'batch_sleeping'
          ? renderBatchNightsReviewHtml(p.batchNights)
          : '';

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

            ${batchNightsHtml}

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
}