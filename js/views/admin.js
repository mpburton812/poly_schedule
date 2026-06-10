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


export function adminView(state) {
    const polyFamilyName = localStorage.getItem('polyschedule_poly_family_name') || 'The Poly Circle';
    const autoArchiveDays = getAutoArchiveDays();
    const clientId = localStorage.getItem('polyschedule_client_id') || '';
    const apiKey = localStorage.getItem('polyschedule_api_key') || '';
    const calendarId = localStorage.getItem('polyschedule_calendar_id') || 'primary';
    const credentialsConfigured = !!(clientId && apiKey);
    const changeLogHtml = (state.changeLog || []).map(entry => `
      <p class="console-line">
        <span class="console-time">[${entry.time}]</span>
        <strong>${entry.actor}</strong>: ${entry.action}${entry.detail ? ` — ${entry.detail}` : ''}
      </p>
    `).join('') || '<p class="console-line" style="color: var(--on-surface-variant);">No configuration changes recorded yet.</p>';

    const logsHtml = (state.logs || []).map(log => {
      const color = log.type === 'error' ? 'var(--error)' : log.type === 'warning' ? 'var(--tertiary)' : 'inherit';
      return `<p class="console-line"><span class="console-time">[${log.time}]</span> <span style="color: ${color};">${log.message}</span></p>`;
    }).join('') || '<p class="console-line" style="color: var(--on-surface-variant);">No system events logged yet.</p>';

    return `
      <div class="mb-xl" style="margin-bottom: var(--space-xl);">
        <h2 class="font-headline-lg">System Administration</h2>
        <p class="font-body-lg" style="color: var(--on-surface-variant); margin-top: 4px;">
          Configure global settings and review real operational system logs.
        </p>
      </div>

      <section style="max-width: 800px; display: flex; flex-direction: column; gap: var(--space-xl);">
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Group Settings</h3>
          <div class="form-group" style="margin-bottom: var(--space-md);">
            <label class="form-label" for="admin-poly-family-name">Name</label>
            <input class="form-input" id="admin-poly-family-name" placeholder="The Poly Circle" type="text" value="${polyFamilyName}"/>
          </div>
          <button class="btn btn-filled" id="btn-save-group-name" style="align-self: flex-start;">Save Name</button>
        </div>

        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-xs); display: flex; align-items: center; gap: var(--space-sm);">
            <span class="material-symbols-outlined text-primary">cloud_sync</span> Google Calendar Integration
          </h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            One-time setup for the whole household. After saving credentials, members can use <strong>Sync Google</strong> in the top bar to connect their account.
          </p>
          ${credentialsConfigured
            ? '<p class="font-label-sm" style="color: var(--secondary); margin-bottom: var(--space-md);">Credentials are configured.</p>'
            : '<p class="font-label-sm" style="color: var(--tertiary); margin-bottom: var(--space-md);">Not configured yet — enter credentials below.</p>'}

          <div style="display: flex; flex-direction: column; gap: var(--space-md);">
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
              <button class="btn btn-outline" id="btn-disconnect-google" type="button">Disconnect Google Sync</button>
            </div>
          </div>
        </div>

        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Proposal Archive</h3>
          <div class="form-group" style="margin-bottom: var(--space-md);">
            <label class="form-label" for="admin-auto-archive-days">Auto-archive approved proposals after (days)</label>
            <input class="form-input" id="admin-auto-archive-days" type="number" min="0" max="365" value="${autoArchiveDays}"/>
            <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-xs);">Set to 0 to disable automatic archiving (manual only).</p>
          </div>
          <button class="btn btn-filled" id="btn-save-auto-archive" style="align-self: flex-start;">Save Archive Setting</button>
        </div>

        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--outline-variant);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md); display: flex; align-items: center; gap: var(--space-sm);">
            <span class="material-symbols-outlined text-primary">history</span> Change Control Log
          </h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Audit trail of configuration and workflow changes (${(state.changeLog || []).length} entries).
          </p>
          <div class="console-container">
            <div class="console-body" id="change-log-body" style="max-height: 220px; overflow-y: auto; background: var(--surface-container-low);">
              ${changeLogHtml}
            </div>
          </div>
        </div>

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
        </div>
      </section>
    `;
  }