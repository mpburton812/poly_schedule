import {
  CLIENT_ID_KEY,
  API_KEY_KEY
} from '../storage-keys.js';
/**
 * Shared modal dialogs.
 */

import { AuthManager } from '../auth.js';
import { CalendarSync } from '../calendar.js';
import { renderAvatarPickerHtml } from '../avatar.js';
import { state } from './state.js';
import { LOCAL_SESSION_KEY } from '../storage-keys.js';
import { addLog, logOperationError, showToast, updateNotificationsBadge, logoutUser, getCurrentUserName, updatePartnerProfile, persistCurrentUserNotifications, pushAppNotification } from './context.js';
import { getCurrentUserPartner, formatAppDateTime } from '../helpers.js';
import { renderPronounPickerHtml, bindPronounPicker } from '../pronouns.js';
import { escapeHtml } from '../escape.js';

function openModalOverlay(box, ariaLabel) {
  const modal = document.getElementById('app-modal');
  if (!modal || !box) return null;
  if (ariaLabel) box.setAttribute('aria-label', ariaLabel);
  modal.classList.add('open');
  return modal;
}
import { bindSettingsEvents, bindLogisticsEvents } from './bindings/logistics.js';
import { bindAvatarPicker } from '../avatar.js';

export function handleBookingDeletion(event, reason) {
  const cancelledBy = getCurrentUserName();
  const cancelledTime = formatAppDateTime();

  pushAppNotification({
    title: 'Booking Cancelled',
    description: `"${event.title}" was cancelled by ${cancelledBy} on ${cancelledTime}.${reason ? ` Reason: ${reason}` : ''}`
  });

  showToast('Booking cancelled successfully.', 'success');
  addLog(`Deleted event "${event.title}": ${reason || 'no reason'}`);
}

export function openNotificationsModal() {
  const modal = document.getElementById('app-modal');
  const box = document.getElementById('app-modal-content');
  if (!modal || !box) return;

  state.notifications.forEach(n => { n.read = true; });
  updateNotificationsBadge();
  persistCurrentUserNotifications();

  let listHtml = '';
  if (state.notifications.length === 0) {
    listHtml = '<p style="text-align: center; color: var(--on-surface-variant); padding: var(--space-md);">No new notifications.</p>';
  } else {
    listHtml = state.notifications.map(n => `
      <div style="padding: var(--space-sm) 0; border-bottom: 1px solid var(--outline-variant);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <strong class="font-title-lg" style="font-size: 0.95rem; color: var(--primary);">${escapeHtml(n.title)}</strong>
          <span class="font-label-sm" style="color: var(--on-surface-variant);">${escapeHtml(n.timestamp)}</span>
        </div>
        <p class="font-body-md" style="color: var(--on-surface); font-size: 0.875rem; line-height: 1.4;">${escapeHtml(n.description)}</p>
      </div>
    `).reverse().join('');
  }

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-md);">
      <h3 class="font-headline-lg" style="font-size: 1.5rem; font-weight: 700;">Notifications</h3>
      <button class="btn-icon-only" id="modal-close-btn">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>
    <div style="max-height: 350px; overflow-y: auto; margin-bottom: var(--space-md);">
      ${listHtml}
    </div>
    <button class="btn btn-outline" id="btn-clear-notifications" style="width: 100%;">Clear All Notifications</button>
  `;

  openModalOverlay(box, 'Notifications');

  document.getElementById('modal-close-btn').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  document.getElementById('btn-clear-notifications').addEventListener('click', () => {
    state.notifications = [];
    persistCurrentUserNotifications();
    updateNotificationsBadge();
    modal.classList.remove('open');
    showToast('Notifications cleared.', 'success');
  });
}

export function openUserProfileModal() {
  const modal = document.getElementById('app-modal');
  const box = document.getElementById('app-modal-content');
  if (!modal || !box) return;

  const isOffline = state.isOffline;
  const credentialsConfigured = !!(localStorage.getItem(CLIENT_ID_KEY) && localStorage.getItem(API_KEY_KEY));

  const profilePartner = getCurrentUserPartner(state.config, state.currentUser);

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-md); border-bottom: 1px solid var(--outline-variant); padding-bottom: var(--space-sm);">
      <div style="display: flex; gap: var(--space-md); align-items: center;">
        <div class="profile-avatar" style="width: 48px; height: 48px; border: 2px solid var(--primary);">
          <img src="${state.currentUser?.picture || 'https://lh3.googleusercontent.com/a/default-user'}" alt="Profile Image" style="width: 100%; height: 100%; object-fit: cover;"/>
        </div>
        <div>
          <h3 class="font-title-lg" style="font-weight: 700; line-height: 1.2;">${escapeHtml(getCurrentUserName())}</h3>
        </div>
      </div>
      <button class="btn-icon-only" id="modal-close-btn" style="margin-top: -6px;">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div style="max-height: 55vh; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-lg); padding-right: 4px;">
      <div style="display: flex; gap: var(--space-sm);">
        <button class="btn btn-outline" id="modal-btn-logout" style="flex: 1; padding: 8px 16px; font-size: 0.85rem;">
          <span class="material-symbols-outlined" style="font-size: 18px;">logout</span> Log Out
        </button>
        <button class="btn btn-error" id="modal-btn-delete-account" style="flex: 1; padding: 8px 16px; font-size: 0.85rem; border-color: var(--error); color: var(--error);">
          <span class="material-symbols-outlined" style="font-size: 18px;">delete_forever</span> Delete Account
        </button>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--space-md);">
        <h4 class="font-title-lg" style="font-weight: 700; font-size: 1.1rem; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Edit Profile</h4>
        
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="setting-display-name" style="font-size: 0.8rem;">Display Name</label>
          <input class="form-input" id="setting-display-name" type="text" value="${state.currentUser?.name || ''}" style="padding: 6px 12px; font-size: 0.85rem;"/>
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="setting-notification-email" style="font-size: 0.8rem;">Notification email (optional)</label>
          <input class="form-input" id="setting-notification-email" type="email" placeholder="you@example.com" value="${profilePartner?.notificationEmail || ''}" style="padding: 6px 12px; font-size: 0.85rem;"/>
          <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: 4px;">Used for email backup when push cannot reach your devices.</p>
        </div>

        <div class="grid grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-username" style="font-size: 0.8rem;">Username</label>
            <input class="form-input" id="setting-username" type="text" value="${state.currentUser?.username || ''}" style="padding: 6px 12px; font-size: 0.85rem;"/>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-password" style="font-size: 0.8rem;">Password</label>
            <input class="form-input" id="setting-password" type="password" value="" placeholder="Leave blank to keep unchanged" style="padding: 6px 12px; font-size: 0.85rem;"/>
          </div>
        </div>

        ${renderPronounPickerHtml(profilePartner)}

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 0.8rem;">Select Avatar</label>
          <div style="margin-top: var(--space-xs);">
            ${renderAvatarPickerHtml(state.currentUser?.picture, 'setting-avatar-options', { size: 44 })}
          </div>
        </div>

        <button class="btn btn-filled" id="btn-save-profile" style="align-self: flex-start; padding: 6px 16px; font-size: 0.8rem; margin-top: var(--space-xs);">Save Profile</button>
      </div>

      <div style="display: flex; flex-direction: column; gap: var(--space-md);">
        <h4 class="font-title-lg" style="font-weight: 700; font-size: 1.1rem; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Connection Settings</h4>
        
        <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
          <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-xs); background-color: ${isOffline ? 'var(--surface-container-high)' : 'transparent'}; border-radius: var(--radius-default);">
            <input type="radio" name="mode-select" value="offline" ${isOffline ? 'checked' : ''} style="accent-color: var(--primary);"/>
            <div>
              <strong style="display: block; font-size: 0.9rem;">Offline Mode</strong>
              <span class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.75rem;">Persists data locally in browser storage.</span>
            </div>
          </label>
          <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-xs); background-color: ${!isOffline ? 'var(--surface-container-high)' : 'transparent'}; border-radius: var(--radius-default);">
            <input type="radio" name="mode-select" value="sync" ${!isOffline ? 'checked' : ''} style="accent-color: var(--primary);"/>
            <div>
              <strong style="display: block; font-size: 0.9rem;">Google Calendar API Sync Mode</strong>
              <span class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.75rem;">Syncs with Google Calendar.</span>
            </div>
          </label>
        </div>

        <p class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.8rem; margin: 0;">
          ${credentialsConfigured
            ? 'Google Calendar credentials are configured by an administrator. Use <strong>Sync Google</strong> in the top bar to connect.'
            : 'Ask an administrator to configure Google Calendar credentials on the Admin page before using sync mode.'}
        </p>

        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-xs);">
          <button class="btn btn-outline" id="btn-force-update" style="border-color: var(--primary); color: var(--primary); padding: 6px 16px; font-size: 0.8rem; flex: 1;">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">system_update_alt</span> Force Update Software
          </button>
        </div>
      </div>
    </div>
  `;

  openModalOverlay(box, 'User profile');

  document.getElementById('modal-close-btn').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  document.getElementById('modal-btn-logout').addEventListener('click', () => {
    modal.classList.remove('open');
    showToast('Logged out successfully.', 'success');
    logoutUser();
  });

  document.getElementById('modal-btn-delete-account').addEventListener('click', () => {
    if (confirm('Are you sure you want to permanently delete your account and clear all local data? This action cannot be undone.')) {
      AuthManager.clearCredentials();
      localStorage.clear();
      modal.classList.remove('open');
      showToast('Account deleted. Reloading...', 'warning');
      setTimeout(() => window.location.reload(), 1500);
    }
  });

  const displayNameInput = box.querySelector('#setting-display-name');
  const getPronouns = bindPronounPicker(box, { displayNameInput });

  const getSelectedAvatar = bindAvatarPicker('#setting-avatar-options', {
    initialUrl: state.currentUser?.picture,
    size: 44,
    onError: (msg) => showToast(msg, 'warning')
  });

  const btnSaveProfile = box.querySelector('#btn-save-profile');
  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', async () => {
      const dispName = displayNameInput.value.trim();
      const userName = box.querySelector('#setting-username').value.trim();
      const pwd = box.querySelector('#setting-password').value.trim();
      const selectedAvatar = getSelectedAvatar();
      const pronouns = getPronouns();

      if (!dispName || !userName) {
        showToast('Display Name and User Name are required.', 'warning');
        return;
      }

      if (!pronouns) {
        showToast('Please complete custom pronoun fields (subject, object, possessive).', 'warning');
        return;
      }

      if (!state.currentUser?.id) return;

      updatePartnerProfile(state.currentUser.id, {
        name: dispName,
        username: userName,
        password: pwd,
        avatar: selectedAvatar,
        pronouns,
        notificationEmail: box.querySelector('#setting-notification-email')?.value.trim() || ''
      });

      const modalHeading = box.querySelector('h3.font-title-lg');
      if (modalHeading) modalHeading.textContent = dispName;
      const modalAvatarImg = box.querySelector('.profile-avatar img');
      if (modalAvatarImg) modalAvatarImg.src = selectedAvatar;

      addLog(`Profile updated for "${dispName}".`, 'info');
      showToast('Profile updated successfully.', 'success');
      modal.classList.remove('open');
    });
  }

  bindSettingsEvents(box);
  bindLogisticsEvents(box);
}

export function openEventDetailsModal(event) {
  const modal = document.getElementById('app-modal');
  const box = document.getElementById('app-modal-content');
  if (!modal || !box) return;

  const dateStr = new Date(event.start).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const timeOpts = { hour: 'numeric', minute: '2-digit', hour12: true };
  const timeRangeStr = event.type === 'sleeping'
    ? 'All night'
    : `${new Date(event.start).toLocaleTimeString(undefined, timeOpts)} - ${new Date(event.end).toLocaleTimeString(undefined, timeOpts)}`;

  let locationOrRoom = '';
  if (event.type === 'sleeping') {
    locationOrRoom = `
      <div style="display: flex; gap: var(--space-base); align-items: center; color: var(--on-surface-variant); margin-bottom: var(--space-md);">
        <span class="material-symbols-outlined">bed</span>
        <span>${escapeHtml(event.homeName)}: ${escapeHtml(event.roomName)}</span>
      </div>
    `;
  } else {
    locationOrRoom = `
      <div style="display: flex; gap: var(--space-base); align-items: center; color: var(--on-surface-variant); margin-bottom: var(--space-md);">
        <span class="material-symbols-outlined">location_on</span>
        <span>${escapeHtml(event.location || 'No location set')}</span>
      </div>
    `;
  }

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-md);">
      <div>
        <span class="proposal-badge ${event.type}" style="margin-bottom: var(--space-xs); display: inline-block;">${event.type.toUpperCase()}</span>
        <h3 class="font-headline-lg" style="font-size: 1.5rem; font-weight: 700; line-height: 1.2;">${escapeHtml(event.title)}</h3>
      </div>
      <button class="btn-icon-only" id="modal-close-btn" style="margin-top: -6px;">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div style="display: flex; gap: var(--space-base); align-items: center; color: var(--on-surface-variant); margin-bottom: var(--space-xs);">
      <span class="material-symbols-outlined">calendar_month</span>
      <span>${dateStr}</span>
    </div>
    <div style="display: flex; gap: var(--space-base); align-items: center; color: var(--on-surface-variant); margin-bottom: var(--space-sm);">
      <span class="material-symbols-outlined">schedule</span>
      <span>${timeRangeStr}</span>
    </div>

    ${locationOrRoom}

    <h4 class="font-title-lg" style="font-size: 0.95rem; font-weight: 700; margin-bottom: var(--space-xs);">Participants</h4>
    <div style="display: flex; flex-wrap: wrap; gap: var(--space-base); margin-bottom: var(--space-lg);">
      ${event.participants.map(p => `<span class="chip active" style="font-size: 11px; padding: 2px 12px; pointer-events: none;">${escapeHtml(p)}</span>`).join('')}
    </div>

    <button class="btn btn-error" id="modal-delete-btn" style="width: 100%;">Cancel / Delete Booking</button>
  `;

  openModalOverlay(box, `Booking: ${event.title}`);

  document.getElementById('modal-close-btn').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  document.getElementById('modal-delete-btn').addEventListener('click', async () => {
    if (confirm(`Are you sure you want to delete "${event.title}"?`)) {
      const reason = prompt('Optional: Enter a reason for cancelling this booking:');
      if (reason === null) return;
      try {
        await CalendarSync.deleteEvent(event.id);
        state.events = CalendarSync.events;
        modal.classList.remove('open');
        handleBookingDeletion(event, reason);
        import('./router.js').then(({ renderView }) => renderView());
      } catch (err) {
        logOperationError('Booking delete', err, {
          eventId: event.id,
          eventTitle: event.title
        });
        showToast('Failed to delete booking.', 'error');
      }
    }
  });
}
