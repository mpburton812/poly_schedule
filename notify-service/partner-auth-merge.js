/**
 * Preserve partner login credentials when clients push sanitized household config.
 * Login responses strip passwordHash; sync pushes must not wipe server-side auth.
 */

export function mergePartnerAuthFields(incomingConfig, previousConfig) {
  if (!incomingConfig || typeof incomingConfig !== 'object') return incomingConfig;
  if (!Array.isArray(incomingConfig.partners)) return incomingConfig;
  if (!previousConfig?.partners?.length) return incomingConfig;

  const prevById = new Map(
    previousConfig.partners.filter((partner) => partner?.id).map((partner) => [partner.id, partner])
  );

  for (const partner of incomingConfig.partners) {
    if (!partner?.id) continue;
    const prev = prevById.get(partner.id);
    if (!prev) continue;

    if (!partner.passwordHash && prev.passwordHash) {
      partner.passwordHash = prev.passwordHash;
    }
    if (!partner.password && prev.password) {
      partner.password = prev.password;
    }
  }

  return incomingConfig;
}
