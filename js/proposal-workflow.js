/**
 * Proposal workflow state machine and participant/voting helpers.
 */

import { isPartnerPassive } from './helpers.js';

export const WORKFLOW = {
  DRAFT: 'draft',
  PROPOSED: 'proposed',
  APPROVED: 'approved',
  ARCHIVED: 'archived',
  DECLINED: 'declined'
};

export const AUTO_ARCHIVE_DAYS_KEY = 'polyschedule_auto_archive_days';
export const DEFAULT_AUTO_ARCHIVE_DAYS = 7;

export function getAutoArchiveDays() {
  const val = parseInt(localStorage.getItem(AUTO_ARCHIVE_DAYS_KEY), 10);
  return Number.isFinite(val) && val >= 0 ? val : DEFAULT_AUTO_ARCHIVE_DAYS;
}

export function setAutoArchiveDays(days) {
  localStorage.setItem(AUTO_ARCHIVE_DAYS_KEY, String(Math.max(0, parseInt(days, 10) || 0)));
}

export function isProposalType(type) {
  return type === 'event' || type === 'sleeping' || type === 'batch_sleeping';
}

export function getWorkflowState(event) {
  if (event?.workflowState) return event.workflowState;
  if (event?.status === 'confirmed') return WORKFLOW.APPROVED;
  if (event?.status === 'rejected') return WORKFLOW.DECLINED;
  if (event?.status === 'pending') return WORKFLOW.PROPOSED;
  return null;
}

export function isCalendarEvent(event) {
  if (!event) return false;
  if (event.type === 'batch_sleeping') return false;
  const ws = getWorkflowState(event);
  if (ws === WORKFLOW.APPROVED) return true;
  if (!ws && event.status === 'confirmed') return true;
  return false;
}

export function isActiveProposalRecord(event) {
  const ws = getWorkflowState(event);
  return ws && ws !== WORKFLOW.APPROVED && ws !== WORKFLOW.ARCHIVED && isProposalType(event?.type);
}

export function findPartnerByName(config, name) {
  if (!name || !config?.partners) return null;
  return config.partners.find(p => p.name === name)
    || config.partners.find(p => p.name.split(' ')[0] === name.split(' ')[0]);
}

export function isPassivePerson(name, config) {
  const partner = findPartnerByName(config, name);
  return partner ? isPartnerPassive(partner) : false;
}

export function normalizeParticipantRoles(participants, config, proposalType = 'event') {
  if (!participants) return [];

  if (Array.isArray(participants) && participants.length && typeof participants[0] === 'object' && participants[0].name) {
    return participants.map(p => ({
      name: p.name,
      role: isPassivePerson(p.name, config) ? 'optional' : (p.role === 'optional' ? 'optional' : 'required')
    }));
  }

  const names = Array.isArray(participants) ? participants : [];
  return names.map(name => {
    if (isPassivePerson(name, config)) {
      return { name, role: 'optional' };
    }
    const sleepingTypes = proposalType === 'sleeping' || proposalType === 'batch_sleeping';
    const partner = findPartnerByName(config, name);
    const isSleepingPartner = sleepingTypes && partner?.rules?.partnerLimits && Object.keys(partner.rules.partnerLimits).length > 0;
    return { name, role: isSleepingPartner ? 'required' : 'required' };
  });
}

export function participantNames(participantRoles) {
  return (participantRoles || []).map(p => p.name);
}

export function getRequiredVoters(participantRoles, config) {
  return (participantRoles || [])
    .filter(p => p.role === 'required' && !isPassivePerson(p.name, config))
    .map(p => p.name);
}

export function canUserSeeProposal(proposal, userName) {
  if (!userName || !proposal) return false;
  if (proposal.proposer === userName) return true;
  const names = participantNames(proposal.participantRoles || []);
  return names.some(n => n === userName || n.split(' ')[0] === userName.split(' ')[0]);
}

export function buildInitialResponses(proposerName, participantRoles, config) {
  const responses = {};
  (participantRoles || []).forEach(({ name }) => {
    if (isPassivePerson(name, config)) return;
    if (name === proposerName) {
      responses[name] = { status: 'accept', comment: 'Organizer' };
    } else {
      responses[name] = { status: 'pending', comment: '' };
    }
  });
  return responses;
}

export function allowsAbstain(proposalType) {
  return proposalType === 'event';
}

/**
 * Evaluate a PROPOSED proposal after a vote or sync.
 * Returns { transition: null | 'approved' | 'declined', declinedBy?: string }
 */
export function evaluateProposedProposal(proposal, config) {
  if (getWorkflowState(proposal) !== WORKFLOW.PROPOSED) {
    return { transition: null };
  }

  const requiredVoters = getRequiredVoters(proposal.participantRoles || [], config);
  const responses = proposal.responses || {};

  for (const name of requiredVoters) {
    if (responses[name]?.status === 'reject') {
      return { transition: 'declined', declinedBy: name };
    }
  }

  const allSatisfied = requiredVoters.every(name => {
    const vote = responses[name]?.status;
    if (!vote || vote === 'pending') return false;
    if (allowsAbstain(proposal.type)) {
      return vote === 'accept' || vote === 'abstain';
    }
    return vote === 'accept';
  });

  if (allSatisfied && requiredVoters.length > 0) {
    return { transition: 'approved' };
  }

  return { transition: null };
}

/** Legacy outcome helper used by tests and UI; delegates to evaluateProposedProposal. */
export function getProposalOutcome(responses = {}, proposalType = 'event', participantRoles = null, config = null) {
  const roles = participantRoles || Object.keys(responses || {}).map(name => ({ name, role: 'required' }));
  const proposal = {
    type: proposalType,
    workflowState: WORKFLOW.PROPOSED,
    responses: responses || {},
    participantRoles: roles
  };
  const result = evaluateProposedProposal(proposal, config || { partners: [] });
  if (result.transition === 'approved') return 'confirmed';
  if (result.transition === 'declined') return 'rejected';

  const entries = Object.entries(responses || {});
  if (entries.length === 0) return 'pending';
  if (entries.some(([, r]) => r.status === 'pending')) return 'pending';
  return 'pending';
}

export function migrateEventRecord(event, config) {
  if (!event || !isProposalType(event.type)) return event;

  if (!event.workflowState) {
    if (event.status === 'confirmed') event.workflowState = WORKFLOW.APPROVED;
    else if (event.status === 'rejected') event.workflowState = WORKFLOW.DECLINED;
    else if (event.status === 'pending') event.workflowState = WORKFLOW.PROPOSED;
  }

  if (!event.participantRoles) {
    const names = Array.isArray(event.participants) ? event.participants : [];
    event.participantRoles = normalizeParticipantRoles(names, config, event.type);
  }

  if (!event.revision) event.revision = 1;

  if (event.workflowState === WORKFLOW.APPROVED && event.status !== 'confirmed' && event.type !== 'batch_sleeping') {
    event.status = 'confirmed';
  }

  return event;
}

export function migrateEvents(events, config) {
  return (events || []).map(e => migrateEventRecord({ ...e }, config));
}

export function computeAutoArchiveAt(approvedAt, days = getAutoArchiveDays()) {
  if (!approvedAt || days <= 0) return null;
  const d = new Date(approvedAt);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

export function filterProposalsForTab(events, tab, userName, config) {
  return (events || []).filter(e => {
    if (!isProposalType(e.type)) return false;
    if (!canUserSeeProposal(e, userName)) return false;
    const ws = getWorkflowState(e);
    if (tab === 'drafts') return ws === WORKFLOW.DRAFT && e.proposer === userName;
    if (tab === 'proposed') return ws === WORKFLOW.PROPOSED;
    if (tab === 'approved') return ws === WORKFLOW.APPROVED;
    if (tab === 'archived') return ws === WORKFLOW.ARCHIVED;
    if (tab === 'declined') return ws === WORKFLOW.DECLINED;
    return false;
  });
}

export function cloneProposalAsDraft(source, config) {
  const id = `prop_${Date.now()}`;
  const participantRoles = (source.participantRoles || []).map(p => ({ ...p }));
  return {
    ...JSON.parse(JSON.stringify(source)),
    id,
    parentProposalId: source.id,
    workflowState: WORKFLOW.DRAFT,
    status: 'draft',
    revision: (source.revision || 1) + 1,
    responses: {},
    approvedAt: null,
    archivedAt: null,
    autoArchiveAt: null,
    expandedEventIds: [],
    participantRoles
  };
}
