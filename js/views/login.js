import { needsHouseholdSetup } from '../helpers.js';
import { AuthManager } from '../auth.js';
import { CALENDAR_ID_KEY, CLIENT_ID_KEY, API_KEY_KEY } from '../storage-keys.js';

function googleCredentialDefaults() {
  return {
    clientId: AuthManager.clientId || localStorage.getItem(CLIENT_ID_KEY) || '',
    apiKey: AuthManager.apiKey || localStorage.getItem(API_KEY_KEY) || '',
    calendarId: localStorage.getItem(CALENDAR_ID_KEY) || 'primary'
  };
}

function connectExistingHouseholdHtml() {
  const { clientId, apiKey, calendarId } = googleCredentialDefaults();
  return `
        <div class="bento-card" id="connect-household-form" style="width: 100%; max-width: 440px; padding: var(--space-xl); border: 1px solid var(--outline-variant);">
          <div style="text-align: center; margin-bottom: var(--space-lg);">
            <span class="material-symbols-outlined" style="font-size: 48px; color: var(--primary);">cloud_sync</span>
            <h2 class="font-headline-lg" style="margin-top: var(--space-sm); font-weight: 700;">Connect Existing Household</h2>
            <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 4px;">
              Use this on a new phone or after clearing browser data. Enter the same Google Calendar credentials as your other device, then sign in with Google to load your partners and schedule.
            </p>
          </div>
          <div class="form-group">
            <label class="form-label" for="connect-client-id">Google Client ID</label>
            <input class="form-input" id="connect-client-id" type="text" autocomplete="off" placeholder="From Google Cloud Console" value="${clientId}"/>
          </div>
          <div class="form-group">
            <label class="form-label" for="connect-api-key">Google API Key</label>
            <input class="form-input" id="connect-api-key" type="text" autocomplete="off" placeholder="Calendar API key" value="${apiKey}"/>
          </div>
          <div class="form-group">
            <label class="form-label" for="connect-calendar-id">Calendar ID</label>
            <input class="form-input" id="connect-calendar-id" type="text" autocomplete="off" placeholder="primary or shared calendar ID" value="${calendarId}"/>
          </div>
          <button class="btn btn-filled" id="btn-connect-existing-household" style="width: 100%; margin-top: var(--space-sm);">
            Connect Google Calendar &amp; Load Household
          </button>
        </div>
  `;
}

export function loginView(state) {
  if (needsHouseholdSetup(state.config)) {
    return `
      <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; padding: var(--space-lg); gap: var(--space-xl);">
        ${connectExistingHouseholdHtml()}
        <div class="bento-card" id="setup-form" style="width: 100%; max-width: 440px; padding: var(--space-xl); border: 1px solid var(--outline-variant);">
          <div style="text-align: center; margin-bottom: var(--space-lg);">
            <span class="material-symbols-outlined" style="font-size: 48px; color: var(--on-surface-variant);">person_add</span>
            <h2 class="font-headline-lg" style="margin-top: var(--space-sm); font-weight: 700;">Brand-New Household</h2>
            <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 4px;">
              Only use this if nobody in your group has set up PolySchedule yet.
            </p>
          </div>
          <div class="form-group">
            <label class="form-label" for="setup-name">Your name</label>
            <input class="form-input" id="setup-name" type="text" autocomplete="name" placeholder="e.g. Michael Burton"/>
          </div>
          <div class="form-group">
            <label class="form-label" for="setup-username">Username</label>
            <input class="form-input" id="setup-username" type="text" autocomplete="username" placeholder="e.g. mpburton"/>
          </div>
          <div class="form-group">
            <label class="form-label" for="setup-password">Password</label>
            <input class="form-input" id="setup-password" type="password" autocomplete="new-password" placeholder="Choose a password"/>
          </div>
          <button class="btn btn-outline" id="btn-setup-household" style="width: 100%; margin-top: var(--space-sm);">Create Admin Account</button>
        </div>
      </div>
    `;
  }

  return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; padding: var(--space-lg);">
      <div class="bento-card" id="login-form" style="width: 100%; max-width: 400px; padding: var(--space-xl); border: 1px solid var(--outline-variant);">
        <div style="text-align: center; margin-bottom: var(--space-lg);">
          <span class="material-symbols-outlined" style="font-size: 48px; color: var(--primary);">calendar_month</span>
          <h2 class="font-headline-lg" style="margin-top: var(--space-sm); font-weight: 700;">PolySchedule</h2>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 4px;">Sign in to manage your schedule</p>
        </div>
        <div class="form-group">
          <label class="form-label" for="login-username">Username</label>
          <input class="form-input" id="login-username" type="text" autocomplete="username" placeholder="Enter username"/>
        </div>
        <div class="form-group">
          <label class="form-label" for="login-password">Password</label>
          <input class="form-input" id="login-password" type="password" autocomplete="current-password" placeholder="Enter password"/>
        </div>
        <button class="btn btn-filled" id="btn-login" style="width: 100%; margin-top: var(--space-sm);">Log In</button>
      </div>
    </div>
  `;
}
