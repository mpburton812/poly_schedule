import { CalendarSync } from '../../calendar.js';
import { state, flowState } from '../state.js';
import {
  logUserAction,
  showToast,
  getCurrentUserName,
  getCurrentUserId,
  logOperationError,
  persistCurrentUserNotifications,
  notifyProposerOfProposalVote,
  notifyProposalOutcome,
  notifyProposalWithdrawn
} from '../context.js';
import { getWorkflowState, WORKFLOW } from '../../proposal-workflow.js';
import { isRecurrenceInstance, askRecurrenceScope } from '../../recurrence.js';
import { parseHashParams } from '../../helpers.js';
import { renderView } from '../router.js';
import { loadDraftIntoForm } from './create.js';

export function bindProposalsEvents() {
  const bindTab = (id, tabName) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        flowState.activeProposalsTab = tabName;
        renderView();
      });
    }
  };
  bindTab('btn-tab-drafts', 'drafts');
  bindTab('btn-tab-proposed', 'proposed');
  bindTab('btn-tab-resolved', 'resolved');
  bindTab('btn-tab-archived', 'archived');

  if (flowState.highlightProposalId) {
    const highlightId = flowState.highlightProposalId;
    flowState.highlightProposalId = null;
    scrollToProposalCard(highlightId);
  }

  const params = parseHashParams();
  if (params.highlight) {
    scrollToProposalCard(params.highlight);
  }

  bindProposalActionHandlers();
}

function scrollToProposalCard(highlightId) {
  requestAnimationFrame(() => {
    const card = document.getElementById(`prop-${highlightId}`);
    if (!card) return;
    card.scrollIntoView({ behavior: 'smooth', block: 'center' });
    card.classList.add('proposal-card-highlight');
    setTimeout(() => card.classList.remove('proposal-card-highlight'), 2400);
  });
}

function bindProposalActionHandlers() {
  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const vote = btn.dataset.vote;
      const voteLabel = vote === 'accept' ? 'Accept' : vote === 'abstain' ? 'Abstain' : 'Reject';

      const commentInput = prompt(`Optional comment for your ${voteLabel} vote (leave blank to skip):`);
      if (commentInput === null) return;

      const proposal = state.events.find(ev => ev.id === id);
      if (!proposal) return;

      const voterRef = state.currentUser?.id || getCurrentUserName();
      const voterName = getCurrentUserName();
      const beforeWs = getWorkflowState(proposal);

      try {
        const updated = await CalendarSync.submitProposalVote(id, voterRef, vote, commentInput);
        state.events = CalendarSync.events;

        state.notifications = state.notifications.filter(
          n => n.dedupeKey !== `pending_${id}_${state.currentUser?.id}`
        );
        persistCurrentUserNotifications();

        const finalEvent = state.events.find(e => e.id === id) || updated;
        const afterWs = getWorkflowState(finalEvent);

        if (afterWs === WORKFLOW.APPROVED && beforeWs === WORKFLOW.PROPOSED) {
          notifyProposalOutcome(finalEvent, state.config, { outcome: 'approved' });
        } else if (afterWs === WORKFLOW.DECLINED && beforeWs === WORKFLOW.PROPOSED) {
          notifyProposalOutcome(finalEvent, state.config, {
            outcome: 'declined',
            declinedBy: finalEvent.declinedBy
          });
          flowState.activeProposalsTab = 'resolved';
        } else if (afterWs === WORKFLOW.PROPOSED) {
          notifyProposerOfProposalVote(finalEvent, state.config, {
            voterName,
            vote,
            actingUserId: getCurrentUserId()
          });
        }

        if (finalEvent && afterWs === WORKFLOW.APPROVED) {
          flowState.activeProposalsTab = 'resolved';
          showToast('Proposal approved!', 'success');
        } else {
          showToast('Vote submitted successfully!', 'success');
        }
        logUserAction(`Voted ${vote} on proposal "${proposal.title}"`);
        renderView();
      } catch (err) {
        logOperationError('Proposal vote submit', err, {
          proposalId: id,
          proposalTitle: proposal.title,
          vote
        });
        showToast('Failed to submit vote.', 'error');
      }
    });
  });

  document.querySelectorAll('.cancel-proposal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const proposal = state.events.find(ev => ev.id === id);
      if (!proposal) return;

      if (confirm(`Cancel proposal "${proposal.title}"? This permanently removes it.`)) {
        const reason = prompt('Optional reason for cancelling:') ?? '';
        try {
          notifyProposalWithdrawn(proposal, state.config, {
            kind: 'cancelled',
            reason,
            actingUserId: getCurrentUserId(),
            actorName: getCurrentUserName()
          });
          await CalendarSync.cancelProposal(id, reason);
          logUserAction(`Proposal cancelled: "${proposal.title}"${reason ? ` — ${reason}` : ''}`, 'warning');
          showToast('Proposal cancelled.', 'success');
        } catch (err) {
          logOperationError('Proposal cancel', err, {
            proposalId: id,
            proposalTitle: proposal.title
          });
          showToast('Failed to cancel proposal.', 'error');
        }
      }
    });
  });

  document.querySelectorAll('.retract-proposal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const proposal = state.events.find(ev => ev.id === id);
      if (!proposal) return;

      if (confirm(`Retract "${proposal.title}" back to draft? All votes will be cleared.`)) {
        try {
          notifyProposalWithdrawn(proposal, state.config, {
            kind: 'retracted',
            actingUserId: getCurrentUserId(),
            actorName: getCurrentUserName()
          });
          await CalendarSync.retractProposal(id);
          logUserAction(`Proposal retracted to draft: "${proposal.title}"`, 'info');
          showToast('Proposal retracted to draft.', 'success');
          flowState.activeProposalsTab = 'drafts';
          renderView();
        } catch (err) {
          logOperationError('Proposal retract', err, {
            proposalId: id,
            proposalTitle: proposal.title
          });
          showToast('Failed to retract proposal.', 'error');
        }
      }
    });
  });

  document.querySelectorAll('.edit-draft-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      loadDraftIntoForm(btn.dataset.id);
      window.location.hash = `#create?draft=${btn.dataset.id}`;
    });
  });

  document.querySelectorAll('.delete-draft-btn, .delete-declined-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const proposal = state.events.find(ev => ev.id === id);
      if (!proposal) return;
      if (!confirm(`Delete "${proposal.title}" permanently?`)) return;
      try {
        await CalendarSync.deleteProposal(id, 'Deleted by proposer');
        logUserAction(`Proposal deleted: "${proposal.title}"`, 'warning');
        showToast('Proposal deleted.', 'success');
      } catch (err) {
        logOperationError('Proposal delete', err, {
          proposalId: id,
          proposalTitle: proposal.title
        });
        showToast('Failed to delete proposal.', 'error');
      }
    });
  });

  document.querySelectorAll('.reopen-proposal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const proposal = state.events.find(ev => ev.id === id);
      if (!proposal) return;
      try {
        const draft = await CalendarSync.reopenDeclinedProposal(id);
        logUserAction(`Declined proposal reopened as new draft: "${proposal.title}"`, 'info');
        showToast('Reopened as a new draft.', 'success');
        loadDraftIntoForm(draft.id);
        flowState.activeProposalsTab = 'drafts';
        window.location.hash = `#create?draft=${draft.id}`;
      } catch (err) {
        logOperationError('Proposal reopen', err, {
          proposalId: id,
          proposalTitle: proposal.title
        });
        showToast('Failed to reopen proposal.', 'error');
      }
    });
  });

  document.querySelectorAll('.archive-proposal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const proposal = state.events.find(ev => ev.id === id);
      if (!proposal) return;
      try {
        await CalendarSync.archiveProposal(id);
        logUserAction(`Proposal archived: "${proposal.title}"`, 'info');
        showToast('Proposal archived.', 'success');
        flowState.activeProposalsTab = 'archived';
        renderView();
      } catch (err) {
        logOperationError('Proposal archive', err, {
          proposalId: id,
          proposalTitle: proposal.title
        });
        showToast('Failed to archive proposal.', 'error');
      }
    });
  });

  document.querySelectorAll('.redraft-proposal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const proposal = state.events.find(ev => ev.id === id);
      if (!proposal) return;
      if (!confirm(`Move "${proposal.title}" back to draft for editing and re-submission?`)) return;

      let redraftOptions = {};
      if (isRecurrenceInstance(proposal)) {
        const scope = askRecurrenceScope('redraft');
        if (!scope) return;
        redraftOptions = { scope };
      }

      try {
        const draft = await CalendarSync.redraftApprovedEvent(id, getCurrentUserName(), redraftOptions);
        state.events = CalendarSync.events;
        logUserAction(`Re-drafted proposal: "${proposal.title}"`, 'info');
        showToast('Moved to draft.', 'success');
        if (draft?.id) {
          loadDraftIntoForm(draft.id);
          window.location.hash = `#create?draft=${draft.id}`;
        } else {
          flowState.activeProposalsTab = 'drafts';
          renderView();
        }
      } catch (err) {
        logOperationError('Proposal re-draft', err, {
          proposalId: id,
          proposalTitle: proposal.title
        });
        showToast(err?.message || 'Failed to re-draft.', 'error');
      }
    });
  });
}
