import { AuthManager } from './auth.js';
import { normalizeEmail } from './helpers.js';
import { hasGoogleAccessToken, hasGoogleIntegrationCredentials } from './calendar-status.js';

export function getConnectedGoogleEmail() {
  AuthManager.reloadFromStorage?.();
  const profile = AuthManager.userProfile
    || JSON.parse(localStorage.getItem('polyschedule_google_profile') || 'null');
  return normalizeEmail(profile?.email);
}

export function partnerExpectsGoogleEmail(partner) {
  return !!normalizeEmail(partner?.googleEmail);
}

export function googleEmailMatchesPartner(partner, email) {
  const expected = normalizeEmail(partner?.googleEmail);
  const actual = normalizeEmail(email);
  if (!expected) return true;
  if (!actual) return false;
  return expected === actual;
}

/** True when OAuth token exists and matches the partner's configured Google email (if any). */
export function isGoogleSessionValidForPartner(partner) {
  if (!hasGoogleIntegrationCredentials() || !hasGoogleAccessToken()) return false;
  if (!partnerExpectsGoogleEmail(partner)) return true;
  return googleEmailMatchesPartner(partner, getConnectedGoogleEmail());
}

/**
 * Clear a stale Google session left by another household member on this browser.
 * @returns {boolean} whether a session was cleared
 */
export function clearGoogleSessionIfPartnerMismatch(partner) {
  if (!partner || !hasGoogleAccessToken()) return false;
  if (!partnerExpectsGoogleEmail(partner)) return false;
  if (googleEmailMatchesPartner(partner, getConnectedGoogleEmail())) return false;
  AuthManager.logout();
  return true;
}

/** Start Google OAuth for the signed-in partner, forcing account pick when needed. */
export function beginPartnerGoogleConnect(partner) {
  const expectedEmail = normalizeEmail(partner?.googleEmail);
  const mismatch = partner && expectedEmail
    && !googleEmailMatchesPartner(partner, getConnectedGoogleEmail());

  AuthManager.logout();

  return AuthManager.login({
    forceConsent: true,
    selectAccount: true,
    loginHint: expectedEmail || undefined
  });
}
