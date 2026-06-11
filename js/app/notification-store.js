import { state } from './state.js';
import { NOTIFICATIONS_BY_USER_KEY } from '../storage-keys.js';
import { formatAppTime, findPartnerByRef, partnerRefsMatch, isPartnerPassive } from '../helpers.js';
import { getCurrentUserId, getCurrentUserName } from './session.js';
import { isPastScheduledEvent } from '../gcal-sync.js';
import {
  dispatchProposalReviewPush,
  dispatchProposalVotePush,
  dispatchProposalApprovedPush,
  dispatchProposalDeclinedPush,
  dispatchProposalWithdrawnPush,
  buildProposalReviewRecipients
} from '../push-notifications.js';
import { getWorkflowState, getRequiredVoters, getResponseForParticipant, userNeedsProposalVote, WORKFLOW, isProposalType } from '../proposal-workflow.js';

export function loadNotificationsStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATIONS_BY_USER_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

export function saveNotificationsStore(store) {
  localStorage.setItem(NOTIFICATIONS_BY_USER_KEY, JSON.stringify(store));
}

export function loadNotificationsForUser(userId) {
  if (!userId) return [];
  const store = loadNotificationsStore();
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return list;
}

export function saveNotificationsForUser(userId, notifications) {
  if (!userId) return;
  const store = loadNotificationsStore();
  store[userId] = notifications;
  saveNotificationsStore(store);
}

export function persistCurrentUserNotifications() {
  const userId = getCurrentUserId();
  if (userId) saveNotificationsForUser(userId, state.notifications);
}

export function refreshCurrentUserNotifications() {
  const userId = getCurrentUserId();
  state.notifications = userId ? loadNotificationsForUser(userId) : [];
  updateNotificationsBadge();
}

export function pushAppNotification({ title, description, dedupeKey, recipientId = null }) {
  const targetUserId = recipientId || getCurrentUserId();
  if (!targetUserId) return false;

  const appendNotification = (list) => {
    if (dedupeKey && list.some(n => n.dedupeKey === dedupeKey)) {
      return { list, added: false };
    }
    const notification = {
      id: \`notif_\${Date.now()}_\${Math.random().toString(36).slice(2, 7)}\`,
      title,
      description,
      timestamp: formatAppTime(),
      read: false,
      dedupeKey: dedupeKey || null,
      recipientId: targetUserId
    };
    const next = [notification, ...list];
    if (next.length > 50) next.pop();
    return { list: next, added: true };
  };

  if (targetUserId === getCurrentUserId()) {
    const result = appendNotification([...state.notifications]);
    if (!result.added) return false;
    state.notifications = result.list;
    saveNotificationsForUser(targetUserId, state.notifications);
    updateNotificationsBadge();
    return true;
  }

  const remote = loadNotificationsForUser(targetUserId);
  const result = appendNotification([...remote]);
  if (!result.added) return false;
  saveNotificationsForUser(targetUserId, result.list);
  return true;
}

export function notifyProposalReviewers(proposal, config, options = {}) {
  if (getWorkflowState(proposal) !== WORKFLOW.PROPOSED) return;
  const actingUserId = options.actingUserId || getCurrentUserId();
  getRequiredVoters(proposal.participantRoles || [], config).forEach(name => {
    if (partnerRefsMatch(config, name, proposal.proposer)) return;
    if (proposal.submittedBy && partnerRefsMatch(config, name, proposal.submittedBy)) return;
    const response = getResponseForParticipant(proposal, name, config);
    if (response?.status !== 'pending') return;
    const recipient = findPartnerByRef(config, name);
    if (!recipient || isPartnerPassive(recipient)) return;
    if (actingUserId && recipient.id === actingUserId) return;
    pushAppNotification({
      title: 'Proposal needs your review',
      description: \`"\${proposal.title}" from \${proposal.proposer} is waiting for your response.\${isPastScheduledEvent(proposal) ? ' This proposal is scheduled in the past.' : ''}\`,
      dedupeKey: \`pending_\${proposal.id}_\${recipient.id}\`,
      recipientId: recipient.id
    });
  });
  dispatchProposalReviewPush(proposal, config);
}

export function notifyProposerOfProposalVote(proposal, config, { voterName, vote, actingUserId = null }) {
  if (!proposal || !voterName || !vote) return;
  const proposer = findPartnerByRef(config, proposal.proposer);
  if (!proposer || isPartnerPassive(proposer)) return;
  if (partnerRefsMatch(config, voterName, proposal.proposer)) return;
  if (actingUserId && proposer.id === actingUserId) return;

  const voterFirst = voterName.split(' ')[0];
  pushAppNotification({
    title: 'New response on your proposal',
    description: \`\${voterFirst} \${vote === 'accept' ? 'accepted' : vote === 'reject' ? 'rejected' : 'abstained on'} "\${proposal.title}".\`,
    dedupeKey: \`vote_\${proposal.id}_\${voterName}_\${vote}\`,
    recipientId: proposer.id
  });
  dispatchProposalVotePush(proposal, config, voterName, vote);
}

export function notifyProposalOutcome(proposal, config, { outcome, declinedBy = null }) {
  if (!proposal) return;
  const proposer = findPartnerByRef(config, proposal.proposer);
  if (!proposer || isPartnerPassive(proposer)) return;

  if (outcome === 'approved') {
    pushAppNotification({
      title: 'Proposal approved',
      description: \`"\${proposal.title}" was approved and added to the calendar.\`,
      dedupeKey: \`approved_\${proposal.id}\`,
      recipientId: proposer.id
    });
    dispatchProposalApprovedPush(proposal, config);
    return;
  }

  if (outcome === 'declined') {
    const byLine = declinedBy ? \` by \${declinedBy.split(' ')[0]}\` : '';
    pushAppNotification({
      title: 'Proposal declined',
      description: \`"\${proposal.title}" was declined\${byLine}.\`,
      dedupeKey: \`declined_\${proposal.id}_\${declinedBy || 'unknown'}\`,
      recipientId: proposer.id
    });
    dispatchProposalDeclinedPush(proposal, config, declinedBy);
  }
}

export function notifyProposalWithdrawn(proposal, config, { kind = 'retracted', reason = '', actingUserId = null, actorName = null }) {
  if (!proposal || getWorkflowState(proposal) !== WORKFLOW.PROPOSED) return;
  const actor = actorName || getCurrentUserName();
  const actorFirst = actor.split(' ')[0];
  const reasonNote = reason ? \` Reason: \${reason}\` : '';

  buildProposalReviewRecipients(proposal, config).forEach(recipient => {
    if (actingUserId && recipient.id === actingUserId) return;
    pushAppNotification({
      title: kind === 'cancelled' ? 'Proposal cancelled' : 'Proposal retracted',
      description: \`\${actorFirst} \${kind === 'cancelled' ? 'cancelled' : 'retracted'} "\${proposal.title}".\${reasonNote}\`,
      dedupeKey: \`\${kind}_\${proposal.id}_\${recipient.id}\`,
      recipientId: recipient.id
    });
  });

  dispatchProposalWithdrawnPush(proposal, config, { kind, reason, actingUserId, actorName: actor });
}

export function syncPendingProposalAlertsForUser() {
  if (!state.currentUser || !state.config) return;
  const userRef = state.currentUser.id || getCurrentUserName();

  (state.events || []).forEach(proposal => {
    if (!isProposalType(proposal.type)) return;
    if (!userNeedsProposalVote(proposal, userRef, state.config)) return;
    pushAppNotification({
      title: 'Proposal needs your review',
      description: \`"\${proposal.title}" from \${proposal.proposer} is waiting for your response.\`,
      dedupeKey: \`pending_\${proposal.id}_\${state.currentUser.id}\`
    });
  });
}

export function updateNotificationsBadge() {
  if (typeof document === 'undefined') return;
  const badge = document.getElementById('notifications-badge');
  if (badge) {
    const unreadCount = state.notifications.filter(n => !n.read).length;
    badge.style.display = unreadCount > 0 ? 'block' : 'none';
  }
}
