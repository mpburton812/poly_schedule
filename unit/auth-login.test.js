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

import { loginViaNotifyService, resolvePublicNotifyUrl } from '../js/auth-login.js';

describe('auth-login client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('resolves notify url from version.json when local storage is empty', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ notifyUrl: 'https://notify.example.com/' })
    });
    await expect(resolvePublicNotifyUrl()).resolves.toBe('https://notify.example.com');
  });

  it('hydrates household state from remote login response', async () => {
    localStorage.setItem('polyschedule_notify_url', 'https://notify.example.com');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        householdId: 'hh1',
        partner: { id: 'p1', name: 'Alex', username: 'alex', role: 'Admin' },
        config: { householdId: 'hh1', partners: [{ id: 'p1', name: 'Alex', username: 'alex', role: 'Admin' }], residences: [] },
        googleIntegration: {
          clientId: 'client.apps.googleusercontent.com',
          apiKey: 'AIza-test',
          calendarId: 'primary',
          serverManaged: true
        },
        events: [],
        revision: 3
      })
    });

    const result = await loginViaNotifyService('alex', 'secret');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.config.householdId).toBe('hh1');
      expect(result.partner.username).toBe('alex');
      expect(result.googleIntegration?.serverManaged).toBe(true);
    }
  });
});
