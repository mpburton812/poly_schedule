import { getHousehold } from './sync-store.js';
import { lookupUsernameForLogin, normalizeUsername } from './username-registry.js';
import { getFixedHouseholdId } from './fixed-household.js';

function findLoginPartner(config, normalizedUsername) {
  return (config?.partners || []).find((partner) => {
    if (partner?.passive || !partner?.username) return false;
    return normalizeUsername(partner.username) === normalizedUsername;
  }) || null;
}

/**
 * @returns {{ householdId: string, household: object, partner: object } | { error: { code: string, message: string } }}
 */
export function resolvePartnerLoginContext(username) {
  const normalized = normalizeUsername(username);
  if (!normalized) {
    return { error: { code: 'BAD_REQUEST', message: 'Username is required.' } };
  }

  const fixedHouseholdId = getFixedHouseholdId();
  if (fixedHouseholdId) {
    const household = getHousehold(fixedHouseholdId);
    if (!household?.config) {
      return {
        error: {
          code: 'HOUSEHOLD_UNAVAILABLE',
          message: 'Household data is not available yet. Ask an admin to open PolySchedule on a connected device first.'
        }
      };
    }
    const partner = findLoginPartner(household.config, normalized);
    if (!partner) {
      return {
        error: {
          code: 'PARTNER_NOT_IN_HOUSEHOLD',
          message: 'No account is set up for that username. Ask an admin to verify the partner exists and was saved successfully.'
        }
      };
    }
    return { householdId: fixedHouseholdId, household, partner };
  }

  const lookup = lookupUsernameForLogin(username);
  if (!lookup.found) {
    return {
      error: {
        code: 'USERNAME_UNKNOWN',
        message: 'That username is not registered. Check spelling or ask an admin to create your account.'
      }
    };
  }

  if (!lookup.householdId || !lookup.partnerId) {
    return {
      error: {
        code: 'REGISTRY_MISMATCH',
        message: 'This username is in an invalid state. Ask an admin to repair user registry entries.'
      }
    };
  }

  const household = getHousehold(lookup.householdId);
  if (!household?.config) {
    return {
      error: {
        code: 'HOUSEHOLD_UNAVAILABLE',
        message: 'Household data is not available yet. Ask an admin to open PolySchedule on a connected device first.'
      }
    };
  }

  const partner = findLoginPartner(household.config, lookup.normalized || normalized);
  if (!partner) {
    return {
      error: {
        code: 'PARTNER_NOT_IN_HOUSEHOLD',
        message: 'Username is registered but the partner record is missing from the household. Ask an admin to re-save or recreate the account.'
      }
    };
  }

  if (partner.id !== lookup.partnerId) {
    return {
      error: {
        code: 'REGISTRY_MISMATCH',
        message: 'Username is linked to a different partner record. Ask an admin to repair the user registry.'
      }
    };
  }

  return { householdId: lookup.householdId, household, partner };
}
