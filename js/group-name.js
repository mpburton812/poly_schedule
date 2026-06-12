import { FAMILY_NAME_KEY } from './storage-keys.js';

const DEFAULT_GROUP_NAME = 'The Poly Circle';

export function getGroupName(config) {
  const fromConfig = String(config?.groupName || '').trim();
  if (fromConfig) return fromConfig;
  try {
    const legacy = localStorage.getItem(FAMILY_NAME_KEY);
    if (legacy?.trim()) return legacy.trim();
  } catch {
    /* ignore */
  }
  return DEFAULT_GROUP_NAME;
}

/** One-time migration from local-only family name to synced config. */
export function migrateFamilyNameToConfig(config) {
  if (!config) return false;
  if (String(config.groupName || '').trim()) return false;
  try {
    const legacy = localStorage.getItem(FAMILY_NAME_KEY);
    if (!legacy?.trim()) return false;
    config.groupName = legacy.trim();
    localStorage.removeItem(FAMILY_NAME_KEY);
    return true;
  } catch {
    return false;
  }
}
