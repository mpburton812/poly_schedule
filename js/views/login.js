export function loginView() {
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
        <p class="font-body-md" style="text-align: center; margin-top: var(--space-lg); color: var(--on-surface-variant);">
          Setting up PolySchedule for the first time?
          <a href="#initial-setup" id="link-initial-setup" style="color: var(--primary); font-weight: 600; text-decoration: none;">First-time setup</a>
        </p>
      </div>
    </div>
  `;
}

export function initialSetupView() {
  return `
    <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; min-height: 60vh; padding: var(--space-lg);">
      <div class="bento-card" id="setup-form" style="width: 100%; max-width: 440px; padding: var(--space-xl); border: 1px solid var(--outline-variant);">
        <div style="text-align: center; margin-bottom: var(--space-lg);">
          <span class="material-symbols-outlined" style="font-size: 48px; color: var(--on-surface-variant);">person_add</span>
          <h2 class="font-headline-lg" style="margin-top: var(--space-sm); font-weight: 700;">First-Time Setup</h2>
          <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 4px;">
            Create the first admin account for your group. After setup, connect Google Calendar and configure the notify service in Admin settings.
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
        <button class="btn btn-filled" id="btn-setup-household" style="width: 100%; margin-top: var(--space-sm);">Create Admin Account</button>
        <p class="font-body-md" style="text-align: center; margin-top: var(--space-lg); color: var(--on-surface-variant);">
          Already have an account?
          <a href="#login" id="link-back-login" style="color: var(--primary); font-weight: 600; text-decoration: none;">Back to Log In</a>
        </p>
      </div>
    </div>
  `;
}

/** @deprecated Use initialSetupView */
export const createHouseholdView = initialSetupView;
