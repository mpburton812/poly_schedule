import { NOTIFY_SECRET_KEY, NOTIFY_URL_KEY } from './storage-keys.js';

function getNotifyConfig() {
  return {
    url: (localStorage.getItem(NOTIFY_URL_KEY) || '').replace(/\/$/, ''),
    secret: localStorage.getItem(NOTIFY_SECRET_KEY) || ''
  };
}

function notifyConfigured() {
  const { url, secret } = getNotifyConfig();
  return !!(url && secret);
}

/**
 * @returns {Promise<{ ok: true, config: object, revision: number, partner: object } | { ok: false, message: string }>}
 */
export async function createPartnerViaNotify(householdId, partner, { actorPartnerId = null } = {}) {
  if (!notifyConfigured()) {
    return { ok: false, message: 'Notify service is not configured for this household.' };
  }
  const { url, secret } = getNotifyConfig();
  try {
    const res = await fetch(`${url}/v1/household/partners`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Notify-Secret': secret
      },
      body: JSON.stringify({ householdId, partner, actorPartnerId })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: body.error || 'Could not create partner on the notify service.' };
    }
    return {
      ok: true,
      config: body.config,
      revision: body.revision,
      partner: body.partner
    };
  } catch {
    return { ok: false, message: 'Could not reach the notify service.' };
  }
}

/**
 * @returns {Promise<{ ok: true, config: object, revision: number } | { ok: false, message: string }>}
 */
export async function deletePartnerViaNotify(householdId, partnerId, { actorPartnerId = null } = {}) {
  if (!notifyConfigured()) {
    return { ok: false, message: 'Notify service is not configured for this household.' };
  }
  const { url, secret } = getNotifyConfig();
  try {
    const params = new URLSearchParams({ householdId });
    const res = await fetch(`${url}/v1/household/partners/${encodeURIComponent(partnerId)}?${params}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Notify-Secret': secret
      },
      body: JSON.stringify({ householdId, actorPartnerId })
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: body.error || 'Could not delete partner on the notify service.' };
    }
    return {
      ok: true,
      config: body.config,
      revision: body.revision
    };
  } catch {
    return { ok: false, message: 'Could not reach the notify service.' };
  }
}

/**
 * @returns {Promise<{ ok: true, report: object } | { ok: false, message: string }>}
 */
export async function fetchUserHealthReport(householdId) {
  if (!notifyConfigured()) {
    return { ok: false, message: 'Notify service is not configured for this household.' };
  }
  const { url, secret } = getNotifyConfig();
  try {
    const params = new URLSearchParams();
    if (householdId) params.set('householdId', householdId);
    const res = await fetch(`${url}/v1/admin/users/health?${params}`, {
      headers: { 'X-Notify-Secret': secret }
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, message: body.error || 'Could not load user health report.' };
    }
    return { ok: true, report: body };
  } catch {
    return { ok: false, message: 'Could not reach the notify service.' };
  }
}
