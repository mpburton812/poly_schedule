import {
  WORKFLOW,
  normalizeParticipantRoles,
  participantNames,
  buildInitialResponses,
  getWorkflowState,
  cloneProposalAsDraft,
  evaluateProposedProposal,
  computeAutoArchiveAt,
  getAutoArchiveDays,
  resolveParticipantRoleName
} from './proposal-workflow.js';
import { findPartnerByRef, partnerRefsMatch } from './helpers.js';
import {
  isRecurrenceInstance,
  getFutureRecurrenceInstances
} from './recurrence.js';

export const ProposalManager = {
  async createDraft(context, proposalData) {
    const draft = {
      ...proposalData,
      id: proposalData.id || `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      workflowState: WORKFLOW.DRAFT,
      status: 'draft',
      revision: proposalData.revision || 1,
      responses: {},
      approvedAt: null,
      archivedAt: null,
      autoArchiveAt: null,
      expandedEventIds: []
    };
    if (!draft.participantRoles && draft.participants) {
      draft.participantRoles = normalizeParticipantRoles(draft.participants, context.config, draft.type);
    }
    draft.participants = participantNames(draft.participantRoles || []);
    return context.createEvent(draft);
  },

  async saveDraft(context, eventId, draftData) {
    const idx = context.events.findIndex(e => e.id === eventId);
    if (idx === -1) throw new Error('Draft not found');
    if (getWorkflowState(context.events[idx]) !== WORKFLOW.DRAFT) {
      throw new Error('Only drafts can be auto-saved');
    }
    const updated = {
      ...context.events[idx],
      ...draftData,
      workflowState: WORKFLOW.DRAFT,
      status: 'draft'
    };
    if (draftData.participantRoles) {
      updated.participants = participantNames(draftData.participantRoles);
    }
    return context.updateEvent(eventId, updated, { skipWorkflow: true });
  },

  async submitProposal(context, eventId, options = {}) {
    const idx = context.events.findIndex(e => e.id === eventId);
    if (idx === -1) throw new Error('Proposal not found');
    const event = context.events[idx];
    if (getWorkflowState(event) !== WORKFLOW.DRAFT) {
      throw new Error('Only drafts can be submitted');
    }

    const submittedBy = options.submittedBy || null;
    const participantRoles = event.participantRoles || normalizeParticipantRoles(event.participants, context.config, event.type);
    const responses = buildInitialResponses(event.proposer, participantRoles, context.config, submittedBy);

    return context.updateEvent(eventId, {
      workflowState: WORKFLOW.PROPOSED,
      status: 'pending',
      participantRoles,
      participants: participantNames(participantRoles),
      responses,
      submittedBy,
      submittedAt: new Date().toISOString()
    });
  },

  async retractProposal(context, eventId) {
    const event = context.events.find(e => e.id === eventId);
    if (!event || getWorkflowState(event) !== WORKFLOW.PROPOSED) {
      throw new Error('Only proposed items can be retracted');
    }
    return context.updateEvent(eventId, {
      workflowState: WORKFLOW.DRAFT,
      status: 'draft',
      responses: {},
      submittedAt: null,
      declinedBy: null,
      declinedAt: null
    }, { skipWorkflow: true });
  },

  async cancelProposal(context, eventId, reason = '') {
    return this.deleteProposal(context, eventId, reason || 'Cancelled by proposer');
  },

  async deleteProposal(context, eventId, reason = '') {
    const event = context.events.find(e => e.id === eventId);
    if (!event) return;
    await context.deleteEvent(eventId);
    return { deleted: true, reason, title: event.title };
  },

  async reopenDeclinedProposal(context, eventId) {
    const event = context.events.find(e => e.id === eventId);
    if (!event || getWorkflowState(event) !== WORKFLOW.DECLINED) {
      throw new Error('Only declined proposals can be reopened');
    }
    const draft = cloneProposalAsDraft(event, context.config);
    await context.deleteEvent(eventId);
    return context.createEvent(draft);
  },

  async redraftApprovedEvent(context, eventId, redraftedByRef, options = {}) {
    const event = context.events.find(e => e.id === eventId);
    if (!event) throw new Error('Event not found');

    const ws = getWorkflowState(event);
    if (ws !== WORKFLOW.APPROVED && ws !== WORKFLOW.ARCHIVED) {
      throw new Error('Only approved or archived events can be re-drafted');
    }

    const targets = options.scope === 'future' && isRecurrenceInstance(event)
      ? getFutureRecurrenceInstances(context.events, event)
      : [event];

    let lastDraft = null;
    for (const target of targets) {
      const updates = {
        workflowState: WORKFLOW.DRAFT,
        status: 'draft',
        responses: {},
        submittedAt: null,
        submittedBy: null,
        approvedAt: null,
        archivedAt: null,
        autoArchiveAt: null,
        declinedBy: null,
        declinedAt: null,
        recurrenceSeriesId: null,
        recurrenceInstanceIndex: null,
        recurrenceInstanceDate: null
      };

      const redrafterName = typeof redraftedByRef === 'string' && !String(redraftedByRef).startsWith('p')
        ? redraftedByRef
        : findPartnerByRef(context.config, redraftedByRef)?.name;
      if (redrafterName && !partnerRefsMatch(context.config, target.proposer, redrafterName)) {
        updates.proposer = redrafterName;
      }

      lastDraft = await context.updateEvent(target.id, updates, { skipWorkflow: true });
    }

    if (options.scope === 'future' && isRecurrenceInstance(event)) {
      const parent = context.events.find(e => e.id === event.recurrenceSeriesId);
      if (parent?.expandedEventIds?.length) {
        const removedIds = new Set(targets.map(t => t.id));
        const remaining = parent.expandedEventIds.filter(id => !removedIds.has(id));
        await context.updateEvent(parent.id, { expandedEventIds: remaining }, { skipWorkflow: true });
      }
    }

    return lastDraft;
  },

  async archiveProposal(context, eventId) {
    const event = context.events.find(e => e.id === eventId);
    if (!event || getWorkflowState(event) !== WORKFLOW.APPROVED) {
      throw new Error('Only approved proposals can be archived');
    }
    return context.updateEvent(eventId, {
      workflowState: WORKFLOW.ARCHIVED,
      archivedAt: new Date().toISOString()
    }, { skipWorkflow: true });
  },

  async submitProposalVote(context, eventId, voterRef, vote, comment = '') {
    const event = context.events.find(e => e.id === eventId);
    if (!event) throw new Error('Proposal not found');

    const responseKey = resolveParticipantRoleName(context.config, voterRef, event.participantRoles)
      || findPartnerByRef(context.config, voterRef)?.name;
    if (!responseKey) throw new Error('Voter is not a participant on this proposal');

    const responses = { ...(event.responses || {}) };
    responses[responseKey] = {
      status: vote,
      comment: (comment || '').trim()
    };
    return context.updateEvent(eventId, { responses });
  },

  applyWorkflowEvaluation(context, event) {
    if (getWorkflowState(event) !== WORKFLOW.PROPOSED) return event;

    const result = evaluateProposedProposal(event, context.config);
    if (result.transition === 'declined') {
      event.workflowState = WORKFLOW.DECLINED;
      event.status = 'rejected';
      event.declinedBy = result.declinedBy;
      event.declinedAt = new Date().toISOString();
    } else if (result.transition === 'approved') {
      event.workflowState = WORKFLOW.APPROVED;
      event.status = 'confirmed';
      event.approvedAt = new Date().toISOString();
      event.autoArchiveAt = computeAutoArchiveAt(event.approvedAt, getAutoArchiveDays());
      if (event.type === 'sleeping') {
        event.title = `SLEEP: ${event.roomName}: ${(event.participants || []).join(' & ')}`;
      }
    }
    return event;
  },

  syncProposalStatuses(context) {
    const changedIds = [];
    context.events.forEach(event => {
      if (getWorkflowState(event) !== WORKFLOW.PROPOSED) return;
      const before = event.workflowState;
      this.applyWorkflowEvaluation(context, event);
      if (event.workflowState !== before) changedIds.push(event.id);
    });
    if (changedIds.length) context.persistEvents(changedIds);
  },

  async syncProposalStatusesAsync(context) {
    const changedIds = [];
    context.events.forEach(event => {
      if (getWorkflowState(event) !== WORKFLOW.PROPOSED) return;
      const before = event.workflowState;
      this.applyWorkflowEvaluation(context, event);
      if (event.workflowState !== before) changedIds.push(event.id);
    });
    if (!changedIds.length) return;
    if (context.mode === 'offline') {
      context.persistEvents(changedIds);
      return;
    }
    for (const id of changedIds) {
      await context.updateEvent(id, {}, { skipWorkflow: true });
    }
  },

  processAutoArchive(context) {
    const days = getAutoArchiveDays();
    if (days <= 0) return;
    const now = Date.now();
    const changedIds = [];
    context.events.forEach(event => {
      if (getWorkflowState(event) !== WORKFLOW.APPROVED) return;
      const computed = event.autoArchiveAt || computeAutoArchiveAt(event.approvedAt, days);
      const archiveAt = computed ? new Date(computed).getTime() : null;
      if (archiveAt && now >= archiveAt) {
        event.workflowState = WORKFLOW.ARCHIVED;
        event.archivedAt = new Date().toISOString();
        changedIds.push(event.id);
      }
    });
    if (changedIds.length) context.persistEvents(changedIds);
  },

  async processAutoArchiveAsync(context) {
    const days = getAutoArchiveDays();
    if (days <= 0) return;
    const now = Date.now();
    const changedIds = [];
    context.events.forEach(event => {
      if (getWorkflowState(event) !== WORKFLOW.APPROVED) return;
      const computed = event.autoArchiveAt || computeAutoArchiveAt(event.approvedAt, days);
      const archiveAt = computed ? new Date(computed).getTime() : null;
      if (archiveAt && now >= archiveAt) {
        event.workflowState = WORKFLOW.ARCHIVED;
        event.archivedAt = new Date().toISOString();
        changedIds.push(event.id);
      }
    });
    if (!changedIds.length) return;
    if (context.mode === 'offline') {
      context.persistEvents(changedIds);
      return;
    }
    for (const id of changedIds) {
      const event = context.events.find(e => e.id === id);
      if (event) await context.updateGCalEvent(id, event);
    }
  }
};
