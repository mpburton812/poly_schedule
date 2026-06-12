import { state } from './state.js';
import { AuthManager } from '../auth.js';
import {
  CALENDAR_ID_KEY,
  LOCAL_SESSION_KEY,
  PROPOSAL_DRAFT_KEY_PREFIX,
  GOOGLE_PROFILE_KEY,
  LEGACY_PROFILE_KEY,
  LOCAL_EVENTS_KEY,
  LOCAL_CONFIG_KEY,
  LOGS_STORAGE_KEY,
  CHANGE_LOG_KEY,
  PROMOTION_KEY_STORAGE,
  NOTIFICATIONS_BY_USER_KEY,
  LEGACY_NOTIFICATIONS_KEY,
  PUSH_TYPE_PREFS_KEY,
  PUSH_ENABLED_KEY,
  PUSH_QUIET_HOURS_KEY,
  PUSH_QUIET_START_KEY,
  PUSH_QUIET_END_KEY,
  AUTO_ARCHIVE_DAYS_KEY,
  DEVICE_ID_KEY,
  HOUSEHOLD_SYNC_TOKEN_KEY,
  LAST_SYNC_REVISION_KEY,
  NOTIFY_URL_KEY,
  NOTIFY_SECRET_KEY,
  RETURN_ADD_PARTNER_KEY,
  SELECT_HOME_KEY,
  ADD_PARTNER_DRAFT_KEY
} from '../storage-keys.js';
import { router } from './router.js';
import { hashPassword } from '../crypto.js';
import { CalendarSync } from '../calendar.js';
import { DEFAULT_AVATARS, Views } from '../views.js';
import { persistHouseholdConfig } from './household-config.js';
import { isPartnerPassive, needsHouseholdSetup, partnerRefsMatch } from '../helpers.js';
import { ensureHouseholdIdentity } from '../household-sync.js';
import { assertUsernameAvailable, claimUsernameGlobally } from '../username-registry.js';
import { loginViaNotifyService, resolvePublicNotifyUrl, applyRemoteLoginPayload } from '../auth-login.js';
import { showToast } from './toast.js';
import { addLog, logUserAction } from './operation-log.js';
import { updateImpersonationBanner } from './impersonation.js';
import { refreshCurrentUserNotifications, syncPendingProposalAlertsForUser } from './notification-store.js';
import { updateOfflineBanner } from '../calendar-status.js';
import { needsGoogleCalendarConnect, showGoogleConnectGate } from './google-connect-gate.js';

export function getCurrentUserId() {
  return state.currentUser?.id || null;
}

export function getCurrentUserName() {
  return state.currentUser?.name || 'User';
}

export function isAdmin() {
  if (!state.currentUser || !state.config?.partners) return false;
  const partner = state.config.partners.find(p => p.id === state.currentUser.id);
  return partner?.role === 'Admin';
}

export function isLoggedIn() {
  return !!(state.currentUser && state.currentUser.sessionActive);
}

export function updateAdminNavVisibility() {
  const showAdmin = isAdmin();
  const sideNavAdmin = document.getElementById('side-nav-admin');
  const mobileNavAdmin = document.getElementById('mobile-nav-admin');
  if (sideNavAdmin) sideNavAdmin.style.display = showAdmin ? 'flex' : 'none';
  if (mobileNavAdmin) mobileNavAdmin.style.display = showAdmin ? 'inline-flex' : 'none';
}

export function updateUIForAuthState(loggedIn) {
  const bottomNav = document.querySelector('.bottom-nav');
  const sidebarNav = document.querySelector('.sidebar-nav');
  const fab = document.getElementById('fab-quick-add');
  const notifBtn = document.getElementById('btn-notifications');
  const avatarContainer = document.getElementById('avatar-container');
  const sideLogout = document.getElementById('side-nav-logout');

  if (bottomNav) bottomNav.style.display = loggedIn ? '' : 'none';
  if (sidebarNav) {
    if (loggedIn) {
      sidebarNav.style.removeProperty('display');
    } else {
      sidebarNav.style.setProperty('display', 'none', 'important');
    }
  }
  if (fab) fab.style.display = loggedIn ? 'flex' : 'none';
  if (notifBtn) notifBtn.style.display = loggedIn ? '' : 'none';
  if (avatarContainer) avatarContainer.style.display = loggedIn ? 'block' : 'none';
  if (sideLogout) sideLogout.style.display = loggedIn ? 'flex' : 'none';
  updateImpersonationBanner();
  updateOfflineBanner();
}

export function updateGuestGoogleLoginButton() {
  const loginBtnEl = document.getElementById('btn-google-login');
  if (loginBtnEl) loginBtnEl.style.display = 'none';
}

async function completeLogin(partner, logMessage) {
  establishSession(partner);
  addLog(logMessage, 'info');
  showToast(`Welcome back, ${partner.name.split(' ')[0]}!`, 'success');
  if (needsGoogleCalendarConnect()) {
    showGoogleConnectGate();
    return true;
  }
  const { bootstrapData } = await import('./bootstrap.js');
  await bootstrapData('sync');
  const { router } = await import('./router.js');
  router();
  return true;
}

export async function attemptLogin(username, password) {
  const trimmedUser = username.trim();
  const trimmedPassword = password.trim();
  if (!trimmedUser || !trimmedPassword) {
    showToast('Please enter username and password.', 'warning');
    return false;
  }

  const notifyUrl = await resolvePublicNotifyUrl();
  if (!notifyUrl) {
    showToast('Login service is not configured. Contact your administrator.', 'error');
    return false;
  }

  const remote = await loginViaNotifyService(trimmedUser, trimmedPassword, notifyUrl);
  if (remote.ok) {
    applyRemoteLoginPayload(remote, state);
    const partner = state.config?.partners?.find((p) => p.id === remote.partner.id) || remote.partner;
    return completeLogin(partner, `${partner.name}: Logged in successfully.`);
  }

  if (remote.code === 'INVALID_CREDENTIALS') {
    showToast('Invalid username or password.', 'error');
    addLog(`${trimmedUser}: Failed login attempt.`, 'warning');
    return false;
  }

  if (remote.code === 'HOUSEHOLD_UNAVAILABLE') {
    showToast(remote.message, 'warning');
    addLog(`${trimmedUser}: Login blocked — household cache unavailable.`, 'warning');
    return false;
  }

  showToast(remote.message || 'Login failed.', 'error');
  addLog(`${trimmedUser}: Remote login failed (${remote.code || 'unknown'}).`, 'warning');
  return false;
}

export function showLoginView() {
  updateUIForAuthState(false);
  state.currentView = 'login';
  const container = document.getElementById('app-view-container');
  if (container) {
    container.innerHTML = Views.login();
    updateGuestGoogleLoginButton();
    import('./bindings/admin.js').then(({ bindLoginEvents }) => bindLoginEvents());
  }
}

export function showInitialSetupView() {
  updateUIForAuthState(false);
  state.currentView = 'initial-setup';
  const container = document.getElementById('app-view-container');
  if (container) {
    container.innerHTML = Views.initialSetup();
    updateGuestGoogleLoginButton();
    import('./bindings/admin.js').then(({ bindInitialSetupEvents }) => bindInitialSetupEvents());
  }
}

/** @deprecated Use showInitialSetupView */
export const showCreateHouseholdView = showInitialSetupView;

export function establishSession(partner) {
  state.currentUser = {
    id: partner.id,
    name: partner.name,
    username: partner.username,
    picture: partner.avatar || DEFAULT_AVATARS[0],
    role: partner.role,
    sessionActive: true
  };
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({
    id: partner.id,
    username: partner.username,
    sessionActive: true
  }));
  const avatarImg = document.getElementById('user-avatar-img');
  if (avatarImg) avatarImg.src = state.currentUser.picture;
  updateUIForAuthState(true);
  updateAdminNavVisibility();
  refreshCurrentUserNotifications();
  syncPendingProposalAlertsForUser();
  import('../push-notifications.js').then(({ syncPushSubscriptionIfEnabled }) => {
    syncPushSubscriptionIfEnabled(partner.id);
  });
  import('../household-sync.js').then(({ startHouseholdSyncHub }) => {
    import('./render-bus.js').then(({ requestRender }) => {
      startHouseholdSyncHub({
        CalendarSync,
        state,
        renderView: () => requestRender()
      });
    });
  });
}

export async function createFirstAdminPartner({ name, username, password }) {
  const trimmedName = name.trim();
  const trimmedUser = username.trim();
  const trimmedPassword = password.trim();

  if (!trimmedName || !trimmedUser || !trimmedPassword) {
    showToast('Name, username, and password are required.', 'warning');
    return false;
  }

  if (!state.config) {
    state.config = { partners: [], residences: [], groupName: 'The Poly Circle' };
    CalendarSync.config = state.config;
  }

  ensureHouseholdIdentity(state.config);

  const usernameCheck = await assertUsernameAvailable(trimmedUser, {
    config: state.config,
    partnerId: null,
    householdId: state.config.householdId
  });
  if (!usernameCheck.ok) {
    showToast(usernameCheck.message, 'warning');
    return false;
  }

  // Check for existing username and upgrade if needed
  const duplicate = state.config.partners?.find(p => p.username === trimmedUser);
  if (duplicate) {
    // Upgrade existing partner to admin (same as below)
    const passwordHash = await hashPassword(trimmedPassword, duplicate.id);
    duplicate.passwordHash = passwordHash;
    duplicate.username = trimmedUser;
    duplicate.role = 'Admin';
    duplicate.avatar = duplicate.avatar || DEFAULT_AVATARS[0];
    duplicate.pronouns = duplicate.pronouns || null;
    duplicate.rules = duplicate.rules || {};
    delete duplicate.passive;
    let saveResult;
    try { saveResult = await CalendarSync.saveConfig(state.config); } catch (err) { showToast(`Failed to save household: ${err.message}`, 'error'); return false; }
    establishSession(duplicate);
    addLog(`${duplicate.name}: Upgraded to admin account.`, 'info');
    if (needsGoogleCalendarConnect()) {
      showGoogleConnectGate();
    } else {
      showToast(`Welcome, ${duplicate.name.split(' ')[0]}!`, 'success');
      router();
    }
    return true;
  }

  if (!needsHouseholdSetup(state.config)) {
    showToast('This household already has login accounts.', 'warning');
    return false;
  }

  let partner = state.config.partners?.find(p => isPartnerPassive(p) && partnerRefsMatch(state.config, p.name, trimmedName));
  let createdNewPartner = false;

  if (partner) {
    const passwordHash = await hashPassword(trimmedPassword, partner.id);
    partner.username = trimmedUser;
    partner.passwordHash = passwordHash;
    partner.role = 'Admin';
    partner.avatar = partner.avatar || DEFAULT_AVATARS[0];
    partner.pronouns = partner.pronouns || null;
    partner.rules = partner.rules || {};
    delete partner.passive;
  } else {
    const newId = `p_${crypto.randomUUID?.() || Date.now()}`;
    const passwordHash = await hashPassword(trimmedPassword, newId);

    partner = {
      id: newId,
      name: trimmedName,
      username: trimmedUser,
      passwordHash,
      role: 'Admin',
      avatar: DEFAULT_AVATARS[0],
      pronouns: null,
      rules: {}
    };

    state.config.partners = state.config.partners || [];
    state.config.residences = state.config.residences || [];
    state.config.partners.push(partner);
    createdNewPartner = true;
  }

  const claimResult = await claimUsernameGlobally(trimmedUser, state.config.householdId, partner.id);
  if (!claimResult.ok) {
    showToast(claimResult.message, 'warning');
    if (createdNewPartner) {
      state.config.partners.pop();
    }
    return false;
  }

  // Persist the updated config and refresh the in‑memory state.
  let saveResult;
  try {
    saveResult = await persistHouseholdConfig('Created first admin account');
  } catch (err) {
    // If persisting fails we already showed a toast inside persistHouseholdConfig.
    state.config.partners.pop();
    return false;
  }

  addLog(`${partner.name}: Created first admin account.`, 'info');
  establishSession(partner);
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({
    id: partner.id,
    username: partner.username,
    sessionActive: true
  }));
  if (needsGoogleCalendarConnect()) {
    showGoogleConnectGate();
  } else {
    showToast(`Welcome, ${partner.name.split(' ')[0]}!`, 'success');
    router();
  }
  return true;
}


export function logoutUser() {
  const name = getCurrentUserName();
  state.currentUser = null;
  localStorage.removeItem(LOCAL_SESSION_KEY);
  addLog(`${name}: Logged out.`, 'info');
  showLoginView();
}

export function logoutGoogleSync() {
  AuthManager.logout();
  logUserAction('Disconnected Google Calendar sync.', 'info');
  showToast('Google Calendar sync disconnected.', 'info');
}

// Utility to fully clear user data
export function clearUserDatabase() {
  const keys = [
    LOCAL_SESSION_KEY,
    GOOGLE_PROFILE_KEY,
    LEGACY_PROFILE_KEY,
    LOCAL_EVENTS_KEY,
    LOCAL_CONFIG_KEY,
    LOGS_STORAGE_KEY,
    CHANGE_LOG_KEY,
    PROMOTION_KEY_STORAGE,
    NOTIFICATIONS_BY_USER_KEY,
    LEGACY_NOTIFICATIONS_KEY,
    PUSH_TYPE_PREFS_KEY,
    PUSH_ENABLED_KEY,
    PUSH_QUIET_HOURS_KEY,
    PUSH_QUIET_START_KEY,
    PUSH_QUIET_END_KEY,
    AUTO_ARCHIVE_DAYS_KEY,
    DEVICE_ID_KEY,
    HOUSEHOLD_SYNC_TOKEN_KEY,
    LAST_SYNC_REVISION_KEY,
    NOTIFY_URL_KEY,
    NOTIFY_SECRET_KEY,
    RETURN_ADD_PARTNER_KEY,
    SELECT_HOME_KEY,
    ADD_PARTNER_DRAFT_KEY
  ];
  // Remove each known key
  keys.forEach(k => {
    try { localStorage.removeItem(k); } catch (_) {}
  });
  // Clear any proposal drafts (prefix based)
  try {
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith(PROPOSAL_DRAFT_KEY_PREFIX)) {
        localStorage.removeItem(k);
      }
    });
  } catch (_) {}
  // Clear sessionStorage completely
  try { sessionStorage.clear(); } catch (_) {}
  // Reset in‑memory state
  if (typeof state !== 'undefined') {
    state.config = null;
    state.events = null;
    state.currentUser = null;
    state.sessionActive = false;
  }
  showToast('All user data cleared.', 'success');
}

