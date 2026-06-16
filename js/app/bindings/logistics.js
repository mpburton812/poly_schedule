import {
  CALENDAR_ID_KEY
} from '../../storage-keys.js';
import { AuthManager } from '../../auth.js';
import { CalendarSync } from '../../calendar.js';
import { probeGoogleCalendarConnection } from '../../gcal-sync.js';
import { escapeHtml } from '../../escape.js';
import { state } from '../state.js';
import { logUserAction, showToast, logoutGoogleSync, getCurrentUserId, hasAdminSessionAccess, canEditPartnerProfile } from '../context.js';
import {
  registerGCalWatchOnServer,
  isSyncHubConfigured
} from '../../household-sync.js';
import { setGoogleIntegrationOnConfig } from '../../google-integration.js';
import {
  setNotifyServiceOnConfig
} from '../../household-services.js';
import { NOTIFY_URL_KEY, NOTIFY_SECRET_KEY } from '../../storage-keys.js';
import { enablePushOnThisDevice, disablePushOnThisDevice, sendTestPush, saveQuietHoursSettings, savePushTypePrefs, getPushTypePrefs, fetchRegisteredDevices } from '../../push-notifications.js';
import { forceReloadApp } from '../version-update.js';
import { renderView } from '../router.js';
import { saveColorTheme } from '../../color-themes.js';

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

  container.querySelectorAll('.partner-card-editable').forEach(card => {
    card.addEventListener('click', (e) => {
      if (e.target.closest('.btn-edit-partner')) return;
      const partnerId = card.dataset.partnerId;
      if (!canEditPartnerProfile(partnerId)) return;
      window.location.hash = `#edit-partner?p=${partnerId}`;
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
  bindColorThemeEvents(container);
}

export function bindColorThemeEvents(container = document) {
  container.querySelectorAll('[data-color-theme]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const themeId = btn.dataset.colorTheme;
      saveColorTheme(themeId);
      container.querySelectorAll('[data-color-theme]').forEach((el) => {
        const active = el.dataset.colorTheme === themeId;
        el.classList.toggle('active', active);
        el.setAttribute('aria-pressed', active ? 'true' : 'false');
      });
      showToast(`${btn.querySelector('.font-label-md')?.textContent || 'Theme'} applied.`, 'success');
    });
  });
}

export function bindHouseholdSyncEvents(container = document) {
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
            showToast(`Saved on this device but failed to sync to cloud: ${err.message}`, 'warning');
            logUserAction(`Notify settings saved locally; cloud sync failed: ${err.message}`, 'warning');
            renderView();
            return;
          }
        }

        showToast('Notify service settings saved and synced to household.', 'success');
        logUserAction('Mobile notify service settings updated and synced to household.', 'info');
        renderView();
      })();
    });
  }
}

export function bindPushSettingsEvents(container = document) {
  const btnEnable = container.querySelector('#btn-enable-push');
  const btnDisable = container.querySelector('#btn-disable-push');
  const btnTest = container.querySelector('#btn-test-push');
  const statusEl = container.querySelector('#push-action-status');

  const setPushStatus = (message, type = 'info') => {
    if (statusEl) {
      statusEl.textContent = message || '';
      statusEl.style.color = type === 'error'
        ? 'var(--error)'
        : type === 'success'
          ? 'var(--secondary)'
          : 'var(--on-surface-variant)';
    }
  };

  const runPushAction = async (button, action) => {
    const partnerId = getCurrentUserId();
    if (!partnerId) {
      const message = 'You must be logged in to manage push notifications.';
      setPushStatus(message, 'error');
      showToast(message, 'error');
      return;
    }
    if (button?.disabled) return;

    const buttons = [btnEnable, btnDisable, btnTest].filter(Boolean);
    buttons.forEach((btn) => { btn.disabled = true; });
    setPushStatus('Working…');

    try {
      await action(partnerId);
    } finally {
      buttons.forEach((btn) => { btn.disabled = false; });
    }
  };

  if (btnEnable) {
    btnEnable.addEventListener('click', () => {
      void runPushAction(btnEnable, async (partnerId) => {
        try {
          await enablePushOnThisDevice(partnerId);
          setPushStatus('Push enabled on this device.', 'success');
          showToast('Push notifications enabled on this device.', 'success');
          logUserAction('Enabled push notifications on this device.', 'info');
          import('../router.js').then(({ router }) => router());
        } catch (err) {
          const message = err?.message || 'Could not enable push notifications.';
          setPushStatus(message, 'error');
          showToast(message, 'error');
        }
      });
    });
  }

  if (btnDisable) {
    btnDisable.addEventListener('click', () => {
      if (btnDisable.disabled) {
        const message = 'Push is not enabled on this device yet.';
        setPushStatus(message, 'warning');
        showToast(message, 'warning');
        return;
      }
      void runPushAction(btnDisable, async (partnerId) => {
        try {
          await disablePushOnThisDevice(partnerId);
          setPushStatus('Push disabled on this device.', 'success');
          showToast('Push notifications disabled on this device.', 'success');
          logUserAction('Disabled push notifications on this device.', 'info');
          import('../router.js').then(({ router }) => router());
        } catch (err) {
          const message = err?.message || 'Could not disable push notifications.';
          setPushStatus(message, 'error');
          showToast(message, 'error');
        }
      });
    });
  }

  if (btnTest) {
    btnTest.addEventListener('click', () => {
      if (btnTest.disabled) {
        const message = 'Enable push on this device first, then try again.';
        setPushStatus(message, 'warning');
        showToast(message, 'warning');
        return;
      }
      void runPushAction(btnTest, async (partnerId) => {
        try {
          await sendTestPush(partnerId);
          setPushStatus('Test sent — check for a banner now, or switch apps for server push.', 'success');
          showToast('Test sent — check for a banner now, or switch apps to see server push.', 'success');
        } catch (err) {
          const message = err?.message || 'Test notification failed.';
          setPushStatus(message, 'error');
          showToast(message, 'error');
        }
      });
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
      const meta = data.meta || null;
      if (!rows.length) {
        const metaLine = meta
          ? `Server storage: ${meta.subscriptionCount ?? 0} subscription(s) at ${meta.subscriptionsPath || meta.dataDir || 'unknown'}.`
          : '';
        panel.innerHTML = `
          <p style="margin: 0 0 var(--space-sm);">No devices registered yet.</p>
          ${metaLine ? `<p class="font-label-sm" style="margin: 0 0 var(--space-sm); color: var(--on-surface-variant);">${escapeHtml(metaLine)}</p>` : ''}
          <p class="font-label-sm" style="margin: 0; color: var(--on-surface-variant);">
            On each phone: Settings → Disable push → Enable on this device. If the count stays 0, check Render <code>DATA_DIR</code> matches your persistent disk mount path.
          </p>`;
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
