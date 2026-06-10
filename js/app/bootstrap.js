import { AuthManager } from '../auth.js';
import { CalendarSync } from '../calendar.js';
import { isPartnerPassive, LEGACY_PROFILE_KEY, SEED_REFRESH_NOTICE_KEY } from '../helpers.js';
import {
  state,
} from './state.js';
import {
  loadPersistedLogs,
  addLog,
  showToast,
  updateNotificationsBadge,
  establishSession,
  logoutUser,
  showLoginView,
  LOCAL_SESSION_KEY
} from './context.js';
import {
  openNotificationsModal,
  openUserProfileModal
} from './modals.js';
import { router } from './router.js';

export async function bootstrapData(mode) {
  addLog(`Sync: Initializing client state in ${mode} mode.`);

  let credentials = null;
  if (mode === 'sync') {
    credentials = {
      accessToken: AuthManager.accessToken,
      apiKey: AuthManager.apiKey
    };
  }

  try {
    await CalendarSync.init(mode, credentials, () => {
      state.events = CalendarSync.events;
      state.config = CalendarSync.config;
    });

    state.events = CalendarSync.events;
    state.config = CalendarSync.config;
    router();
  } catch (err) {
    addLog(`Error initializing sync: ${err.message}`, 'error');
    showToast('Failed to connect to Google Calendar. Operating in Offline Mode.', 'error');

    state.isOffline = true;
    localStorage.setItem('polyschedule_mode', 'offline');
    bootstrapData('offline');
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

    if (new URLSearchParams(window.location.search).get('reset') === '1') {
      localStorage.clear();
      window.history.replaceState({}, '', window.location.pathname);
      addLog('System: Application data reset to defaults.', 'warning');
    }

    migrateLegacySession();

    await bootstrapData('offline');

    if (sessionStorage.getItem(SEED_REFRESH_NOTICE_KEY)) {
      sessionStorage.removeItem(SEED_REFRESH_NOTICE_KEY);
      showToast('Demo database updated to the latest defaults. Please log in again.', 'warning');
    }

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

    AuthManager.init((authState) => {
      if (authState.loggedIn && authState.user?.email) {
        const loginBtnEl = document.getElementById('btn-google-login');
        if (loginBtnEl) loginBtnEl.style.display = 'none';
      }
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', run);
  } else {
    run();
  }
}
