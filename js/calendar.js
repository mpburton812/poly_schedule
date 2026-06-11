/**
 * PolySchedule Google Calendar & State Manager
 * Synchronizes local state with Google Calendar events or provides offline localStorage mock sync.
 */

import {
  renamePartnerReferences,
  expandBatchSleepingToEvents,
  dedupeDuplicateSleepingEvents,
  reconcileBatchExpandedIds,
  removePartnerReferences,
  removeHomeReferences,
  normalizeConfigPartners,
  syncAllHomeAssociationDefaults,
  findPartnerByRef,
  LOCAL_CONFIG_KEY,
  LOCAL_EVENTS_KEY
} from './helpers.js';
import {
  WORKFLOW,
  migrateEvents,
  evaluateProposedProposal,
  computeAutoArchiveAt,
  getAutoArchiveDays,
  buildInitialResponses,
  normalizeParticipantRoles,
  participantNames,
  cloneProposalAsDraft,
  getWorkflowState,
  isCalendarEvent,
  resolveParticipantRoleName
} from './proposal-workflow.js';
import {
  GCAL_CONFIG_SUMMARY,
  googleApiErrorFromResponse,
  parseGCalEventItem,
  formatGCalResource as buildGCalResource,
  isLocalEventId,
  shouldSyncEventToGCal,
  shouldRemoveEventFromGCal,
  shouldAttemptGCalDelete,
  mergeGCalWithLocalEvents
} from './gcal-sync.js';
import {
  needsGCalAlignment,
  markGCalAligned,
  collectEventsToSync,
  collectOrphanGCalIds,
  findMatchingSleepingEvent
} from './gcal-align.js';

import { flowState } from './app/state.js';

const EMPTY_HOUSEHOLD = {
  residences: [],
  partners: []
};

function createEmptyHousehold() {
  return JSON.parse(JSON.stringify(EMPTY_HOUSEHOLD));
}

export const CalendarSync = {
  calendarId: localStorage.getItem('polyschedule_calendar_id') || 'primary',
  events: [],
  config: null,
  mode: 'offline', // 'offline' or 'sync'
  accessToken: '',
  apiKey: '',
  onStateUpdate: null,

  async init(mode, credentials, onUpdateCallback) {
    this.mode = mode;
    this.onStateUpdate = onUpdateCallback;
    
    if (credentials) {
      this.accessToken = credentials.accessToken || '';
      this.apiKey = credentials.apiKey || '';
      this.calendarId = localStorage.getItem('polyschedule_calendar_id') || 'primary';
    }

    // Load Configuration
    await this.loadConfig();
    
    // Load Events
    await this.loadEvents();

    if (this.mode === 'sync' && needsGCalAlignment()) {
      return this.alignGoogleCalendarOnce();
    }
    return null;
  },

  async loadConfig() {
    if (this.mode === 'offline') {
      const saved = localStorage.getItem(LOCAL_CONFIG_KEY);
      if (saved) {
        this.config = JSON.parse(saved);
      } else {
        this.config = createEmptyHousehold();
        localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
      }
    } else {
      // Fetch Config from Google Calendar configuration event description
      try {
        const configEvent = await this.findGCalConfigEvent();
        if (configEvent && configEvent.description) {
          this.config = JSON.parse(configEvent.description);
        } else {
          // Create a new config event in Google Calendar
          this.config = createEmptyHousehold();
          await this.saveGCalConfigEvent(this.config);
          return;
        }
      } catch (e) {
        console.error('Failed to load config from GCal, falling back to local', e);
        this.config = createEmptyHousehold();
      }
    }

    const syncMod = await import('./household-sync.js');
    const identityChanged = syncMod.ensureHouseholdIdentity(this.config);
    if (this.config?.syncRevision != null) {
      localStorage.setItem('polyschedule_last_sync_revision', String(this.config.syncRevision));
    }
    if (identityChanged) {
      if (this.mode === 'offline') {
        localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
      } else {
        try {
          await this.saveGCalConfigEvent(this.config);
          localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
        } catch (e) {
          console.warn('[sync] Failed to persist household identity to GCal', e);
        }
      }
    }

    await this.normalizeAndPersistConfig();

    const { applySyncedAdminSettingsFromConfig } = await import('./household-config-apply.js');
    applySyncedAdminSettingsFromConfig(this.config, { CalendarSync: this });
  },

  async normalizeAndPersistConfig() {
    let changed = normalizeConfigPartners(this.config, EMPTY_HOUSEHOLD);
    if (syncAllHomeAssociationDefaults(this.config)) changed = true;
    if (!changed) return;

    if (this.mode === 'offline') {
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
      return;
    }

    try {
      await this.saveGCalConfigEvent(this.config);
    } catch (e) {
      console.error('Failed to persist normalized config to Google Calendar', e);
    }
  },

  async saveConfig(newConfig) {
    const syncMod = await import('./household-sync.js');
    const { canWriteToGoogleCalendar } = await import('./gcal-sync.js');
    syncMod.ensureHouseholdIdentity(newConfig);
    syncMod.bumpSyncRevision(newConfig);

    this.config = newConfig;
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(newConfig));

    let gcalSynced = false;
    let needsAuth = false;

    if (canWriteToGoogleCalendar(this)) {
      try {
        await this.saveGCalConfigEvent(newConfig);
        gcalSynced = true;
      } catch (e) {
        if (e.code === 'GOOGLE_AUTH_EXPIRED' || e.status === 401) {
          console.warn('[GCal] Config saved locally; Google sign-in required to sync.', e);
          needsAuth = true;
        } else {
          console.error('Failed to save config to GCal', e);
          throw e;
        }
      }
    } else if (this.mode === 'sync') {
      needsAuth = true;
    }

    if (
      gcalSynced
      || (syncMod.isSyncHubConfigured() && localStorage.getItem('polyschedule_mode') === 'sync')
    ) {
      try {
        await syncMod.afterHouseholdWrite(['config'], {
          config: newConfig,
          events: this.events,
          revision: newConfig.syncRevision
        });
      } catch (err) {
        console.warn('[sync] Failed to notify after config save', err);
      }
    }

    if (this.onStateUpdate) {
      this.onStateUpdate();
    }

    return { gcalSynced, needsAuth };
  },

  async loadEvents() {
    if (this.mode === 'offline') {
      const saved = localStorage.getItem(LOCAL_EVENTS_KEY);
      if (saved) {
        this.events = JSON.parse(saved);
      } else {
        this.events = [];
        localStorage.setItem(LOCAL_EVENTS_KEY, '[]');
      }
      this.migrateAndNormalizeEvents();
    } else {
      try {
        const gcalEvents = await this.fetchGCalEvents();
        const localEvents = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]');
        this.events = mergeGCalWithLocalEvents(gcalEvents, localEvents);
        this.migrateAndNormalizeEvents();
      } catch (e) {
        console.error('Failed to fetch events from GCal, falling back to local storage', e);
        this.events = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]');
        this.migrateAndNormalizeEvents();
      }
    }

    if (this.mode === 'offline') {
      this.syncProposalStatuses();
      this.processAutoArchive();
    } else {
      await this.syncProposalStatusesAsync();
      await this.processAutoArchiveAsync();
    }
    
    if (this.onStateUpdate) {
      this.onStateUpdate();
    }
  },

  migrateAndNormalizeEvents() {
    const before = JSON.stringify(this.events);
    this.events = migrateEvents(this.events, this.config);
    const { events: deduped, removedIds } = dedupeDuplicateSleepingEvents(this.events);
    this.events = deduped;
    reconcileBatchExpandedIds(this.events);
    if (before !== JSON.stringify(this.events)) {
      this.persistEvents();
      if (this.mode === 'sync' && removedIds.length) {
        removedIds.forEach(id => {
          this.deleteGCalEvent(id).catch(err =>
            console.error('Failed to delete duplicate calendar event', id, err)
          );
        });
      }
    }
  },

  async materializeApprovedBatchChildren(stats = null) {
    for (const batch of this.events.filter(e => e.type === 'batch_sleeping' && getWorkflowState(e) === WORKFLOW.APPROVED)) {
      if ((batch.expandedEventIds || []).length > 0) continue;
      if (!batch.batchNights?.length) continue;

      const expanded = expandBatchSleepingToEvents(batch);
      expanded.forEach(e => {
        e.status = 'confirmed';
        e.workflowState = WORKFLOW.APPROVED;
      });
      batch.status = 'confirmed';
      batch.expandedEventIds = [];

      for (const child of expanded) {
        const existing = findMatchingSleepingEvent(this.events, child);
        if (existing) {
          batch.expandedEventIds.push(existing.id);
          continue;
        }

        if (this.mode === 'sync') {
          const created = await this.createGCalEvent(child);
          child.id = created.id;
        }
        batch.expandedEventIds.push(child.id);
        this.events.push(child);
        if (stats) stats.materialized += 1;
      }
    }
    reconcileBatchExpandedIds(this.events);
  },

  async alignGoogleCalendarOnce() {
    const stats = { deleted: 0, upserted: 0, materialized: 0 };

    try {
      const rawItems = await this.fetchGCalEventItems({ daysBack: 180, daysForward: 365 });
      await this.materializeApprovedBatchChildren(stats);

      const keepMap = collectEventsToSync(this.events);
      const keepIds = new Set(keepMap.keys());
      const deleteIds = collectOrphanGCalIds(rawItems, keepIds);

      for (const id of deleteIds) {
        await this.deleteGCalEvent(id);
        stats.deleted += 1;
      }

      for (const [eventId, event] of keepMap) {
        const result = await this.upsertGCalEvent(eventId, event);
        stats.upserted += 1;
        if (result.id !== eventId) {
          this.remapEventId(eventId, result.id, { ...event, id: result.id });
        }
      }

      reconcileBatchExpandedIds(this.events);
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));
      markGCalAligned();

      if (this.onStateUpdate) this.onStateUpdate();
    } catch (err) {
      console.error('Google Calendar alignment failed', err);
      throw err;
    }

    return stats;
  },

  persistLocalEventsMirror() {
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));
  },

  persistEvents(eventIds = null) {
    if (this.mode === 'offline') {
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));
      return;
    }
    const ids = eventIds || this.events.map(e => e.id);
    void this.syncEventsToGCal(ids);
  },

  async syncEventsToGCal(eventIds) {
    await Promise.all((eventIds || []).map(async (id) => {
      const event = this.events.find(e => e.id === id);
      if (!event || !shouldSyncEventToGCal(event)) return;
      await this.upsertGCalEvent(id, event);
    }));
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));

    try {
      const syncMod = await import('./household-sync.js');
      if (this.config) {
        syncMod.bumpSyncRevision(this.config);
        await this.saveGCalConfigEvent(this.config);
        localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
      }
      await syncMod.afterHouseholdWrite(['events', 'config'], {
        config: this.config,
        events: this.events,
        revision: this.config?.syncRevision
      });
    } catch (err) {
      console.warn('[sync] Failed to notify after event sync', err);
    }
  },

  /** Create or update a GCal event; remaps local prop_/e_ ids to Google ids. */
  async upsertGCalEvent(eventId, event) {
    if (!shouldSyncEventToGCal(event)) {
      return { id: eventId, created: false, skipped: true };
    }

    if (isLocalEventId(eventId)) {
      const created = await this.createGCalEvent(event);
      return { id: created.id, created: true };
    }

    const resource = this.formatGCalResource(event);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}?key=${this.apiKey}`;
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resource)
    });

    if (res.ok) {
      return { id: eventId, created: false };
    }
    if (res.status === 404) {
      const created = await this.createGCalEvent(event);
      return { id: created.id, created: true };
    }
    throw new Error('Failed to update calendar event on Google Calendar');
  },

  /** Replace a local event id with the Google Calendar id after first sync. */
  remapEventId(oldId, newId, updatedEvent) {
    const idx = this.events.findIndex(e => e.id === oldId);
    if (idx === -1) return;
    updatedEvent.id = newId;
    this.events[idx] = updatedEvent;
    if (flowState.currentDraftId === oldId) {
      flowState.currentDraftId = newId;
    }
  },

  applyWorkflowEvaluation(event) {
    if (getWorkflowState(event) !== WORKFLOW.PROPOSED) return event;

    const result = evaluateProposedProposal(event, this.config);
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

  syncProposalStatuses() {
    const changedIds = [];
    this.events.forEach(event => {
      if (getWorkflowState(event) !== WORKFLOW.PROPOSED) return;
      const before = event.workflowState;
      this.applyWorkflowEvaluation(event);
      if (event.workflowState !== before) changedIds.push(event.id);
    });
    if (changedIds.length) this.persistEvents(changedIds);
  },

  async syncProposalStatusesAsync() {
    const changedIds = [];
    this.events.forEach(event => {
      if (getWorkflowState(event) !== WORKFLOW.PROPOSED) return;
      const before = event.workflowState;
      this.applyWorkflowEvaluation(event);
      if (event.workflowState !== before) changedIds.push(event.id);
    });
    if (!changedIds.length) return;
    if (this.mode === 'offline') {
      this.persistEvents(changedIds);
      return;
    }
    for (const id of changedIds) {
      await this.updateEvent(id, {}, { skipWorkflow: true });
    }
  },

  processAutoArchive() {
    const days = getAutoArchiveDays();
    if (days <= 0) return;
    const now = Date.now();
    const changedIds = [];
    this.events.forEach(event => {
      if (getWorkflowState(event) !== WORKFLOW.APPROVED) return;
      const archiveAt = event.autoArchiveAt
        ? new Date(event.autoArchiveAt).getTime()
        : computeAutoArchiveAt(event.approvedAt, days)
          ? new Date(computeAutoArchiveAt(event.approvedAt, days)).getTime()
          : null;
      if (archiveAt && now >= archiveAt) {
        event.workflowState = WORKFLOW.ARCHIVED;
        event.archivedAt = new Date().toISOString();
        changedIds.push(event.id);
      }
    });
    if (changedIds.length) this.persistEvents(changedIds);
  },

  async processAutoArchiveAsync() {
    const days = getAutoArchiveDays();
    if (days <= 0) return;
    const now = Date.now();
    const changedIds = [];
    this.events.forEach(event => {
      if (getWorkflowState(event) !== WORKFLOW.APPROVED) return;
      const archiveAt = event.autoArchiveAt
        ? new Date(event.autoArchiveAt).getTime()
        : computeAutoArchiveAt(event.approvedAt, days)
          ? new Date(computeAutoArchiveAt(event.approvedAt, days)).getTime()
          : null;
      if (archiveAt && now >= archiveAt) {
        event.workflowState = WORKFLOW.ARCHIVED;
        event.archivedAt = new Date().toISOString();
        changedIds.push(event.id);
      }
    });
    if (!changedIds.length) return;
    if (this.mode === 'offline') {
      this.persistEvents(changedIds);
      return;
    }
    for (const id of changedIds) {
      const event = this.events.find(e => e.id === id);
      if (event) await this.updateGCalEvent(id, event);
    }
  },

  async createDraft(proposalData) {
    const draft = {
      ...proposalData,
      id: proposalData.id || `prop_${Date.now()}`,
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
      draft.participantRoles = normalizeParticipantRoles(draft.participants, this.config, draft.type);
    }
    draft.participants = participantNames(draft.participantRoles || []);
    return this.createEvent(draft);
  },

  async saveDraft(eventId, draftData) {
    const idx = this.events.findIndex(e => e.id === eventId);
    if (idx === -1) throw new Error('Draft not found');
    if (getWorkflowState(this.events[idx]) !== WORKFLOW.DRAFT) {
      throw new Error('Only drafts can be auto-saved');
    }
    const updated = {
      ...this.events[idx],
      ...draftData,
      workflowState: WORKFLOW.DRAFT,
      status: 'draft'
    };
    if (draftData.participantRoles) {
      updated.participants = participantNames(draftData.participantRoles);
    }
    return this.updateEvent(eventId, updated, { skipWorkflow: true });
  },

  async submitProposal(eventId, options = {}) {
    const idx = this.events.findIndex(e => e.id === eventId);
    if (idx === -1) throw new Error('Proposal not found');
    const event = this.events[idx];
    const ws = getWorkflowState(event);
    if (ws !== WORKFLOW.DRAFT) {
      throw new Error('Only drafts can be submitted');
    }

    const submittedBy = options.submittedBy || null;
    const participantRoles = event.participantRoles || normalizeParticipantRoles(event.participants, this.config, event.type);
    const responses = buildInitialResponses(event.proposer, participantRoles, this.config, submittedBy);

    return this.updateEvent(eventId, {
      workflowState: WORKFLOW.PROPOSED,
      status: 'pending',
      participantRoles,
      participants: participantNames(participantRoles),
      responses,
      submittedBy,
      submittedAt: new Date().toISOString()
    });
  },

  async retractProposal(eventId) {
    const event = this.events.find(e => e.id === eventId);
    if (!event || getWorkflowState(event) !== WORKFLOW.PROPOSED) {
      throw new Error('Only proposed items can be retracted');
    }
    return this.updateEvent(eventId, {
      workflowState: WORKFLOW.DRAFT,
      status: 'draft',
      responses: {},
      submittedAt: null,
      declinedBy: null,
      declinedAt: null
    }, { skipWorkflow: true });
  },

  async cancelProposal(eventId, reason = '') {
    return this.deleteProposal(eventId, reason || 'Cancelled by proposer');
  },

  async deleteProposal(eventId, reason = '') {
    const event = this.events.find(e => e.id === eventId);
    if (!event) return;
    await this.deleteEvent(eventId);
    return { deleted: true, reason, title: event.title };
  },

  async reopenDeclinedProposal(eventId) {
    const event = this.events.find(e => e.id === eventId);
    if (!event || getWorkflowState(event) !== WORKFLOW.DECLINED) {
      throw new Error('Only declined proposals can be reopened');
    }
    const draft = cloneProposalAsDraft(event, this.config);
    await this.deleteEvent(eventId);
    return this.createEvent(draft);
  },

  async archiveProposal(eventId) {
    const event = this.events.find(e => e.id === eventId);
    if (!event || getWorkflowState(event) !== WORKFLOW.APPROVED) {
      throw new Error('Only approved proposals can be archived');
    }
    return this.updateEvent(eventId, {
      workflowState: WORKFLOW.ARCHIVED,
      archivedAt: new Date().toISOString()
    }, { skipWorkflow: true });
  },

  applyProposalOutcome(event) {
    return this.applyWorkflowEvaluation(event);
  },

  async submitProposalVote(eventId, voterRef, vote, comment = '') {
    const event = this.events.find(e => e.id === eventId);
    if (!event) throw new Error('Proposal not found');

    const responseKey = resolveParticipantRoleName(this.config, voterRef, event.participantRoles)
      || findPartnerByRef(this.config, voterRef)?.name;
    if (!responseKey) throw new Error('Voter is not a participant on this proposal');

    const responses = { ...(event.responses || {}) };
    responses[responseKey] = {
      status: vote,
      comment: (comment || '').trim()
    };
    return this.updateEvent(eventId, { responses });
  },

  renamePartnerInEvents(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    renamePartnerReferences(this.config, this.events, oldName, newName);
    if (this.mode === 'sync') {
      this.saveConfig(this.config).catch(err => console.error('Failed to save config to GCal', err));
      this.syncEventsToGCal(this.events.map(e => e.id));
    } else {
      this.persistEvents();
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
    }
  },

  removePartner(partnerId) {
    const partner = this.config?.partners?.find(p => p.id === partnerId);
    if (!partner) return false;
    removePartnerReferences(this.config, this.events, partnerId, partner.name);
    this.config.partners = this.config.partners.filter(p => p.id !== partnerId);
    if (this.mode === 'sync') {
      this.saveConfig(this.config).catch(err => console.error('Failed to save config to GCal', err));
      this.syncEventsToGCal(this.events.map(e => e.id));
    } else {
      this.persistEvents();
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
    }
    if (this.onStateUpdate) this.onStateUpdate();
    return true;
  },

  removeHome(homeId) {
    const home = this.config?.residences?.find(h => h.id === homeId);
    if (!home) return false;
    removeHomeReferences(this.config, this.events, homeId);
    this.config.residences = this.config.residences.filter(h => h.id !== homeId);
    if (this.mode === 'sync') {
      this.saveConfig(this.config).catch(err => console.error('Failed to save config to GCal', err));
      this.syncEventsToGCal(this.events.map(e => e.id));
    } else {
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
    }
    if (this.onStateUpdate) this.onStateUpdate();
    return true;
  },

  // --- CRUD Operations ---

  async createEvent(eventData) {
    const newEvent = {
      ...eventData,
      id: eventData.id || 'e_' + Date.now()
    };

    if (this.mode === 'offline') {
      this.events.push(newEvent);
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));
    } else if (!shouldSyncEventToGCal(newEvent)) {
      this.events.push(newEvent);
      this.persistLocalEventsMirror();
    } else {
      try {
        const created = await this.createGCalEvent(newEvent);
        newEvent.id = created.id; // Map back the Google Calendar Event ID
        this.events.push(newEvent);
        this.persistLocalEventsMirror();
      } catch (e) {
        console.error('Failed to sync created event to Google Calendar', e);
        throw e;
      }
    }

    if (this.onStateUpdate) this.onStateUpdate();
    return newEvent;
  },

  async updateEvent(eventId, updatedData, options = {}) {
    const idx = this.events.findIndex(e => e.id === eventId);
    if (idx === -1) return;

    const updated = { ...this.events[idx], ...updatedData };

    if (!options.skipWorkflow && getWorkflowState(updated) === WORKFLOW.PROPOSED) {
      this.applyWorkflowEvaluation(updated);
    }

    if (getWorkflowState(updated) === WORKFLOW.APPROVED && updated.type === 'batch_sleeping') {
      const priorExpanded = this.events[idx].expandedEventIds || [];
      if (priorExpanded.length > 0) {
        updated.expandedEventIds = priorExpanded;
      } else {
      const expanded = expandBatchSleepingToEvents(updated);
      expanded.forEach(e => {
        e.status = 'confirmed';
        e.workflowState = WORKFLOW.APPROVED;
      });
      updated.status = 'confirmed';
      updated.expandedEventIds = [];

      if (this.mode === 'sync') {
        try {
          if (!isLocalEventId(eventId)) {
            await this.deleteGCalEvent(eventId);
          }
          for (const child of expanded) {
            const created = await this.createGCalEvent(child);
            child.id = created.id;
            updated.expandedEventIds.push(created.id);
            this.events.push(child);
          }
          this.events[idx] = updated;
        } catch (e) {
          console.error('Failed to sync batch sleeping expansion to Google Calendar', e);
          throw e;
        }
      } else {
        updated.expandedEventIds = expanded.map(e => e.id);
        this.events[idx] = updated;
        this.events.push(...expanded);
        this.persistEvents();
      }

      if (this.onStateUpdate) this.onStateUpdate();
      return { parent: updated, expanded };
      }
    }

    if (this.mode === 'offline') {
      this.events[idx] = updated;
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));
    } else if (shouldRemoveEventFromGCal(updated)) {
      if (shouldAttemptGCalDelete(eventId)) {
        try {
          await this.deleteGCalEvent(eventId);
        } catch (e) {
          console.error('Failed to remove calendar event from Google Calendar', e);
          throw e;
        }
      }
      this.events[idx] = updated;
      this.persistLocalEventsMirror();
    } else if (!shouldSyncEventToGCal(updated)) {
      this.events[idx] = updated;
      this.persistLocalEventsMirror();
    } else {
      try {
        const { id: syncedId } = await this.upsertGCalEvent(eventId, updated);
        if (syncedId !== eventId) {
          this.remapEventId(eventId, syncedId, updated);
        } else {
          this.events[idx] = updated;
        }
        this.persistLocalEventsMirror();
      } catch (e) {
        console.error('Failed to sync updated event to Google Calendar', e);
        throw e;
      }
    }

    if (this.onStateUpdate) this.onStateUpdate();
    return updated;
  },

  async deleteEvent(eventId) {
    const idx = this.events.findIndex(e => e.id === eventId);
    if (idx === -1) {
      throw new Error('Event not found');
    }

    const event = this.events[idx];
    const childIds = new Set(event.expandedEventIds || []);
    const idsToRemove = new Set([eventId, ...childIds]);
    const gcalIdsToDelete = [];

    if (event.type === 'batch_sleeping') {
      for (const childId of childIds) {
        if (shouldAttemptGCalDelete(childId)) gcalIdsToDelete.push(childId);
      }
      if (shouldAttemptGCalDelete(eventId)) gcalIdsToDelete.push(eventId);
    } else if (shouldAttemptGCalDelete(eventId) && (shouldSyncEventToGCal(event) || shouldRemoveEventFromGCal(event))) {
      gcalIdsToDelete.push(eventId);
    }

    if (this.mode === 'sync' && gcalIdsToDelete.length) {
      for (const id of gcalIdsToDelete) {
        try {
          await this.deleteGCalEvent(id);
        } catch (err) {
          console.error(`Failed to delete event ${id} from Google Calendar`, err);
        }
      }
    }

    this.events = this.events.filter(e => !idsToRemove.has(e.id));
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));

    if (this.onStateUpdate) this.onStateUpdate();
  },

  // --- Google Calendar REST API Calls ---

  async fetchGCalEventItems({ daysBack = 30, daysForward = 60 } = {}) {
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - daysBack);
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + daysForward);

    const items = [];
    let pageToken = null;

    do {
      const params = new URLSearchParams({
        timeMin: timeMin.toISOString(),
        timeMax: timeMax.toISOString(),
        singleEvents: 'true',
        key: this.apiKey
      });
      if (pageToken) params.set('pageToken', pageToken);

      const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?${params}`;
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });

      if (!res.ok) throw await googleApiErrorFromResponse(res, 'Failed to fetch calendar events from Google Calendar API');

      const data = await res.json();
      items.push(...(data.items || []));
      pageToken = data.nextPageToken || null;
    } while (pageToken);

    return items;
  },

  async fetchGCalEvents() {
    const items = await this.fetchGCalEventItems({ daysBack: 30, daysForward: 60 });
    this.lastFetchedGCalItems = items;
    const parsedEvents = [];

    for (const item of items) {
      const parsed = parseGCalEventItem(item);
      if (parsed) parsedEvents.push(parsed);
    }

    return parsedEvents;
  },

  async createGCalEvent(event) {
    const resource = this.formatGCalResource(event);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?key=${this.apiKey}`;
    
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resource)
    });

    if (!res.ok) throw await googleApiErrorFromResponse(res, 'Failed to create calendar event on Google Calendar');
    return await res.json();
  },

  async updateGCalEvent(eventId, event) {
    const resource = this.formatGCalResource(event);
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}?key=${this.apiKey}`;
    
    const res = await fetch(url, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resource)
    });

    if (!res.ok) throw await googleApiErrorFromResponse(res, 'Failed to update calendar event on Google Calendar');
    return await res.json();
  },

  async deleteGCalEvent(eventId) {
    if (isLocalEventId(eventId)) return;

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}?key=${this.apiKey}`;
    
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (res.status === 404 || res.status === 410) return;
    if (!res.ok) throw await googleApiErrorFromResponse(res, 'Failed to delete calendar event from Google Calendar');
  },

  formatGCalResource(event) {
    return buildGCalResource(event);
  },

  // --- Configuration Sync Event Helpers ---

  async findGCalConfigEvent() {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?q=${encodeURIComponent(GCAL_CONFIG_SUMMARY)}&key=${this.apiKey}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items || []).find(item => item.summary === GCAL_CONFIG_SUMMARY);
  },

  async saveGCalConfigEvent(configData) {
    const configEvent = await this.findGCalConfigEvent();

    const resource = {
      summary: GCAL_CONFIG_SUMMARY,
      description: JSON.stringify(configData, null, 2),
      start: {
        date: '2026-01-01' // Far past date
      },
      end: {
        date: '2026-01-02'
      },
      recurrence: ['RRULE:FREQ=DAILY;COUNT=1'] // single instance effectively
    };

    let url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?key=${this.apiKey}`;
    let method = 'POST';

    if (configEvent) {
      url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${configEvent.id}?key=${this.apiKey}`;
      method = 'PUT';
    }

    const res = await fetch(url, {
      method: method,
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(resource)
    });

    if (!res.ok) throw await googleApiErrorFromResponse(res, 'Failed to save configuration settings to Google Calendar');
  }
};
