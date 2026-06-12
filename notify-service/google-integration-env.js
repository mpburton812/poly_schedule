/**
 * Household Google Calendar credentials from notify service environment variables.
 * When set, all devices receive these on login and via GET /v1/config.
 */

export function getGoogleIntegrationFromEnv() {
  const clientId = String(process.env.GOOGLE_CLIENT_ID || '').trim();
  const apiKey = String(process.env.GOOGLE_API_KEY || '').trim();
  const calendarId = String(process.env.GOOGLE_CALENDAR_ID || 'primary').trim() || 'primary';
  if (!clientId || !apiKey) return null;
  return { clientId, apiKey, calendarId };
}

export function isGoogleIntegrationEnvManaged() {
  return getGoogleIntegrationFromEnv() !== null;
}

/**
 * Env vars take precedence over household config when both are present.
 * @param {object|null|undefined} householdConfig
 */
export function resolveGoogleIntegration(householdConfig) {
  const fromEnv = getGoogleIntegrationFromEnv();
  if (fromEnv) {
    return { ...fromEnv, serverManaged: true };
  }

  const gi = householdConfig?.googleIntegration;
  if (!gi?.clientId || !gi?.apiKey) return null;
  return {
    clientId: gi.clientId,
    apiKey: gi.apiKey,
    calendarId: gi.calendarId || 'primary',
    serverManaged: false
  };
}

/**
 * @param {object|null|undefined} householdConfig
 */
export function mergeGoogleIntegrationIntoConfig(householdConfig) {
  const resolved = resolveGoogleIntegration(householdConfig);
  if (!resolved || !householdConfig) return householdConfig;

  const copy = JSON.parse(JSON.stringify(householdConfig));
  copy.googleIntegration = {
    clientId: resolved.clientId,
    apiKey: resolved.apiKey,
    calendarId: resolved.calendarId
  };
  return copy;
}
