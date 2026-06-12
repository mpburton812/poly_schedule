import { RulesEngine } from '../rules.js';
import { escapeHtml } from '../escape.js';
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
  renderBatchNightsReviewHtml,
  formatPersonConflictNotice
} from '../helpers.js';
import { isPastScheduledEvent } from '../gcal-sync.js';
import { normalizeEventComments } from '../event-comments.js';
import { VISIBILITY } from '../event-privacy.js';
import {
  WORKFLOW,
  filterProposalsForTab,
  getWorkflowState,
  allowsAbstain,
  isPassivePerson,
  getAutoArchiveDays,
  getResponseForParticipant,
  resolveParticipantRoleName
} from '../proposal-workflow.js';


export function proposalsView(state, activeTab = 'proposed') {
    const userName = state.currentUser?.name;
    const userRef = state.currentUser?.id || userName;
    const isAdmin = state.config?.partners?.find((p) => p.id === state.currentUser?.id)?.role === 'Admin';
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

        const dateStr = new Date(p.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
        const timeOpts = { hour: 'numeric', minute: '2-digit', hour12: true };
        const timeStr = `${new Date(p.start).toLocaleTimeString(undefined, timeOpts)} - ${new Date(p.end).toLocaleTimeString(undefined, timeOpts)}`;

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
                  <span>${escapeHtml(nameLabel)}<span class="font-label-sm" style="color: var(--on-surface-variant);">${roleLabel}${passiveLabel}</span></span>
                </div>
                <span class="font-label-sm" style="color: var(--on-surface-variant);">${responseStatusLabel(r.status)}</span>
              </div>
              ${r.comment ? `<p class="review-comment">"${escapeHtml(r.comment)}"</p>` : ''}
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
        } else if (ws === WORKFLOW.APPROVED && (isProposer || isAdmin)) {
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
        const personConflictHtml = (p.personConflicts || []).length
          ? `
            <div class="proposal-person-conflict-notice">
              <span class="material-symbols-outlined" aria-hidden="true">warning</span>
              <div>
                <strong>Person schedule conflict</strong>
                ${formatPersonConflictNotice(p.personConflicts)}
                <p class="font-label-sm" style="margin-top: var(--space-xs); opacity: 0.85;">Reviewers should confirm this overlap is intentional before accepting.</p>
              </div>
            </div>
          `
          : '';
        const pastScheduleHtml = isPastScheduledEvent(p)
          ? `
            <div class="proposal-person-conflict-notice proposal-past-schedule-notice">
              <span class="material-symbols-outlined" aria-hidden="true">history</span>
              <div>
                <strong>Past schedule</strong>
                <p class="font-body-sm" style="margin-top: var(--space-xs);">This proposal is scheduled in the past. Confirm the date and time are intentional before accepting.</p>
              </div>
            </div>
          `
          : '';
        const notesHtml = p.notes?.trim()
          ? `
            <div class="proposal-notes-block">
              <span class="font-label-sm" style="color: var(--on-surface-variant); display: block; margin-bottom: 4px;">NOTES</span>
              <p class="proposal-notes-text">${escapeHtml(p.notes.trim())}</p>
            </div>
          `
          : '';
        const commentItems = normalizeEventComments(p.comments);
        const commentsHtml = commentItems.length
          ? `
            <div class="proposal-notes-block">
              <span class="font-label-sm" style="color: var(--on-surface-variant); display: block; margin-bottom: 4px;">COMMENTS</span>
              ${commentItems.map((c) => {
                const when = c.createdAt
                  ? new Date(c.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
                  : '';
                return `<p class="proposal-notes-text"><strong>${escapeHtml(c.author)}</strong>${when ? ` · ${escapeHtml(when)}` : ''}<br/>${escapeHtml(c.text)}</p>`;
              }).join('')}
            </div>
          `
          : '';
        const privacyLabel = p.visibility === VISIBILITY.PRIVATE
          ? 'Private'
          : p.visibility === VISIBILITY.SUPER_PRIVATE
            ? 'Super Private'
            : '';
        const privacyBadge = privacyLabel
          ? `<span class="chip" style="font-size: 10px; margin-left: 8px; pointer-events: none;">${privacyLabel}</span>`
          : '';

        listHtml += `
          <div class="proposal-card ${p.type === 'sleeping' || p.type === 'batch_sleeping' ? 'sleeping' : ''}" id="prop-${p.id}">
            <div class="proposal-header">
              <div>
                <span class="proposal-badge ${p.type === 'batch_sleeping' ? 'batch' : p.type}">${p.type === 'batch_sleeping' ? 'BATCH SLEEPING' : p.type.toUpperCase()} PROPOSAL</span>
                <h3 class="font-title-lg" style="margin-top: 4px; font-weight: 700; color: var(--on-surface);">${escapeHtml(p.title)}${statusBadge}${privacyBadge}</h3>
              </div>
              <div style="text-align: right;">
                <span class="font-label-sm" style="color: var(--on-surface-variant); display: block;">PROPOSED BY</span>
                <span class="font-body-md" style="font-weight: 600;">${escapeHtml(p.proposer)}</span>
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
                    : p.type === 'sleeping' ? `${escapeHtml(p.homeName || 'Home')}: ${escapeHtml(p.roomName || 'Room')}` : escapeHtml(p.location || 'No location set')}</span>
                </div>
              </div>
            </div>

            ${notesHtml}
            ${commentsHtml}

            ${batchNightsHtml}

            ${personConflictHtml}

            ${pastScheduleHtml}

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