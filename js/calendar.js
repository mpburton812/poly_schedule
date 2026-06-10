/**
 * PolySchedule Google Calendar & State Manager
 * Synchronizes local state with Google Calendar events or provides offline localStorage mock sync.
 */

import {
  DEFAULT_AVATARS,
  renamePartnerReferences,
  expandBatchSleepingToEvents,
  removePartnerReferences,
  removeHomeReferences,
  normalizeConfigPartners
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
  isCalendarEvent
} from './proposal-workflow.js';

// Local Storage Keys
const LOCAL_EVENTS_KEY = 'polyschedule_local_events';
const LOCAL_CONFIG_KEY = 'polyschedule_local_config';
const LOCAL_SEED_VERSION_KEY = 'polyschedule_seed_version';
const CURRENT_SEED_VERSION = 2;

// Default Fallback Mock Data
const DEFAULT_CONFIG = {
  residences: [
    {
      id: 'h1',
      name: "Michael's Place",
      address: '',
      bedrooms: 1,
      bedroomDetails: [
        { id: 'r1', name: "Michael's Bedroom" }
      ],
      associatedPeople: ['Michael Burton']
    },
    {
      id: 'h2',
      name: "Katie's Place",
      address: '',
      bedrooms: 1,
      bedroomDetails: [
        { id: 'r1', name: "Katie's Bedroom" }
      ],
      associatedPeople: ['Katie Thompson']
    },
    {
      id: 'h3',
      name: 'The Lake House',
      address: '',
      bedrooms: 1,
      bedroomDetails: [
        { id: 'r1', name: 'The Lakehouse Bedroom' }
      ],
      associatedPeople: ['Katie Thompson']
    }
  ],
  partners: [
    {
      id: 'p1',
      name: 'Michael Burton',
      username: 'mpburton',
      password: 'password',
      role: 'Admin',
      defaultHome: 'h1',
      avatar: DEFAULT_AVATARS[0],
      rules: {
        minSoloNights: 2,
        partnerLimits: {
          'Katie Thompson': { min: 1, max: 4 }
        }
      }
    },
    {
      id: 'p2',
      name: 'Katie Thompson',
      username: 'kthompson',
      password: 'password',
      role: 'Admin',
      defaultHome: 'h2',
      avatar: DEFAULT_AVATARS[1],
      rules: {
        minSoloNights: 2,
        partnerLimits: {
          'Michael Burton': { min: 1, max: 4 }
        }
      }
    },
    {
      id: 'p3',
      name: 'Zachery',
      passive: true,
      defaultHome: 'h3',
      avatar: DEFAULT_AVATARS[3],
      rules: {}
    },
    {
      id: 'p4',
      name: 'Bailey',
      passive: true,
      defaultHome: '',
      avatar: DEFAULT_AVATARS[2],
      rules: {}
    },
    {
      id: 'p5',
      name: 'Guest User',
      username: 'guest',
      password: 'password',
      role: 'User',
      defaultHome: 'h3',
      avatar: DEFAULT_AVATARS[2],
      rules: { minSoloNights: 2 }
    }
  ]
};

function cloneDefaultConfig() {
  return JSON.parse(JSON.stringify(DEFAULT_CONFIG));
}

function applyDefaultSeed() {
  const config = cloneDefaultConfig();
  const events = generateMockEvents();
  localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(config));
  localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
  localStorage.setItem(LOCAL_SEED_VERSION_KEY, String(CURRENT_SEED_VERSION));
  localStorage.removeItem('polyschedule_user_profile');
  return { config, events };
}

function needsSeedRefresh() {
  return localStorage.getItem(LOCAL_SEED_VERSION_KEY) !== String(CURRENT_SEED_VERSION);
}

// Generates some mock events relative to current date (ensures demo calendar is always populated)
function generateMockEvents() {
  const today = new Date();
  
  // Helper to construct dates relative to today
  const getRelDate = (offsetDays, hour = 0, minute = 0) => {
    const d = new Date(today);
    d.setDate(today.getDate() + offsetDays);
    d.setHours(hour, minute, 0, 0);
    return d.toISOString();
  };

  return [
    {
      id: 'e1',
      title: 'Date Night',
      type: 'event',
      start: getRelDate(0, 19, 0),
      end: getRelDate(0, 21, 30),
      location: "Michael's Place",
      participants: ['Michael Burton', 'Katie Thompson'],
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' }
      ],
      workflowState: WORKFLOW.APPROVED,
      status: 'confirmed',
      revision: 1
    },
    {
      id: 'e2',
      title: 'Lake House Game Night',
      type: 'event',
      start: getRelDate(2, 20, 0),
      end: getRelDate(2, 23, 0),
      location: 'The Lake House',
      participants: ['Michael Burton', 'Katie Thompson', 'Zachery'],
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' },
        { name: 'Zachery', role: 'optional' }
      ],
      workflowState: WORKFLOW.APPROVED,
      status: 'confirmed',
      revision: 1
    },
    {
      id: 's1',
      title: "SLEEP: Michael's Bedroom: Michael Burton",
      type: 'sleeping',
      start: getRelDate(0, 22, 0),
      end: getRelDate(1, 8, 0),
      homeId: 'h1',
      roomId: 'r1',
      roomName: "Michael's Bedroom",
      homeName: "Michael's Place",
      participants: ['Michael Burton'],
      participantRoles: [{ name: 'Michael Burton', role: 'required' }],
      workflowState: WORKFLOW.APPROVED,
      status: 'confirmed',
      revision: 1
    },
    {
      id: 's2',
      title: "SLEEP: Katie's Bedroom: Katie Thompson",
      type: 'sleeping',
      start: getRelDate(1, 22, 0),
      end: getRelDate(2, 8, 0),
      homeId: 'h2',
      roomId: 'r1',
      roomName: "Katie's Bedroom",
      homeName: "Katie's Place",
      participants: ['Katie Thompson'],
      participantRoles: [{ name: 'Katie Thompson', role: 'required' }],
      workflowState: WORKFLOW.APPROVED,
      status: 'confirmed',
      revision: 1
    },
    {
      id: 'p_e1',
      title: 'Weekend at The Lake House',
      type: 'event',
      start: getRelDate(5, 12, 0),
      end: getRelDate(5, 18, 0),
      location: 'The Lake House',
      participants: ['Michael Burton', 'Katie Thompson'],
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' }
      ],
      proposer: 'Michael Burton',
      workflowState: WORKFLOW.PROPOSED,
      status: 'pending',
      revision: 1,
      responses: {
        'Michael Burton': { status: 'accept', comment: 'Already packing the cooler.' },
        'Katie Thompson': { status: 'pending', comment: '' }
      }
    },
    {
      id: 'p_s1',
      title: "Sleeping : Katie : The Lake House The Lakehouse Bedroom",
      type: 'sleeping',
      start: getRelDate(4, 22, 0),
      end: getRelDate(6, 8, 0),
      homeId: 'h3',
      roomId: 'r1',
      roomName: 'The Lakehouse Bedroom',
      homeName: 'The Lake House',
      participants: ['Michael Burton', 'Katie Thompson', 'Zachery'],
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' },
        { name: 'Zachery', role: 'optional' }
      ],
      proposer: 'Michael Burton',
      workflowState: WORKFLOW.PROPOSED,
      status: 'pending',
      revision: 1,
      responses: {
        'Michael Burton': { status: 'accept', comment: '' },
        'Katie Thompson': { status: 'accept', comment: 'Sounds cozy!' }
      }
    }
  ];
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
  },

  async loadConfig() {
    if (this.mode === 'offline') {
      if (needsSeedRefresh()) {
        const seeded = applyDefaultSeed();
        this.config = seeded.config;
        this.events = seeded.events;
        return;
      }

      const saved = localStorage.getItem(LOCAL_CONFIG_KEY);
      if (saved) {
        this.config = JSON.parse(saved);
        if (normalizeConfigPartners(this.config, DEFAULT_CONFIG)) {
          localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
        }
      } else {
        const seeded = applyDefaultSeed();
        this.config = seeded.config;
        this.events = seeded.events;
      }
    } else {
      // Fetch Config from Google Calendar configuration event description
      try {
        const configEvent = await this.findGCalConfigEvent();
        if (configEvent && configEvent.description) {
          this.config = JSON.parse(configEvent.description);
        } else {
          // Create a new config event in Google Calendar
          this.config = DEFAULT_CONFIG;
          await this.saveGCalConfigEvent(DEFAULT_CONFIG);
        }
      } catch (e) {
        console.error('Failed to load config from GCal, falling back to local', e);
        this.config = DEFAULT_CONFIG;
      }
    }
  },

  async saveConfig(newConfig) {
    this.config = newConfig;
    if (this.mode === 'offline') {
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(newConfig));
    } else {
      try {
        await this.saveGCalConfigEvent(newConfig);
      } catch (e) {
        console.error('Failed to save config to GCal', e);
        throw e;
      }
    }
    
    if (this.onStateUpdate) {
      this.onStateUpdate();
    }
  },

  async loadEvents() {
    if (this.mode === 'offline') {
      if (this.events?.length) {
        this.migrateAndNormalizeEvents();
        return;
      }

      const saved = localStorage.getItem(LOCAL_EVENTS_KEY);
      if (saved) {
        this.events = JSON.parse(saved);
      } else {
        this.events = generateMockEvents();
        localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));
      }
      this.migrateAndNormalizeEvents();
    } else {
      // Load actual events from Google Calendar
      try {
        this.events = await this.fetchGCalEvents();
      } catch (e) {
        console.error('Failed to fetch events from GCal, falling back to local storage', e);
        this.events = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]');
      }
    }

    this.syncProposalStatuses();
    this.processAutoArchive();
    
    if (this.onStateUpdate) {
      this.onStateUpdate();
    }
  },

  migrateAndNormalizeEvents() {
    this.events = migrateEvents(this.events, this.config);
    this.persistEvents();
  },

  persistEvents() {
    if (this.mode === 'offline') {
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));
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
    let changed = false;
    this.events.forEach(event => {
      if (getWorkflowState(event) !== WORKFLOW.PROPOSED) return;
      const before = event.workflowState;
      this.applyWorkflowEvaluation(event);
      if (event.workflowState !== before) changed = true;
    });
    if (changed) this.persistEvents();
  },

  processAutoArchive() {
    const days = getAutoArchiveDays();
    if (days <= 0) return;
    const now = Date.now();
    let changed = false;
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
        changed = true;
      }
    });
    if (changed) this.persistEvents();
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

  async submitProposal(eventId) {
    const idx = this.events.findIndex(e => e.id === eventId);
    if (idx === -1) throw new Error('Proposal not found');
    const event = this.events[idx];
    const ws = getWorkflowState(event);
    if (ws !== WORKFLOW.DRAFT) {
      throw new Error('Only drafts can be submitted');
    }

    const participantRoles = event.participantRoles || normalizeParticipantRoles(event.participants, this.config, event.type);
    const responses = buildInitialResponses(event.proposer, participantRoles, this.config);

    return this.updateEvent(eventId, {
      workflowState: WORKFLOW.PROPOSED,
      status: 'pending',
      participantRoles,
      participants: participantNames(participantRoles),
      responses,
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

  renamePartnerInEvents(oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    renamePartnerReferences(this.config, this.events, oldName, newName);
    this.persistEvents();
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
  },

  removePartner(partnerId) {
    const partner = this.config?.partners?.find(p => p.id === partnerId);
    if (!partner) return false;
    removePartnerReferences(this.config, this.events, partnerId, partner.name);
    this.config.partners = this.config.partners.filter(p => p.id !== partnerId);
    this.persistEvents();
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
    if (this.onStateUpdate) this.onStateUpdate();
    return true;
  },

  removeHome(homeId) {
    const home = this.config?.residences?.find(h => h.id === homeId);
    if (!home) return false;
    removeHomeReferences(this.config, this.events, homeId);
    this.config.residences = this.config.residences.filter(h => h.id !== homeId);
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
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
    } else {
      try {
        const created = await this.createGCalEvent(newEvent);
        newEvent.id = created.id; // Map back the Google Calendar Event ID
        this.events.push(newEvent);
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
      const expanded = expandBatchSleepingToEvents(updated);
      expanded.forEach(e => {
        e.status = 'confirmed';
        e.workflowState = WORKFLOW.APPROVED;
      });
      updated.expandedEventIds = expanded.map(e => e.id);
      updated.status = 'confirmed';
      this.events[idx] = updated;
      this.events.push(...expanded);
      this.persistEvents();
      if (this.onStateUpdate) this.onStateUpdate();
      return { parent: updated, expanded };
    }

    if (this.mode === 'offline') {
      this.events[idx] = updated;
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));
    } else {
      try {
        await this.updateGCalEvent(eventId, updated);
        this.events[idx] = updated;
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
    if (idx === -1) return;

    if (this.mode === 'offline') {
      this.events.splice(idx, 1);
      localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));
    } else {
      try {
        await this.deleteGCalEvent(eventId);
        this.events.splice(idx, 1);
      } catch (e) {
        console.error('Failed to delete event from Google Calendar', e);
        throw e;
      }
    }

    if (this.onStateUpdate) this.onStateUpdate();
  },

  // --- Google Calendar REST API Calls ---

  async fetchGCalEvents() {
    const timeMin = new Date();
    timeMin.setDate(timeMin.getDate() - 30); // 30 days ago
    const timeMax = new Date();
    timeMax.setDate(timeMax.getDate() + 60); // 60 days in future

    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?timeMin=${timeMin.toISOString()}&timeMax=${timeMax.toISOString()}&singleEvents=true&key=${this.apiKey}`;
    
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    
    if (!res.ok) throw new Error('Failed to fetch calendar events from Google Calendar API');
    
    const data = await res.json();
    
    // Parse Google events back into PolySchedule objects
    const parsedEvents = [];
    
    for (const item of data.items || []) {
      // Skip config event
      if (item.summary === '[CONFIG] PolySchedule Core Settings') continue;

      let type = 'event';
      let status = 'confirmed';
      let roomName = '';
      let homeName = '';
      let roomId = '';
      let homeId = '';
      let proposer = '';
      let responses = {};
      let participants = [];

      // Check for proposal prefix or extended JSON in description
      let title = item.summary || 'Untitled Event';
      
      if (item.description) {
        try {
          // Check if description starts with PolySchedule JSON
          if (item.description.trim().startsWith('{')) {
            const meta = JSON.parse(item.description);
            type = meta.type || type;
            status = meta.status || status;
            roomName = meta.roomName || roomName;
            homeName = meta.homeName || homeName;
            roomId = meta.roomId || roomId;
            homeId = meta.homeId || homeId;
            proposer = meta.proposer || proposer;
            responses = meta.responses || responses;
            participants = meta.participants || participants;
          }
        } catch (e) {
          // Description is plain text, fallback parsing
        }
      }

      // Fallback participant extraction from attendees if JSON parsing failed
      if (participants.length === 0) {
        participants = (item.attendees || []).map(a => a.displayName || a.email.split('@')[0]);
      }

      // Detect sleeping types based on summary
      if (title.toUpperCase().includes('SLEEP') || title.toUpperCase().startsWith('[PROPOSAL-SLEEP]')) {
        type = 'sleeping';
      }

      if (title.startsWith('[PROPOSAL] ') || title.startsWith('[PROPOSAL-SLEEP] ')) {
        status = 'pending';
      }

      parsedEvents.push({
        id: item.id,
        title: title,
        type: type,
        start: item.start.dateTime || item.start.date,
        end: item.end.dateTime || item.end.date,
        location: item.location || '',
        roomId,
        homeId,
        roomName,
        homeName,
        participants,
        proposer,
        status,
        responses
      });
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

    if (!res.ok) throw new Error('Failed to create calendar event on Google Calendar');
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

    if (!res.ok) throw new Error('Failed to update calendar event on Google Calendar');
    return await res.json();
  },

  async deleteGCalEvent(eventId) {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events/${eventId}?key=${this.apiKey}`;
    
    const res = await fetch(url, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) throw new Error('Failed to delete calendar event from Google Calendar');
  },

  formatGCalResource(event) {
    // Pack our custom metadata into the event description block as a JSON string
    const meta = {
      type: event.type,
      status: event.status,
      roomName: event.roomName || '',
      homeName: event.homeName || '',
      roomId: event.roomId || '',
      homeId: event.homeId || '',
      proposer: event.proposer || '',
      responses: event.responses || {},
      participants: event.participants || [],
      batchNights: event.batchNights || undefined
    };

    let title = event.title;
    if (event.status === 'pending') {
      let prefix = '[PROPOSAL] ';
      if (event.type === 'sleeping') prefix = '[PROPOSAL-SLEEP] ';
      if (event.type === 'batch_sleeping') prefix = '[PROPOSAL-BATCH] ';
      if (!title.startsWith(prefix)) {
        title = prefix + title;
      }
    }

    return {
      summary: title,
      location: event.location || '',
      description: JSON.stringify(meta, null, 2),
      start: {
        dateTime: new Date(event.start).toISOString(),
        timeZone: 'America/New_York'
      },
      end: {
        dateTime: new Date(event.end).toISOString(),
        timeZone: 'America/New_York'
      },
      // Optional: Add attendees email mapping here if desired
    };
  },

  // --- Configuration Sync Event Helpers ---

  async findGCalConfigEvent() {
    const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(this.calendarId)}/events?q=${encodeURIComponent('[CONFIG] PolySchedule Core Settings')}&key=${this.apiKey}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });
    if (!res.ok) return null;
    const data = await res.json();
    return (data.items || []).find(item => item.summary === '[CONFIG] PolySchedule Core Settings');
  },

  async saveGCalConfigEvent(configData) {
    const configEvent = await this.findGCalConfigEvent();
    
    const resource = {
      summary: '[CONFIG] PolySchedule Core Settings',
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

    if (!res.ok) throw new Error('Failed to save configuration settings to Google Calendar');
  }
};
