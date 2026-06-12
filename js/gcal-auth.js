import { AuthManager } from './auth.js';
import { ACCESS_TOKEN_KEY, API_KEY_KEY, CALENDAR_ID_KEY } from './storage-keys.js';
import { canWriteToGoogleCalendar } from './gcal-sync.js';
import { setCalendarStatus } from './calendar-status.js';

/** Copy the latest OAuth credentials from AuthManager onto CalendarSync. */
export function syncCalendarSyncFromAuth(calendarSync) {
  AuthManager.reloadFromStorage();
  calendarSync.accessToken = AuthManager.accessToken || '';
  calendarSync.apiKey = AuthManager.apiKey || localStorage.getItem(API_KEY_KEY) || '';
  calendarSync.calendarId = localStorage.getItem(CALENDAR_ID_KEY) || calendarSync.calendarId || 'primary';
}

/** Ensure CalendarSync has a live token before calling the Calendar API. */
export function prepareCalendarSyncForWrite(calendarSync) {
  syncCalendarSyncFromAuth(calendarSync);
  if (calendarSync.accessToken && calendarSync.apiKey && calendarSync.mode !== 'sync') {
    calendarSync.mode = 'sync';
  }
  if (!canWriteToGoogleCalendar(calendarSync)) {
    const err = new Error('Google Calendar is not connected. Use the OFFLINE banner to reconnect.');
    err.code = 'GOOGLE_AUTH_EXPIRED';
    throw err;
  }
}

/** Mark session expired and surface the OFFLINE re-auth banner. */
export function handleGCalAuthFailure(err, calendarSync) {
  if (err?.code !== 'GOOGLE_AUTH_EXPIRED' && err?.status !== 401) return false;

  AuthManager.accessToken = '';
  calendarSync.accessToken = '';
  localStorage.removeItem(ACCESS_TOKEN_KEY);
  calendarSync.mode = 'cache';
  setCalendarStatus('disconnected');
  return true;
}

/** Run a Calendar API action with fresh credentials and auth-expiry handling. */
export async function withGCalAuth(calendarSync, action) {
  prepareCalendarSyncForWrite(calendarSync);
  try {
    return await action();
  } catch (err) {
    if (handleGCalAuthFailure(err, calendarSync)) {
      const wrapped = new Error(
        'Google Calendar session expired. Click the OFFLINE banner at the top to sign in again.'
      );
      wrapped.code = 'GOOGLE_AUTH_EXPIRED';
      wrapped.cause = err;
      throw wrapped;
    }
    throw err;
  }
}
