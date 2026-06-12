import { ACCESS_TOKEN_KEY, CLIENT_ID_KEY, API_KEY_KEY } from './storage-keys.js';
import { AuthManager } from './auth.js';
import { state } from './app/state.js';
import { showToast } from './app/toast.js';

/** @typedef {'unknown'|'connecting'|'connected'|'disconnected'} CalendarStatus */

export function isGoogleCalendarReady() {
  AuthManager.reloadFromStorage?.();
  return !!(
    localStorage.getItem(CLIENT_ID_KEY)
    && localStorage.getItem(API_KEY_KEY)
    && (AuthManager.accessToken || localStorage.getItem(ACCESS_TOKEN_KEY))
  );
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
    import('./auth.js').then(({ AuthManager }) => {
      try {
        setCalendarStatus('connecting');
        AuthManager.login();
      } catch (err) {
        setCalendarStatus('disconnected');
        showToast(err.message || 'Could not start Google sign-in.', 'error');
      }
    });
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
