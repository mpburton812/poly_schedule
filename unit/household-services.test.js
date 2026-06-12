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

import {
  applyHouseholdServicesFromConfig,
  getNotifyServiceFromConfig,
  getSyncHubFromConfig,
  setNotifyServiceOnConfig,
  setSyncHubOnConfig
} from '../js/household-services.js';

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent.mockClear();
});

describe('notify service config', () => {
  it('round-trips notify url and secret', () => {
    const config = {};
    setNotifyServiceOnConfig(config, {
      url: 'https://notify.example.com/',
      secret: 'secret-value'
    });
    expect(getNotifyServiceFromConfig(config)).toEqual({
      url: 'https://notify.example.com',
      secret: 'secret-value'
    });
  });

  it('applies notify settings to local storage', () => {
    const result = applyHouseholdServicesFromConfig({
      notifyService: {
        url: 'https://notify.example.com',
        secret: 'household-secret'
      }
    });

    expect(result.notifyApplied).toBe(true);
    expect(localStorage.getItem('polyschedule_notify_url')).toBe('https://notify.example.com');
    expect(localStorage.getItem('polyschedule_notify_secret')).toBe('household-secret');
    expect(window.dispatchEvent).toHaveBeenCalled();
  });
});

describe('sync hub config', () => {
  it('applies sync token to local storage', () => {
    const result = applyHouseholdServicesFromConfig({
      syncHub: { token: 'abc123' }
    });

    expect(result.syncTokenApplied).toBe(true);
    expect(getSyncHubFromConfig({ syncHub: { token: 'abc123' } })).toEqual({ token: 'abc123' });
    expect(localStorage.getItem('polyschedule_sync_token')).toBe('abc123');
  });

  it('skips when values already match', () => {
    localStorage.setItem('polyschedule_notify_url', 'https://notify.example.com');
    localStorage.setItem('polyschedule_notify_secret', 'secret');

    const result = applyHouseholdServicesFromConfig({
      notifyService: {
        url: 'https://notify.example.com',
        secret: 'secret'
      }
    });

    expect(result.notifyApplied).toBe(false);
    expect(window.dispatchEvent).not.toHaveBeenCalled();
  });
});
