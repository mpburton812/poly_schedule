/**
 * Household policy for whether private / super-private scheduling is offered on new proposals.
 * Existing events keep their stored visibility regardless of policy (see event-privacy.js).
 */

export const PRIVACY_SCHEDULING_MODE = {
  DISABLED: 'disabled',
  ENABLED: 'enabled',
  DEFAULT: 'default'
};

const VISIBILITY = {
  STANDARD: 'standard',
  PRIVATE: 'private',
  SUPER_PRIVATE: 'super_private'
};

const DEFAULT_POLICIES = {
  private: PRIVACY_SCHEDULING_MODE.ENABLED,
  superPrivate: PRIVACY_SCHEDULING_MODE.ENABLED
};

function normalizeMode(mode) {
  if (mode === PRIVACY_SCHEDULING_MODE.DISABLED || mode === PRIVACY_SCHEDULING_MODE.DEFAULT) {
    return mode;
  }
  return PRIVACY_SCHEDULING_MODE.ENABLED;
}

export function normalizePrivacySchedulingPolicies(config) {
  const raw = config?.privacyScheduling || {};
  return {
    private: normalizeMode(raw.private),
    superPrivate: normalizeMode(raw.superPrivate)
  };
}

export function ensurePrivacySchedulingPolicies(config) {
  if (!config || typeof config !== 'object') return config;
  const normalized = normalizePrivacySchedulingPolicies(config);
  config.privacyScheduling = { ...normalized };
  return config;
}

function policyKeyForVisibility(visibility) {
  return visibility === VISIBILITY.SUPER_PRIVATE ? 'superPrivate' : 'private';
}

/** Whether a privacy level can be chosen when creating a new proposal. */
export function isPrivacyLevelAvailable(config, visibility) {
  if (visibility === VISIBILITY.STANDARD) return true;
  const policies = normalizePrivacySchedulingPolicies(config);
  const key = policyKeyForVisibility(visibility);
  return policies[key] !== PRIVACY_SCHEDULING_MODE.DISABLED;
}

/** Default visibility for a brand-new proposal form. */
export function getDefaultProposalVisibility(config) {
  const policies = normalizePrivacySchedulingPolicies(config);
  if (
    policies.superPrivate === PRIVACY_SCHEDULING_MODE.DEFAULT
    && isPrivacyLevelAvailable(config, VISIBILITY.SUPER_PRIVATE)
  ) {
    return VISIBILITY.SUPER_PRIVATE;
  }
  if (
    policies.private === PRIVACY_SCHEDULING_MODE.DEFAULT
    && isPrivacyLevelAvailable(config, VISIBILITY.PRIVATE)
  ) {
    return VISIBILITY.PRIVATE;
  }
  return VISIBILITY.STANDARD;
}

/** Coerce draft/saved visibility when admin policy disables a level. */
export function coerceProposalVisibility(config, visibility) {
  const requested = visibility || getDefaultProposalVisibility(config);
  if (requested === VISIBILITY.STANDARD) return VISIBILITY.STANDARD;
  if (isPrivacyLevelAvailable(config, requested)) return requested;
  return getDefaultProposalVisibility(config);
}

export function privacySchedulingModeLabel(mode) {
  if (mode === PRIVACY_SCHEDULING_MODE.DISABLED) return 'Disabled';
  if (mode === PRIVACY_SCHEDULING_MODE.DEFAULT) return 'Default for new proposals';
  return 'Available (not default)';
}
