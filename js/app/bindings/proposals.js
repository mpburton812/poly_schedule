import { CalendarSync } from '../../calendar.js';
import { state, flowState } from '../state.js';
import { addLog, showToast, getCurrentUserName } from '../context.js';
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
  bindTab('btn-tab-approved', 'approved');
  bindTab('btn-tab-archived', 'archived');
  bindTab('btn-tab-declined', 'declined');

  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const vote = btn.dataset.vote;
      const voteLabel = vote === 'accept' ? 'Accept' : vote === 'abstain' ? 'Abstain' : 'Reject';

      const commentInput = prompt(`Optional comment for your ${voteLabel} vote (leave blank to skip):`);
      if (commentInput === null) return;

      const proposal = state.events.find(ev => ev.id === id);
      if (!proposal) return;

      const voterName = getCurrentUserName();
      const responses = { ...proposal.responses };
      responses[voterName] = {
        status: vote,
        comment: commentInput.trim()
      };

      try {
        await CalendarSync.updateEvent(id, { responses });
        showToast('Vote submitted successfully!', 'success');
        addLog(`User voted ${vote} on proposal "${proposal.title}"`);
      } catch (err) {
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
          await CalendarSync.cancelProposal(id, reason);
          addLog(`Proposal cancelled: "${proposal.title}"${reason ? ` — ${reason}` : ''}`, 'warning');
          showToast('Proposal cancelled.', 'success');
        } catch (err) {
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
          await CalendarSync.retractProposal(id);
          addLog(`Proposal retracted to draft: "${proposal.title}"`, 'info');
          showToast('Proposal retracted to draft.', 'success');
          flowState.activeProposalsTab = 'drafts';
          renderView();
        } catch (err) {
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
        addLog(`Proposal deleted: "${proposal.title}"`, 'warning');
        showToast('Proposal deleted.', 'success');
      } catch (err) {
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
        addLog(`Declined proposal reopened as new draft: "${proposal.title}"`, 'info');
        showToast('Reopened as a new draft.', 'success');
        loadDraftIntoForm(draft.id);
        flowState.activeProposalsTab = 'drafts';
        window.location.hash = `#create?draft=${draft.id}`;
      } catch (err) {
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
        addLog(`Proposal archived: "${proposal.title}"`, 'info');
        showToast('Proposal archived.', 'success');
        flowState.activeProposalsTab = 'archived';
        renderView();
      } catch (err) {
        showToast('Failed to archive proposal.', 'error');
      }
    });
  });
}
