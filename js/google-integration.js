import {
  CALENDAR_ID_KEY,
  CLIENT_ID_KEY,
  API_KEY_KEY
} from './storage-keys.js';
/**
 * Household Google Calendar integration settings (synced via config).
 * OAuth access tokens remain per-device in localStorage.
 */

import { AuthManager } from './auth.js';

let googleIntegrationServerManaged = false;

export function isGoogleIntegrationServerManaged() {
  return googleIntegrationServerManaged;
}

export function setGoogleIntegrationServerManaged(value) {
  googleIntegrationServerManaged = !!value;
}


/**
 * @param {import('./types.js').AppConfig & { googleIntegration?: object }} config
 */
export function getGoogleIntegrationFromConfig(config) {
  const gi = config?.googleIntegration;
  if (!gi?.clientId || !gi?.apiKey) return null;
  return {
    clientId: gi.clientId,
    apiKey: gi.apiKey,
    calendarId: gi.calendarId || 'primary'
  };
}

/**
 * @param {import('./types.js').AppConfig} config
 * @param {{ clientId: string, apiKey: string, calendarId?: string }} integration
 */
export function setGoogleIntegrationOnConfig(config, { clientId, apiKey, calendarId }) {
  if (!config) return;
  config.googleIntegration = {
    clientId: clientId.trim(),
    apiKey: apiKey.trim(),
    calendarId: (calendarId || 'primary').trim() || 'primary'
  };
}

/**
 * Apply synced household Google settings to this device's local storage.
 * @returns {boolean} true when local credentials were updated
 */
export function applyGoogleIntegrationFromConfig(config, { CalendarSync = null } = {}) {
  const integration = getGoogleIntegrationFromConfig(config);
  if (!integration) return false;

  const prevClient = localStorage.getItem(CLIENT_ID_KEY) || '';
  const prevKey = localStorage.getItem(API_KEY_KEY) || '';
  const prevCal = localStorage.getItem(CALENDAR_ID_KEY) || 'primary';

  if (
    prevClient === integration.clientId
    && prevKey === integration.apiKey
    && prevCal === integration.calendarId
  ) {
    return false;
  }

  AuthManager.setCredentials(integration.clientId, integration.apiKey);
  localStorage.setItem(CALENDAR_ID_KEY, integration.calendarId);
  if (CalendarSync) {
    CalendarSync.calendarId = integration.calendarId;
    CalendarSync.apiKey = integration.apiKey;
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('polyschedule:google-integration', {
      detail: { applied: true, needsGoogleLogin: !AuthManager.accessToken }
    }));
  }

  return true;
}

export function ensureGoogleCredentialsFromConfig(config, { CalendarSync = null } = {}) {
  if (config) {
    applyGoogleIntegrationFromConfig(config, { CalendarSync });
  }
  AuthManager.reloadFromStorage();
  return !!(
    localStorage.getItem(CLIENT_ID_KEY)
    && localStorage.getItem(API_KEY_KEY)
  );
}

/** Human-readable label for a Google Calendar ID (not the raw API id). */
export function formatCalendarDisplayLabel(calendarId) {
  const id = String(calendarId || '').trim() || 'primary';
  if (id === 'primary') return 'Primary calendar';
  if (id.endsWith('@group.calendar.google.com')) {
    const namePart = id.slice(0, -'@group.calendar.google.com'.length);
    if (namePart.includes('@')) return namePart;
    return 'Shared group calendar';
  }
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(id)) return id;
  return id;
}

/** True when the raw calendar id should be shown beneath the friendly label. */
export function shouldShowCalendarIdDetail(calendarId) {
  const id = String(calendarId || '').trim() || 'primary';
  return id !== 'primary' && id !== formatCalendarDisplayLabel(id);
}
