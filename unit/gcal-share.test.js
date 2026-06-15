import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../js/auth.js', () => ({
  AuthManager: { accessToken: 'token', apiKey: 'key' }
}));

vi.mock('../js/calendar.js', () => ({
  CalendarSync: { calendarId: 'household@group.calendar.google.com', apiKey: 'key' }
}));

vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
});

import { shareHouseholdCalendarWithEmail } from '../js/gcal-share.js';

describe('shareHouseholdCalendarWithEmail', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('rejects invalid email', async () => {
    await expect(shareHouseholdCalendarWithEmail('not-an-email')).resolves.toEqual({
      ok: false,
      code: 'INVALID_EMAIL',
      message: 'A valid Google account email is required.'
    });
  });

  it('creates an ACL rule for the household calendar', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ id: 'acl1' })
    });

    const result = await shareHouseholdCalendarWithEmail('Katie@Example.com');
    expect(result.ok).toBe(true);
    expect(result.email).toBe('katie@example.com');
    expect(result.alreadyShared).toBe(false);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/calendars/household%40group.calendar.google.com/acl');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body)).toEqual({
      role: 'writer',
      scope: { type: 'user', value: 'katie@example.com' }
    });
  });

  it('treats duplicate ACL as success', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: false,
      status: 409,
      text: async () => JSON.stringify({ error: { message: 'Duplicate' } })
    });

    const result = await shareHouseholdCalendarWithEmail('katie@gmail.com');
    expect(result).toEqual({
      ok: true,
      email: 'katie@gmail.com',
      calendarId: 'household@group.calendar.google.com',
      alreadyShared: true
    });
  });
});
