/**
 * PolySchedule Application Entrypoint
 * Handles state management, UI events, routing, and PWA registration.
 */

import { AuthManager } from './auth.js';
import { CalendarSync } from './calendar.js';
import { RulesEngine } from './rules.js';
import { Views, DEFAULT_AVATARS } from './views.js';
import {
  LOGS_STORAGE_KEY,
  CREATE_NEW_HOME,
  RETURN_ADD_PARTNER_KEY,
  SELECT_HOME_KEY,
  ADD_PARTNER_DRAFT_KEY,
  parseHashParams,
  getRouteBase,
  isPartnerPassive
} from './helpers.js';

function loadPersistedLogs() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

// Global Application State
const state = {
  currentView: 'schedule',
  currentUser: null,
  isOffline: localStorage.getItem('polyschedule_mode') !== 'sync',
  events: [],
  config: null,
  selectedDate: new Date(),
  filterPartner: 'all',
  filterResidence: 'all',
  notifications: JSON.parse(localStorage.getItem('polyschedule_notifications') || '[]'),
  logs: loadPersistedLogs()
};

// Sub-navigation tab states
let activeProposalsTab = 'pending';
let currentCreateType = 'event';
let activePartnerType = 'active';

// Proposal Creation Form Temp Data
const newProposalState = {
  participants: [],
  homeId: 'h1',
  roomId: 'r1'
};

/**
 * Log System messages
 */
function addLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  state.logs.push({ time, message, type, timestamp: Date.now() });
  if (state.logs.length > 100) state.logs.shift();
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(state.logs));
  
  // Dynamic update if currently viewing logistics or if modal log console is open
  const consoleBodies = document.querySelectorAll('#console-logs-body');
  consoleBodies.forEach(consoleBody => {
    const p = document.createElement('p');
    p.className = 'console-line';
    let color = type === 'error' ? 'var(--error)' : type === 'warning' ? 'var(--tertiary)' : 'inherit';
    p.innerHTML = `<span class="console-time">[${time}]</span> <span style="color: ${color};">${message}</span>`;
    consoleBody.appendChild(p);
    consoleBody.scrollTop = consoleBody.scrollHeight;
  });
}

/**
 * Toast Notifications
 */
function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'bento-card';
  toast.style.cssText = `
    padding: var(--space-sm) var(--space-lg);
    background-color: var(--inverse-surface);
    color: var(--inverse-on-surface);
    border-radius: var(--radius-default);
    font-family: var(--font-body);
    font-size: 0.875rem;
    box-shadow: 0 4px 10px rgba(0,0,0,0.2);
    pointer-events: auto;
    opacity: 0;
    transform: translateY(20px);
    transition: opacity 0.3s, transform 0.3s;
    display: flex;
    align-items: center;
    gap: var(--space-base);
  `;
  
  let icon = 'info';
  if (type === 'success') {
    icon = 'check_circle';
    toast.style.borderLeft = '4px solid var(--secondary-container)';
  } else if (type === 'error') {
    icon = 'error';
    toast.style.borderLeft = '4px solid var(--error)';
  } else if (type === 'warning') {
    icon = 'warning';
    toast.style.borderLeft = '4px solid var(--tertiary-container)';
  }

  toast.innerHTML = `
    <span class="material-symbols-outlined" style="font-size: 18px;">${icon}</span>
    <span>${message}</span>
  `;

  container.appendChild(toast);
  
  // Force reflow
  toast.offsetHeight;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/**
 * Update the notifications bell badge count
 */
function updateNotificationsBadge() {
  const badge = document.getElementById('notifications-badge');
  if (badge) {
    const unreadCount = state.notifications.filter(n => !n.read).length;
    if (unreadCount > 0) {
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }
}

/**
 * Handle notification creation when a booking is deleted
 */
function handleBookingDeletion(event, reason) {
  const cancelledBy = state.currentUser?.name || 'Alex Rivera';
  const cancelledTime = new Date().toLocaleString();
  
  // (a) create a notification in the app
  const notification = {
    id: 'notif_' + Date.now(),
    title: 'Booking Cancelled',
    description: `"${event.title}" was cancelled by ${cancelledBy} on ${cancelledTime}.${reason ? ` Reason: ${reason}` : ''}`,
    timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
    read: false
  };
  
  state.notifications.push(notification);
  localStorage.setItem('polyschedule_notifications', JSON.stringify(state.notifications));
  
  // (b) put a marker on the bell in the upper right
  updateNotificationsBadge();
  
  showToast(`Booking cancelled successfully.`, 'success');
  addLog(`Deleted event "${event.title}": ${reason || 'no reason'}`);
}

/**
 * Open the notifications modal showing all cancellation details
 */
function openNotificationsModal() {
  const modal = document.getElementById('app-modal');
  const box = document.getElementById('app-modal-content');
  if (!modal || !box) return;
  
  // Mark all notifications as read
  state.notifications.forEach(n => n.read = true);
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
  
  modal.classList.add('open');
  
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

/**
 * Helper to check if the current user is an admin
 */
function isAdmin() {
  if (!state.currentUser || !state.config?.partners) return false;
  const partner = state.config.partners.find(p => p.id === state.currentUser.id);
  return partner?.role === 'Admin';
}

function isLoggedIn() {
  return !!(state.currentUser && state.currentUser.sessionActive);
}

function saveConfig() {
  localStorage.setItem('polyschedule_local_config', JSON.stringify(state.config));
  CalendarSync.config = state.config;
}

function updateUIForAuthState(loggedIn) {
  const bottomNav = document.querySelector('.bottom-nav');
  const sidebarNav = document.querySelector('.sidebar-nav');
  const fab = document.getElementById('fab-quick-add');
  const notifBtn = document.getElementById('btn-notifications');
  const avatarContainer = document.getElementById('avatar-container');
  const sideLogout = document.getElementById('side-nav-logout');

  if (bottomNav) bottomNav.style.display = loggedIn ? '' : 'none';
  if (sidebarNav) {
    if (loggedIn) {
      sidebarNav.style.removeProperty('display');
    } else {
      sidebarNav.style.setProperty('display', 'none', 'important');
    }
  }
  if (fab) fab.style.display = loggedIn ? 'flex' : 'none';
  if (notifBtn) notifBtn.style.display = loggedIn ? '' : 'none';
  if (avatarContainer) avatarContainer.style.display = loggedIn ? 'block' : 'none';
  if (sideLogout) sideLogout.style.display = loggedIn ? 'flex' : 'none';
}

function showLoginView() {
  updateUIForAuthState(false);
  state.currentView = 'login';
  const container = document.getElementById('app-view-container');
  if (container) {
    container.innerHTML = Views.login(state);
    bindLoginEvents();
  }
}

function establishSession(partner) {
  state.currentUser = {
    id: partner.id,
    name: partner.name,
    username: partner.username,
    password: partner.password,
    picture: partner.avatar || DEFAULT_AVATARS[0],
    role: partner.role,
    sessionActive: true
  };
  localStorage.setItem('polyschedule_user_profile', JSON.stringify(state.currentUser));
  const avatarImg = document.getElementById('user-avatar-img');
  if (avatarImg) avatarImg.src = state.currentUser.picture;
  updateUIForAuthState(true);
  updateAdminNavVisibility();
}

function attemptLogin(username, password) {
  const partner = state.config?.partners?.find(p =>
    !isPartnerPassive(p) && p.username === username.trim() && p.password === password
  );
  if (!partner) {
    showToast('Invalid username or password.', 'error');
    addLog(`Auth: Failed login attempt for "${username.trim()}".`, 'warning');
    return false;
  }
  establishSession(partner);
  addLog(`Auth: User "${partner.name}" logged in successfully.`, 'info');
  showToast(`Welcome back, ${partner.name.split(' ')[0]}!`, 'success');
  window.location.hash = '#schedule';
  router();
  return true;
}

function logoutUser() {
  AuthManager.logout();
  state.currentUser = null;
  localStorage.removeItem('polyschedule_user_profile');
  addLog('Auth: User logged out.', 'info');
  showLoginView();
}

function bindHomeSelectCreateNew(selectEl) {
  if (!selectEl) return;
  selectEl.addEventListener('change', (e) => {
    if (e.target.value === CREATE_NEW_HOME) {
      saveAddPartnerDraft();
      sessionStorage.setItem(RETURN_ADD_PARTNER_KEY, '1');
      window.location.hash = '#add-home';
    }
  });
}

function saveAddPartnerDraft() {
  const draft = {
    type: document.getElementById('new-partner-type')?.value || activePartnerType,
    name: document.getElementById('new-partner-name')?.value || '',
    username: document.getElementById('new-partner-username')?.value || '',
    password: document.getElementById('new-partner-password')?.value || '',
    role: document.getElementById('new-partner-role')?.value || 'User'
  };
  sessionStorage.setItem(ADD_PARTNER_DRAFT_KEY, JSON.stringify(draft));
}

function restoreAddPartnerDraft() {
  const raw = sessionStorage.getItem(ADD_PARTNER_DRAFT_KEY);
  if (!raw) return;
  sessionStorage.removeItem(ADD_PARTNER_DRAFT_KEY);
  try {
    const draft = JSON.parse(raw);
    if (draft.type) activePartnerType = draft.type;
    const nameEl = document.getElementById('new-partner-name');
    const userEl = document.getElementById('new-partner-username');
    const pwdEl = document.getElementById('new-partner-password');
    const roleEl = document.getElementById('new-partner-role');
    if (nameEl && draft.name) nameEl.value = draft.name;
    if (userEl && draft.username) userEl.value = draft.username;
    if (pwdEl && draft.password) pwdEl.value = draft.password;
    if (roleEl && draft.role) roleEl.value = draft.role;
  } catch { /* ignore corrupt draft */ }
}

function selectNewHomeAfterReturn() {
  const homeId = sessionStorage.getItem(SELECT_HOME_KEY);
  if (!homeId) return;
  sessionStorage.removeItem(SELECT_HOME_KEY);
  const select = document.getElementById('new-partner-home');
  if (select) select.value = homeId;
}

function bindAvatarPicker(containerSelector, onSelect) {
  let selected = DEFAULT_AVATARS[0];
  const container = document.querySelector(containerSelector);
  if (!container) return () => selected;
  const opts = container.querySelectorAll('.avatar-option');
  opts.forEach(opt => {
    if (opt.classList.contains('selected')) selected = opt.dataset.url;
    opt.addEventListener('click', () => {
      opts.forEach(o => { o.style.borderColor = 'transparent'; o.classList.remove('selected'); });
      opt.style.borderColor = 'var(--primary)';
      opt.classList.add('selected');
      selected = opt.dataset.url;
      if (onSelect) onSelect(selected);
    });
  });
  return () => selected;
}

function bindSleepingPartnerCheckboxes(container = document) {
  const checkboxes = container.querySelectorAll('.sleeping-partner-checkbox');
  const soloNightsGroup = container.querySelector('#solo-nights-group');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const details = cb.closest('div').querySelector('.sleeping-partner-details');
      if (details) details.style.display = cb.checked ? 'flex' : 'none';
      if (soloNightsGroup) {
        soloNightsGroup.style.display = Array.from(checkboxes).some(c => c.checked) ? 'block' : 'none';
      }
    });
  });
}

/**
 * Open the user profile modal with settings, system administration logs, log out, and delete account options
 */
function openUserProfileModal() {
  const modal = document.getElementById('app-modal');
  const box = document.getElementById('app-modal-content');
  if (!modal || !box) return;

  const isOffline = state.isOffline;
  const clientId = localStorage.getItem('polyschedule_client_id') || '';
  const apiKey = localStorage.getItem('polyschedule_api_key') || '';
  const calendarId = localStorage.getItem('polyschedule_calendar_id') || 'primary';

  // Render logs
  const logsHtml = state.logs.map(log => {
    let color = log.type === 'error' ? 'var(--error)' : log.type === 'warning' ? 'var(--tertiary)' : 'inherit';
    return `<p class="console-line"><span class="console-time">[${log.time}]</span> <span style="color: ${color};">${log.message}</span></p>`;
  }).join('');

  const adminPanelHtml = isAdmin() ? `
      <!-- System Administration Log -->
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
          <h3 class="font-title-lg" style="font-weight: 700; line-height: 1.2;">${state.currentUser?.name || 'Alex Rivera'}</h3>
          <span class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.8rem;">${state.currentUser?.email || 'alex@example.com'}</span>
        </div>
      </div>
      <button class="btn-icon-only" id="modal-close-btn" style="margin-top: -6px;">
        <span class="material-symbols-outlined">close</span>
      </button>
    </div>

    <div style="max-height: 55vh; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-lg); padding-right: 4px;">
      <!-- Account Actions -->
      <div style="display: flex; gap: var(--space-sm);">
        <button class="btn btn-outline" id="modal-btn-logout" style="flex: 1; padding: 8px 16px; font-size: 0.85rem;">
          <span class="material-symbols-outlined" style="font-size: 18px;">logout</span> Log Out
        </button>
        <button class="btn btn-error" id="modal-btn-delete-account" style="flex: 1; padding: 8px 16px; font-size: 0.85rem; border-color: var(--error); color: var(--error);">
          <span class="material-symbols-outlined" style="font-size: 18px;">delete_forever</span> Delete Account
        </button>
      </div>

      <!-- Profile Settings -->
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

      <!-- Settings & Integrations -->
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

  modal.classList.add('open');

  // Bind close btn
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  // Bind Logout
  document.getElementById('modal-btn-logout').addEventListener('click', () => {
    modal.classList.remove('open');
    showToast('Logged out successfully.', 'success');
    logoutUser();
  });

  // Bind Delete Account
  document.getElementById('modal-btn-delete-account').addEventListener('click', () => {
    if (confirm('Are you sure you want to permanently delete your account and clear all local data? This action cannot be undone.')) {
      AuthManager.clearCredentials();
      localStorage.clear();
      modal.classList.remove('open');
      showToast('Account deleted. Reloading...', 'warning');
      setTimeout(() => window.location.reload(), 1500);
    }
  });

  // Bind Profile Save Click
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

      // Update state.currentUser
      state.currentUser.name = dispName;
      state.currentUser.username = userName;
      state.currentUser.password = pwd;
      state.currentUser.picture = selectedAvatar;
      state.currentUser.sessionActive = true;

      localStorage.setItem('polyschedule_user_profile', JSON.stringify(state.currentUser));

      // Update avatar image in top app bar
      const avatarImg = document.getElementById('user-avatar-img');
      if (avatarImg) avatarImg.src = selectedAvatar;

      // Update modal display elements dynamically
      const modalHeading = box.querySelector('h3.font-title-lg');
      if (modalHeading) modalHeading.textContent = dispName;
      const modalAvatarImg = box.querySelector('.profile-avatar img');
      if (modalAvatarImg) modalAvatarImg.src = selectedAvatar;

      // Update name/avatar in config partners if match
      const partner = state.config?.partners?.find(p => p.id === state.currentUser.id || p.name === state.currentUser.name || p.username === state.currentUser.username);
      if (partner) {
        partner.name = dispName;
        partner.avatar = selectedAvatar;
        partner.username = userName;
        partner.password = pwd;
        
        localStorage.setItem('polyschedule_local_config', JSON.stringify(state.config));
      }

      showToast('Profile updated successfully.', 'success');
      renderView();
    });
  }

  // Bind Settings Events
  bindSettingsEvents(box);

  // Bind Logistics Events
  bindLogisticsEvents(box);
}

/**
 * Dynamic View Router
 */
function router() {
  if (!isLoggedIn()) {
    showLoginView();
    return;
  }

  const view = getRouteBase();
  const params = parseHashParams();
  
  // Auth check for admin route
  if (view === 'admin' && !isAdmin()) {
    window.location.hash = '#schedule';
    return;
  }

  // Admin-only edit routes
  if ((view === 'edit-partner' || view === 'edit-home') && !isAdmin()) {
    window.location.hash = '#logistics';
    return;
  }
  
  state.currentView = view;
  
  // Highlight navigation
  document.querySelectorAll('.bottom-nav-item, .sidebar-nav-item').forEach(item => {
    item.classList.remove('active');
    const symbol = item.querySelector('.material-symbols-outlined');
    if (symbol) symbol.style.fontVariationSettings = "'FILL' 0";
  });
  
  const activeNavs = document.querySelectorAll(`[href="#${view}"]`);
  activeNavs.forEach(nav => {
    nav.classList.add('active');
    const symbol = nav.querySelector('.material-symbols-outlined');
    if (symbol) symbol.style.fontVariationSettings = "'FILL' 1";
  });

  // Render view
  renderView();
}

/**
 * Render Active View Templates
 */
function renderView() {
  const container = document.getElementById('app-view-container');
  if (!container) return;

  // Manage visibility of transactional elements
  const fab = document.getElementById('fab-quick-add');
  if (state.currentView === 'create' || state.currentView === 'settings' || state.currentView === 'add-partner' || state.currentView === 'add-home' || state.currentView === 'edit-partner' || state.currentView === 'edit-home' || state.currentView === 'activate-partner') {
    if (fab) fab.style.display = 'none';
  } else {
    if (fab) fab.style.display = 'flex';
  }

  // Generate HTML from Views module
  if (state.currentView === 'schedule') {
    container.innerHTML = Views.schedule(state);
    bindScheduleEvents();
  } else if (state.currentView === 'proposals') {
    container.innerHTML = Views.proposals(state, activeProposalsTab);
    bindProposalsEvents();
  } else if (state.currentView === 'create') {
    // If they try to load sleeping but have no sleeping partners, force event
    const currentUserProfile = state.config?.partners?.find(p => p.name === state.currentUser?.name);
    const hasSleepingPartners = currentUserProfile && currentUserProfile.rules && currentUserProfile.rules.partnerLimits && Object.keys(currentUserProfile.rules.partnerLimits).length > 0;
    
    if (currentCreateType === 'sleeping' && !hasSleepingPartners) {
      currentCreateType = 'event';
    }
    container.innerHTML = Views.createProposal(state, currentCreateType);
    bindCreateEvents();
  } else if (state.currentView === 'logistics') {
    container.innerHTML = Views.logistics(state);
    bindLogisticsEvents();
  } else if (state.currentView === 'settings') {
    container.innerHTML = Views.settings(state);
    bindSettingsEvents();
  } else if (state.currentView === 'admin') {
    if (!isAdmin()) {
      window.location.hash = '#schedule';
      return;
    }
    container.innerHTML = Views.admin(state);
    bindAdminEvents();
  } else if (state.currentView === 'add-partner') {
    const draftRaw = sessionStorage.getItem(ADD_PARTNER_DRAFT_KEY);
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw);
        if (draft.type) activePartnerType = draft.type;
      } catch { /* ignore */ }
    }
    container.innerHTML = Views.addPartner(state, activePartnerType);
    bindAddPartnerEvents();
  } else if (state.currentView === 'add-home') {
    container.innerHTML = Views.addHome(state);
    bindAddHomeEvents();
  } else if (state.currentView === 'edit-partner') {
    const params = parseHashParams();
    container.innerHTML = Views.editPartner(state, params.p);
    bindEditPartnerEvents();
  } else if (state.currentView === 'edit-home') {
    const params = parseHashParams();
    container.innerHTML = Views.editHome(state, params.h);
    bindEditHomeEvents();
  } else if (state.currentView === 'activate-partner') {
    container.innerHTML = Views.activatePartner(state);
    bindActivatePartnerEvents();
  }
}

// --- View Specific Event Bindings ---

function bindScheduleEvents() {
  // Clicking event cards
  document.querySelectorAll('.card-event, .card-sleeping').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const event = state.events.find(e => e.id === id);
      if (event) {
        openEventDetailsModal(event);
      }
    });
  });

  // Clicking proposal mini summaries
  document.querySelectorAll('.proposal-summary-card').forEach(card => {
    card.addEventListener('click', () => {
      activeProposalsTab = 'pending';
      window.location.hash = '#proposals';
    });
  });

  // Week Selector change
  const weekInput = document.getElementById('input-week-selector');
  if (weekInput) {
    weekInput.addEventListener('change', (e) => {
      state.selectedDate = new Date(e.target.value);
      renderView();
    });
  }

  // Partner filter select change
  const partnerSelect = document.getElementById('filter-partner-select');
  if (partnerSelect) {
    partnerSelect.addEventListener('change', (e) => {
      state.filterPartner = e.target.value;
      renderView();
    });
  }

  // Residence filter select change
  const residenceSelect = document.getElementById('filter-residence-select');
  if (residenceSelect) {
    residenceSelect.addEventListener('change', (e) => {
      state.filterResidence = e.target.value;
      renderView();
    });
  }
}

function bindProposalsEvents() {
  // Tab Switchers
  const bindTab = (id, tabName) => {
    const btn = document.getElementById(id);
    if (btn) {
      btn.addEventListener('click', () => {
        activeProposalsTab = tabName;
        renderView();
      });
    }
  };
  bindTab('btn-tab-pending', 'pending');
  bindTab('btn-tab-reviewed', 'reviewed');
  bindTab('btn-tab-completed', 'completed');

  // Voting buttons (Accept / Reject)
  document.querySelectorAll('.vote-btn').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const id = btn.dataset.id;
      const vote = btn.dataset.vote;
      
      const commentInput = prompt(`Add an optional comment for your ${vote}:`);
      if (commentInput === null) return; // cancelled prompt

      const proposal = state.events.find(ev => ev.id === id);
      if (!proposal) return;

      const responses = { ...proposal.responses };
      responses[state.currentUser?.name || 'Alex Rivera'] = {
        status: vote,
        comment: commentInput || ''
      };

      try {
        await CalendarSync.updateEvent(id, { responses });
        showToast(`Vote submitted successfully!`, 'success');
        addLog(`User voted ${vote} on proposal "${proposal.title}"`);
      } catch (err) {
        showToast(`Failed to submit vote.`, 'error');
      }
    });
  });

  // Cancel/Delete buttons
  document.querySelectorAll('.cancel-proposal-btn, .retract-proposal-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.id;
      const proposal = state.events.find(ev => ev.id === id);
      if (!proposal) return;

      if (confirm(`Are you sure you want to cancel proposal "${proposal.title}"?`)) {
        const reason = prompt('Optional: Enter a reason for cancelling this booking:');
        if (reason === null) return; // User cancelled prompt
        try {
          await CalendarSync.deleteEvent(id);
          handleBookingDeletion(proposal, reason);
        } catch (err) {
          showToast(`Failed to cancel proposal.`, 'error');
        }
      }
    });
  });
}

/**
 * Formats the sleeping arrangement title dynamically: Sleeping : [NAME(S) of people] : [RESIDENCE] [BEDROOM]
 */
function updateSleepingArrangementTitle() {
  if (currentCreateType !== 'sleeping') return;
  const titleInput = document.getElementById('prop-title');
  if (!titleInput) return;

  const names = newProposalState.participants.length > 0 
    ? newProposalState.participants.map(p => p.split(' ')[0]).join(', ') 
    : 'Nobody';

  const homeSelect = document.getElementById('sleep-home-select');
  let homeName = '';
  if (homeSelect && homeSelect.selectedIndex >= 0) {
    homeName = homeSelect.options[homeSelect.selectedIndex].text;
  } else {
    const defaultHome = state.config?.residences?.find(h => h.id === newProposalState.homeId);
    homeName = defaultHome ? defaultHome.name : '';
  }

  const roomSelect = document.getElementById('sleep-room-select');
  let roomName = '';
  if (roomSelect && roomSelect.selectedIndex >= 0) {
    roomName = roomSelect.options[roomSelect.selectedIndex].text;
  } else {
    roomName = 'North Bedroom';
  }

  titleInput.value = `Sleeping : ${names} : ${homeName} ${roomName}`;
}

function bindCreateEvents() {
  // Reset create proposal state
  newProposalState.participants = [];

  // Event/Sleeping toggle
  const btnEvent = document.getElementById('btn-toggle-event');
  const btnSleep = document.getElementById('btn-toggle-sleeping');
  if (btnEvent && btnSleep) {
    btnEvent.addEventListener('click', () => {
      currentCreateType = 'event';
      renderView();
    });
    btnSleep.addEventListener('click', () => {
      currentCreateType = 'sleeping';
      renderView();
    });
  }

  // Invitees selection
  document.querySelectorAll('.circle-partner-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const name = opt.dataset.name;
      const idx = newProposalState.participants.indexOf(name);
      
      if (idx === -1) {
        newProposalState.participants.push(name);
        opt.style.opacity = '1';
        opt.querySelector('.profile-avatar').style.borderColor = 'var(--primary)';
      } else {
        newProposalState.participants.splice(idx, 1);
        opt.style.opacity = '0.6';
        opt.querySelector('.profile-avatar').style.borderColor = 'var(--outline-variant)';
      }

      // Check rules on changing participants
      runRulesChecks();
      updateSleepingArrangementTitle();
    });
  });

  // Date and duration checks
  const startDateInput = document.getElementById('prop-start-date');
  const durationInput = document.getElementById('prop-duration');
  if (startDateInput) startDateInput.addEventListener('change', runRulesChecks);
  if (durationInput) durationInput.addEventListener('input', runRulesChecks);

  // Bedroom selection bindings (for sleeping arrangement)
  const homeSelect = document.getElementById('sleep-home-select');
  const roomSelect = document.getElementById('sleep-room-select');
  if (homeSelect && roomSelect) {
    homeSelect.addEventListener('change', (e) => {
      newProposalState.homeId = e.target.value;
      const homeObj = state.config.residences.find(h => h.id === e.target.value);
      newProposalState.homeName = homeObj ? homeObj.name : '';
      
      // Seed bedroom select dynamically based on home's bedroomDetails
      if (homeObj) {
        if (homeObj.bedroomDetails && homeObj.bedroomDetails.length > 0) {
          roomSelect.innerHTML = homeObj.bedroomDetails.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        } else {
          // Generate generic options based on bedrooms count
          let genericOpts = '';
          for (let i = 0; i < homeObj.bedrooms; i++) {
            genericOpts += `<option value="r${i + 1}">Bedroom ${i + 1}</option>`;
          }
          roomSelect.innerHTML = genericOpts;
        }
      }
      newProposalState.roomId = roomSelect.value;
      newProposalState.roomName = roomSelect.options[roomSelect.selectedIndex].text;
      runRulesChecks();
      updateSleepingArrangementTitle();
    });
    
    roomSelect.addEventListener('change', (e) => {
      newProposalState.roomId = e.target.value;
      newProposalState.roomName = roomSelect.options[roomSelect.selectedIndex].text;
      runRulesChecks();
      updateSleepingArrangementTitle();
    });
  }

  // Set initial sleeping arrangement title format
  updateSleepingArrangementTitle();

  // Cancel/Back button
  const btnBack = document.getElementById('btn-create-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.hash = '#schedule';
    });
  }

  // Submit Proposal
  const btnSubmit = document.getElementById('btn-submit-proposal');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', async () => {
      const titleInput = document.getElementById('prop-title');
      const startInput = document.getElementById('prop-start-date');
      const durationVal = document.getElementById('prop-duration').value;
      
      if (!titleInput.value.trim()) {
        showToast('Please enter a title for the proposal.', 'warning');
        return;
      }

      // Format Start/End Dates
      const startD = new Date(startInput.value);
      let endD = new Date(startD);

      if (currentCreateType === 'sleeping') {
        const nights = parseInt(durationVal) || 1;
        endD.setDate(startD.getDate() + nights);
      } else {
        // Parse time: "19:00 - 22:00"
        let startHour = 19, startMin = 0;
        let endHour = 22, endMin = 0;
        const timeMatch = durationVal.match(/(\d{2}):(\d{2})\s*-\s*(\d{2}):(\d{2})/);
        if (timeMatch) {
          startHour = parseInt(timeMatch[1]);
          startMin = parseInt(timeMatch[2]);
          endHour = parseInt(timeMatch[3]);
          endMin = parseInt(timeMatch[4]);
        }
        startD.setHours(startHour, startMin, 0, 0);
        endD.setHours(endHour, endMin, 0, 0);
      }

      // Add proposer's own name as a participant automatically
      const currentUserName = state.currentUser?.name || 'Alex Rivera';
      if (!newProposalState.participants.includes(currentUserName)) {
        newProposalState.participants.push(currentUserName);
      }

      // Set up default responses map
      const responses = {};
      newProposalState.participants.forEach(p => {
        responses[p] = {
          status: p === currentUserName ? 'accept' : 'pending',
          comment: p === currentUserName ? 'Organizer' : ''
        };
      });

      const proposalData = {
        title: titleInput.value.trim(),
        type: currentCreateType,
        start: startD.toISOString(),
        end: endD.toISOString(),
        participants: newProposalState.participants,
        proposer: currentUserName,
        status: 'pending',
        responses
      };

      if (currentCreateType === 'sleeping') {
        proposalData.homeId = newProposalState.homeId;
        proposalData.roomId = newProposalState.roomId;
        proposalData.homeName = newProposalState.homeName || 'The Sanctuary';
        proposalData.roomName = newProposalState.roomName || 'North Bedroom';
      } else {
        proposalData.location = document.getElementById('event-location')?.value || 'The Loft at Main St';
      }

      try {
        await CalendarSync.createEvent(proposalData);
        showToast('Proposal submitted successfully!', 'success');
        addLog(`Created proposal: "${proposalData.title}"`);
        window.location.hash = '#proposals';
      } catch (err) {
        showToast('Failed to submit proposal.', 'error');
      }
    });
  }
}

function runRulesChecks() {
  if (currentCreateType !== 'sleeping') return;

  const startInput = document.getElementById('prop-start-date');
  const durationVal = document.getElementById('prop-duration')?.value || '1';
  const banner = document.getElementById('proposal-rules-banner');
  const titleEl = document.getElementById('banner-warning-title');
  const descEl = document.getElementById('banner-warning-desc');
  const conflictNotice = document.getElementById('micro-cal-conflict-notice');

  if (!startInput || !banner) return;

  // Construct temp proposal
  const startD = new Date(startInput.value);
  const endD = new Date(startD);
  endD.setDate(startD.getDate() + (parseInt(durationVal) || 1));

  // Current proposer name
  const currentUserName = state.currentUser?.name || 'Alex Rivera';
  const participants = [...newProposalState.participants];
  if (!participants.includes(currentUserName)) {
    participants.push(currentUserName);
  }

  const tempProposal = {
    id: 'temp_create',
    type: 'sleeping',
    start: startD.toISOString(),
    end: endD.toISOString(),
    participants,
    homeId: newProposalState.homeId,
    roomId: newProposalState.roomId,
    roomName: newProposalState.roomName
  };

  const warnings = RulesEngine.evaluateSleepingProposal(
    tempProposal,
    state.events,
    state.config,
    state.config.partners
  );

  if (warnings.length > 0) {
    // Show top warning banner
    banner.classList.remove('hidden');
    
    const capacityErr = warnings.find(w => w.type === 'CAPACITY_CONFLICT');
    const partnerErr = warnings.find(w => w.type === 'PARTNER_MAX_LIMIT');
    
    if (capacityErr) {
      titleEl.textContent = 'Room Capacity Conflict';
      descEl.textContent = capacityErr.message;
      banner.style.backgroundColor = 'var(--error-container)';
      banner.style.color = 'var(--on-error-container)';
      banner.style.borderColor = 'var(--error)';
    } else if (partnerErr) {
      titleEl.textContent = 'Extended Stay Alert';
      descEl.textContent = partnerErr.message;
      banner.style.backgroundColor = 'var(--tertiary-fixed)';
      banner.style.color = 'var(--on-tertiary-fixed)';
      banner.style.borderColor = 'var(--tertiary)';
    } else {
      titleEl.textContent = 'Preference Limit Alert';
      descEl.textContent = warnings[0].message;
    }

    // Toggle micro calendar conflict notice
    if (conflictNotice) conflictNotice.style.display = 'block';
  } else {
    banner.classList.add('hidden');
    if (conflictNotice) conflictNotice.style.display = 'none';
  }
}

function bindLogisticsEvents(container = document) {
  const exportBtn = container.querySelector('#btn-export-logs');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(state.logs, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'polyschedule_logs.json';
      a.click();
      showToast('Logs exported successfully!', 'success');
      addLog('Admin: System logs exported.', 'info');
    });
  }

  const addPartnerBtn = container.querySelector('#btn-add-partner');
  if (addPartnerBtn) {
    addPartnerBtn.addEventListener('click', () => {
      activePartnerType = 'active';
      window.location.hash = '#add-partner';
    });
  }

  const activateBtn = container.querySelector('#btn-activate-partner');
  if (activateBtn) {
    activateBtn.addEventListener('click', () => {
      window.location.hash = '#activate-partner';
    });
  }

  const addHomeBtn = container.querySelector('#btn-add-home');
  if (addHomeBtn) {
    addHomeBtn.addEventListener('click', () => {
      window.location.hash = '#add-home';
    });
  }

  container.querySelectorAll('.btn-edit-partner').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.hash = `#edit-partner?p=${btn.dataset.partnerId}`;
    });
  });

  container.querySelectorAll('.btn-edit-home').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.location.hash = `#edit-home?h=${btn.dataset.homeId}`;
    });
  });
}

function bindSettingsEvents(container = document) {
  // Connection Mode Switcher
  const radios = container.querySelectorAll('input[name="mode-select"]');
  radios.forEach(radio => {
    radio.addEventListener('change', (e) => {
      const selected = e.target.value;
      const apiSection = container.querySelector('#api-keys-section');
      
      if (selected === 'sync') {
        if (apiSection) apiSection.style.display = 'flex';
      } else {
        if (apiSection) apiSection.style.display = 'none';
        
        // Revert to local storage state
        state.isOffline = true;
        localStorage.setItem('polyschedule_mode', 'offline');
        bootstrapData('offline');
      }
    });
  });

  // Save Credentials Click
  const btnSave = container.querySelector('#btn-save-credentials');
  if (btnSave) {
    btnSave.addEventListener('click', () => {
      const cid = container.querySelector('#setting-client-id').value.trim();
      const akey = container.querySelector('#setting-api-key').value.trim();
      const calid = container.querySelector('#setting-calendar-id').value.trim();

      if (!cid || !akey) {
        showToast('OAuth Client ID and API Key are required for Sync.', 'warning');
        return;
      }

      AuthManager.setCredentials(cid, akey);
      localStorage.setItem('polyschedule_calendar_id', calid || 'primary');
      localStorage.setItem('polyschedule_mode', 'sync');
      state.isOffline = false;

      showToast('API Credentials saved. Please click "Sync Google" to log in.', 'success');
      addLog('Auth: New API credentials entered. Requesting auth.');
      
      // Update Top App Bar sync button
      const loginBtn = document.getElementById('btn-google-login');
      if (loginBtn) loginBtn.style.display = 'inline-flex';
    });
  }

  // Reset App Data
  const btnReset = container.querySelector('#btn-reset-app');
  if (btnReset) {
    btnReset.addEventListener('click', () => {
      if (confirm('Are you sure you want to delete all local storage cache, custom settings, and credentials?')) {
        localStorage.clear();
        showToast('All local storage data cleared. Reloading...', 'warning');
        setTimeout(() => window.location.reload(), 1500);
      }
    });
  }

  // Force Update Software
  const btnForceUpdate = container.querySelector('#btn-force-update');
  if (btnForceUpdate) {
    btnForceUpdate.addEventListener('click', () => {
      showToast('Clearing cache and updating software...', 'info');
      if ('caches' in window) {
        caches.keys().then(names => {
          for (let name of names) {
            caches.delete(name);
          }
        });
      }
      if (navigator.serviceWorker) {
        navigator.serviceWorker.getRegistrations().then(registrations => {
          for (let registration of registrations) {
            registration.update();
          }
        });
      }
      setTimeout(() => {
        window.location.reload(true);
      }, 1000);
    });
  }
}

function bindAdminEvents() {
  const btnSave = document.getElementById('btn-save-group-name');
  const familyInput = document.getElementById('admin-poly-family-name');
  if (btnSave && familyInput) {
    btnSave.addEventListener('click', () => {
      const name = familyInput.value.trim() || 'The Poly Circle';
      localStorage.setItem('polyschedule_poly_family_name', name);
      addLog(`Admin: Group name updated to "${name}".`, 'info');
      showToast('Group name saved.', 'success');
    });
  }
  bindLogisticsEvents(document);
}

function bindLoginEvents() {
  const btnLogin = document.getElementById('btn-login');
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');

  const submit = () => {
    if (!usernameInput?.value || !passwordInput?.value) {
      showToast('Please enter username and password.', 'warning');
      return;
    }
    attemptLogin(usernameInput.value, passwordInput.value);
  };

  if (btnLogin) btnLogin.addEventListener('click', submit);
  if (passwordInput) {
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }
}

function bindAddPartnerEvents() {
  restoreAddPartnerDraft();
  selectNewHomeAfterReturn();

  const btnBack = document.getElementById('btn-add-partner-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.hash = '#logistics';
    });
  }

  const btnActive = document.getElementById('btn-partner-type-active');
  const btnPassive = document.getElementById('btn-partner-type-passive');
  if (btnActive) {
    btnActive.addEventListener('click', () => {
      activePartnerType = 'active';
      renderView();
    });
  }
  if (btnPassive) {
    btnPassive.addEventListener('click', () => {
      activePartnerType = 'passive';
      renderView();
    });
  }

  bindHomeSelectCreateNew(document.getElementById('new-partner-home'));
  const getSelectedAvatar = bindAvatarPicker('#new-partner-avatar-options');
  bindSleepingPartnerCheckboxes();

  const btnSubmit = document.getElementById('btn-submit-partner');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => {
      const name = document.getElementById('new-partner-name').value.trim();
      const partnerType = document.getElementById('new-partner-type')?.value || activePartnerType;
      const isPassive = partnerType === 'passive';
      const defaultHome = document.getElementById('new-partner-home').value;

      if (defaultHome === CREATE_NEW_HOME) {
        saveAddPartnerDraft();
        sessionStorage.setItem(RETURN_ADD_PARTNER_KEY, '1');
        window.location.hash = '#add-home';
        return;
      }

      if (!name) {
        showToast('Display Name is required.', 'warning');
        return;
      }

      let username, password, role;
      if (!isPassive) {
        username = document.getElementById('new-partner-username').value.trim();
        password = document.getElementById('new-partner-password').value.trim();
        role = document.getElementById('new-partner-role').value;
        if (!username || !password) {
          showToast('Username and password are required for active users.', 'warning');
          return;
        }
        const exists = state.config.partners.some(p => p.username === username || p.name === name);
        if (exists) {
          showToast('A partner with this Display Name or Username already exists.', 'warning');
          return;
        }
      } else if (state.config.partners.some(p => p.name === name)) {
        showToast('A partner with this Display Name already exists.', 'warning');
        return;
      }

      const selectedAvatar = getSelectedAvatar();
      const rules = {};
      if (!isPassive) {
        const checkboxes = document.querySelectorAll('.sleeping-partner-checkbox');
        const anyChecked = Array.from(checkboxes).some(c => c.checked);
        if (anyChecked) {
          rules.maxSoloNights = parseInt(document.getElementById('new-partner-solo-nights').value) || 2;
          rules.partnerLimits = {};
          checkboxes.forEach(cb => {
            if (cb.checked) {
              const partnerName = cb.dataset.partnerName;
              const minNights = parseInt(cb.closest('div').querySelector('.partner-min-nights').value) || 0;
              const maxNights = parseInt(cb.closest('div').querySelector('.partner-max-nights').value) || 7;
              rules.partnerLimits[partnerName] = { min: minNights, max: maxNights };
              const otherPartner = state.config.partners.find(p => p.name === partnerName);
              if (otherPartner) {
                if (!otherPartner.rules) otherPartner.rules = {};
                if (!otherPartner.rules.partnerLimits) otherPartner.rules.partnerLimits = {};
                otherPartner.rules.partnerLimits[name] = { min: minNights, max: maxNights };
              }
            }
          });
        }
      }

      const newId = 'p' + Date.now();
      const newPartner = isPassive
        ? { id: newId, name, passive: true, defaultHome, avatar: selectedAvatar, rules: {} }
        : { id: newId, name, username, password, role, defaultHome, avatar: selectedAvatar, rules };

      state.config.partners.push(newPartner);
      saveConfig();
      addLog(`Logistics: ${isPassive ? 'Passive' : 'Active'} partner "${name}" added.`, 'info');
      showToast(`Partner "${name}" added successfully!`, 'success');
      window.location.hash = '#logistics';
    });
  }
}

function bindAddHomeEvents() {
  const returningToPartner = sessionStorage.getItem(RETURN_ADD_PARTNER_KEY) === '1';

  const btnBack = document.getElementById('btn-add-home-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      if (returningToPartner) {
        window.location.hash = '#add-partner';
      } else {
        window.location.hash = '#logistics';
      }
    });
  }

  const bedroomsInput = document.getElementById('new-home-bedrooms-count');
  const bedroomContainer = document.getElementById('bedroom-names-container');

  if (bedroomsInput && bedroomContainer) {
    bedroomsInput.addEventListener('input', () => {
      const count = Math.max(1, parseInt(bedroomsInput.value) || 1);
      let inputsHtml = '<h4 class="font-label-md" style="font-weight: bold;">Bedroom Names (Optional)</h4>';
      for (let i = 0; i < count; i++) {
        inputsHtml += `
          <div class="form-group" style="margin-bottom: var(--space-xs);">
            <input class="form-input bedroom-name-input" placeholder="Bedroom ${i + 1} Name (e.g. Bedroom ${i + 1})" type="text" data-index="${i}"/>
          </div>
        `;
      }
      bedroomContainer.innerHTML = inputsHtml;
    });
  }

  const btnSubmit = document.getElementById('btn-submit-home');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => {
      const name = document.getElementById('new-home-name').value.trim();
      const address = document.getElementById('new-home-address').value.trim();

      if (!name) {
        showToast('Please fill in Home Name.', 'warning');
        return;
      }

      const bedroomsCount = Math.max(1, parseInt(bedroomsInput.value) || 1);

      const bedroomInputs = document.querySelectorAll('.bedroom-name-input');
      const bedroomsList = [];
      for (let i = 0; i < bedroomsCount; i++) {
        const input = Array.from(bedroomInputs).find(inp => parseInt(inp.dataset.index) === i);
        const bedName = (input && input.value.trim()) ? input.value.trim() : `Bedroom ${i + 1}`;
        bedroomsList.push({ id: `r${i + 1}`, name: bedName });
      }

      const associatedCheckboxes = document.querySelectorAll('.home-associated-partner');
      const associatedPeople = [];
      associatedCheckboxes.forEach(cb => {
        if (cb.checked) {
          associatedPeople.push(cb.dataset.partnerName);
        }
      });

      const newHomeId = 'h' + (state.config.residences.length + 1);
      const newHome = {
        id: newHomeId,
        name,
        address: address || '',
        bedrooms: bedroomsCount,
        bedroomDetails: bedroomsList,
        associatedPeople: associatedPeople
      };

      state.config.residences.push(newHome);
      saveConfig();
      addLog(`Logistics: Home "${name}" added.`, 'info');
      showToast(`Home "${name}" added successfully!`, 'success');

      if (sessionStorage.getItem(RETURN_ADD_PARTNER_KEY) === '1') {
        sessionStorage.removeItem(RETURN_ADD_PARTNER_KEY);
        sessionStorage.setItem(SELECT_HOME_KEY, newHomeId);
        window.location.hash = '#add-partner';
      } else {
        window.location.hash = '#logistics';
      }
    });
  }
}

function bindEditPartnerEvents() {
  document.getElementById('btn-edit-partner-back')?.addEventListener('click', () => {
    window.location.hash = '#logistics';
  });

  bindHomeSelectCreateNew(document.getElementById('edit-partner-home'));
  const getSelectedAvatar = bindAvatarPicker('#edit-partner-avatar-options');
  bindSleepingPartnerCheckboxes();

  document.getElementById('btn-save-edit-partner')?.addEventListener('click', () => {
    const partnerId = document.getElementById('edit-partner-id').value;
    const partner = state.config.partners.find(p => p.id === partnerId);
    if (!partner) return;

    const name = document.getElementById('edit-partner-name').value.trim();
    const defaultHome = document.getElementById('edit-partner-home').value;
    if (defaultHome === CREATE_NEW_HOME) {
      window.location.hash = '#add-home';
      return;
    }
    if (!name) {
      showToast('Display Name is required.', 'warning');
      return;
    }

    partner.name = name;
    partner.defaultHome = defaultHome;
    partner.avatar = getSelectedAvatar();

    if (!isPartnerPassive(partner)) {
      partner.username = document.getElementById('edit-partner-username').value.trim();
      partner.password = document.getElementById('edit-partner-password').value.trim();
      partner.role = document.getElementById('edit-partner-role').value;
      partner.rules = partner.rules || {};
      partner.rules.maxSoloNights = parseInt(document.getElementById('edit-partner-solo-nights')?.value) || 2;
      partner.rules.partnerLimits = {};
      document.querySelectorAll('.sleeping-partner-checkbox').forEach(cb => {
        if (cb.checked) {
          const pName = cb.dataset.partnerName;
          partner.rules.partnerLimits[pName] = {
            min: parseInt(cb.closest('div').querySelector('.partner-min-nights').value) || 0,
            max: parseInt(cb.closest('div').querySelector('.partner-max-nights').value) || 7
          };
        }
      });
    }

    saveConfig();
    addLog(`Admin: Partner "${name}" updated.`, 'info');
    showToast(`Partner "${name}" updated.`, 'success');
    window.location.hash = '#logistics';
  });
}

function bindEditHomeEvents() {
  document.getElementById('btn-edit-home-back')?.addEventListener('click', () => {
    window.location.hash = '#logistics';
  });

  const bedroomsInput = document.getElementById('edit-home-bedrooms-count');
  const bedroomContainer = document.getElementById('bedroom-names-container');

  if (bedroomsInput && bedroomContainer) {
    bedroomsInput.addEventListener('input', () => {
      const homeId = document.getElementById('edit-home-id').value;
      const home = state.config.residences.find(h => h.id === homeId);
      const count = Math.max(1, parseInt(bedroomsInput.value) || 1);
      let inputsHtml = '<h4 class="font-label-md" style="font-weight: bold;">Bedroom Names</h4>';
      for (let i = 0; i < count; i++) {
        const existing = home?.bedroomDetails?.[i]?.name || '';
        inputsHtml += `<div class="form-group" style="margin-bottom: var(--space-xs);"><input class="form-input bedroom-name-input" type="text" data-index="${i}" value="${existing}"/></div>`;
      }
      bedroomContainer.innerHTML = inputsHtml;
    });
  }

  document.getElementById('btn-save-edit-home')?.addEventListener('click', () => {
    const homeId = document.getElementById('edit-home-id').value;
    const home = state.config.residences.find(h => h.id === homeId);
    if (!home) return;

    const name = document.getElementById('edit-home-name').value.trim();
    const address = document.getElementById('edit-home-address').value.trim();
    const bedroomsCount = Math.max(1, parseInt(bedroomsInput.value) || 1);

    if (!name || !address) {
      showToast('Home Name and Address are required.', 'warning');
      return;
    }

    const bedroomInputs = document.querySelectorAll('.bedroom-name-input');
    const bedroomsList = [];
    for (let i = 0; i < bedroomsCount; i++) {
      const input = Array.from(bedroomInputs).find(inp => parseInt(inp.dataset.index) === i);
      bedroomsList.push({ id: `r${i + 1}`, name: (input?.value.trim()) || `Bedroom ${i + 1}` });
    }

    const associatedPeople = [];
    document.querySelectorAll('.home-associated-partner').forEach(cb => {
      if (cb.checked) associatedPeople.push(cb.dataset.partnerName);
    });

    home.name = name;
    home.address = address;
    home.bedrooms = bedroomsCount;
    home.bedroomDetails = bedroomsList;
    home.associatedPeople = associatedPeople;

    saveConfig();
    addLog(`Admin: Home "${name}" updated.`, 'info');
    showToast(`Home "${name}" updated.`, 'success');
    window.location.hash = '#logistics';
  });
}

function bindActivatePartnerEvents() {
  document.getElementById('btn-activate-partner-back')?.addEventListener('click', () => {
    window.location.hash = '#logistics';
  });

  bindSleepingPartnerCheckboxes();

  document.getElementById('btn-submit-activate')?.addEventListener('click', () => {
    const partnerId = document.getElementById('activate-partner-select').value;
    const partner = state.config.partners.find(p => p.id === partnerId);
    if (!partner || !isPartnerPassive(partner)) {
      showToast('Select a passive partner to activate.', 'warning');
      return;
    }

    const username = document.getElementById('activate-username').value.trim();
    const password = document.getElementById('activate-password').value.trim();
    const role = document.getElementById('activate-role').value;

    if (!username || !password) {
      showToast('Username and password are required.', 'warning');
      return;
    }

    if (state.config.partners.some(p => p.username === username && p.id !== partnerId)) {
      showToast('Username already in use.', 'warning');
      return;
    }

    partner.username = username;
    partner.password = password;
    partner.role = role;
    delete partner.passive;

    const rules = {};
    const checkboxes = document.querySelectorAll('.sleeping-partner-checkbox');
    const anyChecked = Array.from(checkboxes).some(c => c.checked);
    if (anyChecked) {
      rules.maxSoloNights = parseInt(document.getElementById('activate-solo-nights').value) || 2;
      rules.partnerLimits = {};
      checkboxes.forEach(cb => {
        if (cb.checked) {
          const pName = cb.dataset.partnerName;
          rules.partnerLimits[pName] = {
            min: parseInt(cb.closest('div').querySelector('.partner-min-nights').value) || 0,
            max: parseInt(cb.closest('div').querySelector('.partner-max-nights').value) || 7
          };
        }
      });
    }
    partner.rules = rules;

    saveConfig();
    addLog(`Logistics: Passive partner "${partner.name}" activated as ${role}.`, 'info');
    showToast(`"${partner.name}" is now an active user!`, 'success');
    window.location.hash = '#logistics';
  });
}

function updateAdminNavVisibility() {
  const showAdmin = isAdmin();
  const sideNavAdmin = document.getElementById('side-nav-admin');
  const mobileNavAdmin = document.getElementById('mobile-nav-admin');
  if (sideNavAdmin) sideNavAdmin.style.display = showAdmin ? 'flex' : 'none';
  if (mobileNavAdmin) mobileNavAdmin.style.display = showAdmin ? 'inline-flex' : 'none';
}

// --- Shared Dialogs / Modals ---

function openEventDetailsModal(event) {
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

  modal.classList.add('open');

  // Bind close
  document.getElementById('modal-close-btn').addEventListener('click', () => {
    modal.classList.remove('open');
  });

  // Bind delete
  document.getElementById('modal-delete-btn').addEventListener('click', async () => {
    if (confirm(`Are you sure you want to delete "${event.title}"?`)) {
      const reason = prompt('Optional: Enter a reason for cancelling this booking:');
      if (reason === null) return; // User cancelled prompt
      try {
        await CalendarSync.deleteEvent(event.id);
        modal.classList.remove('open');
        handleBookingDeletion(event, reason);
      } catch (err) {
        showToast('Failed to delete booking.', 'error');
      }
    }
  });
}

// --- Application Bootstrapping ---

async function bootstrapData(mode) {
  addLog(`Sync: Initializing client state in ${mode} mode.`);
  
  let credentials = null;
  if (mode === 'sync') {
    credentials = {
      accessToken: AuthManager.accessToken,
      apiKey: AuthManager.apiKey
    };
  }

  try {
    await CalendarSync.init(mode, credentials, () => {
      // Callback triggered whenever state changes inside CalendarSync
      state.events = CalendarSync.events;
      state.config = CalendarSync.config;
      renderView();
    });
    
    state.events = CalendarSync.events;
    state.config = CalendarSync.config;
    router();
  } catch (err) {
    addLog(`Error initializing sync: ${err.message}`, 'error');
    showToast('Failed to connect to Google Calendar. Operating in Offline Mode.', 'error');
    
    // Auto-fallback
    state.isOffline = true;
    localStorage.setItem('polyschedule_mode', 'offline');
    bootstrapData('offline');
  }
}

// Global initialization
document.addEventListener('DOMContentLoaded', async () => {
  window.addEventListener('hashchange', router);

  if (state.logs.length === 0) {
    addLog('Application initialized.', 'info');
  }

  const loginBtn = document.getElementById('btn-google-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      try { AuthManager.login(); } catch (err) { showToast(err.message, 'error'); }
    });
  }

  const fab = document.getElementById('fab-quick-add');
  if (fab) fab.addEventListener('click', () => { window.location.hash = '#create'; });

  const notifBtn = document.getElementById('btn-notifications');
  if (notifBtn) notifBtn.addEventListener('click', () => openNotificationsModal());
  updateNotificationsBadge();

  initBuildBanner();

  const avatarContainer = document.getElementById('avatar-container');
  if (avatarContainer) avatarContainer.addEventListener('click', () => openUserProfileModal());

  const sideLogout = document.getElementById('side-nav-logout');
  if (sideLogout) {
    sideLogout.addEventListener('click', (e) => {
      e.preventDefault();
      logoutUser();
      showToast('Logged out successfully.', 'success');
    });
  }

  if (new URLSearchParams(window.location.search).get('reset') === '1') {
    localStorage.clear();
    window.history.replaceState({}, '', window.location.pathname);
    addLog('System: Application data reset to defaults.', 'warning');
  }

  await bootstrapData('offline');

  const savedProfile = JSON.parse(localStorage.getItem('polyschedule_user_profile') || 'null');
  if (savedProfile?.sessionActive) {
    const partner = state.config?.partners?.find(p => p.id === savedProfile.id && !isPartnerPassive(p));
    if (partner && partner.username === savedProfile.username) {
      establishSession(partner);
      router();
    } else {
      localStorage.removeItem('polyschedule_user_profile');
      showLoginView();
    }
  } else {
    showLoginView();
  }

  AuthManager.init((authState) => {
    if (authState.loggedIn && authState.user?.email) {
      const loginBtnEl = document.getElementById('btn-google-login');
      if (loginBtnEl) loginBtnEl.style.display = 'none';
    }
  });
});

async function initBuildBanner() {
  const banner = document.getElementById('build-banner');
  if (!banner) return;
  try {
    const res = await fetch('version.json');
    if (res.ok) {
      const data = await res.json();
      banner.textContent = `BUILD #${data.commit} • BRANCH ${data.branch}`;
    }
  } catch (err) {
    console.error('Failed to load version info:', err);
  }
}

// PWA Service Worker Registration
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js')
      .then(reg => {
        console.log('PolySchedule Service Worker registered with scope: ', reg.scope);
      })
      .catch(err => {
        console.error('PolySchedule Service Worker registration failed: ', err);
      });
  });
}
