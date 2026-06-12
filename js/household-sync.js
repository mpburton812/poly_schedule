import {
  MODE_KEY,
  DEVICE_ID_KEY,
  LAST_SYNC_REVISION_KEY,
  HOUSEHOLD_SYNC_TOKEN_KEY,
  LOCAL_CONFIG_KEY,
  LOCAL_EVENTS_KEY
} from './storage-keys.js';
/**
 * Household near-real-time sync — Render hub + Google Calendar source of truth.
 */

import { NOTIFY_SECRET_KEY, NOTIFY_URL_KEY } from './storage-keys.js';
import {
  pickNewerHouseholdConfig
} from './helpers.js';


let sseAbort = null;
let pollTimer = null;
let refreshInFlight = null;

export function getDeviceId() {
  let id = localStorage.getItem(DEVICE_ID_KEY);
  if (!id) {
    id = `dev_${crypto.randomUUID?.() || Date.now()}`;
    localStorage.setItem(DEVICE_ID_KEY, id);
  }
  return id;
}

export function getHouseholdSyncToken() {
  return localStorage.getItem(HOUSEHOLD_SYNC_TOKEN_KEY) || '';
}

export function setHouseholdSyncToken(token) {
  if (token) localStorage.setItem(HOUSEHOLD_SYNC_TOKEN_KEY, token.trim());
  else localStorage.removeItem(HOUSEHOLD_SYNC_TOKEN_KEY);
}

export function generateHouseholdId() {
  return crypto.randomUUID?.() || `hh_${Date.now()}`;
}

export function generateHouseholdSyncToken() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

export function ensureHouseholdIdentity(config) {
  if (!config) return config;
  let changed = false;
  if (!config.householdId) {
    config.householdId = generateHouseholdId();
    changed = true;
  }
  if (typeof config.syncRevision !== 'number') {
    config.syncRevision = 0;
    changed = true;
  }
  return changed;
}

export function bumpSyncRevision(config) {
  if (!config) return 0;
  ensureHouseholdIdentity(config);
  config.syncRevision = (config.syncRevision || 0) + 1;
  return config.syncRevision;
}

function getNotifyConfig() {
  return {
    url: (localStorage.getItem(NOTIFY_URL_KEY) || '').replace(/\/$/, ''),
    secret: localStorage.getItem(NOTIFY_SECRET_KEY) || ''
  };
}

export function isSyncHubConfigured() {
  const { url, secret } = getNotifyConfig();
  return !!(url && secret);
}

async function syncHubFetch(path, options = {}) {
  const { url, secret } = getNotifyConfig();
  if (!url || !secret) throw new Error('Notify service is not configured');
  const res = await fetch(`${url}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'X-Notify-Secret': secret,
      ...(options.headers || {})
    }
  });
  return res;
}

export async function registerSyncDevice(partnerId, householdId) {
  if (!isSyncHubConfigured() || !partnerId || !householdId) return null;
  const res = await syncHubFetch('/v1/sync/register', {
    method: 'POST',
    body: JSON.stringify({
      householdId,
      partnerId,
      deviceId: getDeviceId()
    })
  });
  if (!res.ok) throw new Error('Failed to register sync device');
  return res.json();
}

/**
 * After a successful GCal write, notify other household devices.
 */
export async function afterHouseholdWrite(scopes = ['config', 'events'], {
  config = null,
  events = null,
  actorPartnerId = null,
  revision = null
} = {}) {
  const householdId = config?.householdId;
  if (!householdId || !isSyncHubConfigured()) return null;
  if (localStorage.getItem(MODE_KEY) !== 'sync') return null;

  const body = {
    householdId,
    revision: revision ?? config?.syncRevision,
    scopes,
    actorPartnerId: actorPartnerId || null,
    excludeDeviceId: getDeviceId(),
    config: scopes.includes('config') ? config : undefined,
    events: scopes.includes('events') ? events : undefined
  };

  const res = await syncHubFetch('/v1/sync/push', {
    method: 'POST',
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Failed to notify sync hub');
  const data = await res.json();
  if (data.revision != null) {
    localStorage.setItem(LAST_SYNC_REVISION_KEY, String(data.revision));
  }
  return data;
}

async function fetchCacheConfig(householdId, sinceRevision) {
  const res = await syncHubFetch(
    `/v1/sync/config?householdId=${encodeURIComponent(householdId)}&sinceRevision=${sinceRevision}`
  );
  if (res.status === 204) return null;
  if (!res.ok) throw new Error('Failed to fetch cached config');
  return res.json();
}

async function fetchCacheEvents(householdId, sinceRevision) {
  const res = await syncHubFetch(
    `/v1/sync/events?householdId=${encodeURIComponent(householdId)}&sinceRevision=${sinceRevision}`
  );
  if (res.status === 204) return null;
  if (!res.ok) throw new Error('Failed to fetch cached events');
  return res.json();
}

async function pullFromGoogleCalendar(CalendarSync, scopes) {
  if (scopes.includes('config')) await CalendarSync.loadConfig();
  if (scopes.includes('events')) await CalendarSync.loadEvents();
}

/**
 * Apply remote changes: Render cache first, then GCal fallback.
 */
export async function refreshHouseholdFromCloud(scopes = ['config', 'events'], {
  CalendarSync,
  state,
  renderView,
  forceGCal = false
} = {}) {
  if (!CalendarSync || localStorage.getItem(MODE_KEY) !== 'sync') return false;

  const householdId = state?.config?.householdId || CalendarSync.config?.householdId;
  if (!householdId) return false;

  const sinceRevision = Number(localStorage.getItem(LAST_SYNC_REVISION_KEY) || 0);
  let applied = false;

  if (!forceGCal && isSyncHubConfigured()) {
    try {
      if (scopes.includes('config')) {
        const cached = await fetchCacheConfig(householdId, sinceRevision);
        if (cached?.config) {
          let localConfig = null;
          try {
            localConfig = JSON.parse(localStorage.getItem(LOCAL_CONFIG_KEY) || 'null');
          } catch {
            localConfig = null;
          }
          const picked = pickNewerHouseholdConfig(localConfig, cached.config);
          CalendarSync.config = picked.config;
          state.config = picked.config;
          localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(picked.config));
          localStorage.setItem(LAST_SYNC_REVISION_KEY, String(cached.revision));
          const { applySyncedAdminSettingsFromConfig } = await import('./household-config-apply.js');
          applySyncedAdminSettingsFromConfig(picked.config, { CalendarSync });
          applied = true;
        }
      }
      if (scopes.includes('events')) {
        const cached = await fetchCacheEvents(householdId, sinceRevision);
        if (cached?.events) {
          CalendarSync.events = cached.events;
          state.events = cached.events;
          localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify(cached.events));
          localStorage.setItem(LAST_SYNC_REVISION_KEY, String(cached.revision));
          applied = true;
        }
      }
    } catch (err) {
      console.warn('[sync] cache pull failed, falling back to GCal', err);
    }
  }

  if (!applied || forceGCal) {
    await pullFromGoogleCalendar(CalendarSync, scopes);
    if (state) {
      state.config = CalendarSync.config;
      state.events = CalendarSync.events;
    }
    if (CalendarSync.config?.syncRevision != null) {
      localStorage.setItem(LAST_SYNC_REVISION_KEY, String(CalendarSync.config.syncRevision));
    }
    if (scopes.includes('config')) {
      const { applySyncedAdminSettingsFromConfig } = await import('./household-config-apply.js');
      applySyncedAdminSettingsFromConfig(CalendarSync.config, { CalendarSync });
    }
    applied = true;
  }

  if (applied && typeof renderView === 'function') renderView();
  return applied;
}

function handleSyncPayload(payload, hooks) {
  if (!payload || payload.type !== 'household-sync') return;
  if (payload.excludeDeviceId && payload.excludeDeviceId === getDeviceId()) return;

  const run = () => {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = refreshHouseholdFromCloud(payload.scopes || ['config', 'events'], hooks)
      .finally(() => { refreshInFlight = null; });
    return refreshInFlight;
  };

  run();
}

export function connectSyncStream(hooks) {
  disconnectSyncStream();
  const householdId = hooks?.state?.config?.householdId;
  if (!householdId || !isSyncHubConfigured()) return;
  if (localStorage.getItem(MODE_KEY) !== 'sync') return;

  const { url, secret } = getNotifyConfig();
  const controller = new AbortController();
  sseAbort = controller;

  const connect = async () => {
    try {
      const res = await fetch(
        `${url}/v1/sync/stream?householdId=${encodeURIComponent(householdId)}`,
        {
          headers: { 'X-Notify-Secret': secret, Accept: 'text/event-stream' },
          signal: controller.signal
        }
      );
      if (!res.ok || !res.body) throw new Error('SSE connection failed');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split('\n\n');
        buffer = chunks.pop() || '';
        for (const chunk of chunks) {
          const line = chunk.split('\n').find(l => l.startsWith('data: '));
          if (!line) continue;
          try {
            const payload = JSON.parse(line.slice(6));
            handleSyncPayload(payload, hooks);
          } catch {
            // ignore malformed events
          }
        }
      }
    } catch (err) {
      if (controller.signal.aborted) return;
      console.warn('[sync] SSE disconnected', err.message);
    }

    if (!controller.signal.aborted) {
      setTimeout(connect, 5000);
    }
  };

  connect();

  if (pollTimer) clearInterval(pollTimer);
  pollTimer = setInterval(async () => {
    if (!hooks?.state?.config?.householdId) return;
    try {
      const res = await syncHubFetch(
        `/v1/sync/status?householdId=${encodeURIComponent(hooks.state.config.householdId)}`
      );
      if (!res.ok) return;
      const status = await res.json();
      const localRev = Number(localStorage.getItem(LAST_SYNC_REVISION_KEY) || 0);
      if (status.revision > localRev) {
        handleSyncPayload({
          type: 'household-sync',
          revision: status.revision,
          scopes: ['config', 'events']
        }, hooks);
      }
    } catch {
      // ignore poll errors
    }
  }, 45000);
}

export function disconnectSyncStream() {
  if (sseAbort) {
    sseAbort.abort();
    sseAbort = null;
  }
  if (pollTimer) {
    clearInterval(pollTimer);
    pollTimer = null;
  }
}

export async function registerGCalWatchOnServer({
  householdId,
  calendarId,
  accessToken,
  apiKey
}) {
  const res = await syncHubFetch('/v1/gcal/watch', {
    method: 'POST',
    body: JSON.stringify({ householdId, calendarId, accessToken, apiKey })
  });
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Failed to register Google Calendar watch');
  }
  return res.json();
}

export function bindHouseholdSyncMessageHandler(hooks) {
  if (typeof navigator === 'undefined' || !navigator.serviceWorker) return;
  navigator.serviceWorker.addEventListener('message', (event) => {
    if (event.data?.type === 'household-sync') {
      handleSyncPayload(event.data, hooks);
    }
  });
}

/**
 * Register this device and open the SSE sync stream (sync mode + notify hub only).
 */
export async function startHouseholdSyncHub(hooks) {
  if (localStorage.getItem(MODE_KEY) !== 'sync') return;
  if (!isSyncHubConfigured()) return;

  const householdId = hooks?.state?.config?.householdId;
  if (!householdId) return;

  const partnerId = hooks?.state?.currentUser?.id;
  if (partnerId) {
    try {
      await registerSyncDevice(partnerId, householdId);
    } catch (err) {
      console.warn('[sync] device registration failed', err.message);
    }
  }

  connectSyncStream(hooks);
}
