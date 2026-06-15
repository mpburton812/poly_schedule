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
    google: {
      accounts: {
        oauth2: {
          initTokenClient: vi.fn(() => ({ requestAccessToken: vi.fn() })),
          revokeToken: vi.fn()
        }
      }
    }
  });
});

import { AuthManager } from '../js/auth.js';

describe('AuthManager token lifecycle', () => {
  beforeEach(() => {
    localStorage.clear();
    AuthManager.accessToken = '';
    AuthManager.accessTokenExpiry = 0;
    AuthManager.userProfile = null;
  });

  it('stores token expiry from Google token response', () => {
    AuthManager.persistToken({ access_token: 'abc', expires_in: 3600 });
    expect(localStorage.getItem('polyschedule_access_token')).toBe('abc');
    expect(Number(localStorage.getItem('polyschedule_access_token_expiry'))).toBeGreaterThan(Date.now());
    expect(AuthManager.isAccessTokenExpired()).toBe(false);
  });

  it('marks token expired after expiry timestamp passes', () => {
    AuthManager.persistToken({ access_token: 'abc', expires_in: 3600 });
    AuthManager.accessTokenExpiry = Date.now() - 1000;
    localStorage.setItem('polyschedule_access_token_expiry', String(AuthManager.accessTokenExpiry));
    expect(AuthManager.isAccessTokenExpired()).toBe(true);
  });

  it('clears stored token and expiry together', () => {
    AuthManager.persistToken({ access_token: 'abc', expires_in: 3600 });
    AuthManager.clearStoredToken();
    expect(localStorage.getItem('polyschedule_access_token')).toBeNull();
    expect(localStorage.getItem('polyschedule_access_token_expiry')).toBeNull();
  });
});
