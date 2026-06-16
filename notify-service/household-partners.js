import { getHousehold, upsertHouseholdCache } from './sync-store.js';
import { hashPassword } from './crypto.js';
import {
  claimUsername,
  isUsernameTaken,
  normalizeUsername,
  releaseUsername,
  syncHouseholdUsernames
} from './username-registry.js';

function cloneConfig(config) {
  return JSON.parse(JSON.stringify(config || { partners: [], residences: [] }));
}

function findPartner(config, partnerId) {
  return (config?.partners || []).find((partner) => partner.id === partnerId) || null;
}

function validateActivePartnerInput(partner) {
  if (!partner?.id || !partner?.name || !partner?.username) {
    return 'partner id, name, and username are required';
  }
  if (!partner.passwordHash && !partner.password) {
    return 'passwordHash or password is required for active partners';
  }
  return null;
}

/**
 * Atomically append an active partner to the notify household cache and registry.
 */
export async function createHouseholdPartner(householdId, partner, { actorPartnerId = null } = {}) {
  const validationError = validateActivePartnerInput(partner);
  if (validationError) {
    const err = new Error(validationError);
    err.code = 'BAD_REQUEST';
    throw err;
  }

  const household = getHousehold(householdId);
  const config = cloneConfig(household?.config);
  if ((config.partners || []).some((row) => row.id === partner.id)) {
    const err = new Error('Partner id already exists in household config.');
    err.code = 'PARTNER_EXISTS';
    throw err;
  }

  const normalized = normalizeUsername(partner.username);
  const taken = isUsernameTaken(partner.username, { excludeHouseholdId: householdId, excludePartnerId: partner.id });
  if (taken.taken) {
    const err = new Error('Username is already in use by another partner.');
    err.code = 'USERNAME_TAKEN';
    throw err;
  }

  const nextPartner = { ...partner, username: normalized };
  if (!nextPartner.passwordHash && nextPartner.password) {
    nextPartner.passwordHash = await hashPassword(nextPartner.password, partner.id);
    delete nextPartner.password;
  }

  config.partners = [...(config.partners || []), nextPartner];
  const saved = upsertHouseholdCache(householdId, {
    revision: (household?.revision || 0) + 1,
    config,
    events: household?.events ?? null,
    actorPartnerId
  });

  try {
    syncHouseholdUsernames(householdId, saved.config);
  } catch (err) {
    const rollbackConfig = cloneConfig(household?.config);
    upsertHouseholdCache(householdId, {
      revision: household?.revision || 0,
      config: rollbackConfig,
      events: household?.events ?? null,
      actorPartnerId
    });
    throw err;
  }

  return {
    householdId,
    revision: saved.revision,
    partner: findPartner(saved.config, partner.id),
    config: saved.config
  };
}

/**
 * Remove a partner from household config and release their username from the registry.
 */
export function deleteHouseholdPartner(householdId, partnerId, { actorPartnerId = null } = {}) {
  const household = getHousehold(householdId);
  if (!household?.config) {
    const err = new Error('Household not found.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const existing = findPartner(household.config, partnerId);
  if (!existing) {
    const err = new Error('Partner not found in household config.');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const config = cloneConfig(household.config);
  config.partners = (config.partners || []).filter((partner) => partner.id !== partnerId);

  const saved = upsertHouseholdCache(householdId, {
    revision: (household.revision || 0) + 1,
    config,
    events: household.events ?? null,
    actorPartnerId
  });

  if (existing.username) {
    releaseUsername(existing.username, householdId, partnerId);
  } else {
    syncHouseholdUsernames(householdId, saved.config);
  }

  return {
    householdId,
    revision: saved.revision,
    removedPartnerId: partnerId,
    removedUsername: existing.username || null,
    config: saved.config
  };
}

/**
 * Claim a username after the partner is durably stored in household config.
 */
export function claimHouseholdPartnerUsername(householdId, partnerId, username) {
  const household = getHousehold(householdId);
  const partner = findPartner(household?.config, partnerId);
  if (!partner) {
    const err = new Error('Partner not found in household config.');
    err.code = 'PARTNER_NOT_IN_HOUSEHOLD';
    throw err;
  }
  return claimUsername(username, householdId, partnerId);
}
