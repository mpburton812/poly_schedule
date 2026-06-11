/**
 * Household notify service and sync hub settings (synced via config).
 * Per-device push enablement stays in localStorage.
 */

import {
  NOTIFY_SECRET_KEY,
  NOTIFY_URL_KEY
} from './push-notifications.js';
import {
  HOUSEHOLD_SYNC_TOKEN_KEY,
  setHouseholdSyncToken
} from './household-sync.js';

/**
 * @param {import('./types.js').AppConfig & { notifyService?: object, syncHub?: object }} config
 */
export function getNotifyServiceFromConfig(config) {
  const notify = config?.notifyService;
  if (!notify?.url || !notify?.secret) return null;
  return {
    url: notify.url.replace(/\/$/, ''),
    secret: notify.secret
  };
}

/**
 * @param {import('./types.js').AppConfig} config
 * @param {{ url: string, secret: string }} notifyService
 */
export function setNotifyServiceOnConfig(config, { url, secret }) {
  if (!config) return;
  config.notifyService = {
    url: url.trim().replace(/\/$/, ''),
    secret: secret.trim()
  };
}

/**
 * @param {import('./types.js').AppConfig & { syncHub?: object }} config
 */
export function getSyncHubFromConfig(config) {
  const token = config?.syncHub?.token;
  if (!token) return null;
  return { token };
}

/**
 * @param {import('./types.js').AppConfig} config
 * @param {{ token: string }} syncHub
 */
export function setSyncHubOnConfig(config, { token }) {
  if (!config) return;
  config.syncHub = { token: token.trim() };
}

/**
 * Apply synced notify + sync hub settings to this device.
 * @returns {{ notifyApplied: boolean, syncTokenApplied: boolean }}
 */
export function applyHouseholdServicesFromConfig(config) {
  let notifyApplied = false;
  let syncTokenApplied = false;

  const notify = getNotifyServiceFromConfig(config);
  if (notify) {
    const prevUrl = localStorage.getItem(NOTIFY_URL_KEY) || '';
    const prevSecret = localStorage.getItem(NOTIFY_SECRET_KEY) || '';
    if (prevUrl !== notify.url || prevSecret !== notify.secret) {
      localStorage.setItem(NOTIFY_URL_KEY, notify.url);
      localStorage.setItem(NOTIFY_SECRET_KEY, notify.secret);
      notifyApplied = true;
    }
  }

  const syncHub = getSyncHubFromConfig(config);
  if (syncHub) {
    const prevToken = localStorage.getItem(HOUSEHOLD_SYNC_TOKEN_KEY) || '';
    if (prevToken !== syncHub.token) {
      setHouseholdSyncToken(syncHub.token);
      syncTokenApplied = true;
    }
  }

  if ((notifyApplied || syncTokenApplied) && typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('polyschedule:household-services', {
      detail: { notifyApplied, syncTokenApplied }
    }));
  }

  return { notifyApplied, syncTokenApplied };
}
