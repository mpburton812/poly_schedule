import { AuthManager } from '../../auth.js';
import { state } from '../state.js';
import { addLog, showToast, logoutGoogleSync, addChangeLog } from '../context.js';

export function bindLogisticsEvents(container = document) {
  const exportBtn = container.querySelector('#btn-export-logs');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'polyschedule_logs.json';
      a.click();
      showToast('Logs exported successfully!', 'success');
      addLog('Admin: System logs exported.', 'info');
    });
  }

  container.querySelectorAll('.btn-edit-partner').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.hash = `#edit-partner?p=${btn.dataset.partnerId}`;
    });
  });

  container.querySelectorAll('.btn-edit-home').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.hash = `#edit-home?h=${btn.dataset.homeId}`;
    });
  });
}

export function bindGoogleCredentialsEvents(container = document) {
  const btnSave = container.querySelector('#btn-save-google-credentials');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const cid = container.querySelector('#admin-google-client-id')?.value.trim();
      const akey = container.querySelector('#admin-google-api-key')?.value.trim();
      const calid = container.querySelector('#admin-google-calendar-id')?.value.trim();

      if (!cid || !akey) {
        showToast('OAuth Client ID and API Key are required.', 'warning');
        return;
      }

      AuthManager.setCredentials(cid, akey);
      localStorage.setItem('polyschedule_calendar_id', calid || 'primary');
      localStorage.setItem('polyschedule_mode', 'sync');
      state.isOffline = false;

      showToast('Google credentials saved. Use Sync Google in the top bar to connect.', 'success');
      addLog('Admin: Google Calendar API credentials updated.', 'info');
      addChangeLog('Updated Google Calendar credentials', calid || 'primary');

      const loginBtn = document.getElementById('btn-google-login');
      if (loginBtn) loginBtn.style.display = 'inline-flex';

      if (AuthManager.accessToken) {
        import('../bootstrap.js').then(({ handleGoogleAuthState }) => {
          handleGoogleAuthState({ loggedIn: true, user: AuthManager.userProfile, mode: 'sync' });
        });
      }
    });
  }

  const btnDisconnect = container.querySelector('#btn-disconnect-google');
  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      logoutGoogleSync();
      addChangeLog('Disconnected Google Calendar sync', '');
      const loginBtn = document.getElementById('btn-google-login');
      if (loginBtn) loginBtn.style.display = 'inline-flex';
    });
  }
}

export function bindSettingsEvents(container = document) {
  const radios = container.querySelectorAll('input[name="mode-select"]');
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const selected = e.target.value;

      if (selected === 'sync') {
        if (!AuthManager.clientId || !AuthManager.apiKey) {
          showToast('An administrator must configure Google credentials on the Admin page first.', 'warning');
          const offlineRadio = container.querySelector('input[name="mode-select"][value="offline"]');
          if (offlineRadio) offlineRadio.checked = true;
          return;
        }
        state.isOffline = false;
        localStorage.setItem('polyschedule_mode', 'sync');
        const loginBtn = document.getElementById('btn-google-login');
        if (loginBtn) loginBtn.style.display = 'inline-flex';
      } else {
        state.isOffline = true;
        localStorage.setItem('polyschedule_mode', 'offline');
        import('../bootstrap.js').then(({ bootstrapData }) => bootstrapData('offline'));
      }
    });
  });
  const btnReset = container.querySelector('#btn-reset-app');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete all local storage cache, custom settings, and credentials?')) {
        localStorage.clear();
        showToast('All local storage data cleared. Reloading...', 'warning');
        setTimeout(() => window.location.reload(), 1500);
      }
    });
  }

  const btnForceUpdate = container.querySelector('#btn-force-update');
  if (btnForceUpdate) {
    btnForceUpdate.addEventListener('click', () => {
      showToast('Clearing cache and updating software...', 'info');
      if ('caches' in window) {
        caches.keys().then(names => {
          for (const name of names) {
            caches.delete(name);
          }
        });
      }
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (const registration of registrations) {
            registration.update();
          }
        });
      }
      setTimeout(() => {
        window.location.reload(true);
      }, 1000);
    });
  }
}
