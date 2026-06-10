import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGS_STORAGE_KEY } from '../js/helpers.js';

const storage = vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
  return { local };
});

vi.mock('../js/calendar.js', () => ({
  CalendarSync: { mode: 'offline' }
}));

describe('logOperationError', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { state } = await import('../js/app/state.js');
    state.logs = [];
    state.currentUser = { name: 'Michael Burton', sessionActive: true };
    state.currentView = 'create';
    state.isOffline = true;
  });

  it('persists error details and support context to system logs', async () => {
    const { logOperationError, loadPersistedLogs } = await import('../js/app/context.js');
    const err = new Error('Failed to update calendar event on Google Calendar');

    logOperationError('Proposal submit', err, {
      draftId: 'prop_123',
      proposalTitle: 'Dinner'
    });

    const saved = loadPersistedLogs();
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe('error');
    expect(saved[0].operation).toBe('Proposal submit');
    expect(saved[0].errorMessage).toBe(err.message);
    expect(saved[0].support.user).toBe('Michael Burton');
    expect(saved[0].support.draftId).toBe('prop_123');
    expect(saved[0].message).toContain('Proposal submit failed');
    expect(saved[0].message).toContain('draftId=prop_123');
    expect(localStorage.getItem(LOGS_STORAGE_KEY)).toContain('Proposal submit failed');
  });
});
