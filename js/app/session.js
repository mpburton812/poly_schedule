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
import { CalendarSync } from '../calendar.js';
import { DEFAULT_AVATARS, Views } from '../views.js';
import { loginViaNotifyService, resolvePublicNotifyUrl, applyRemoteLoginPayload } from '../auth-login.js';
import { showToast } from './toast.js';
import { logUserAction } from './operation-log.js';
import { updateImpersonationBanner } from './impersonation.js';
import { refreshCurrentUserNotifications, syncPendingProposalAlertsForUser } from './notification-store.js';
import { updateOfflineBanner } from '../calendar-status.js';
import { needsGoogleCalendarConnect, showGoogleConnectGate } from './google-connect-gate.js';
import { ensureGoogleCredentialsFromConfig } from '../google-integration.js';

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

async function completeLogin(partner, message) {
  establishSession(partner);
  logUserAction(message, 'info', partner.name);
  showToast(`Welcome back, ${partner.name.split(' ')[0]}!`, 'success');
  if (needsGoogleCalendarConnect()) {
    ensureGoogleCredentialsFromConfig(state.config, { CalendarSync });
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
    return completeLogin(partner, 'Logged in successfully.');
  }

  if (remote.code === 'INVALID_CREDENTIALS') {
    showToast('Invalid username or password. If this persists after signing in with Google, ask an admin to reset your password.', 'error');
    logUserAction('Failed login attempt.', 'warning', trimmedUser);
    return false;
  }

  if (remote.code === 'HOUSEHOLD_UNAVAILABLE') {
    showToast(remote.message, 'warning');
    logUserAction('Login blocked — household cache unavailable.', 'warning', trimmedUser);
    return false;
  }

  showToast(remote.message || 'Login failed.', 'error');
  logUserAction(`Remote login failed (${remote.code || 'unknown'}).`, 'warning', trimmedUser);
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

export function logoutUser() {
  const name = getCurrentUserName();
  state.currentUser = null;
  localStorage.removeItem(LOCAL_SESSION_KEY);
  logUserAction('Logged out.', 'info', name);
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

