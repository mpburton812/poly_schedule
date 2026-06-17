import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { normalizeEmail } from '../js/helpers.js';

const storage = new Map();

vi.stubGlobal('localStorage', {
  getItem: (key) => storage.get(key) ?? null,
  setItem: (key, value) => storage.set(key, value),
  removeItem: (key) => storage.delete(key)
});

const authState = vi.hoisted(() => ({
  userProfile: null,
  accessToken: '',
  logoutCalls: 0
}));

vi.mock('../js/auth.js', () => ({
  AuthManager: {
    reloadFromStorage: () => {},
    get userProfile() {
      return authState.userProfile;
    },
    get accessToken() {
      return authState.accessToken;
    },
    logout() {
      authState.logoutCalls += 1;
      authState.userProfile = null;
      authState.accessToken = '';
      storage.delete('polyschedule_access_token');
      storage.delete('polyschedule_google_profile');
    },
    login: vi.fn()
  }
}));

const {
  googleEmailMatchesPartner,
  isGoogleSessionValidForPartner,
  clearGoogleSessionIfPartnerMismatch,
  beginPartnerGoogleConnect
} = await import('../js/google-partner-session.js');
const { AuthManager } = await import('../js/auth.js');

describe('google-partner-session', () => {
  beforeEach(() => {
    storage.clear();
    authState.userProfile = null;
    authState.accessToken = '';
    authState.logoutCalls = 0;
    storage.set('polyschedule_client_id', 'client');
    storage.set('polyschedule_api_key', 'key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('detects configured vs connected email mismatch', () => {
    const partner = { googleEmail: 'thegayagenda36@gmail.com' };
    expect(googleEmailMatchesPartner(partner, 'mpburton@gmail.com')).toBe(false);
    expect(googleEmailMatchesPartner(partner, 'thegayagenda36@gmail.com')).toBe(true);
  });

  it('clears stale Google session when partner expects a different email', () => {
    authState.accessToken = 'token';
    authState.userProfile = { email: 'mpburton@gmail.com' };
    storage.set('polyschedule_access_token', 'token');
    const partner = { googleEmail: 'thegayagenda36@gmail.com' };
    expect(clearGoogleSessionIfPartnerMismatch(partner)).toBe(true);
    expect(authState.logoutCalls).toBe(1);
    expect(isGoogleSessionValidForPartner(partner)).toBe(false);
  });

  it('forces account selection when connecting Google for a configured partner', () => {
    authState.userProfile = { email: 'mpburton@gmail.com' };
    authState.accessToken = 'token';
    const partner = { googleEmail: 'thegayagenda36@gmail.com' };
    beginPartnerGoogleConnect(partner);
    expect(AuthManager.login).toHaveBeenCalledWith({ forceConsent: true });
    expect(authState.logoutCalls).toBe(1);
  });
});

vi.mock('../js/app/toast.js', () => ({
  showToast: vi.fn()
}));

describe('syncPartnerGoogleEmailFromAuth', () => {
  it('does not overwrite an admin-configured googleEmail', async () => {
    const { syncPartnerGoogleEmailFromAuth } = await import('../js/app/household-config.js');
    const { state } = await import('../js/app/state.js');
    state.impersonatorId = null;
    state.config = {
      householdId: 'hh1',
      partners: [{ id: 'p9', name: 'Test', googleEmail: 'thegayagenda36@gmail.com' }]
    };
    state.currentUser = { id: 'p9' };

    const calendar = await import('../js/calendar.js');
    calendar.CalendarSync.saveConfig = vi.fn(async () => ({ ok: true }));
    calendar.CalendarSync.config = state.config;

    const status = await import('../js/calendar-status.js');
    vi.spyOn(status, 'assertCalendarConnectedForWrite').mockReturnValue(true);

    const result = await syncPartnerGoogleEmailFromAuth('p9', 'mpburton@gmail.com');
    expect(result).toBe(false);
    expect(normalizeEmail(state.config.partners[0].googleEmail)).toBe('thegayagenda36@gmail.com');
  });
});
