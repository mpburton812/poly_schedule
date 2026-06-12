import {
  ACCESS_TOKEN_KEY
} from '../storage-keys.js';
import { LOCAL_CONFIG_KEY } from '../storage-keys.js';
import { AuthManager } from '../auth.js';
import { CalendarSync } from '../calendar.js';
import { LEGACY_PROFILE_KEY } from '../storage-keys.js';
import { isPartnerPassive, getRouteBase } from '../helpers.js';
import { shouldSyncWithGoogleCalendar } from '../gcal-sync.js';
import { loadCacheSnapshot, applyCacheSnapshot } from '../cache-store.js';
import { migrateFamilyNameToConfig } from '../group-name.js';
import { syncCalendarSyncFromAuth } from '../gcal-auth.js';
import {
  setCalendarStatus,
  isCalendarConnected,
  updateOfflineBanner,
  bindOfflineBanner
} from '../calendar-status.js';
import {
  state,
} from './state.js';
import { LOCAL_SESSION_KEY } from '../storage-keys.js';
import { loadPersistedLogs, addLog, initChangeLog, syncPromotionChangeLog, logOperationError, showToast, updateNotificationsBadge, establishSession, logoutUser, showLoginView, bindImpersonationBanner, isLoggedIn } from './context.js';
import {
  openNotificationsModal,
  openUserProfileModal
} from './modals.js';
import { router } from './router.js';
import {
  bindUpdateBanner,
  checkForAppUpdate,
  markLoadedBuild
} from './version-update.js';
import { toggleLoadingSpinner } from './spinner.js';
import { applySyncedAdminSettingsFromConfig } from '../household-config-apply.js';
import {
  dismissGoogleConnectGate,
  needsGoogleCalendarConnect,
  showGoogleConnectGate
} from './google-connect-gate.js';

// Global localStorage exception handling
const originalSetItem = Storage.prototype.setItem;
Storage.prototype.setItem = function(key, value) {
  try {
    originalSetItem.call(this, key, value);
  } catch (err) {
    console.error('localStorage.setItem failed (quota exceeded or disabled):', err);
    if (typeof window !== 'undefined' && window.showToast) {
      window.showToast('Storage quota exceeded. Some data may not be saved locally.', 'error');
    }
  }
};

async function routeAfterAuth() {
  if (needsGoogleCalendarConnect()) {
    showGoogleConnectGate();
    return;
  }
  router();
}

function determineInitialView() {
  const savedProfile = JSON.parse(localStorage.getItem(LOCAL_SESSION_KEY) || 'null');
  if (savedProfile?.sessionActive) {
    const partner = state.config?.partners?.find(p => p.id === savedProfile.id && !isPartnerPassive(p));
    if (partner && partner.username === savedProfile.username) {
      establishSession(partner);
      void routeAfterAuth();
      return;
    }
    localStorage.removeItem(LOCAL_SESSION_KEY);
  }

  showLoginView();
}

function createSyncHooks() {
  return {
    CalendarSync,
    state,
    renderView: () => router()
  };
}

/** Load cached snapshot; sync with Google when credentials are available. */
export async function bootstrapInitial() {
  AuthManager.reloadFromStorage();
  applyCacheSnapshot(loadCacheSnapshot(), { state, CalendarSync });
  if (state.config && migrateFamilyNameToConfig(state.config)) {
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(state.config));
    CalendarSync.config = state.config;
  }
  CalendarSync.mode = 'cache';

  if (shouldSyncWithGoogleCalendar()) {
    setCalendarStatus('connecting');
    const result = await bootstrapData('sync');
    if (!result.ok) {
      applyCacheSnapshot(loadCacheSnapshot(), { state, CalendarSync });
    }
  } else {
    setCalendarStatus('disconnected');
  }

  updateOfflineBanner();
}

/** @returns {Promise<{ ok: boolean, mode: string, error?: Error }>} */
export async function bootstrapData(mode) {
  addLog(`Sync: Initializing cloud calendar (${mode}).`);

  AuthManager.reloadFromStorage();
  if (!AuthManager.accessToken || !AuthManager.apiKey || !AuthManager.clientId) {
    const err = new Error('Google Calendar is not connected.');
    err.code = 'GOOGLE_CREDENTIALS_INCOMPLETE';
    setCalendarStatus('disconnected');
    applyCacheSnapshot(loadCacheSnapshot(), { state, CalendarSync });
    CalendarSync.mode = 'cache';
    updateOfflineBanner();
    return { ok: false, mode: 'cache', error: err };
  }

  const credentials = {
    accessToken: AuthManager.accessToken,
    apiKey: AuthManager.apiKey
  };

  try {
    const alignStats = await CalendarSync.init('sync', credentials, () => {
      state.events = CalendarSync.events;
      state.config = CalendarSync.config;
    });

    state.events = CalendarSync.events;
    state.config = CalendarSync.config;
    setCalendarStatus('connected');
    syncCalendarSyncFromAuth(CalendarSync);

    const adminSettings = applySyncedAdminSettingsFromConfig(state.config);
    addLog(`Admin settings applied: ${Object.keys(adminSettings).join(', ')}`);

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

    const syncMod = await import('../household-sync.js');
    await syncMod.startHouseholdSyncHub(createSyncHooks());

    updateOfflineBanner();
    return { ok: true, mode: 'sync' };
  } catch (err) {
    logOperationError('Google Calendar sync init', err);

    if (err?.code === 'GOOGLE_AUTH_EXPIRED') {
      AuthManager.accessToken = '';
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }

    if (err?.code === 'GOOGLE_NOT_FOUND') {
      showToast('Calendar not found. Check Calendar ID on the Admin page.', 'error');
    } else if (err?.code === 'GOOGLE_FORBIDDEN') {
      showToast(`Google Calendar access denied: ${err.message}`, 'error');
    } else if (err?.code === 'GOOGLE_CREDENTIALS_INCOMPLETE') {
      showToast('Google Calendar is not connected.', 'warning');
    } else {
      showToast(`Calendar sync failed: ${err.message}`, 'error');
    }

    setCalendarStatus('disconnected');
    applyCacheSnapshot(loadCacheSnapshot(), { state, CalendarSync });
    CalendarSync.mode = 'cache';
    updateOfflineBanner();
    return { ok: false, mode: 'cache', error: err };
  }
}

function updateGoogleLoginButton() {
  const loginBtnEl = document.getElementById('btn-google-login');
  if (!loginBtnEl) return;
  loginBtnEl.style.display = 'none';
}

export async function handleGoogleAuthState(authState) {
  updateGoogleLoginButton();

  if (authState.loggedIn) {
    const result = await bootstrapData('sync');
    if (result.ok) {
      dismissGoogleConnectGate();
      setCalendarStatus('connected');
      CalendarSync.mode = 'sync';
      syncCalendarSyncFromAuth(CalendarSync);
      showToast('Connected to Google Calendar.', 'success');
      if (isLoggedIn()) {
        router();
      } else {
        showLoginView();
      }
    }
    return;
  }

  if (isLoggedIn() && !isCalendarConnected()) {
    setCalendarStatus('disconnected');
    updateOfflineBanner();
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

function markBooted() {
  document.documentElement.setAttribute('data-polyschedule-booted', '1');
  if (typeof window.__polyscheduleMarkBooted === 'function') {
    window.__polyscheduleMarkBooted();
  }
}

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    })
  ]);
}

export function init() {
  window.addEventListener('polyschedule:google-integration', () => {
    updateGoogleLoginButton();
  });

  window.addEventListener('polyschedule:household-services', async (event) => {
    const { startHouseholdSyncHub } = await import('../household-sync.js');
    await startHouseholdSyncHub(createSyncHooks());
    if (event.detail?.notifyApplied && state.currentUser) {
      import('../push-notifications.js').then(({ syncPushSubscriptionIfEnabled }) => {
        syncPushSubscriptionIfEnabled(state.currentUser.id);
      });
    }
  });

  const run = async () => {
    markBooted();
    state.logs = loadPersistedLogs();
    initChangeLog();
    void syncPromotionChangeLog();

    window.addEventListener('hashchange', router);

    if (state.logs.length === 0) {
      addLog('Application initialized.', 'info');
    }

    bindOfflineBanner();
    bindUpdateBanner();
    void checkForAppUpdate();

    const notifBtn = document.getElementById('btn-notifications');
    if (notifBtn) notifBtn.addEventListener('click', () => openNotificationsModal());
    updateNotificationsBadge();

    initBuildBanner();
    updateGoogleLoginButton();

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

    const { bindHouseholdSyncMessageHandler } = await import('../household-sync.js');
    bindHouseholdSyncMessageHandler(createSyncHooks());

    bindImpersonationBanner();

    AuthManager.onAuthError = (message) => showToast(message, 'error');
    AuthManager.init(() => updateGoogleLoginButton());

    toggleLoadingSpinner(true);
    try {
      await withTimeout(bootstrapInitial(), 30000, 'Calendar bootstrap');
      await determineInitialView();
    } catch (err) {
      console.error('[bootstrap] init failed', err);
      showToast('Failed to start PolySchedule. Try clearing site data and reloading.', 'error');
      showLoginView();
    } finally {
      toggleLoadingSpinner(false);
      void markLoadedBuild();
    }

    AuthManager.onAuthStateChange = (authState) => handleGoogleAuthState(authState);
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}
