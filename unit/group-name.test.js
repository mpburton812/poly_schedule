import { beforeEach, describe, expect, it, vi } from 'vitest';
import { FAMILY_NAME_KEY } from '../js/storage-keys.js';
import { getGroupName, migrateFamilyNameToConfig } from '../js/group-name.js';

vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
});

describe('getGroupName', () => {
  beforeEach(() => localStorage.clear());

  it('prefers synced config groupName', () => {
    expect(getGroupName({ groupName: 'Burton Circle' })).toBe('Burton Circle');
  });

  it('falls back to legacy localStorage name', () => {
    localStorage.setItem(FAMILY_NAME_KEY, 'Legacy Name');
    expect(getGroupName({ partners: [] })).toBe('Legacy Name');
  });
});

describe('migrateFamilyNameToConfig', () => {
  beforeEach(() => localStorage.clear());

  it('copies legacy local name into config once', () => {
    localStorage.setItem(FAMILY_NAME_KEY, 'Migrated Group');
    const config = { partners: [] };
    expect(migrateFamilyNameToConfig(config)).toBe(true);
    expect(config.groupName).toBe('Migrated Group');
    expect(localStorage.getItem(FAMILY_NAME_KEY)).toBeNull();
  });
});
