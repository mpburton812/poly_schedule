import { state } from './state.js';
import { CalendarSync } from '../calendar.js';
import { hashPassword } from '../crypto.js';
import { normalizePronouns } from '../pronouns.js';
import { logUserAction } from './operation-log.js';
import { showToast } from './toast.js';
import { establishSession } from './session.js';
import { assertUsernameAvailable, claimUsernameAfterPersist, releaseUsernameGlobally } from '../username-registry.js';
import { ensureHouseholdIdentity } from '../household-sync.js';
import { normalizeEmail } from '../helpers.js';

import { assertCalendarConnectedForWrite } from '../calendar-status.js';

/** Share the household Google Calendar with a partner's Google account email. */
export async function grantPartnerCalendarAccess(email) {
  const { shareHouseholdCalendarWithEmail } = await import('../gcal-share.js');
  const result = await shareHouseholdCalendarWithEmail(email);
  if (result.ok) {
    logUserAction(
      result.alreadyShared
        ? `Calendar access already granted to ${result.email}.`
        : `Shared household calendar with ${result.email}.`,
      'info'
    );
  }
  return result;
}

export async function persistHouseholdConfig(logMessage) {
  if (!assertCalendarConnectedForWrite()) {
    throw new Error('Calendar sync is offline');
  }
  try {
    const result = await CalendarSync.saveConfig(state.config);
    state.config = CalendarSync.config;
    if (logMessage) logUserAction(logMessage, 'info');
    return result;
  } catch (err) {
    showToast(`Failed to save changes: ${err.message}`, 'error');
    throw err;
  }
}

export function saveConfig(logMessage) {
  void persistHouseholdConfig(logMessage).catch(() => {});
}

export async function updatePartnerProfile(partnerId, updates) {
  const partner = state.config?.partners?.find((p) => p.id === partnerId);
  if (!partner) return false;

  const oldName = partner.name;
  if (updates.name && updates.name !== oldName) {
    CalendarSync.renamePartnerInEvents(oldName, updates.name);
  }

  if (updates.name !== undefined) partner.name = updates.name;
  if (updates.avatar !== undefined) partner.avatar = updates.avatar;
  let usernameChange = null;
  if (updates.username !== undefined) {
    const nextUsername = String(updates.username || '').trim();
    const previousUsername = String(partner.username || '').trim();
    if (nextUsername !== previousUsername) {
      ensureHouseholdIdentity(state.config);
      const check = await assertUsernameAvailable(nextUsername, {
        config: state.config,
        partnerId,
        householdId: state.config.householdId
      });
      if (!check.ok) {
        showToast(check.message, 'warning');
        return false;
      }
      usernameChange = { nextUsername, previousUsername };
      partner.username = nextUsername;
    }
  }
  if (updates.password !== undefined && updates.password !== '') {
    partner.passwordHash = await hashPassword(updates.password, partnerId);
    delete partner.password;
  }
  if (updates.pronouns !== undefined) partner.pronouns = normalizePronouns(updates.pronouns);
  if (updates.notificationEmail !== undefined) {
    partner.notificationEmail = String(updates.notificationEmail || '').trim();
  }
  if (updates.googleEmail !== undefined) {
    partner.googleEmail = normalizeEmail(updates.googleEmail);
  }

  await persistHouseholdConfig(`Updated profile for ${partner.name}`);

  if (usernameChange) {
    const claim = await claimUsernameAfterPersist(
      usernameChange.nextUsername,
      state.config.householdId,
      partnerId
    );
    if (!claim.ok) {
      showToast(claim.message, 'warning');
      return false;
    }
    if (usernameChange.previousUsername) {
      await releaseUsernameGlobally(
        usernameChange.previousUsername,
        state.config.householdId,
        partnerId
      );
    }
  }

  if (updates.googleEmail !== undefined && partner.googleEmail) {
    const share = await grantPartnerCalendarAccess(partner.googleEmail);
    if (!share.ok) {
      showToast(`Profile saved, but calendar sharing failed: ${share.message}`, 'warning');
    }
  }

  if (state.currentUser?.id === partnerId) {
    establishSession(partner);
  }

  state.events = CalendarSync.events;
  import('./render-bus.js').then(({ requestRender }) => requestRender());
  return true;
}

/** Save the Google account email for a partner after OAuth connect. */
export async function syncPartnerGoogleEmailFromAuth(partnerId, email) {
  const partner = state.config?.partners?.find((p) => p.id === partnerId);
  if (!partner) return false;
  if (state.impersonatorId) return false;

  const next = normalizeEmail(email);
  if (!next) return false;
  if (normalizeEmail(partner.googleEmail) === next) return false;

  const configured = normalizeEmail(partner.googleEmail);
  if (configured && configured !== next) {
    showToast(
      `Signed in to Google as ${email}, but this account is configured for ${partner.googleEmail}. Ask an admin to update your Google email, or sign in with the correct Google account.`,
      'warning'
    );
    return false;
  }

  partner.googleEmail = next;
  await persistHouseholdConfig(`Linked Google account for ${partner.name}`);
  const share = await grantPartnerCalendarAccess(next);
  if (!share.ok && share.code !== 'NOT_CONNECTED') {
    showToast(`Google account linked, but calendar sharing failed: ${share.message}`, 'warning');
  }
  return true;
}
