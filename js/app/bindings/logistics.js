import {
  CALENDAR_ID_KEY
} from '../../storage-keys.js';
import { AuthManager } from '../../auth.js';
import { CalendarSync } from '../../calendar.js';
import { probeGoogleCalendarConnection } from '../../gcal-sync.js';
import { escapeHtml } from '../../escape.js';
import { state } from '../state.js';
import { logUserAction, showToast, logoutGoogleSync, getCurrentUserId } from '../context.js';
import {
  generateHouseholdSyncToken,
  registerGCalWatchOnServer,
  setHouseholdSyncToken,
  isSyncHubConfigured
} from '../../household-sync.js';
import { setGoogleIntegrationOnConfig } from '../../google-integration.js';
import {
  setNotifyServiceOnConfig,
  setSyncHubOnConfig
} from '../../household-services.js';
import { NOTIFY_URL_KEY, NOTIFY_SECRET_KEY } from '../../storage-keys.js';
import { enablePushOnThisDevice, disablePushOnThisDevice, sendTestPush, saveQuietHoursSettings, savePushTypePrefs, getPushTypePrefs, fetchRegisteredDevices } from '../../push-notifications.js';
import { forceReloadApp } from '../version-update.js';

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
  const calendarId = localStorage.getItem(CALENDAR_ID_KEY) || 'primary';
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
      void (async () => {
        const cid = container.querySelector('#admin-google-client-id')?.value.trim();
        const akey = container.querySelector('#admin-google-api-key')?.value.trim();
        const calid = container.querySelector('#admin-google-calendar-id')?.value.trim() || 'primary';

        if (!cid || !akey) {
          showToast('OAuth Client ID and API Key are required.', 'warning');
          return;
        }

        AuthManager.setCredentials(cid, akey);
        localStorage.setItem(CALENDAR_ID_KEY, calid);
        CalendarSync.calendarId = calid;
        CalendarSync.apiKey = akey;

        if (state.config) {
          setGoogleIntegrationOnConfig(state.config, {
            clientId: cid,
            apiKey: akey,
            calendarId: calid
          });
          try {
            await CalendarSync.saveConfig(state.config);
          } catch (err) {
            showToast(`Saved locally but failed to sync credentials: ${err.message}`, 'warning');
          }
        }

        showToast('Google credentials saved and synced to household config.', 'success');
        logUserAction('Google Calendar API credentials updated and synced to household.', 'info');

        const loginBtn = document.getElementById('btn-google-login');
        if (loginBtn) loginBtn.style.display = 'inline-flex';

        if (AuthManager.accessToken) {
          const result = await runGoogleCalendarConnectionTest({ showSuccessToast: false });
          if (!result.ok) return;
          const { handleGoogleAuthState } = await import('../bootstrap.js');
          handleGoogleAuthState({ loggedIn: true, user: AuthManager.userProfile, mode: 'sync' });
        }
      })();
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
  const btnForceUpdate = container.querySelector('#btn-force-update');
  if (btnForceUpdate) {
    btnForceUpdate.addEventListener('click', () => {
      showToast('Clearing cache and updating software...', 'info');
      void forceReloadApp();
    });
  }

  bindPushSettingsEvents(container);
}

export function bindHouseholdSyncEvents(container = document) {
  const btnSaveToken = container.querySelector('#btn-save-household-sync-token');
  if (btnSaveToken) {
    btnSaveToken.addEventListener('click', () => {
      void (async () => {
        const token = container.querySelector('#admin-household-sync-token')?.value.trim();
        if (!token) {
          showToast('Enter a sync token or click Generate Token.', 'warning');
          return;
        }
        setHouseholdSyncToken(token);
        if (state.config) {
          setSyncHubOnConfig(state.config, { token });
          try {
            await CalendarSync.saveConfig(state.config);
          } catch (err) {
            showToast(`Saved locally but failed to sync token: ${err.message}`, 'warning');
            return;
          }
        }
        logUserAction('Household sync token saved and synced to household.', 'info');
        showToast('Household sync token saved and synced.', 'success');
      })();
    });
  }

  const btnGenToken = container.querySelector('#btn-generate-household-sync-token');
  if (btnGenToken) {
    btnGenToken.addEventListener('click', () => {
      void (async () => {
        const token = generateHouseholdSyncToken();
        const input = container.querySelector('#admin-household-sync-token');
        if (input) input.value = token;
        setHouseholdSyncToken(token);
        if (state.config) {
          setSyncHubOnConfig(state.config, { token });
          try {
            await CalendarSync.saveConfig(state.config);
            showToast('Generated and synced a new household sync token.', 'success');
          } catch (err) {
            showToast('Token generated locally but failed to sync.', 'warning');
          }
        } else {
          showToast('Generated a new sync token.', 'success');
        }
      })();
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
        showToast('Save household config to Google Calendar first so a sync id is assigned.', 'warning');
        return;
      }
      AuthManager.reloadFromStorage();
      if (!AuthManager.accessToken || !AuthManager.apiKey) {
        showToast('Connect Google Calendar first.', 'warning');
        return;
      }
      const calendarId = localStorage.getItem(CALENDAR_ID_KEY) || 'primary';
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
      void (async () => {
        const url = container.querySelector('#admin-notify-url')?.value.trim().replace(/\/$/, '');
        const secret = container.querySelector('#admin-notify-secret')?.value.trim();
        if (!url || !secret) {
          showToast('Notify service URL and secret are required.', 'warning');
          return;
        }
        localStorage.setItem(NOTIFY_URL_KEY, url);
        localStorage.setItem(NOTIFY_SECRET_KEY, secret);

        if (state.config) {
          setNotifyServiceOnConfig(state.config, { url, secret });
          try {
            await CalendarSync.saveConfig(state.config);
          } catch (err) {
            showToast(`Saved locally but failed to sync notify settings: ${err.message}`, 'warning');
            return;
          }
        }

        showToast('Notify service settings saved and synced to household.', 'success');
        logUserAction('Mobile notify service settings updated and synced to household.', 'info');
      })();
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
            <span style="color: var(--on-surface);">${escapeHtml(device.userAgent)}</span>
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
