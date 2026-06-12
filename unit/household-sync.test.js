import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
  vi.stubGlobal('crypto', {
    randomUUID: () => 'test-uuid-1234',
    getRandomValues: (arr) => {
      for (let i = 0; i < arr.length; i += 1) arr[i] = i;
      return arr;
    }
  });
});

import {
  bumpSyncRevision,
  ensureHouseholdIdentity,
  generateHouseholdSyncToken,
  getDeviceId,
  isSyncHubConfigured,
  setHouseholdSyncToken,
  getHouseholdSyncToken
} from '../js/household-sync.js';
import { NOTIFY_SECRET_KEY, NOTIFY_URL_KEY } from '../js/storage-keys.js';

beforeEach(() => {
  localStorage.clear();
});

describe('ensureHouseholdIdentity', () => {
  it('assigns householdId and syncRevision when missing', () => {
    const config = { partners: [] };
    const changed = ensureHouseholdIdentity(config);
    expect(changed).toBe(true);
    expect(config.householdId).toBe('test-uuid-1234');
    expect(config.syncRevision).toBe(0);
  });

  it('returns false when identity already exists', () => {
    const config = { householdId: 'hh-1', syncRevision: 3 };
    expect(ensureHouseholdIdentity(config)).toBe(false);
  });
});

describe('bumpSyncRevision', () => {
  it('increments revision and ensures identity', () => {
    const config = {};
    expect(bumpSyncRevision(config)).toBe(1);
    expect(bumpSyncRevision(config)).toBe(2);
  });
});

describe('sync hub configuration', () => {
  it('detects when notify service credentials are present', () => {
    expect(isSyncHubConfigured()).toBe(false);
    localStorage.setItem(NOTIFY_URL_KEY, 'https://notify.example.com');
    localStorage.setItem(NOTIFY_SECRET_KEY, 'secret');
    expect(isSyncHubConfigured()).toBe(true);
  });
});

describe('device and token helpers', () => {
  it('creates a stable device id', () => {
    expect(getDeviceId()).toMatch(/^dev_/);
    expect(getDeviceId()).toBe(getDeviceId());
  });

  it('stores household sync token', () => {
    setHouseholdSyncToken('abc');
    expect(getHouseholdSyncToken()).toBe('abc');
  });

  it('generates a hex sync token', () => {
    const token = generateHouseholdSyncToken();
    expect(token).toMatch(/^[0-9a-f]+$/);
    expect(token.length).toBe(48);
  });
});
