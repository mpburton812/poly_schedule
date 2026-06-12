import { state } from './state.js';
import { AuthManager } from '../auth.js';
import { PROPOSAL_DRAFT_KEY_PREFIX } from '../storage-keys.js';
import { hashPassword } from '../crypto.js';
import { CalendarSync } from '../calendar.js';
import { LOCAL_SESSION_KEY } from '../storage-keys.js';
import { DEFAULT_AVATARS, Views } from '../views.js';
import { persistHouseholdConfig } from './household-config.js';
import { isPartnerPassive, needsHouseholdSetup, partnerRefsMatch } from '../helpers.js';
import { showToast } from './toast.js';
import { addLog, logUserAction } from './operation-log.js';
import { updateImpersonationBanner } from './impersonation.js';
import { refreshCurrentUserNotifications, syncPendingProposalAlertsForUser } from './notification-store.js';

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
}

export function showLoginView() {
  updateUIForAuthState(false);
  state.currentView = 'login';
  const container = document.getElementById('app-view-container');
  if (container) {
    container.innerHTML = Views.login(state);
    import('./bindings/admin.js').then(({ bindLoginEvents }) => bindLoginEvents());
  }
}

export function establishSession(partner) {
  state.currentUser = {
    id: partner.id,
    name: partner.name,
    picture: partner.avatar || DEFAULT_AVATARS[0],
    role: partner.role,
    sessionActive: true
  };
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(state.currentUser));
  const avatarImg = document.getElementById('user-avatar-img');
  if (avatarImg) avatarImg.src = state.currentUser.picture;
  updateUIForAuthState(true);
  updateAdminNavVisibility();
  refreshCurrentUserNotifications();
  syncPendingProposalAlertsForUser();
  // After establishing session, check for duplicate accounts with admin role
  maybeSwitchToAdminIfDuplicate();
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

export async function attemptLogin(username, password) {
  const trimmedUser = username.trim();
  const trimmedPassword = password.trim();
  const partnerCandidates = state.config?.partners?.filter(p => !isPartnerPassive(p) && p.username === trimmedUser);
  let authenticatedPartner = null;

  if (partnerCandidates && partnerCandidates.length > 0) {
    for (const p of partnerCandidates) {
      if (p.password === trimmedPassword) {
        p.passwordHash = await hashPassword(trimmedPassword, p.id);
        delete p.password;
        authenticatedPartner = p;
        break;
      } else if (p.passwordHash && p.passwordHash === await hashPassword(trimmedPassword, p.id)) {
        authenticatedPartner = p;
        break;
      }
    }
  }

  if (!authenticatedPartner) {
    const hint = needsHouseholdSetup(state.config)
      ? 'No household accounts exist yet — create the first admin account.'
      : 'Invalid username or password.';
    showToast(hint, 'error');
    addLog(`${trimmedUser}: Failed login attempt.`, 'warning');
    return false;
  }
  
  if (authenticatedPartner.passwordHash) {
    import('./household-config.js').then(({ persistHouseholdConfig }) => {
      persistHouseholdConfig('Migrated password to hash.').catch(() => {});
    });
  }

  establishSession(authenticatedPartner);
  addLog(`${authenticatedPartner.name}: Logged in successfully.`, 'info');
  showToast(`Welcome back, ${authenticatedPartner.name.split(' ')[0]}!`, 'success');
  window.location.hash = '#schedule';
  import('./render-bus.js').then(({ requestRender }) => requestRender());
  return true;
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
    showToast('Household config is not loaded yet. Refresh and try again.', 'error');
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
    if (saveResult?.needsAuth) { showToast('Account upgraded. Click Sync Google in the top bar to back up to Google Calendar.', 'info'); const loginBtn = document.getElementById('btn-google-login'); if (loginBtn) loginBtn.style.display = 'inline-flex'; } else { showToast(`Welcome, ${duplicate.name.split(' ')[0]}!`, 'success'); }
    window.location.hash = '#schedule';
    import('./render-bus.js').then(({ requestRender }) => requestRender());
    return true;
  }

  if (!needsHouseholdSetup(state.config)) {
    showToast('This household already has login accounts.', 'warning');
    return false;
  }

  let partner = state.config.partners?.find(p => isPartnerPassive(p) && partnerRefsMatch(state.config, p.name, trimmedName));
  
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
  // Save session to localStorage for automatic login on reload
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify({
    id: partner.id,
    username: partner.username,
    sessionActive: true
  }));
  if (saveResult?.needsAuth) {
    showToast(
      'Account created. Click Sync Google in the top bar to back up to Google Calendar.',
      'info'
    );
    const loginBtn = document.getElementById('btn-google-login');
    if (loginBtn) loginBtn.style.display = 'inline-flex';
    window.location.hash = '#login';
  } else {
    showToast(`Welcome, ${partner.name.split(' ')[0]}!`, 'success');
    window.location.hash = '#schedule';
  }
  import('./render-bus.js').then(({ requestRender }) => requestRender());
  return true;
}

function maybeSwitchToAdminIfDuplicate() {
  const currentName = state.currentUser?.name;
  if (!currentName) return;
  const candidates = state.config?.partners?.filter(p => p.name === currentName && p.id !== state.currentUser.id);
  for (const p of candidates) {
    if (p.role === 'Admin') {
      establishSession(p);
      showToast('Switched to admin account.', 'info');
      break;
    }
  }
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

