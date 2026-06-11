import { AuthManager } from '../../auth.js';
import { CalendarSync } from '../../calendar.js';
import { probeGoogleCalendarConnection } from '../../gcal-sync.js';
import { state } from '../state.js';
import { logUserAction, showToast, logoutGoogleSync, getCurrentUserId } from '../context.js';
import {
  generateHouseholdId,
  generateHouseholdSyncToken,
  registerGCalWatchOnServer,
  setHouseholdSyncToken,
  isSyncHubConfigured
} from '../../household-sync.js';
import {
  NOTIFY_URL_KEY,
  NOTIFY_SECRET_KEY,
  enablePushOnThisDevice,
  disablePushOnThisDevice,
  sendTestPush,
  saveQuietHoursSettings,
  savePushTypePrefs,
  getPushTypePrefs,
  fetchRegisteredDevices
} from '../../push-notifications.js';

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
      logUserAction('System logs exported.', 'info');
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

export async function runGoogleCalendarConnectionTest({ showSuccessToast = true } = {}) {
  AuthManager.reloadFromStorage();
  const calendarId = localStorage.getItem('polyschedule_calendar_id') || 'primary';
  const result = await probeGoogleCalendarConnection({
    accessToken: AuthManager.accessToken,
    apiKey: AuthManager.apiKey,
    calendarId
  });

  if (result.ok) {
    logUserAction(`Google Calendar API test succeeded (HTTP ${result.status}).`, 'info');
    if (showSuccessToast) showToast('Google Calendar API connection OK.', 'success');
    return result;
  }

  const hint = result.code === 'GOOGLE_CREDENTIALS_INCOMPLETE'
    ? result.error
    : `${result.error} — enable Google Calendar API and check API key referrers for ${window.location.origin}`;
  logUserAction(`Google Calendar API test failed · ${hint}`, 'error');
  showToast(hint, 'error');
  return result;
}

export function bindGoogleCredentialsEvents(container = document) {
  const btnTest = container.querySelector('#btn-test-google-calendar');
  if (btnTest) {
    btnTest.addEventListener('click', () => {
      void runGoogleCalendarConnectionTest();
    });
  }

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

      showToast('Google credentials saved. Click Sync Google, then Test Calendar API.', 'success');
      logUserAction('Google Calendar API credentials updated.', 'info');

      const loginBtn = document.getElementById('btn-google-login');
      if (loginBtn) loginBtn.style.display = 'inline-flex';

      if (AuthManager.accessToken) {
        void runGoogleCalendarConnectionTest({ showSuccessToast: false }).then((result) => {
          if (!result.ok) return;
          import('../bootstrap.js').then(({ handleGoogleAuthState }) => {
            handleGoogleAuthState({ loggedIn: true, user: AuthManager.userProfile, mode: 'sync' });
          });
        });
      }
    });
  }

  const btnDisconnect = container.querySelector('#btn-disconnect-google');
  if (btnDisconnect) {
    btnDisconnect.addEventListener('click', () => {
      logoutGoogleSync();
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

  bindPushSettingsEvents(container);
}

export function bindHouseholdSyncEvents(container = document) {
  const btnGenerate = container.querySelector('#btn-generate-household-id');
  if (btnGenerate) {
    btnGenerate.addEventListener('click', async () => {
      if (!state.config) {
        showToast('Load household config first (sync or offline mode).', 'warning');
        return;
      }
      if (state.config.householdId) {
        showToast('Household ID already exists.', 'info');
        return;
      }
      state.config.householdId = generateHouseholdId();
      if (typeof state.config.syncRevision !== 'number') state.config.syncRevision = 0;
      try {
        await CalendarSync.saveConfig(state.config);
        const input = container.querySelector('#admin-household-id');
        if (input) input.value = state.config.householdId;
        const rev = container.querySelector('#admin-sync-revision');
        if (rev) rev.textContent = String(state.config.syncRevision);
        const watchBtn = container.querySelector('#btn-register-gcal-watch');
        if (watchBtn) watchBtn.disabled = false;
        logUserAction(`Household ID created: ${state.config.householdId}`, 'info');
        showToast('Household ID saved to calendar config.', 'success');
      } catch (err) {
        showToast(err.message || 'Failed to save household ID.', 'error');
      }
    });
  }

  const btnSaveToken = container.querySelector('#btn-save-household-sync-token');
  if (btnSaveToken) {
    btnSaveToken.addEventListener('click', () => {
      const token = container.querySelector('#admin-household-sync-token')?.value.trim();
      if (!token) {
        showToast('Enter a sync token or click Generate Token.', 'warning');
        return;
      }
      setHouseholdSyncToken(token);
      logUserAction('Household sync token saved on this device.', 'info');
      showToast('Household sync token saved.', 'success');
    });
  }

  const btnGenToken = container.querySelector('#btn-generate-household-sync-token');
  if (btnGenToken) {
    btnGenToken.addEventListener('click', () => {
      const token = generateHouseholdSyncToken();
      const input = container.querySelector('#admin-household-sync-token');
      if (input) input.value = token;
      setHouseholdSyncToken(token);
      showToast('Generated a new sync token.', 'success');
    });
  }

  const btnWatch = container.querySelector('#btn-register-gcal-watch');
  if (btnWatch) {
    btnWatch.addEventListener('click', async () => {
      if (!isSyncHubConfigured()) {
        showToast('Configure the notify service first.', 'warning');
        return;
      }
      const householdId = state.config?.householdId;
      if (!householdId) {
        showToast('Generate a household ID first.', 'warning');
        return;
      }
      AuthManager.reloadFromStorage();
      if (!AuthManager.accessToken || !AuthManager.apiKey) {
        showToast('Connect Google Calendar first (Sync Google).', 'warning');
        return;
      }
      const calendarId = localStorage.getItem('polyschedule_calendar_id') || 'primary';
      try {
        const result = await registerGCalWatchOnServer({
          householdId,
          calendarId,
          accessToken: AuthManager.accessToken,
          apiKey: AuthManager.apiKey
        });
        logUserAction(`GCal webhook registered (channel ${result.watch?.channelId || 'ok'}).`, 'info');
        showToast('Google Calendar webhook registered on notify service.', 'success');
      } catch (err) {
        logUserAction(`GCal webhook registration failed: ${err.message}`, 'error');
        showToast(err.message, 'error');
      }
    });
  }
}

export function bindNotifyCredentialsEvents(container = document) {
  const btnSave = container.querySelector('#btn-save-notify-credentials');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const url = container.querySelector('#admin-notify-url')?.value.trim().replace(/\/$/, '');
      const secret = container.querySelector('#admin-notify-secret')?.value.trim();
      if (!url || !secret) {
        showToast('Notify service URL and secret are required.', 'warning');
        return;
      }
      localStorage.setItem(NOTIFY_URL_KEY, url);
      localStorage.setItem(NOTIFY_SECRET_KEY, secret);
      showToast('Notify service settings saved.', 'success');
      logUserAction('Mobile notify service settings updated.', 'info');
    });
  }
}

export function bindPushSettingsEvents(container = document) {
  const partnerId = getCurrentUserId();
  const btnEnable = container.querySelector('#btn-enable-push');
  const btnDisable = container.querySelector('#btn-disable-push');
  const btnTest = container.querySelector('#btn-test-push');

  if (btnEnable) {
    btnEnable.addEventListener('click', async () => {
      try {
        await enablePushOnThisDevice(partnerId);
        showToast('Push notifications enabled on this device.', 'success');
        logUserAction('Enabled push notifications on this device.', 'info');
        import('../router.js').then(({ router }) => router());
      } catch (err) {
        showToast(err?.message || 'Could not enable push notifications.', 'error');
      }
    });
  }

  if (btnDisable) {
    btnDisable.addEventListener('click', async () => {
      try {
        await disablePushOnThisDevice(partnerId);
        showToast('Push notifications disabled on this device.', 'success');
        logUserAction('Disabled push notifications on this device.', 'info');
        import('../router.js').then(({ router }) => router());
      } catch (err) {
        showToast(err?.message || 'Could not disable push notifications.', 'error');
      }
    });
  }

  if (btnTest) {
    btnTest.addEventListener('click', async () => {
      try {
        await sendTestPush(partnerId);
        showToast('Test notification sent.', 'success');
      } catch (err) {
        showToast(err?.message || 'Test notification failed.', 'error');
      }
    });
  }

  const quietCheckbox = container.querySelector('#push-quiet-hours');
  const quietStart = container.querySelector('#push-quiet-start');
  const quietEnd = container.querySelector('#push-quiet-end');
  const persistQuietHours = () => {
    saveQuietHoursSettings({
      enabled: !!quietCheckbox?.checked,
      startHour: parseInt(quietStart?.value || '22', 10),
      endHour: parseInt(quietEnd?.value || '8', 10)
    });
  };
  quietCheckbox?.addEventListener('change', persistQuietHours);
  quietStart?.addEventListener('change', persistQuietHours);
  quietEnd?.addEventListener('change', persistQuietHours);

  const persistPushTypePrefs = () => {
    const prefs = { ...getPushTypePrefs() };
    container.querySelectorAll('.push-type-toggle').forEach(input => {
      const type = input.dataset.pushType;
      if (!type) return;
      prefs[type] = input.checked;
    });
    savePushTypePrefs(prefs);
  };
  container.querySelectorAll('.push-type-toggle').forEach(input => {
    input.addEventListener('change', persistPushTypePrefs);
  });
}

export function bindAdminDevicesEvents(container = document) {
  const panel = container.querySelector('#notify-devices-panel');
  const btnRefresh = container.querySelector('#btn-refresh-notify-devices');
  if (!panel || !btnRefresh) return;

  const renderDevices = async () => {
    panel.textContent = 'Loading…';
    try {
      const data = await fetchRegisteredDevices();
      const rows = data.devices || [];
      if (!rows.length) {
        panel.textContent = 'No devices registered yet.';
        return;
      }
      panel.innerHTML = rows.map(row => {
        const partner = state.config?.partners?.find(p => p.id === row.partnerId);
        const name = partner?.name || row.partnerId;
        const deviceLines = (row.devices || []).map(device => `
          <li style="margin-bottom: 4px;">
            <span style="color: var(--on-surface);">${device.userAgent}</span>
            <span style="display: block; font-size: 0.75rem; opacity: 0.8;">Updated ${device.updatedAt || 'unknown'}</span>
          </li>
        `).join('');
        return `
          <div style="border: 1px solid var(--outline-variant); border-radius: var(--radius-md); padding: var(--space-sm); margin-bottom: var(--space-sm);">
            <strong>${name}</strong>
            <span class="font-label-sm" style="color: var(--on-surface-variant);"> · ${row.devices?.length || 0} device(s)</span>
            <ul style="margin: var(--space-xs) 0 0; padding-left: 1.2rem;">${deviceLines}</ul>
          </div>
        `;
      }).join('');
    } catch (err) {
      panel.textContent = err?.message || 'Could not load devices.';
    }
  };

  btnRefresh.addEventListener('click', renderDevices);
}
