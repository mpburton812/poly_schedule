import { NOTIFY_SECRET_KEY, NOTIFY_URL_KEY } from './storage-keys.js';
import { isPartnerPassive } from './helpers.js';

function getNotifyConfig() {
  return {
    url: (localStorage.getItem(NOTIFY_URL_KEY) || '').replace(/\/$/, ''),
    secret: localStorage.getItem(NOTIFY_SECRET_KEY) || ''
  };
}

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

export function isUsernameTakenLocally(config, username, excludePartnerId = null) {
  const normalized = normalizeUsername(username);
  if (!normalized) return false;
  return (config?.partners || []).some((partner) => {
    if (excludePartnerId && partner.id === excludePartnerId) return false;
    if (isPartnerPassive(partner)) return false;
    return normalizeUsername(partner.username) === normalized;
  });
}

/**
 * @returns {Promise<{ ok: true, available: boolean, verified: boolean } | { ok: false, message: string }>}
 */
export async function checkUsernameGloballyAvailable(username, { householdId = null, partnerId = null } = {}) {
  const trimmed = String(username || '').trim();
  if (!trimmed) {
    return { ok: false, message: 'Username is required.' };
  }

  const { url } = getNotifyConfig();
  if (!url) {
    return { ok: true, available: true, verified: false };
  }

  try {
    const params = new URLSearchParams({ username: trimmed });
    if (householdId) params.set('householdId', householdId);
    if (partnerId) params.set('partnerId', partnerId);
    const res = await fetch(`${url}/v1/usernames/check?${params.toString()}`);
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, message: body.error || 'Could not verify username availability.' };
    }
    const data = await res.json();
    return { ok: true, available: !!data.available, verified: true };
  } catch {
    return { ok: false, message: 'Could not reach the username registry. Try again later.' };
  }
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function assertUsernameAvailable(username, {
  config,
  partnerId = null,
  householdId = config?.householdId || null
} = {}) {
  const trimmed = String(username || '').trim();
  if (!trimmed) {
    return { ok: false, message: 'Username is required.' };
  }

  if (isUsernameTakenLocally(config, trimmed, partnerId)) {
    return { ok: false, message: 'This username is already used in your household.' };
  }

  const global = await checkUsernameGloballyAvailable(trimmed, { householdId, partnerId });
  if (!global.ok) {
    return global;
  }
  if (!global.available) {
    return { ok: false, message: 'This username is already used by another household. Choose a different username.' };
  }

  return { ok: true, verified: global.verified };
}

/**
 * @returns {Promise<{ ok: true } | { ok: false, message: string }>}
 */
export async function claimUsernameGlobally(username, householdId, partnerId) {
  const trimmed = String(username || '').trim();
  const { url, secret } = getNotifyConfig();
  if (!url || !secret || !householdId || !partnerId) {
    return { ok: true, verified: false };
  }

  try {
    const res = await fetch(`${url}/v1/usernames/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Notify-Secret': secret
      },
      body: JSON.stringify({ username: trimmed, householdId, partnerId })
    });
    if (res.status === 409) {
      return { ok: false, message: 'This username is already used by another household. Choose a different username.' };
    }
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return { ok: false, message: body.error || 'Could not register username.' };
    }
    return { ok: true, verified: true };
  } catch {
    return { ok: false, message: 'Could not register username with the sync service.' };
  }
}
