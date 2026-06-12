export function googleConnectGateView() {
  return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; padding: var(--space-lg);">
      <div class="bento-card" id="google-connect-gate" style="width: 100%; max-width: 440px; padding: var(--space-xl); border: 1px solid var(--outline-variant);">
        <div style="text-align: center; margin-bottom: var(--space-lg);">
          <span class="material-symbols-outlined" style="font-size: 48px; color: var(--primary);">calendar_month</span>
          <h2 class="font-headline-lg" style="margin-top: var(--space-sm); font-weight: 700;">Connect Google Calendar</h2>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 4px;">
            PolySchedule is cloud-based. Sign in with Google to load your household schedule before continuing.
          </p>
        </div>
        <button class="btn btn-filled" id="btn-google-connect-gate" style="width: 100%;">
          <span class="material-symbols-outlined" style="font-size: 18px;">login</span>
          Connect Google Calendar
        </button>
        <button class="btn btn-text" id="btn-google-gate-logout" style="width: 100%; margin-top: var(--space-sm); color: var(--on-surface-variant);">
          Log out
        </button>
      </div>
    </div>
  `;
}
