import {
  ACCESS_TOKEN_KEY,
  MODE_KEY
} from '../storage-keys.js';
import { AuthManager } from '../auth.js';
import { CalendarSync } from '../calendar.js';
import { LEGACY_PROFILE_KEY } from '../storage-keys.js';
import { isPartnerPassive } from '../helpers.js';;
import { resolveSyncBootstrapMode } from '../gcal-sync.js';
import {
  state,
} from './state.js';
import { LOCAL_SESSION_KEY } from '../storage-keys.js';
import { loadPersistedLogs, addLog, initChangeLog, syncPromotionChangeLog, logOperationError, showToast, updateNotificationsBadge, establishSession, logoutUser, showLoginView, bindImpersonationBanner } from './context.js';
import {
  openNotificationsModal,
  openUserProfileModal
} from './modals.js';
import { router } from './router.js';

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

function createSyncHooks() {
  return {
    CalendarSync,
    state,
    renderView: () => router()
  };
}

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
    // Router will be invoked after bootstrap completes and initial view is determined.
    // Removed early router() call to avoid premature navigation before session checks.


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

    if (mode === 'sync') {
      const syncMod = await import('../household-sync.js');
      await syncMod.startHouseholdSyncHub(createSyncHooks());
    }

    return { ok: true, mode };
  } catch (err) {
    logOperationError('Google Calendar sync init', err);

    if (err?.code === 'GOOGLE_AUTH_EXPIRED') {
      AuthManager.accessToken = '';
      localStorage.removeItem(ACCESS_TOKEN_KEY);
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
    localStorage.setItem(MODE_KEY, 'offline');
    await bootstrapData('offline');
    return { ok: false, mode: 'offline', error: err };
  }
}

function updateGoogleLoginButton(authState) {
  const loginBtnEl = document.getElementById('btn-google-login');
  if (!loginBtnEl) return;

  const syncConfigured = localStorage.getItem(MODE_KEY) === 'sync'
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
    localStorage.setItem(MODE_KEY, 'sync');
    const result = await bootstrapData('sync');
    if (result.ok) {
      showToast('Connected to Google Calendar.', 'success');
    }
    return;
  }

  if (!authState.loggedIn && CalendarSync.mode === 'sync') {
    state.isOffline = true;
    localStorage.setItem(MODE_KEY, 'offline');
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

    const { bindHouseholdSyncMessageHandler } = await import('../household-sync.js');
    bindHouseholdSyncMessageHandler(createSyncHooks());

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

    window.addEventListener('polyschedule:google-integration', (event) => {
      updateGoogleLoginButton({
        loggedIn: !!AuthManager.accessToken,
        user: AuthManager.userProfile,
        mode: localStorage.getItem(MODE_KEY)
      });
      if (event.detail?.needsGoogleLogin && state.currentUser) {
        showToast('Google credentials synced — click Sync Google to connect your account.', 'info');
      }
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
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}
