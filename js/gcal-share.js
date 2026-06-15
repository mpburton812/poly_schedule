import { AuthManager } from './auth.js';
import { CalendarSync } from './calendar.js';
import { CALENDAR_ID_KEY } from './storage-keys.js';
import { googleApiErrorFromResponse } from './gcal-sync.js';
import { normalizeEmail } from './helpers.js';

/**
 * Grant a Google account access to the household calendar (Calendar ACL API).
 * Requires an admin device connected to Google with permission to manage sharing.
 */
export async function shareHouseholdCalendarWithEmail(rawEmail, {
  role = 'writer',
  calendarId = null,
  accessToken = null,
  apiKey = null,
  sendNotifications = true
} = {}) {
  const email = normalizeEmail(rawEmail);
  if (!email || !email.includes('@')) {
    return { ok: false, code: 'INVALID_EMAIL', message: 'A valid Google account email is required.' };
  }

  const token = accessToken || AuthManager.accessToken;
  const key = apiKey || AuthManager.apiKey || CalendarSync.apiKey;
  const calId = calendarId || CalendarSync.calendarId || localStorage.getItem(CALENDAR_ID_KEY) || 'primary';

  if (!token || !key) {
    return {
      ok: false,
      code: 'NOT_CONNECTED',
      message: 'Google Calendar is not connected on this device. Connect Google first, then retry.'
    };
  }

  const params = new URLSearchParams({ key });
  if (sendNotifications) params.set('sendNotifications', 'true');

  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calId)}/acl?${params}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        role,
        scope: { type: 'user', value: email }
      })
    });

    if (res.ok) {
      return { ok: true, email, calendarId: calId, alreadyShared: false };
    }

    if (res.status === 409) {
      return { ok: true, email, calendarId: calId, alreadyShared: true };
    }

    const err = await googleApiErrorFromResponse(res, 'Failed to share household calendar');
    const duplicate = err.message?.includes('duplicate') || err.message?.includes('already exists');
    if (duplicate) {
      return { ok: true, email, calendarId: calId, alreadyShared: true };
    }

    return { ok: false, code: err.code || 'SHARE_FAILED', message: err.message };
  } catch (e) {
    return { ok: false, code: 'NETWORK_ERROR', message: e.message || 'Could not reach Google Calendar.' };
  }
}
