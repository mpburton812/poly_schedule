import { getHousehold, upsertHouseholdCache } from './sync-store.js';
import { hashPassword } from './crypto.js';
import { isUsernameTaken, normalizeUsername } from './username-registry.js';
import { getFixedHouseholdId } from './fixed-household.js';

function findLoginPartner(config, normalizedUsername) {
  return (config?.partners || []).find((partner) => {
    if (partner?.passive || !partner?.username) return false;
    return normalizeUsername(partner.username) === normalizedUsername;
  }) || null;
}

export function resolvePartnerLoginContext(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) return null;

  const fixedHouseholdId = getFixedHouseholdId();
  if (fixedHouseholdId) {
    const household = getHousehold(fixedHouseholdId);
    if (!household?.config) return null;
    const partner = findLoginPartner(household.config, normalized);
    if (!partner) return null;
    return { householdId: fixedHouseholdId, household, partner };
  }

  const lookup = isUsernameTaken(username);
  if (!lookup.taken || !lookup.householdId || !lookup.partnerId) return null;

  const household = getHousehold(lookup.householdId);
  if (!household?.config) return null;

  const partner = findLoginPartner(household.config, lookup.normalized || normalized);
  if (!partner || partner.id !== lookup.partnerId) return null;

  return { householdId: lookup.householdId, household, partner };
}

/**
 * Set a partner password hash in the notify household cache (lockout recovery).
 * @returns {Promise<{ ok: true, householdId: string, partnerId: string, username: string } | { ok: false, code: string, message: string }>}
 */
export async function resetPartnerPassword(username, newPassword) {
  const trimmedPassword = String(newPassword || '');
  if (!trimmedPassword) {
    return { ok: false, code: 'BAD_REQUEST', message: 'Password is required.' };
  }

  const ctx = resolvePartnerLoginContext(username);
  if (!ctx) {
    return { ok: false, code: 'NOT_FOUND', message: 'Partner not found for that username.' };
  }

  const { householdId, household, partner } = ctx;
  const config = JSON.parse(JSON.stringify(household.config));
  const target = config.partners.find((row) => row.id === partner.id);
  if (!target) {
    return { ok: false, code: 'NOT_FOUND', message: 'Partner not found in household config.' };
  }

  target.passwordHash = await hashPassword(trimmedPassword, partner.id);
  delete target.password;

  upsertHouseholdCache(householdId, {
    revision: (household.revision || 0) + 1,
    config,
    events: household.events
  });

  return {
    ok: true,
    householdId,
    partnerId: partner.id,
    username: partner.username
  };
}
