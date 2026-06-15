/**
 * Sleeping partner connection proposals and partnerLimits state.
 */

import { WORKFLOW, getWorkflowState, normalizeParticipantRoles, participantNames } from './proposal-workflow.js';
import { findPartnerByRef, partnerRefsMatch } from './helpers.js';
import { persistHouseholdConfig } from './app/household-config.js';

export const CONNECTION_STATUS = {
  PENDING: 'pending',
  APPROVED: 'approved'
};

export function resolvePartnerLimitEntry(partner, targetName) {
  const limits = partner?.rules?.partnerLimits;
  if (!limits || !targetName) return null;
  if (limits[targetName]) return limits[targetName];
  const first = targetName.split(' ')[0];
  return limits[first] || null;
}

export function isPendingPartnerConnection(entry) {
  return entry?.status === CONNECTION_STATUS.PENDING;
}

export function isApprovedPartnerConnection(entry) {
  if (!entry) return false;
  if (entry.status === CONNECTION_STATUS.PENDING) return false;
  if (entry.status === CONNECTION_STATUS.APPROVED) return true;
  return typeof entry.min === 'number' || typeof entry.max === 'number';
}

export function isActivePartnerConnection(partner, targetName) {
  const entry = resolvePartnerLimitEntry(partner, targetName);
  return isPendingPartnerConnection(entry) || isApprovedPartnerConnection(entry);
}

export function defaultApprovedLimit() {
  return { status: CONNECTION_STATUS.APPROVED, min: 0, max: 7 };
}

export function defaultPendingLimit(proposalId) {
  return { status: CONNECTION_STATUS.PENDING, proposalId, min: 0, max: 7 };
}

export function findPartnerConnectionProposal(events, proposalId) {
  if (!proposalId) return null;
  return (events || []).find(e => e.id === proposalId && e.type === 'partner_connection') || null;
}

function ensurePartnerRules(partner) {
  if (!partner.rules) partner.rules = {};
  if (!partner.rules.partnerLimits) partner.rules.partnerLimits = {};
  return partner;
}

export function setPendingPartnerConnection(config, initiatorId, targetName, proposalId) {
  const initiator = config?.partners?.find(p => p.id === initiatorId);
  if (!initiator || !targetName) return false;
  ensurePartnerRules(initiator);
  initiator.rules.partnerLimits[targetName] = defaultPendingLimit(proposalId);
  return true;
}

export function clearPartnerConnectionEntry(config, initiatorId, targetName) {
  const initiator = config?.partners?.find(p => p.id === initiatorId);
  if (!initiator?.rules?.partnerLimits || !targetName) return false;
  delete initiator.rules.partnerLimits[targetName];
  const first = targetName.split(' ')[0];
  if (first !== targetName) delete initiator.rules.partnerLimits[first];
  return true;
}

export function syncBidirectionalApprovedConnection(config, partnerA, partnerB) {
  if (!config || !partnerA || !partnerB) return;
  ensurePartnerRules(partnerA);
  ensurePartnerRules(partnerB);
  const limit = defaultApprovedLimit();
  partnerA.rules.partnerLimits[partnerB.name] = { ...limit };
  partnerB.rules.partnerLimits[partnerA.name] = { ...limit };
}

export function buildPartnerConnectionProposalPayload(config, initiatorPartner, targetPartner, actingUserName) {
  const now = new Date().toISOString();
  const participants = [initiatorPartner.name, targetPartner.name];
  const participantRoles = normalizeParticipantRoles(participants, config, 'partner_connection');
  return {
    id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    type: 'partner_connection',
    title: `Sleeping partner: ${initiatorPartner.name} ↔ ${targetPartner.name}`,
    start: now,
    end: now,
    proposer: initiatorPartner.name,
    participants: participantNames(participantRoles),
    participantRoles,
    connectionInitiatorId: initiatorPartner.id,
    connectionTargetId: targetPartner.id,
    connectionTargetName: targetPartner.name,
    notes: `${initiatorPartner.name} requested a sleeping partner connection with ${targetPartner.name}. ${targetPartner.name} must approve before either can schedule together.`,
    workflowState: WORKFLOW.DRAFT,
    status: 'draft',
    revision: 1,
    responses: {},
    approvedAt: null,
    archivedAt: null,
    autoArchiveAt: null,
    expandedEventIds: []
  };
}

export async function createAndSubmitPartnerConnectionProposal({
  CalendarSync,
  state,
  initiatorPartner,
  targetPartner,
  actingUserName
}) {
  const payload = buildPartnerConnectionProposalPayload(
    state.config,
    initiatorPartner,
    targetPartner,
    actingUserName
  );

  await CalendarSync.createEvent(payload);
  setPendingPartnerConnection(state.config, initiatorPartner.id, targetPartner.name, payload.id);
  CalendarSync.config = state.config;

  await persistHouseholdConfig(`Sleeping partner request sent to ${targetPartner.name}`);

  await CalendarSync.submitProposal(payload.id, { submittedBy: actingUserName });
  state.events = CalendarSync.events;

  const finalEvent = state.events.find(e => e.id === payload.id);
  if (finalEvent) {
    const { notifyProposalReviewers } = await import('./app/notification-store.js');
    const { getCurrentUserId } = await import('./app/session.js');
    notifyProposalReviewers(finalEvent, state.config, { actingUserId: getCurrentUserId() });
  }

  return payload.id;
}

export async function applyApprovedPartnerConnection(config, proposal) {
  const initiator = config?.partners?.find(p => p.id === proposal.connectionInitiatorId)
    || findPartnerByRef(config, proposal.proposer);
  const target = config?.partners?.find(p => p.id === proposal.connectionTargetId)
    || findPartnerByRef(config, proposal.connectionTargetName);
  if (!initiator || !target) return false;

  syncBidirectionalApprovedConnection(config, initiator, target);
  await persistHouseholdConfig(`Sleeping partner connection approved: ${initiator.name} ↔ ${target.name}`);
  return true;
}

export function releasePartnerConnectionProposal(config, proposal) {
  if (!proposal || proposal.type !== 'partner_connection') return false;
  const initiatorId = proposal.connectionInitiatorId;
  const targetName = proposal.connectionTargetName
    || config?.partners?.find(p => p.id === proposal.connectionTargetId)?.name;
  if (!initiatorId || !targetName) return false;
  return clearPartnerConnectionEntry(config, initiatorId, targetName);
}

export async function handlePartnerConnectionWorkflowChange(context, updated, previous) {
  if (!updated || updated.type !== 'partner_connection') return;

  const prevWs = getWorkflowState(previous);
  const ws = getWorkflowState(updated);
  const config = context.config;

  if (ws === WORKFLOW.APPROVED && prevWs !== WORKFLOW.APPROVED) {
    await applyApprovedPartnerConnection(config, updated);
    context.config = config;
    return;
  }

  if (
    ws === WORKFLOW.DECLINED
    || ws === WORKFLOW.DRAFT
    || ws === null
  ) {
    if (prevWs === WORKFLOW.PROPOSED || prevWs === WORKFLOW.DRAFT || isPendingPartnerConnection(
      resolvePartnerLimitEntry(
        config?.partners?.find(p => p.id === updated.connectionInitiatorId),
        updated.connectionTargetName
      )
    )) {
      releasePartnerConnectionProposal(config, updated);
      context.config = config;
      try {
        await persistHouseholdConfig('Sleeping partner connection request cleared');
      } catch {
        /* local-only */
      }
    }
  }
}

export function formatPartnerConnectionProposalSummary(proposal, config) {
  const initiator = findPartnerByRef(config, proposal.proposer)?.name || proposal.proposer;
  const target = proposal.connectionTargetName
    || findPartnerByRef(config, proposal.connectionTargetId)?.name
    || 'partner';
  return `${initiator} and ${target} would be connected as sleeping partners. Scheduling together requires this approval.`;
}

export function partnerHasApprovedConnectionTo(config, partnerRef, targetRef) {
  const partner = findPartnerByRef(config, partnerRef);
  const target = findPartnerByRef(config, targetRef);
  if (!partner || !target) return false;
  const entry = resolvePartnerLimitEntry(partner, target.name);
  return isApprovedPartnerConnection(entry);
}
