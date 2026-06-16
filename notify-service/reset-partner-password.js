import { getHousehold, upsertHouseholdCache } from './sync-store.js';
import { hashPassword } from './crypto.js';
import { resolvePartnerLoginContext } from './login-context.js';

export { resolvePartnerLoginContext };

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
  if (ctx.error) {
    return { ok: false, code: ctx.error.code || 'NOT_FOUND', message: ctx.error.message };
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
