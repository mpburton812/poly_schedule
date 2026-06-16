import { getHousehold } from './sync-store.js';
import { listRegisteredUsernames, normalizeUsername } from './username-registry.js';
import { getFixedHouseholdId } from './fixed-household.js';

function activePartnersFromConfig(config) {
  return (config?.partners || [])
    .filter((partner) => !partner?.passive && partner?.username && partner?.id)
    .map((partner) => ({
      partnerId: partner.id,
      name: partner.name || '',
      username: normalizeUsername(partner.username),
      role: partner.role || 'User',
      hasPasswordHash: !!(partner.passwordHash || partner.password)
    }));
}

/**
 * @param {string|null} householdId
 */
export function buildUserHealthReport(householdId = null) {
  const targetHouseholdId = householdId || getFixedHouseholdId() || null;
  const registry = listRegisteredUsernames(
    targetHouseholdId ? { householdId: targetHouseholdId } : {}
  );
  const scopedRegistry = registry;

  const household = targetHouseholdId ? getHousehold(targetHouseholdId) : null;
  const partners = activePartnersFromConfig(household?.config);
  const partnerById = new Map(partners.map((row) => [row.partnerId, row]));
  const partnerByUsername = new Map(partners.map((row) => [row.username, row]));

  const registryOrphans = scopedRegistry.filter((row) => {
    const partner = partnerById.get(row.partnerId);
    return !partner || partner.username !== row.username;
  });

  const configOrphans = partners.filter((partner) => {
    const entry = scopedRegistry.find(
      (row) => row.partnerId === partner.partnerId && row.username === partner.username
    );
    return !entry;
  });

  const rows = partners.map((partner) => {
    const entry = scopedRegistry.find(
      (row) => row.partnerId === partner.partnerId && row.username === partner.username
    );
    return {
      partnerId: partner.partnerId,
      name: partner.name,
      username: partner.username,
      role: partner.role,
      inRegistry: !!entry,
      canLogin: !!(entry && partner.hasPasswordHash),
      issues: [
        ...(entry ? [] : ['missing_registry']),
        ...(partner.hasPasswordHash ? [] : ['missing_password_hash']),
        ...(entry && entry.partnerId !== partner.partnerId ? ['registry_partner_mismatch'] : [])
      ]
    };
  });

  for (const orphan of registryOrphans) {
    if (!partnerByUsername.has(orphan.username)) {
      rows.push({
        partnerId: orphan.partnerId,
        name: '',
        username: orphan.username,
        role: '',
        inRegistry: true,
        canLogin: false,
        issues: ['registry_orphan']
      });
    }
  }

  return {
    householdId: targetHouseholdId,
    revision: household?.revision ?? null,
    storageBackend: process.env.DATABASE_URL ? 'postgres' : 'json',
    summary: {
      activePartners: partners.length,
      registryEntries: scopedRegistry.length,
      registryOrphans: registryOrphans.length,
      configOrphans: configOrphans.length,
      loginReady: rows.filter((row) => row.canLogin).length
    },
    usernames: scopedRegistry,
    partners: rows
  };
}
