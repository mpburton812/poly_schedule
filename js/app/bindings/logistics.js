import { AuthManager } from '../../auth.js';
import { state } from '../state.js';
import { addLog, showToast } from '../context.js';

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

export function bindSettingsEvents(container = document) {
  const radios = container.querySelectorAll('input[name="mode-select"]');
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const selected = e.target.value;
      const apiSection = container.querySelector('#api-keys-section');

      if (selected === 'sync') {
        if (apiSection) apiSection.style.display = 'flex';
      } else {
        if (apiSection) apiSection.style.display = 'none';

        state.isOffline = true;
        localStorage.setItem('polyschedule_mode', 'offline');
        import('../bootstrap.js').then(({ bootstrapData }) => bootstrapData('offline'));
      }
    });
  });

  const btnSave = container.querySelector('#btn-save-credentials');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const cid = container.querySelector('#setting-client-id').value.trim();
      const akey = container.querySelector('#setting-api-key').value.trim();
      const calid = container.querySelector('#setting-calendar-id').value.trim();

      if (!cid || !akey) {
        showToast('OAuth Client ID and API Key are required for Sync.', 'warning');
        return;
      }

      AuthManager.setCredentials(cid, akey);
      localStorage.setItem('polyschedule_calendar_id', calid || 'primary');
      localStorage.setItem('polyschedule_mode', 'sync');
      state.isOffline = false;

      showToast('API Credentials saved. Please click "Sync Google" to log in.', 'success');
      addLog('Auth: New API credentials entered. Requesting auth.');

      const loginBtn = document.getElementById('btn-google-login');
      if (loginBtn) loginBtn.style.display = 'inline-flex';
    });
  }

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
