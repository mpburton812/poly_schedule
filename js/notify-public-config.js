import { resolvePublicNotifyUrl } from './auth-login.js';
import {
  applyGoogleIntegrationFromConfig,
  setGoogleIntegrationServerManaged
} from './google-integration.js';

let cachedNotifyPublicConfig = null;

export function clearNotifyPublicConfigCache() {
  cachedNotifyPublicConfig = null;
}

export async function fetchNotifyPublicConfig(notifyUrl = null) {
  const baseUrl = (notifyUrl || await resolvePublicNotifyUrl()).replace(/\/$/, '');
  if (!baseUrl) return null;

  try {
    const res = await fetch(`${baseUrl}/v1/config`);
    if (!res.ok) return null;
    cachedNotifyPublicConfig = await res.json();
    return cachedNotifyPublicConfig;
  } catch {
    return null;
  }
}

function applyPublicConfigGoogleIntegration(publicConfig, { CalendarSync = null } = {}) {
  const serverManaged = !!publicConfig?.googleIntegrationServerManaged;
  setGoogleIntegrationServerManaged(serverManaged);

  const gi = publicConfig?.googleIntegration;
  if (!gi?.clientId || !gi?.apiKey) {
    return { applied: false, serverManaged };
  }

  const applied = applyGoogleIntegrationFromConfig({
    googleIntegration: {
      clientId: gi.clientId,
      apiKey: gi.apiKey,
      calendarId: gi.calendarId || 'primary'
    }
  }, { CalendarSync });

  return { applied, serverManaged };
}

/** Load Google credentials from notify service public config (env-backed). */
export async function bootstrapServerGoogleIntegration({ CalendarSync = null, force = false } = {}) {
  if (cachedNotifyPublicConfig && !force) {
    return applyPublicConfigGoogleIntegration(cachedNotifyPublicConfig, { CalendarSync });
  }

  const publicConfig = await fetchNotifyPublicConfig();
  if (!publicConfig) {
    return { applied: false, serverManaged: false };
  }

  return applyPublicConfigGoogleIntegration(publicConfig, { CalendarSync });
}
