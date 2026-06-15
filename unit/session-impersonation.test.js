import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
});

import { state } from '../js/app/state.js';
import {
  hasAdminSessionAccess,
  canEditPartnerProfile,
  isAdmin
} from '../js/app/session.js';

describe('admin session access while impersonating', () => {
  beforeEach(() => {
    state.config = {
      partners: [
        { id: 'admin1', name: 'Michael', role: 'Admin', username: 'michael' },
        { id: 'p2', name: 'Bailey', role: 'User', username: 'bailey' }
      ]
    };
    state.currentUser = { id: 'p2', name: 'Bailey', username: 'bailey', sessionActive: true };
    state.impersonatorId = 'admin1';
  });

  it('grants admin session access to impersonating admin', () => {
    expect(isAdmin()).toBe(false);
    expect(hasAdminSessionAccess()).toBe(true);
  });

  it('allows editing any partner profile while impersonating as admin', () => {
    expect(canEditPartnerProfile('p2')).toBe(true);
    expect(canEditPartnerProfile('admin1')).toBe(true);
  });
});

describe('self-service partner profile edit', () => {
  beforeEach(() => {
    state.config = {
      partners: [
        { id: 'admin1', name: 'Michael', role: 'Admin', username: 'michael' },
        { id: 'p2', name: 'Bailey', role: 'User', username: 'bailey' }
      ]
    };
    state.currentUser = { id: 'p2', name: 'Bailey', username: 'bailey', sessionActive: true };
    state.impersonatorId = null;
  });

  it('lets a normal user edit their own profile only', () => {
    expect(hasAdminSessionAccess()).toBe(false);
    expect(canEditPartnerProfile('p2')).toBe(true);
    expect(canEditPartnerProfile('admin1')).toBe(false);
  });
});
