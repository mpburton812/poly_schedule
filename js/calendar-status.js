import { ACCESS_TOKEN_KEY, CLIENT_ID_KEY, API_KEY_KEY } from './storage-keys.js';
import { AuthManager } from './auth.js';
import { ensureGoogleCredentialsFromConfig } from './google-integration.js';
import { state } from './app/state.js';
import { showToast } from './app/toast.js';
import { getCurrentUserPartner } from './helpers.js';
import { beginPartnerGoogleConnect } from './google-partner-session.js';

/** @typedef {'unknown'|'connecting'|'connected'|'disconnected'} CalendarStatus */

export function hasGoogleIntegrationCredentials() {
  AuthManager.reloadFromStorage?.();
  return !!(
    localStorage.getItem(CLIENT_ID_KEY)
    && localStorage.getItem(API_KEY_KEY)
  );
}

export function hasGoogleAccessToken() {
  AuthManager.reloadFromStorage?.();
  return !!(AuthManager.accessToken || localStorage.getItem(ACCESS_TOKEN_KEY));
}

export function isGoogleCalendarReady() {
  return hasGoogleIntegrationCredentials() && hasGoogleAccessToken();
}

/** @param {CalendarStatus} status */
export function setCalendarStatus(status) {
  state.calendarStatus = status;
  updateOfflineBanner();
}

export function isCalendarConnected() {
  return state.calendarStatus === 'connected';
}

export function updateOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner) return;

  const show = state.currentUser?.sessionActive && !isCalendarConnected();
  banner.style.display = show ? 'flex' : 'none';
}

export function bindOfflineBanner() {
  const banner = document.getElementById('offline-banner');
  if (!banner || banner.dataset.bound) return;
  banner.dataset.bound = '1';
  banner.addEventListener('click', () => {
    void (async () => {
      const { CalendarSync } = await import('./calendar.js');
      ensureGoogleCredentialsFromConfig(state.config, { CalendarSync });
      try {
        setCalendarStatus('connecting');
        AuthManager.reloadFromStorage();
        const partner = getCurrentUserPartner(state.config, state.currentUser);
        beginPartnerGoogleConnect(partner);
      } catch (err) {
        setCalendarStatus('disconnected');
        showToast(err.message || 'Could not start Google sign-in.', 'error');
      }
    })();
  });
  banner.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      banner.click();
    }
  });
}

export function assertCalendarConnectedForWrite() {
  if (typeof window !== 'undefined' && window.__POLYSCHEDULE_E2E__) {
    return true;
  }
  if (!isGoogleCalendarReady()) {
    setCalendarStatus('disconnected');
    showToast('Google Calendar is not connected. Use the OFFLINE banner to sign in again.', 'warning');
    return false;
  }
  if (!isCalendarConnected()) {
    showToast('Calendar sync is offline. Reconnect using the banner at the top.', 'warning');
    return false;
  }
  return true;
}
