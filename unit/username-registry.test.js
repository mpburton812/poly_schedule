import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
});

import {
  normalizeUsername,
  isUsernameTakenLocally,
  assertUsernameAvailable,
  checkUsernameGloballyAvailable
} from '../js/username-registry.js';

describe('username-registry client', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it('normalizes usernames case-insensitively', () => {
    expect(normalizeUsername(' MpBurton ')).toBe('mpburton');
  });

  it('detects duplicate usernames within a household config', () => {
    const config = {
      partners: [
        { id: 'p1', username: 'alex', password: 'x' },
        { id: 'p2', username: 'sam', password: 'y' }
      ]
    };
    expect(isUsernameTakenLocally(config, 'alex')).toBe(true);
    expect(isUsernameTakenLocally(config, 'ALEX', 'p1')).toBe(false);
    expect(isUsernameTakenLocally(config, 'sam', 'p2')).toBe(false);
  });

  it('treats username as available when notify service is not configured', async () => {
    const result = await checkUsernameGloballyAvailable('newuser');
    expect(result).toEqual({ ok: true, available: true, verified: false });
  });

  it('rejects locally taken usernames before calling notify service', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const config = { householdId: 'hh1', partners: [{ id: 'p1', username: 'taken', password: 'x' }] };
    const result = await assertUsernameAvailable('taken', { config, partnerId: null, householdId: 'hh1' });
    expect(result.ok).toBe(false);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('uses notify service availability when configured', async () => {
    localStorage.setItem('polyschedule_notify_url', 'https://notify.example.com');
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({ available: false })
    });

    const result = await assertUsernameAvailable('remote-user', {
      config: { householdId: 'hh1', partners: [] },
      partnerId: null,
      householdId: 'hh1'
    });

    expect(result.ok).toBe(false);
    expect(result.message).toContain('another household');
  });
});
