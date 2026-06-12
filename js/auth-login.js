import { NOTIFY_URL_KEY, LOCAL_CONFIG_KEY, LOCAL_EVENTS_KEY, LAST_SYNC_REVISION_KEY } from './storage-keys.js';
import { CalendarSync } from './calendar.js';
import { applyHouseholdServicesFromConfig } from './household-services.js';
import { applyGoogleIntegrationFromConfig } from './google-integration.js';
import { normalizeHouseholdConfigShape } from './helpers.js';
import { migrateFamilyNameToConfig } from './group-name.js';

let cachedPublicNotifyUrl = null;

export async function resolvePublicNotifyUrl() {
  const stored = localStorage.getItem(NOTIFY_URL_KEY);
  if (stored) return stored.replace(/\/$/, '');

  if (cachedPublicNotifyUrl) return cachedPublicNotifyUrl;

  try {
    const res = await fetch('version.json');
    if (res.ok) {
      const data = await res.json();
      cachedPublicNotifyUrl = String(data.notifyUrl || '').trim().replace(/\/$/, '');
      return cachedPublicNotifyUrl;
    }
  } catch {
    /* ignore */
  }
  return '';
}

/**
 * @returns {Promise<{ ok: true, householdId: string, partner: object, config: object, events: array, revision: number, groupName?: string, googleIntegration?: object, notifyService?: object } | { ok: false, code: string, message: string }>}
 */
export async function loginViaNotifyService(username, password, notifyUrl = null) {
  const trimmedUser = String(username || '').trim();
  const trimmedPassword = String(password || '');
  const baseUrl = (notifyUrl || await resolvePublicNotifyUrl()).replace(/\/$/, '');

  if (!baseUrl) {
    return { ok: false, code: 'NO_NOTIFY_URL', message: 'Login service is not configured on this device.' };
  }
  if (!trimmedUser || !trimmedPassword) {
    return { ok: false, code: 'BAD_REQUEST', message: 'Username and password are required.' };
  }

  try {
    const res = await fetch(`${baseUrl}/v1/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: trimmedUser, password: trimmedPassword })
    });
    const body = await res.json().catch(() => ({}));

    if (!res.ok) {
      return {
        ok: false,
        code: body.code || (res.status === 401 ? 'INVALID_CREDENTIALS' : 'LOGIN_FAILED'),
        message: body.error || 'Login failed.'
      };
    }

    const config = normalizeHouseholdConfigShape(body.config);
    if (body.groupName && !config.groupName) {
      config.groupName = body.groupName;
    }
    if (body.googleIntegration && !config.googleIntegration) {
      config.googleIntegration = body.googleIntegration;
    }
    if (body.notifyService && !config.notifyService) {
      config.notifyService = body.notifyService;
    }

    return {
      ok: true,
      householdId: body.householdId,
      partner: body.partner,
      config,
      events: Array.isArray(body.events) ? body.events : [],
      revision: body.revision ?? 0,
      groupName: body.groupName || config.groupName || '',
      googleIntegration: body.googleIntegration || config.googleIntegration || null,
      notifyService: body.notifyService || config.notifyService || null
    };
  } catch {
    return { ok: false, code: 'NETWORK_ERROR', message: 'Could not reach the login service. Check your connection and try again.' };
  }
}

export function applyRemoteLoginPayload({ config, events, revision }, state) {
  migrateFamilyNameToConfig(config);
  state.config = config;
  state.events = events;
  CalendarSync.config = config;
  CalendarSync.events = events;
  localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(config));
  localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(events));
  if (revision != null) {
    localStorage.setItem(LAST_SYNC_REVISION_KEY, String(revision));
  }
  applyGoogleIntegrationFromConfig(config, { CalendarSync });
  applyHouseholdServicesFromConfig(config);
}
