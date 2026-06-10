/**
 * Shared modal dialogs.
 */

import { AuthManager } from '../auth.js';
import { CalendarSync } from '../calendar.js';
import { DEFAULT_AVATARS } from '../views.js';
import { state } from './state.js';
import {
  addLog,
  logOperationError,
  showToast,
  updateNotificationsBadge,
  isAdmin,
  logoutUser,
  getCurrentUserName,
  saveConfig,
  LOCAL_SESSION_KEY
} from './context.js';

function openModalOverlay(box, ariaLabel) {
  const modal = document.getElementById('app-modal');
  if (!modal || !box) return null;
  if (ariaLabel) box.setAttribute('aria-label', ariaLabel);
  modal.classList.add('open');
  return modal;
}
import { bindSettingsEvents, bindLogisticsEvents } from './bindings/logistics.js';

export function handleBookingDeletion(event, reason) {
  const cancelledBy = getCurrentUserName();
  const cancelledTime = new Date().toLocaleString();

  const notification = {
    id: 'notif_' + Date.now(),
    title: 'Booking Cancelled',
    description: `"${event.title}" was cancelled by ${cancelledBy} on ${cancelledTime}.${reason ? ` Reason: ${reason}` : ''}`,
    timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
    read: false
  };

  state.notifications.push(notification);
  localStorage.setItem('polyschedule_notifications', JSON.stringify(state.notifications));

  updateNotificationsBadge();

  showToast('Booking cancelled successfully.', 'success');
  addLog(`Deleted event "${event.title}": ${reason || 'no reason'}`);
}

export function openNotificationsModal() {
  const modal = document.getElementById('app-modal');
  const box = document.getElementById('app-modal-content');
  if (!modal || !box) return;

  state.notifications.forEach(n => { n.read = true; });
  updateNotificationsBadge();
  localStorage.setItem('polyschedule_notifications', JSON.stringify(state.notifications));

  let listHtml = '';
  if (state.notifications.length === 0) {
    listHtml = '<p style="text-align: center; color: var(--on-surface-variant); padding: var(--space-md);">No new notifications.</p>';
  } else {
    listHtml = state.notifications.map(n => `
      <div style="padding: var(--space-sm) 0; border-bottom: 1px solid var(--outline-variant);">
        <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
          <strong class="font-title-lg" style="font-size: 0.95rem; color: var(--primary);">${n.title}</strong>
          <span class="font-label-sm" style="color: var(--on-surface-variant);">${n.timestamp}</span>
        </div>
        <p class="font-body-md" style="color: var(--on-surface); font-size: 0.875rem; line-height: 1.4;">${n.description}</p>
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
    localStorage.setItem('polyschedule_notifications', JSON.stringify([]));
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
  const clientId = localStorage.getItem('polyschedule_client_id') || '';
  const apiKey = localStorage.getItem('polyschedule_api_key') || '';
  const calendarId = localStorage.getItem('polyschedule_calendar_id') || 'primary';

  const logsHtml = state.logs.map(log => {
    const color = log.type === 'error' ? 'var(--error)' : log.type === 'warning' ? 'var(--tertiary)' : 'inherit';
    return `<p class="console-line"><span class="console-time">[${log.time}]</span> <span style="color: ${color};">${log.message}</span></p>`;
  }).join('');

  const adminPanelHtml = isAdmin() ? `
      <div style="display: flex; flex-direction: column; gap: var(--space-md);">
        <h4 class="font-title-lg" style="font-weight: 700; font-size: 1.1rem; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">System Administration Log</h4>
        
        <div class="console-container">
          <div class="console-header">
            <span class="font-label-sm">Live System Logs</span>
            <div style="display: flex; align-items: center; gap: 6px;">
              <span style="width: 8px; height: 8px; border-radius: var(--radius-full); background-color: #4ade80; display: inline-block; animation: pulse-animation 1s infinite;"></span>
              <span class="font-label-sm" style="color: #4ade80;">Stable</span>
            </div>
          </div>
          <div class="console-body" id="console-logs-body" style="max-height: 120px; overflow-y: auto;">
            ${logsHtml}
          </div>
          <div class="console-action-row">
            <button class="btn-outline" id="btn-export-logs" style="background: transparent; border: none; font-family: var(--font-mono); font-size: 0.75rem; color: rgba(255,255,255,0.6); cursor: pointer; display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 16px;">download</span> Export Logs
            </button>
          </div>
        </div>
      </div>
  ` : '';

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-md); border-bottom: 1px solid var(--outline-variant); padding-bottom: var(--space-sm);">
      <div style="display: flex; gap: var(--space-md); align-items: center;">
        <div class="profile-avatar" style="width: 48px; height: 48px; border: 2px solid var(--primary);">
          <img src="${state.currentUser?.picture || 'https://lh3.googleusercontent.com/a/default-user'}" alt="Profile Image" style="width: 100%; height: 100%; object-fit: cover;"/>
        </div>
        <div>
          <h3 class="font-title-lg" style="font-weight: 700; line-height: 1.2;">${getCurrentUserName()}</h3>
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

        <div class="grid grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-username" style="font-size: 0.8rem;">Username</label>
            <input class="form-input" id="setting-username" type="text" value="${state.currentUser?.username || ''}" style="padding: 6px 12px; font-size: 0.85rem;"/>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-password" style="font-size: 0.8rem;">Password</label>
            <input class="form-input" id="setting-password" type="password" value="${state.currentUser?.password || ''}" style="padding: 6px 12px; font-size: 0.85rem;"/>
          </div>
        </div>

        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" style="font-size: 0.8rem;">Select Avatar</label>
          <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap; margin-top: var(--space-xs);" id="setting-avatar-options">
            ${DEFAULT_AVATARS.map((av, idx) => {
              const isSelected = (state.currentUser?.picture === av || (!state.currentUser?.picture && idx === 0));
              return `
                <div class="avatar-option ${isSelected ? 'selected' : ''}" data-url="${av}" style="width: 44px; height: 44px; border-radius: var(--radius-full); overflow: hidden; border: 3px solid ${isSelected ? 'var(--primary)' : 'transparent'}; cursor: pointer; transition: all 0.2s;">
                  <img src="${av}" alt="Avatar ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;"/>
                </div>
              `;
            }).join('')}
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

        <div id="api-keys-section" style="display: ${isOffline ? 'none' : 'flex'}; flex-direction: column; gap: var(--space-sm); border: 1px solid var(--outline-variant); padding: var(--space-md); border-radius: var(--radius-md);">
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-client-id" style="font-size: 0.8rem;">Client ID</label>
            <input class="form-input" id="setting-client-id" placeholder="xxxxxx.apps.googleusercontent.com" type="text" value="${clientId}" style="padding: 6px 12px; font-size: 0.85rem;"/>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-api-key" style="font-size: 0.8rem;">API Key</label>
            <input class="form-input" id="setting-api-key" placeholder="AIzaSy..." type="password" value="${apiKey}" style="padding: 6px 12px; font-size: 0.85rem;"/>
          </div>
          <div class="form-group" style="margin-bottom: 0;">
            <label class="form-label" for="setting-calendar-id" style="font-size: 0.8rem;">Calendar ID</label>
            <input class="form-input" id="setting-calendar-id" placeholder="primary" type="text" value="${calendarId}" style="padding: 6px 12px; font-size: 0.85rem;"/>
          </div>
          <button class="btn btn-filled" id="btn-save-credentials" style="align-self: flex-start; padding: 6px 16px; font-size: 0.8rem; margin-top: var(--space-xs);">Save Credentials</button>
        </div>

        <div style="display: flex; gap: var(--space-sm); margin-top: var(--space-xs);">
          <button class="btn btn-outline" id="btn-force-update" style="border-color: var(--primary); color: var(--primary); padding: 6px 16px; font-size: 0.8rem; flex: 1;">
            <span class="material-symbols-outlined" style="font-size: 16px; vertical-align: middle; margin-right: 4px;">system_update_alt</span> Force Update Software
          </button>
          <button class="btn btn-outline" id="btn-reset-app" style="border-color: var(--error-container); color: var(--error); padding: 6px 16px; font-size: 0.8rem; flex: 1;">Clear Local Data</button>
        </div>
      </div>

      ${adminPanelHtml}
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

  let selectedAvatar = state.currentUser?.picture || DEFAULT_AVATARS[0];
  const avatarOpts = box.querySelectorAll('#setting-avatar-options .avatar-option');
  avatarOpts.forEach(opt => {
    opt.addEventListener('click', () => {
      avatarOpts.forEach(o => {
        o.style.borderColor = 'transparent';
        o.classList.remove('selected');
      });
      opt.style.borderColor = 'var(--primary)';
      opt.classList.add('selected');
      selectedAvatar = opt.dataset.url;
    });
  });

  const btnSaveProfile = box.querySelector('#btn-save-profile');
  if (btnSaveProfile) {
    btnSaveProfile.addEventListener('click', () => {
      const dispName = box.querySelector('#setting-display-name').value.trim();
      const userName = box.querySelector('#setting-username').value.trim();
      const pwd = box.querySelector('#setting-password').value.trim();

      if (!dispName || !userName) {
        showToast('Display Name and User Name are required.', 'warning');
        return;
      }

      const partner = state.config?.partners?.find(p => p.id === state.currentUser.id);
      const oldName = partner?.name || state.currentUser.name;

      if (oldName && oldName !== dispName) {
        CalendarSync.renamePartnerInEvents(oldName, dispName);
      }

      state.currentUser.name = dispName;
      state.currentUser.username = userName;
      state.currentUser.password = pwd;
      state.currentUser.picture = selectedAvatar;
      state.currentUser.sessionActive = true;

      localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(state.currentUser));

      const avatarImg = document.getElementById('user-avatar-img');
      if (avatarImg) avatarImg.src = selectedAvatar;

      const modalHeading = box.querySelector('h3.font-title-lg');
      if (modalHeading) modalHeading.textContent = dispName;
      const modalAvatarImg = box.querySelector('.profile-avatar img');
      if (modalAvatarImg) modalAvatarImg.src = selectedAvatar;

      if (partner) {
        partner.name = dispName;
        partner.avatar = selectedAvatar;
        partner.username = userName;
        partner.password = pwd;
        saveConfig();
      }

      showToast('Profile updated successfully.', 'success');
      modal.classList.remove('open');
      state.events = CalendarSync.events;
      import('./router.js').then(({ renderView }) => renderView());
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
  const startT = new Date(event.start).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });
  const endT = new Date(event.end).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', hour12: false });

  let locationOrRoom = '';
  if (event.type === 'sleeping') {
    locationOrRoom = `
      <div style="display: flex; gap: var(--space-base); align-items: center; color: var(--on-surface-variant); margin-bottom: var(--space-md);">
        <span class="material-symbols-outlined">bed</span>
        <span>${event.homeName}: ${event.roomName}</span>
      </div>
    `;
  } else {
    locationOrRoom = `
      <div style="display: flex; gap: var(--space-base); align-items: center; color: var(--on-surface-variant); margin-bottom: var(--space-md);">
        <span class="material-symbols-outlined">location_on</span>
        <span>${event.location || 'No location set'}</span>
      </div>
    `;
  }

  box.innerHTML = `
    <div style="display: flex; justify-content: space-between; align-items: start; margin-bottom: var(--space-md);">
      <div>
        <span class="proposal-badge ${event.type}" style="margin-bottom: var(--space-xs); display: inline-block;">${event.type.toUpperCase()}</span>
        <h3 class="font-headline-lg" style="font-size: 1.5rem; font-weight: 700; line-height: 1.2;">${event.title}</h3>
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
      <span>${startT} - ${endT}</span>
    </div>

    ${locationOrRoom}

    <h4 class="font-title-lg" style="font-size: 0.95rem; font-weight: 700; margin-bottom: var(--space-xs);">Participants</h4>
    <div style="display: flex; flex-wrap: wrap; gap: var(--space-base); margin-bottom: var(--space-lg);">
      ${event.participants.map(p => `<span class="chip active" style="font-size: 11px; padding: 2px 12px; pointer-events: none;">${p}</span>`).join('')}
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
        modal.classList.remove('open');
        handleBookingDeletion(event, reason);
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
