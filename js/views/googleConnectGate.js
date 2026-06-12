export function googleConnectGateView({ credentialsReady = false, isAdminUser = false } = {}) {
  let bodyHtml = '';
  if (credentialsReady) {
    bodyHtml = `
      <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 4px;">
        PolySchedule is cloud-based. Sign in with Google on this device to load your household schedule before continuing.
      </p>
      <button class="btn btn-filled" id="btn-google-connect-gate" style="width: 100%; margin-top: var(--space-lg);">
        <span class="material-symbols-outlined" style="font-size: 18px;">login</span>
        Connect Google Calendar
      </button>
    `;
  } else if (isAdminUser) {
    bodyHtml = `
      <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 4px;">
        This device does not have your household Google OAuth credentials yet. Open Admin to confirm they are saved to the household, or enter them if setup is still in progress.
      </p>
      <button class="btn btn-filled" id="btn-open-admin-google-setup" style="width: 100%; margin-top: var(--space-lg);">
        <span class="material-symbols-outlined" style="font-size: 18px;">settings</span>
        Open Google Calendar Settings
      </button>
    `;
  } else {
    bodyHtml = `
      <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 4px;">
        Google Calendar is not configured for your household yet. Ask an admin to complete setup under Admin → Google Calendar Settings from a connected device, then try logging in again.
      </p>
    `;
  }

  return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; padding: var(--space-lg);">
      <div class="bento-card" id="google-connect-gate" style="width: 100%; max-width: 440px; padding: var(--space-xl); border: 1px solid var(--outline-variant);">
        <div style="text-align: center; margin-bottom: var(--space-lg);">
          <span class="material-symbols-outlined" style="font-size: 48px; color: var(--primary);">calendar_month</span>
          <h2 class="font-headline-lg" style="margin-top: var(--space-sm); font-weight: 700;">Connect Google Calendar</h2>
          ${bodyHtml}
        </div>
        <button class="btn btn-text" id="btn-google-gate-logout" style="width: 100%; margin-top: var(--space-sm); color: var(--on-surface-variant);">
          Log out
        </button>
      </div>
    </div>
  `;
}
