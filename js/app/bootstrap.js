import { AuthManager } from '../auth.js';
import { CalendarSync } from '../calendar.js';
import { isPartnerPassive, LEGACY_PROFILE_KEY } from '../helpers.js';
import { resolveSyncBootstrapMode } from '../gcal-sync.js';
import {
  state,
} from './state.js';
import {
  loadPersistedLogs,
  addLog,
  initChangeLog,
  syncPromotionChangeLog,
  logOperationError,
  showToast,
  updateNotificationsBadge,
  establishSession,
  logoutUser,
  showLoginView,
  LOCAL_SESSION_KEY,
  bindImpersonationBanner
} from './context.js';
import {
  openNotificationsModal,
  openUserProfileModal
} from './modals.js';
import { router } from './router.js';

/** @returns {Promise<{ ok: boolean, mode: string, error?: Error }>} */
export async function bootstrapData(mode) {
  addLog(`Sync: Initializing client state in ${mode} mode.`);

  let credentials = null;
  if (mode === 'sync') {
    AuthManager.reloadFromStorage();
    if (!AuthManager.accessToken || !AuthManager.apiKey) {
      const err = new Error('Google Calendar credentials are incomplete. Save API Key on Admin, then click Sync Google.');
      err.code = 'GOOGLE_CREDENTIALS_INCOMPLETE';
      throw err;
    }
    credentials = {
      accessToken: AuthManager.accessToken,
      apiKey: AuthManager.apiKey
    };
  }

  try {
    const alignStats = await CalendarSync.init(mode, credentials, () => {
      state.events = CalendarSync.events;
      state.config = CalendarSync.config;
    });

    state.events = CalendarSync.events;
    state.config = CalendarSync.config;
    state.isOffline = mode !== 'sync';
    router();

    if (alignStats) {
      addLog(
        `GCal: Calendar aligned (${alignStats.deleted} removed, ${alignStats.upserted} updated, ${alignStats.materialized} batch nights added).`,
        'info'
      );
      showToast(
        `Google Calendar aligned (${alignStats.deleted} removed, ${alignStats.upserted} updated).`,
        'success'
      );
    }

    return { ok: true, mode };
  } catch (err) {
    logOperationError('Google Calendar sync init', err);

    if (err?.code === 'GOOGLE_AUTH_EXPIRED') {
      AuthManager.accessToken = '';
      localStorage.removeItem('polyschedule_access_token');
      showToast('Google sign-in expired. Click Sync Google in the top bar to reconnect.', 'warning');
    } else if (err?.code === 'GOOGLE_NOT_FOUND') {
      showToast('Calendar not found. Check Calendar ID on the Admin page.', 'error');
    } else if (err?.code === 'GOOGLE_FORBIDDEN') {
      showToast(`Google Calendar access denied: ${err.message}`, 'error');
    } else if (err?.code === 'GOOGLE_CREDENTIALS_INCOMPLETE') {
      showToast(err.message, 'warning');
    } else {
      showToast(`Failed to connect to Google Calendar: ${err.message}`, 'error');
    }

    state.isOffline = true;
    localStorage.setItem('polyschedule_mode', 'offline');
    await bootstrapData('offline');
    return { ok: false, mode: 'offline', error: err };
  }
}

function updateGoogleLoginButton(authState) {
  const loginBtnEl = document.getElementById('btn-google-login');
  if (!loginBtnEl) return;

  const syncConfigured = localStorage.getItem('polyschedule_mode') === 'sync'
    && AuthManager.clientId
    && AuthManager.apiKey;

  if (authState.loggedIn && authState.user?.email) {
    loginBtnEl.style.display = 'none';
  } else if (syncConfigured) {
    loginBtnEl.style.display = 'inline-flex';
  } else {
    loginBtnEl.style.display = 'none';
  }
}

export async function handleGoogleAuthState(authState) {
  updateGoogleLoginButton(authState);

  if (authState.loggedIn && authState.mode === 'sync') {
    state.isOffline = false;
    localStorage.setItem('polyschedule_mode', 'sync');
    const result = await bootstrapData('sync');
    if (result.ok) {
      showToast('Connected to Google Calendar.', 'success');
    }
    return;
  }

  if (!authState.loggedIn && CalendarSync.mode === 'sync') {
    state.isOffline = true;
    localStorage.setItem('polyschedule_mode', 'offline');
    await bootstrapData('offline');
  }
}

export async function initBuildBanner() {
  const banner = document.getElementById('build-banner');
  if (!banner) return;
  try {
    const res = await fetch('version.json');
    if (res.ok) {
      const data = await res.json();
      banner.textContent = `BUILD #${data.commit} • BRANCH ${data.branch}`;
    }
  } catch (err) {
    console.error('Failed to load version info:', err);
  }
}

function migrateLegacySession() {
  const legacyProfile = JSON.parse(localStorage.getItem(LEGACY_PROFILE_KEY) || 'null');
  const savedSession = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
  if (legacyProfile && !savedSession) {
    localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(legacyProfile));
    localStorage.removeItem(LEGACY_PROFILE_KEY);
  }
}

export function init() {
  const run = async () => {
    state.logs = loadPersistedLogs();
    initChangeLog();
    void syncPromotionChangeLog();

    window.addEventListener('hashchange', router);

    if (state.logs.length === 0) {
      addLog('Application initialized.', 'info');
    }

    const loginBtn = document.getElementById('btn-google-login');
    if (loginBtn) {
      loginBtn.addEventListener('click', () => {
        try { AuthManager.login(); } catch (err) { showToast(err.message, 'error'); }
      });
    }

    const notifBtn = document.getElementById('btn-notifications');
    if (notifBtn) notifBtn.addEventListener('click', () => openNotificationsModal());
    updateNotificationsBadge();

    initBuildBanner();

    const avatarContainer = document.getElementById('avatar-container');
    if (avatarContainer) avatarContainer.addEventListener('click', () => openUserProfileModal());

    const sideLogout = document.getElementById('side-nav-logout');
    if (sideLogout) {
      sideLogout.addEventListener('click', (e) => {
        e.preventDefault();
        logoutUser();
        showToast('Logged out successfully.', 'success');
      });
    }

    migrateLegacySession();

    bindImpersonationBanner();

    AuthManager.onAuthError = (message) => showToast(message, 'error');
    AuthManager.init((authState) => {
      updateGoogleLoginButton(authState);
    });

    await bootstrapData(resolveSyncBootstrapMode());

    const savedProfile = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
    if (savedProfile?.sessionActive) {
      const partner = state.config?.partners?.find(p => p.id === savedProfile.id && !isPartnerPassive(p));
      if (partner && partner.username === savedProfile.username) {
        establishSession(partner);
        router();
      } else {
        localStorage.removeItem(LOCAL_SESSION_KEY);
        showLoginView();
      }
    } else {
      showLoginView();
    }

    AuthManager.onAuthStateChange = (authState) => {
      handleGoogleAuthState(authState);
    };
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}
