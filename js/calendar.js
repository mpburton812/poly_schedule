/**
 * PolySchedule Google Calendar & State Manager
 * Synchronizes local state with Google Calendar events or provides offline localStorage mock sync.
 */

// Local Storage Keys
const LOCAL_EVENTS_KEY = 'polyschedule_local_events';
const LOCAL_CONFIG_KEY = 'polyschedule_local_config';

// Default Fallback Mock Data
const DEFAULT_CONFIG = {
  residences: [
    { id: 'h1', name: 'The Sanctuary', address: '420 Willow Ave, Portland OR', bedrooms: 3 },
    { id: 'h2', name: 'Urban Loft', address: '1580 N Pearl St, Ste 402', bedrooms: 1 }
  ],
  partners: [
    {
      id: 'p1',
      name: 'Alex Rivera',
      role: 'Admin',
      defaultHome: 'h1',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDjdXIAb6DttZ_Ivp6ocVuKGc_Cor-qtG3fqxi_3id35pEHmgyk008IoZOgCHsrXXysAKWNYlZFuovzj6OKFhoWqHjHVChafb9BWYQUKgMOWrT51kd1Tdr82IASulIokvB5JGV92NEWkmoFCt2MkVI_dzGJjUZabAGyiL8VI29nblqzqFUfEGWtrBPaXGI5Iz7QpmL4coomXYBEqrLuzJk18OWKIc0wuJe6pzRMziouxu7oZAVZjCFPxSRuTnPx874S9TseYaOXwWA',
      rules: { maxSoloNights: 2, partnerLimits: { 'Sam': { min: 3, max: 3 }, 'Jordan': { max: 3 } } }
    },
    {
      id: 'p2',
      name: 'Sam Davis',
      role: 'User',
      defaultHome: 'h1',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBkiDXcixh9wTyqQ3mmTu32lJeACKwp10ETuYGyHNNM9iiXkeQCKZaUKHex9Lpzd_fXcn73BGgQd5ucgB9njInlBc6hfkUlsx03rdKp04jBzSmhltD32IP9XqSq2KG3_3rQ4zg9y_V67OWA8qV35uzz3wE5q_eIXLqKv8e1YMIEdlzc3fy7VGbbrhx-59Z_t6VTkMgiwRiAerfEGDs5v0Q1tDcEzLm9Fa0y8r4aQOHcmoY4KfivutCmK2ZtPIZJC4AWKSC1VdbZtU8',
      rules: { maxSoloNights: 3, partnerLimits: { 'Alex': { min: 3, max: 3 } } }
    },
    {
      id: 'p3',
      name: 'Jordan Smith',
      role: 'User',
      defaultHome: 'h2',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAsuXXVIcZMSQ62tOZzFQEkE5ntyY1weFLJF0wQCcgxYTMjElV1EJXmqIIjOuprQgQKLmSo_-xB4Tci-zC2zg9MT-Jb7Fmeflk6Bw0wVll9QVmutqIBX9UDU76I08ZYRvmEdnN-pCSfW-Gd44ZvHPM5qCqIWw8PxEFsMGkCZ0hWMeI5XK_EiSI_BsQyHQ0MvsjM42D8nSTDAmL2T5OOTkG2SVSrBtzTsAiJxFnOjYR4yQ9NA17x9iQuir5F8dYT7-iCzK_PG1qyNTY',
      rules: { maxSoloNights: 4 }
    },
    {
      id: 'p4',
      name: 'Casey Chen',
      role: 'Guest',
      defaultHome: 'h2',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuANBeZwLI4tsSql8d73NMsZfXzGtVbeWj5tLl9hR48DeEIHHSCeXAHWVqLkG9SEbO2_fhBq3bxSKUhjod3yItdQkx2BDWgpb9Zzl_Bklaz_azg-r0i9dbzVu2sVwDMHeOy6FYMgpX7d7799HcAyAXPRts4rmyc2hic8KQSmmMrXK8SIhqFJZ2KkJuUq2jJIeu8irpMQWbROQrVtrFVTm-HLi5jcBDtL0VLAA9yWsO4QAYBhswSXZyh7xsuzFesu38a0gN0N0aBIUcI',
      rules: {}
    }
  ]
};

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
    // Confirmed Events
    {
      id: 'e1',
      title: 'Dinner at Sol\'s',
      type: 'event',
      start: getRelDate(0, 19, 0), // Tonight 7pm
      end: getRelDate(0, 21, 30),
      location: 'Sol\'s House',
      participants: ['Alex', 'Sam', 'Jordan'],
      status: 'confirmed'
    },
    {
      id: 'e2',
      title: 'Game Night',
      type: 'event',
      start: getRelDate(2, 20, 0), // 2 days later 8pm
      end: getRelDate(2, 23, 0),
      location: 'The Sanctuary',
      participants: ['Alex', 'Sam', 'Jordan', 'Casey'],
      status: 'confirmed'
    },
    // Confirmed Sleep Arrangements
    {
      id: 's1',
      title: 'SLEEP: North Bedroom: Sam & Alex',
      type: 'sleeping',
      start: getRelDate(0, 22, 0), // Tonight
      end: getRelDate(1, 8, 0),
      homeId: 'h1',
      roomId: 'r1',
      roomName: 'North Bedroom',
      homeName: 'The Sanctuary',
      participants: ['Alex', 'Sam'],
      status: 'confirmed'
    },
    {
      id: 's2',
      title: 'SLEEP: Main House: Alex',
      type: 'sleeping',
      start: getRelDate(1, 22, 0), // Tomorrow
      end: getRelDate(2, 8, 0),
      homeId: 'h1',
      roomId: 'r2',
      roomName: 'Main House',
      homeName: 'The Sanctuary',
      participants: ['Alex'],
      status: 'confirmed'
    },
    // Active Proposals (Pending Approval)
    {
      id: 'p_e1',
      title: 'Thanksgiving Split',
      type: 'event',
      start: getRelDate(5, 12, 0), // 5 days later noon
      end: getRelDate(5, 18, 0),
      location: 'Cabin',
      participants: ['Alex', 'Sam', 'Jordan'],
      proposer: 'Alex Rivera',
      status: 'pending',
      responses: {
        'Alex Rivera': { status: 'accept', comment: 'Ready to cook!' },
        'Sam Davis': { status: 'accept', comment: 'I\'ll bring the games.' },
        'Jordan Smith': { status: 'pending', comment: '' }
      }
    },
    {
      id: 'p_s1',
      title: 'Weekend at Lake Cabin',
      type: 'sleeping',
      start: getRelDate(4, 22, 0), // 4 days later (Friday)
      end: getRelDate(6, 8, 0), // 2 nights
      homeId: 'h1',
      roomId: 'r1',
      roomName: 'North Bedroom',
      homeName: 'The Sanctuary',
      participants: ['Alex', 'Sam', 'Casey'],
      proposer: 'Alex Rivera',
      status: 'pending',
      responses: {
        'Alex Rivera': { status: 'accept', comment: '' },
        'Sam Davis': { status: 'accept', comment: 'Sounds cozy!' },
        'Casey Chen': { status: 'reject', comment: 'Already have family visiting that weekend.' }
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
      const saved = localStorage.getItem(LOCAL_CONFIG_KEY);
      if (saved) {
        this.config = JSON.parse(saved);
      } else {
        this.config = DEFAULT_CONFIG;
        localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(DEFAULT_CONFIG));
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
      const saved = localStorage.getItem(LOCAL_EVENTS_KEY);
      if (saved) {
        this.events = JSON.parse(saved);
      } else {
        this.events = generateMockEvents();
        localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(this.events));
      }
    } else {
      // Load actual events from Google Calendar
      try {
        this.events = await this.fetchGCalEvents();
      } catch (e) {
        console.error('Failed to fetch events from GCal, falling back to local storage', e);
        this.events = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]');
      }
    }
    
    if (this.onStateUpdate) {
      this.onStateUpdate();
    }
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

  async updateEvent(eventId, updatedData) {
    const idx = this.events.findIndex(e => e.id === eventId);
    if (idx === -1) return;

    const updated = { ...this.events[idx], ...updatedData };
    
    // Check if proposal status transitions to approved
    if (updated.status === 'pending') {
      const pendingResponses = Object.values(updated.responses || {}).some(r => r.status === 'pending');
      const hasRejections = Object.values(updated.responses || {}).some(r => r.status === 'reject');
      
      if (!pendingResponses && !hasRejections) {
        // Fully approved! Remove proposal prefixes
        updated.status = 'confirmed';
        if (updated.type === 'sleeping') {
          updated.title = `SLEEP: ${updated.roomName}: ${updated.participants.join(' & ')}`;
        }
      }
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
      participants: event.participants || []
    };

    let title = event.title;
    if (event.status === 'pending') {
      const prefix = event.type === 'sleeping' ? '[PROPOSAL-SLEEP] ' : '[PROPOSAL] ';
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
