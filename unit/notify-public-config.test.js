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
    },
    reloadFromStorage() {
      this.clientId = localStorage.getItem('polyschedule_client_id') || '';
      this.apiKey = localStorage.getItem('polyschedule_api_key') || '';
    }
  }
}));

import {
  bootstrapServerGoogleIntegration,
  clearNotifyPublicConfigCache,
  fetchNotifyPublicConfig
} from '../js/notify-public-config.js';
import { isGoogleIntegrationServerManaged } from '../js/google-integration.js';

describe('notify-public-config client', () => {
  beforeEach(() => {
    localStorage.clear();
    clearNotifyPublicConfigCache();
    vi.restoreAllMocks();
  });

  it('loads env-backed google integration from notify public config', async () => {
    localStorage.setItem('polyschedule_notify_url', 'https://notify.example.com');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        publicKey: 'vapid',
        googleIntegrationServerManaged: true,
        googleIntegration: {
          clientId: 'client.apps.googleusercontent.com',
          apiKey: 'AIza-test',
          calendarId: 'shared@group.calendar.google.com'
        }
      })
    });

    const result = await bootstrapServerGoogleIntegration();
    expect(result).toEqual({ applied: true, serverManaged: true });
    expect(isGoogleIntegrationServerManaged()).toBe(true);
    expect(localStorage.getItem('polyschedule_client_id')).toBe('client.apps.googleusercontent.com');
    expect(localStorage.getItem('polyschedule_calendar_id')).toBe('shared@group.calendar.google.com');
  });

  it('returns serverManaged without applying when integration is missing', async () => {
    localStorage.setItem('polyschedule_notify_url', 'https://notify.example.com');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        publicKey: 'vapid',
        googleIntegrationServerManaged: true,
        googleIntegration: null
      })
    });

    const publicConfig = await fetchNotifyPublicConfig();
    expect(publicConfig.googleIntegrationServerManaged).toBe(true);
    await expect(bootstrapServerGoogleIntegration()).resolves.toEqual({
      applied: false,
      serverManaged: true
    });
  });
});
