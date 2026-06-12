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
          Need an account? Ask your administrator to create one for you.
        </p>
      </div>
    </div>
  `;
}
