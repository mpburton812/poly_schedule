import {
  CLIENT_ID_KEY,
  API_KEY_KEY,
  NOTIFY_URL_KEY
} from '../storage-keys.js';
import { RulesEngine } from '../rules.js';
import {
  DEFAULT_AVATARS,
  isPartnerPassive,
  renderHomeSelectOptions,
  renderAvatarPickerHtml,
  render12HourTimePicker,
  responseStatusLabel,
  defaultBatchAssignment,
  defaultBatchNight,
  normalizeBatchNight,
  getBedroomOptionsForHome,
  getCurrentUserPartner,
  hasSleepingPartnerConnections
} from '../helpers.js';
import {
  WORKFLOW,
  filterProposalsForTab,
  getWorkflowState,
  allowsAbstain,
  isPassivePerson,
  getAutoArchiveDays,
  isCalendarEvent
} from '../proposal-workflow.js';
import { PUSH_TYPE_LABELS, PUSH_TYPE_PREFS_KEY } from '../push-notifications.js';


export function settingsView(state) {
    const isOffline = state.isOffline;
    const credentialsConfigured = !!(localStorage.getItem(CLIENT_ID_KEY) && localStorage.getItem(API_KEY_KEY));
    const notifyUrl = localStorage.getItem(NOTIFY_URL_KEY) || '';
    const pushEnabled = localStorage.getItem('polyschedule_push_enabled') === '1';
    const pushPermission = typeof Notification !== 'undefined' ? Notification.permission : 'default';
    const quietHours = localStorage.getItem('polyschedule_push_quiet_hours') === '1';
    const quietStart = localStorage.getItem('polyschedule_push_quiet_start') || '22';
    const quietEnd = localStorage.getItem('polyschedule_push_quiet_end') || '8';
    let typePrefs = {};
    try {
      typePrefs = JSON.parse(localStorage.getItem(PUSH_TYPE_PREFS_KEY) || '{}');
    } catch {
      typePrefs = {};
    }
    const pushTypeTogglesHtml = Object.entries(PUSH_TYPE_LABELS).map(([type, label]) => `
                  <label style="display: flex; align-items: flex-start; gap: var(--space-sm); cursor: pointer;">
                    <input type="checkbox" class="push-type-toggle" data-push-type="${type}" ${typePrefs[type] !== false ? 'checked' : ''} style="accent-color: var(--primary); margin-top: 2px;"/>
                    <span class="font-body-sm">${label}</span>
                  </label>
                `).join('');
    const pushSupported = typeof window !== 'undefined'
      && 'serviceWorker' in navigator
      && 'PushManager' in window
      && 'Notification' in window;
    
    return `
      <div class="mb-xl" style="margin-bottom: var(--space-xl);">
        <h2 class="font-headline-lg">Settings & Integrations</h2>
        <p class="font-body-lg" style="color: var(--on-surface-variant); margin-top: 4px;">
          Choose how the app stores data and verify local storage options.
        </p>
      </div>

      <section style="max-width: 600px; display: flex; flex-direction: column; gap: var(--space-xl);">
        <!-- Sync Mode Selection -->
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-xs);">Connection Mode</h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Choose whether to operate completely offline (caching configurations in local storage) or sync in real-time with your shared Google Calendar.
          </p>
          
          <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
            <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-sm); background-color: ${isOffline ? 'var(--surface-container-high)' : 'transparent'}; border-radius: var(--radius-default);">
              <input type="radio" name="mode-select" value="offline" ${isOffline ? 'checked' : ''} style="accent-color: var(--primary);"/>
              <div>
                <strong style="display: block; font-size: 0.95rem;">Offline / Local Storage Mode</strong>
                <span class="font-body-md" style="color: var(--on-surface-variant);">No external setup needed. Data persists locally inside your browser.</span>
              </div>
            </label>
            <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-sm); background-color: ${!isOffline ? 'var(--surface-container-high)' : 'transparent'}; border-radius: var(--radius-default);">
              <input type="radio" name="mode-select" value="sync" ${!isOffline ? 'checked' : ''} style="accent-color: var(--primary);"/>
              <div>
                <strong style="display: block; font-size: 0.95rem;">Google Calendar API Sync Mode</strong>
                <span class="font-body-md" style="color: var(--on-surface-variant);">Syncs schedule and proposals to a shared Google Calendar after an admin configures credentials.</span>
              </div>
            </label>
          </div>

          <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-md);">
            ${credentialsConfigured
              ? 'Google Calendar credentials are configured. Use <strong>Sync Google</strong> in the top bar to connect your account.'
              : 'An administrator must configure OAuth Client ID, API Key, and Calendar ID once on the <a href="#admin">Admin</a> page before sync mode is available.'}
          </p>
        </div>

        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-xs); display: flex; align-items: center; gap: var(--space-sm);">
            <span class="material-symbols-outlined text-primary">notifications_active</span> Mobile Notifications
          </h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Receive phone alerts for proposal reviews, votes, approvals, and changes. Works on Android and on iPhone after adding PolySchedule to your Home Screen (iOS 16.4+).
          </p>
          ${notifyUrl
            ? `<p class="font-label-sm" style="color: var(--secondary); margin-bottom: var(--space-md);">Notify service configured${pushEnabled && pushPermission === 'granted' ? ' · enabled on this device' : ''}.</p>`
            : '<p class="font-label-sm" style="color: var(--tertiary); margin-bottom: var(--space-md);">An administrator must configure the notify service on the Admin page first.</p>'}
          ${!pushSupported
            ? '<p class="font-label-sm" style="color: var(--on-surface-variant);">This browser does not support Web Push.</p>'
            : `
              <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
                <button class="btn btn-filled" id="btn-enable-push" type="button" ${!notifyUrl ? 'disabled' : ''}>Enable on this device</button>
                <button class="btn btn-outline" id="btn-disable-push" type="button" ${!pushEnabled ? 'disabled' : ''}>Disable on this device</button>
                <button class="btn btn-outline" id="btn-test-push" type="button" ${!notifyUrl || !pushEnabled || pushPermission !== 'granted' ? 'disabled' : ''}>Send test notification</button>
              </div>
              <p class="font-label-sm" id="push-status-label" style="color: var(--on-surface-variant); margin-top: var(--space-md);">
                Permission: ${pushPermission}${pushEnabled ? ' · device registration on' : ''}
              </p>
              <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-xs);">
                iPhone users: open Safari → Share → Add to Home Screen, then return here to enable notifications.
              </p>
              <div style="margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid var(--outline-variant);">
                <label style="display: flex; align-items: flex-start; gap: var(--space-sm); cursor: pointer;">
                  <input type="checkbox" id="push-quiet-hours" ${quietHours ? 'checked' : ''} style="accent-color: var(--primary); margin-top: 2px;"/>
                  <span>
                    <strong class="font-label-md" style="display: block;">Quiet hours for phone push</strong>
                    <span class="font-body-sm" style="color: var(--on-surface-variant);">Skip mobile push overnight. In-app alerts still appear.</span>
                  </span>
                </label>
                <div style="display: flex; gap: var(--space-md); margin-top: var(--space-sm); flex-wrap: wrap;">
                  <div class="form-group" style="margin-bottom: 0; min-width: 120px;">
                    <label class="form-label" for="push-quiet-start">From</label>
                    <select class="form-input" id="push-quiet-start">
                      ${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${String(h) === quietStart ? 'selected' : ''}>${h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</option>`).join('')}
                    </select>
                  </div>
                  <div class="form-group" style="margin-bottom: 0; min-width: 120px;">
                    <label class="form-label" for="push-quiet-end">Until</label>
                    <select class="form-input" id="push-quiet-end">
                      ${Array.from({ length: 24 }, (_, h) => `<option value="${h}" ${String(h) === quietEnd ? 'selected' : ''}>${h === 0 ? '12 AM' : h < 12 ? `${h} AM` : h === 12 ? '12 PM' : `${h - 12} PM`}</option>`).join('')}
                    </select>
                  </div>
                </div>
              </div>
              <div style="margin-top: var(--space-md); padding-top: var(--space-md); border-top: 1px solid var(--outline-variant);">
                <strong class="font-label-md" style="display: block; margin-bottom: var(--space-sm);">Push alert types</strong>
                <p class="font-body-sm" style="color: var(--on-surface-variant); margin-bottom: var(--space-sm);">Choose which events send phone push. In-app bell alerts are always on.</p>
                <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
                  ${pushTypeTogglesHtml}
                </div>
              </div>
              <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-md);">
                Add a notification email in your profile for email backup when no device is registered (requires admin SMTP setup on the notify service).
              </p>
            `}
        </div>

      </section>
    `;
  }