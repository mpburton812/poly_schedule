import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
  vi.stubGlobal('window', {
    dispatchEvent: vi.fn()
  });
});

vi.mock('../js/auth.js', () => ({
  AuthManager: {
    accessToken: '',
    clientId: '',
    apiKey: '',
    setCredentials(clientId, apiKey) {
      this.clientId = clientId;
      this.apiKey = apiKey;
      localStorage.setItem('polyschedule_client_id', clientId);
      localStorage.setItem('polyschedule_api_key', apiKey);
    }
  }
}));

import { AuthManager } from '../js/auth.js';
import {
  applyGoogleIntegrationFromConfig,
  getGoogleIntegrationFromConfig,
  setGoogleIntegrationOnConfig
} from '../js/google-integration.js';

beforeEach(() => {
  localStorage.clear();
  AuthManager.accessToken = '';
  AuthManager.clientId = '';
  AuthManager.apiKey = '';
  window.dispatchEvent.mockClear();
});

describe('getGoogleIntegrationFromConfig', () => {
  it('returns null when integration is incomplete', () => {
    expect(getGoogleIntegrationFromConfig({ googleIntegration: { clientId: 'a' } })).toBeNull();
  });

  it('returns integration with default calendar id', () => {
    expect(getGoogleIntegrationFromConfig({
      googleIntegration: { clientId: 'cid', apiKey: 'key' }
    })).toEqual({ clientId: 'cid', apiKey: 'key', calendarId: 'primary' });
  });
});

describe('setGoogleIntegrationOnConfig', () => {
  it('writes trimmed integration fields', () => {
    const config = {};
    setGoogleIntegrationOnConfig(config, {
      clientId: ' cid ',
      apiKey: ' key ',
      calendarId: ' shared@group.calendar.google.com '
    });
    expect(config.googleIntegration).toEqual({
      clientId: 'cid',
      apiKey: 'key',
      calendarId: 'shared@group.calendar.google.com'
    });
  });
});

describe('applyGoogleIntegrationFromConfig', () => {
  it('applies credentials to local storage and CalendarSync', () => {
    const CalendarSync = { calendarId: 'primary', apiKey: '' };
    const applied = applyGoogleIntegrationFromConfig({
      googleIntegration: {
        clientId: 'client.apps.googleusercontent.com',
        apiKey: 'AIza-test',
        calendarId: 'household@group.calendar.google.com'
      }
    }, { CalendarSync });

    expect(applied).toBe(true);
    expect(localStorage.getItem('polyschedule_client_id')).toBe('client.apps.googleusercontent.com');
    expect(localStorage.getItem('polyschedule_api_key')).toBe('AIza-test');
    expect(localStorage.getItem('polyschedule_calendar_id')).toBe('household@group.calendar.google.com');
    expect(CalendarSync.calendarId).toBe('household@group.calendar.google.com');
    expect(CalendarSync.apiKey).toBe('AIza-test');
    expect(window.dispatchEvent).toHaveBeenCalled();
  });

  it('skips when credentials already match', () => {
    localStorage.setItem('polyschedule_client_id', 'client.apps.googleusercontent.com');
    localStorage.setItem('polyschedule_api_key', 'AIza-test');
    localStorage.setItem('polyschedule_calendar_id', 'primary');

    const applied = applyGoogleIntegrationFromConfig({
      googleIntegration: {
        clientId: 'client.apps.googleusercontent.com',
        apiKey: 'AIza-test',
        calendarId: 'primary'
      }
    });

    expect(applied).toBe(false);
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });
});
