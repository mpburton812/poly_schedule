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
    const credentialsConfigured = !!(localStorage.getItem('polyschedule_client_id') && localStorage.getItem('polyschedule_api_key'));
    
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