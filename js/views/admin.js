import {
  CALENDAR_ID_KEY,
  CLIENT_ID_KEY,
  API_KEY_KEY,
  NOTIFY_URL_KEY,
  NOTIFY_SECRET_KEY,
  HOUSEHOLD_SYNC_TOKEN_KEY
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
import { renderChangeLogHtml } from '../change-log.js';
import { renderSystemLogHtml } from '../app/operation-log.js';
import { getGroupName } from '../group-name.js';
import { isGoogleIntegrationServerManaged } from '../google-integration.js';


export function adminView(state) {
    const polyFamilyName = getGroupName(state.config);
    const autoArchiveDays = getAutoArchiveDays();
    const googleIntegration = state.config?.googleIntegration || {};
    const clientId = googleIntegration.clientId || localStorage.getItem(CLIENT_ID_KEY) || '';
    const apiKey = googleIntegration.apiKey || localStorage.getItem(API_KEY_KEY) || '';
    const calendarId = googleIntegration.calendarId || localStorage.getItem(CALENDAR_ID_KEY) || 'primary';
    const notifyService = state.config?.notifyService || {};
    const syncHub = state.config?.syncHub || {};
    const notifyUrl = notifyService.url || localStorage.getItem(NOTIFY_URL_KEY) || '';
    const notifySecret = notifyService.secret || localStorage.getItem(NOTIFY_SECRET_KEY) || '';
    const householdId = state.config?.householdId || '';
    const syncRevision = state.config?.syncRevision ?? 0;
    const householdSyncToken = syncHub.token || localStorage.getItem(HOUSEHOLD_SYNC_TOKEN_KEY) || '';
    const serverManagedGoogle = isGoogleIntegrationServerManaged();
    const credentialsConfigured = !!(clientId && apiKey);
    const syncHubConfigured = !!(notifyUrl && notifySecret);
    const changeLogHtml = renderChangeLogHtml(state.changeLog || []);

    const logsHtml = renderSystemLogHtml(state.logs || []);

    const googleCalendarSettingsSection = serverManagedGoogle
      ? `
        <div class="bento-card" id="admin-google-calendar-settings" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-xs); display: flex; align-items: center; gap: var(--space-sm);">
            <span class="material-symbols-outlined text-primary">cloud_sync</span> Google Calendar
          </h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Credentials are managed by the notify service. Household members only connect their Google account once per device — no manual API setup required.
          </p>
          ${credentialsConfigured
            ? `<p class="font-label-sm" style="color: var(--secondary); margin-bottom: var(--space-md);">Connected to calendar <code>${calendarId}</code>.</p>`
            : '<p class="font-label-sm" style="color: var(--tertiary); margin-bottom: var(--space-md);">Credentials could not be loaded from the server. Verify GOOGLE_CLIENT_ID and GOOGLE_API_KEY on Render, then reload the app.</p>'}
          <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
            <button class="btn btn-outline" id="btn-test-google-calendar" type="button">Test Calendar API</button>
            <button class="btn btn-outline" id="btn-disconnect-google" type="button">Disconnect Google Sync</button>
          </div>
        </div>`
      : `
        <div class="bento-card" id="admin-google-calendar-settings" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-xs); display: flex; align-items: center; gap: var(--space-sm);">
            <span class="material-symbols-outlined text-primary">cloud_sync</span> Google Calendar Settings
          </h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            One-time setup for the whole group. Credentials sync to other devices automatically after login. Each member connects Google Calendar once on their device.
          </p>
          ${credentialsConfigured
            ? '<p class="font-label-sm" style="color: var(--secondary); margin-bottom: var(--space-md);">Credentials are configured.</p>'
            : '<p class="font-label-sm" style="color: var(--tertiary); margin-bottom: var(--space-md);">Not configured yet — enter credentials below.</p>'}

          <div style="display: flex; flex-direction: column; gap: var(--space-md);">
            <p class="font-label-sm" style="color: var(--on-surface-variant); margin-bottom: var(--space-sm); padding: var(--space-sm); background: var(--surface-container-low); border-radius: var(--radius-md);">
              <strong>Google Cloud checklist</strong> (same project for OAuth client and API key):<br>
              1. Enable <strong>Google Calendar API</strong> (APIs &amp; Services → Library).<br>
              2. OAuth client → <strong>Authorized JavaScript origins</strong>: <code>${typeof window !== 'undefined' ? window.location.origin : ''}</code><br>
              3. API key → <strong>HTTP referrers</strong>: <code>${typeof window !== 'undefined' ? window.location.origin : ''}/*</code><br>
              4. API key → <strong>API restrictions</strong>: allow <strong>Google Calendar API</strong> only.<br>
              OAuth can succeed while Calendar API calls still fail if steps 1, 3, or 4 are missing.
            </p>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="admin-google-client-id">OAuth 2.0 Client ID</label>
              <input class="form-input" id="admin-google-client-id" placeholder="xxxxxx.apps.googleusercontent.com" type="text" value="${clientId}"/>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="admin-google-api-key">API Key</label>
              <input class="form-input" id="admin-google-api-key" placeholder="AIzaSy..." type="password" value="${apiKey}"/>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="admin-google-calendar-id">Calendar ID</label>
              <input class="form-input" id="admin-google-calendar-id" placeholder="primary" type="text" value="${calendarId}"/>
              <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-xs);">Defaults to <code>primary</code>. Use a shared group calendar ID for the household schedule.</p>
            </div>
            <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
              <button class="btn btn-filled" id="btn-save-google-credentials" type="button">Save Google Credentials</button>
              <button class="btn btn-outline" id="btn-test-google-calendar" type="button">Test Calendar API</button>
              <button class="btn btn-outline" id="btn-disconnect-google" type="button">Disconnect Google Sync</button>
            </div>
            <p class="font-label-sm" style="color: var(--on-surface-variant); margin: 0;">
              After saving credentials, connect Google Calendar from the gate or OFFLINE banner, then use <strong>Test Calendar API</strong>.
            </p>
          </div>
        </div>`;

    const adminSections = [
      `
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Group Settings</h3>
          <div class="form-group" style="margin-bottom: var(--space-md);">
            <label class="form-label" for="admin-poly-family-name">Name</label>
            <input class="form-input" id="admin-poly-family-name" placeholder="The Poly Circle" type="text" value="${polyFamilyName}"/>
          </div>
          <button class="btn btn-filled" id="btn-save-group-name" style="align-self: flex-start;">Save Name</button>
        </div>`,
      ...((!credentialsConfigured && !serverManagedGoogle) ? [googleCalendarSettingsSection] : []),
      `
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm);">
            <span class="material-symbols-outlined text-primary">terminal</span> System Administration Log
          </h3>
          <div class="console-container">
            <div class="console-header">
              <span class="font-label-sm">Operational Log (${(state.logs || []).length} entries)</span>
            </div>
            <div class="console-body" id="console-logs-body" style="max-height: 280px; overflow-y: auto;">
              ${logsHtml}
            </div>
            <div class="console-action-row">
              <button class="btn-outline" id="btn-export-logs" style="background: transparent; border: none; font-family: var(--font-mono); font-size: 0.75rem; color: rgba(255,255,255,0.6); cursor: pointer; display: flex; align-items: center; gap: 4px;">
                <span class="material-symbols-outlined" style="font-size: 16px;">download</span> Export Logs
              </button>
            </div>
          </div>
        </div>`,

      `
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm);">
            <span class="material-symbols-outlined text-primary">history</span> Change Control Log
          </h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Build history and release notes (${(state.changeLog || []).length} releases).
          </p>
          <div class="change-log-panel">
            <div class="change-log-body" id="change-log-body">
              ${changeLogHtml}
            </div>
          </div>
        </div>`,

      `
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Proposal Archiving</h3>
          <div class="form-group" style="margin-bottom: var(--space-md);">
            <label class="form-label" for="admin-auto-archive-days">Auto-archive approved proposals after (days)</label>
            <input class="form-input" id="admin-auto-archive-days" type="number" min="0" max="365" value="${autoArchiveDays}"/>
            <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-xs);">Set to 0 to disable automatic archiving (manual only).</p>
          </div>
          <button class="btn btn-filled" id="btn-save-auto-archive" style="align-self: flex-start;">Save Archive Setting</button>
        </div>`,

      `
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-xs); display: flex; align-items: center; gap: var(--space-sm);">
            <span class="material-symbols-outlined text-primary">hub</span> Household Sync Hub
          </h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Near-real-time coordination via the notify service. Google Calendar remains the source of truth.
          </p>
          ${syncHubConfigured
            ? '<p class="font-label-sm" style="color: var(--secondary); margin-bottom: var(--space-md);">Notify service is configured for sync hub.</p>'
            : '<p class="font-label-sm" style="color: var(--tertiary); margin-bottom: var(--space-md);">Configure the notify service below before enabling household sync.</p>'}

          <div style="display: flex; flex-direction: column; gap: var(--space-md);">
            ${householdId
              ? `<p class="font-label-sm" style="color: var(--on-surface-variant); margin: 0;">Internal sync id (auto-assigned). Revision: <strong id="admin-sync-revision">${syncRevision}</strong></p>`
              : '<p class="font-label-sm" style="color: var(--on-surface-variant); margin: 0;">Sync id is assigned automatically when config is first saved to Google Calendar.</p>'}
            <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
              <button class="btn btn-outline" id="btn-register-gcal-watch" type="button" ${!householdId || !credentialsConfigured ? 'disabled' : ''}>Register GCal Webhook</button>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="admin-household-sync-token">Household sync token (optional)</label>
              <input class="form-input" id="admin-household-sync-token" type="password" value="${householdSyncToken}" placeholder="Per-household secret for future device pairing"/>
            </div>
            <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
              <button class="btn btn-outline" id="btn-generate-household-sync-token" type="button">Generate Token</button>
              <button class="btn btn-filled" id="btn-save-household-sync-token" type="button">Save Sync Token</button>
            </div>
          </div>
        </div>`,
      ...((credentialsConfigured || serverManagedGoogle) ? [googleCalendarSettingsSection] : []),
      `
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-xs); display: flex; align-items: center; gap: var(--space-sm);">
            <span class="material-symbols-outlined text-primary">notifications_active</span> Mobile Push Notifications
          </h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            One-time setup for the notify service that delivers Web Push alerts to Android and iPhone PWAs when proposals need review. URL and secret sync to all household devices; each person still enables push under Settings.
          </p>
          ${notifyUrl && notifySecret
            ? '<p class="font-label-sm" style="color: var(--secondary); margin-bottom: var(--space-md);">Notify service is configured.</p>'
            : '<p class="font-label-sm" style="color: var(--tertiary); margin-bottom: var(--space-md);">Not configured yet — deploy <code>notify-service</code> and enter its URL and secret below.</p>'}

          <div style="display: flex; flex-direction: column; gap: var(--space-md);">
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="admin-notify-url">Notify Service URL</label>
              <input class="form-input" id="admin-notify-url" placeholder="https://polyschedule-notify.onrender.com" type="url" value="${notifyUrl}"/>
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label class="form-label" for="admin-notify-secret">Notify Secret</label>
              <input class="form-input" id="admin-notify-secret" placeholder="long random secret" type="password" value="${notifySecret}"/>
              <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-xs);">Must match <code>NOTIFY_SECRET</code> on the notify service. See <code>notify-service/README.md</code>.</p>
            </div>
            <button class="btn btn-filled" id="btn-save-notify-credentials" type="button">Save Notify Settings</button>
          </div>
          <div style="margin-top: var(--space-lg); padding-top: var(--space-lg); border-top: 1px solid var(--outline-variant);">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-sm); margin-bottom: var(--space-md);">
              <h4 class="font-title-md" style="font-weight: 700; margin: 0;">Registered push devices</h4>
              <button class="btn btn-outline" id="btn-refresh-notify-devices" type="button">Refresh</button>
            </div>
            <p class="font-body-sm" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
              Devices that have enabled push notifications. Partner names come from your household config.
            </p>
            <div id="notify-devices-panel" class="font-body-sm" style="color: var(--on-surface-variant);">
              ${notifyUrl && notifySecret ? 'Click Refresh to load devices.' : 'Configure the notify service first.'}
            </div>
          </div>
        </div>`
    ];

    return `
      <div class="mb-xl" style="margin-bottom: var(--space-xl);">
        <h2 class="font-headline-lg">System Administration</h2>
        <p class="font-body-lg" style="color: var(--on-surface-variant); margin-top: 4px;">
          Configure global settings and review real operational system logs.
        </p>
      </div>

      <section style="max-width: 800px; display: flex; flex-direction: column; gap: var(--space-xl);">
        ${adminSections.join('')}
      </section>
    `;
  }