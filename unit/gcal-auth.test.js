import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
});

vi.mock('../js/calendar-status.js', () => ({
  setCalendarStatus: vi.fn()
}));

import { AuthManager } from '../js/auth.js';
import { handleGCalAuthFailure, prepareCalendarSyncForWrite } from '../js/gcal-auth.js';

describe('prepareCalendarSyncForWrite', () => {
  beforeEach(() => {
    localStorage.clear();
    AuthManager.accessToken = '';
    AuthManager.apiKey = '';
  });

  it('throws when no access token is available', () => {
    localStorage.setItem('polyschedule_client_id', 'client');
    localStorage.setItem('polyschedule_api_key', 'key');
    const calendarSync = { mode: 'sync', accessToken: '', apiKey: '', calendarId: 'primary' };

    expect(() => prepareCalendarSyncForWrite(calendarSync)).toThrow(/not connected/i);
  });

  it('copies AuthManager credentials onto CalendarSync', () => {
    localStorage.setItem('polyschedule_client_id', 'client');
    localStorage.setItem('polyschedule_api_key', 'key');
    localStorage.setItem('polyschedule_access_token', 'token');
    AuthManager.reloadFromStorage();
    const calendarSync = { mode: 'cache', accessToken: '', apiKey: '', calendarId: 'primary' };

    prepareCalendarSyncForWrite(calendarSync);
    expect(calendarSync.accessToken).toBe('token');
    expect(calendarSync.apiKey).toBe('key');
    expect(calendarSync.mode).toBe('sync');
  });
});

describe('handleGCalAuthFailure', () => {
  it('clears expired credentials and switches to cache mode', () => {
    localStorage.setItem('polyschedule_access_token', 'stale');
    const calendarSync = { mode: 'sync', accessToken: 'stale' };
    const err = new Error('auth');
    err.status = 401;
    err.code = 'GOOGLE_AUTH_EXPIRED';

    expect(handleGCalAuthFailure(err, calendarSync)).toBe(true);
    expect(calendarSync.mode).toBe('cache');
    expect(calendarSync.accessToken).toBe('');
    expect(localStorage.getItem('polyschedule_access_token')).toBeNull();
  });
});
