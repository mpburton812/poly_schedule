import { LOCAL_CONFIG_KEY, LOCAL_EVENTS_KEY } from './storage-keys.js';
import { normalizeHouseholdConfigShape } from './helpers.js';

export function loadCacheSnapshot() {
  let config = null;
  let events = [];

  try {
    const raw = localStorage.getItem(LOCAL_CONFIG_KEY);
    if (raw) config = normalizeHouseholdConfigShape(JSON.parse(raw));
  } catch {
    config = null;
  }

  try {
    events = JSON.parse(localStorage.getItem(LOCAL_EVENTS_KEY) || '[]');
    if (!Array.isArray(events)) events = [];
  } catch {
    events = [];
  }

  return { config, events };
}

export function applyCacheSnapshot(snapshot, { state, CalendarSync }) {
  if (snapshot.config) {
    state.config = snapshot.config;
    CalendarSync.config = snapshot.config;
  } else {
    state.config = null;
    CalendarSync.config = null;
  }

  CalendarSync.events = snapshot.events || [];
  state.events = CalendarSync.events;
}
