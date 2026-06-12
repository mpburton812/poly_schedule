import {
  CALENDAR_ID_KEY,
  LOCAL_CONFIG_KEY,
  LOCAL_EVENTS_KEY
} from './storage-keys.js';
/**
 * PolySchedule Google Calendar & State Manager
 * Synchronizes local state with Google Calendar events or provides offline localStorage mock sync.
 */

import { HouseholdStore } from './household-store.js';
import { ProposalManager } from './proposal-manager.js';
import { CalendarAPI } from './gcal-api.js';

import {
  renamePartnerReferences,
  expandBatchSleepingToEvents,
  dedupeDuplicateSleepingEvents,
  reconcileBatchExpandedIds,
  removePartnerReferences,
  removeHomeReferences,
  normalizeConfigPartners,
  normalizeHouseholdConfigShape,
  pickNewerHouseholdConfig,
  syncAllHomeAssociationDefaults,
  findPartnerByRef
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

function isCacheMode(mode) {
  return mode === 'cache' || mode === 'offline';
}

export const CalendarSync = {
  calendarId: localStorage.getItem(CALENDAR_ID_KEY) || 'primary',
  events: [],
  config: null,
  mode: 'cache',
  accessToken: '',
  apiKey: '',
  onStateUpdate: null,

  async init(mode, credentials, onUpdateCallback) {
    this.mode = mode;
    this.onStateUpdate = onUpdateCallback;
    
    if (credentials) {
      this.accessToken = credentials.accessToken || '';
      this.apiKey = credentials.apiKey || '';
      this.calendarId = localStorage.getItem(CALENDAR_ID_KEY) || 'primary';
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
    this.config = await HouseholdStore.loadConfig(this);
    return this.config;
  },

  async saveConfig(newConfig) {
    const result = await HouseholdStore.saveConfig(this, newConfig, this.events);
    this.config = newConfig;
    return result;
  },

  async loadEvents() {
    if (isCacheMode(this.mode)) {
      const saved = localStorage.getItem(LOCAL_EVENTS_KEY);
      if (saved) {
        this.events = JSON.parse(saved);
      } else {
        this.events = [];
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

    if (isCacheMode(this.mode)) {
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
    if (isCacheMode(this.mode)) {
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
    return ProposalManager.applyWorkflowEvaluation(this, event);
  },

  syncProposalStatuses() {
    return ProposalManager.syncProposalStatuses(this);
  },

  async syncProposalStatusesAsync() {
    return ProposalManager.syncProposalStatusesAsync(this);
  },

  processAutoArchive() {
    return ProposalManager.processAutoArchive(this);
  },

  async processAutoArchiveAsync() {
    return ProposalManager.processAutoArchiveAsync(this);
  },

  async createDraft(proposalData) {
    return ProposalManager.createDraft(this, proposalData);
  },

  async saveDraft(eventId, draftData) {
    return ProposalManager.saveDraft(this, eventId, draftData);
  },

  async submitProposal(eventId, options = {}) {
    return ProposalManager.submitProposal(this, eventId, options);
  },

  async retractProposal(eventId) {
    return ProposalManager.retractProposal(this, eventId);
  },

  async cancelProposal(eventId, reason = '') {
    return ProposalManager.cancelProposal(this, eventId, reason);
  },

  async deleteProposal(eventId, reason = '') {
    return ProposalManager.deleteProposal(this, eventId, reason);
  },

  async reopenDeclinedProposal(eventId) {
    return ProposalManager.reopenDeclinedProposal(this, eventId);
  },

  async archiveProposal(eventId) {
    return ProposalManager.archiveProposal(this, eventId);
  },

  applyProposalOutcome(event) {
    return ProposalManager.applyWorkflowEvaluation(this, event);
  },

  async submitProposalVote(eventId, voterRef, vote, comment = '') {
    return ProposalManager.submitProposalVote(this, eventId, voterRef, vote, comment);
  },

  renamePartnerInEvents(oldName, newName) {
    return HouseholdStore.renamePartnerInEvents(this, this.events, oldName, newName);
  },

  removePartner(partnerId) {
    return HouseholdStore.removePartner(this, this.events, partnerId);
  },

  removeHome(homeId) {
    return HouseholdStore.removeHome(this, this.events, homeId);
  },

  // --- CRUD Operations ---

  async createEvent(eventData) {
    const newEvent = {
      ...eventData,
      id: eventData.id || `e_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`
    };

    if (isCacheMode(this.mode)) {
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

    if (isCacheMode(this.mode)) {
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

  async fetchGCalEventItems(opts = {}) {
    return CalendarAPI.fetchEventItems({ calendarId: this.calendarId, apiKey: this.apiKey, accessToken: this.accessToken, ...opts });
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
    return CalendarAPI.createEvent({ calendarId: this.calendarId, apiKey: this.apiKey, accessToken: this.accessToken, resource: this.formatGCalResource(event) });
  },

  async updateGCalEvent(eventId, event) {
    return CalendarAPI.updateEvent({ calendarId: this.calendarId, apiKey: this.apiKey, accessToken: this.accessToken, eventId, resource: this.formatGCalResource(event) });
  },

  async deleteGCalEvent(eventId) {
    if (isLocalEventId(eventId)) return;
    return CalendarAPI.deleteEvent({ calendarId: this.calendarId, apiKey: this.apiKey, accessToken: this.accessToken, eventId });
  },

  formatGCalResource(event) {
    return buildGCalResource(event);
  },

  // --- Configuration Sync Event Helpers ---

  async findGCalConfigEvent() {
    return CalendarAPI.findConfigEvent({ calendarId: this.calendarId, apiKey: this.apiKey, accessToken: this.accessToken });
  },

  async saveGCalConfigEvent(configData) {
    return CalendarAPI.saveConfigEvent({ calendarId: this.calendarId, apiKey: this.apiKey, accessToken: this.accessToken, configData, configEventId: this.configEventId });
  }
};
