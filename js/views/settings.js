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


export function settingsView(state) {
    const isOffline = state.isOffline;
    const clientId = localStorage.getItem('polyschedule_client_id') || '';
    const apiKey = localStorage.getItem('polyschedule_api_key') || '';
    const calendarId = localStorage.getItem('polyschedule_calendar_id') || 'primary';
    
    return `
      <div class="mb-xl" style="margin-bottom: var(--space-xl);">
        <h2 class="font-headline-lg">Settings & Integrations</h2>
        <p class="font-body-lg" style="color: var(--on-surface-variant); margin-top: 4px;">
          Configure API credentials, choose synchronization profiles, and verify local storage states.
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
                <span class="font-body-md" style="color: var(--on-surface-variant);">Syncs schedule and proposals directly to a Google Calendar. Requires client API keys.</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Google Calendar API Setup (Conditional) -->
        <div class="bento-card" id="api-keys-section" style="padding: var(--space-lg); border: 1px solid var(--outline-variant); display: ${isOffline ? 'none' : 'flex'}; flex-direction: column; gap: var(--space-md);">
          <h3 class="font-title-lg" style="font-weight: 700;">Google API Credentials</h3>
          <p class="font-body-md" style="color: var(--on-surface-variant);">
            To connect, enter your Google OAuth 2.0 Client ID and API Key from the Google Cloud Console.
          </p>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-client-id">OAuth 2.0 Client ID</label>
            <input class="form-input" id="setting-client-id" placeholder="xxxxxx.apps.googleusercontent.com" type="text" value="${clientId}"/>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-api-key">API Key</label>
            <input class="form-input" id="setting-api-key" placeholder="AIzaSy..." type="password" value="${apiKey}"/>
          </div>

          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-calendar-id">Calendar ID (Optional)</label>
            <input class="form-input" id="setting-calendar-id" placeholder="primary" type="text" value="${calendarId}"/>
            <span class="font-label-sm" style="color: var(--on-surface-variant); margin-top: 4px;">defaults to 'primary' (your main login calendar)</span>
          </div>

          <button class="btn btn-filled" id="btn-save-credentials" style="align-self: flex-start; margin-top: var(--space-sm);">Save Credentials</button>
        </div>

        <!-- App Reset Details -->
        <div class="bento-card" style="padding: var(--space-lg); border: 1px solid var(--error-container); background-color: rgba(186, 26, 26, 0.02);">
          <h3 class="font-title-lg" style="font-weight: 700; color: var(--error);">Reset Data</h3>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-bottom: var(--space-md);">
            Clears all local storage settings, cached events, profiles, and API credentials, resetting the app to default.
          </p>
          <button class="btn btn-error" id="btn-reset-app" style="align-self: flex-start;">Clear Local Data</button>
        </div>
      </section>
    `;
  }