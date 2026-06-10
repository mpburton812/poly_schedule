/**
 * Auth, session, logging, toasts, and shared UI helpers.
 */

import { AuthManager } from '../auth.js';
import { CalendarSync } from '../calendar.js';
import { Views, DEFAULT_AVATARS } from '../views.js';
import {
  LOGS_STORAGE_KEY,
  CREATE_NEW_HOME,
  RETURN_ADD_PARTNER_KEY,
  SELECT_HOME_KEY,
  ADD_PARTNER_DRAFT_KEY,
  LOCAL_SESSION_KEY,
  LEGACY_PROFILE_KEY,
  isPartnerPassive
} from '../helpers.js';
import { state, flowState } from './state.js';

export { LOCAL_SESSION_KEY };

export function loadPersistedLogs() {
  try {
    const saved = JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY) || '[]');
    return Array.isArray(saved) ? saved : [];
  } catch {
    return [];
  }
}

export function addLog(message, type = 'info') {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  state.logs.push({ time, message, type, timestamp: Date.now() });
  if (state.logs.length > 100) state.logs.shift();
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(state.logs));

  const consoleBodies = document.querySelectorAll('#console-logs-body');
  consoleBodies.forEach(consoleBody => {
    const p = document.createElement('p');
    p.className = 'console-line';
    const color = type === 'error' ? 'var(--error)' : type === 'warning' ? 'var(--tertiary)' : 'inherit';
    p.innerHTML = `<span class="console-time">[${time}]</span> <span style="color: ${color};">${message}</span>`;
    consoleBody.appendChild(p);
    consoleBody.scrollTop = consoleBody.scrollHeight;
  });
}

export function showToast(message, type = 'info') {
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

  toast.offsetHeight;
  toast.style.opacity = '1';
  toast.style.transform = 'translateY(0)';

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(-20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

export function updateNotificationsBadge() {
  const badge = document.getElementById('notifications-badge');
  if (badge) {
    const unreadCount = state.notifications.filter(n => !n.read).length;
    badge.style.display = unreadCount > 0 ? 'block' : 'none';
  }
}

export function isAdmin() {
  if (!state.currentUser || !state.config?.partners) return false;
  const partner = state.config.partners.find(p => p.id === state.currentUser.id);
  return partner?.role === 'Admin';
}

export function isLoggedIn() {
  return !!(state.currentUser && state.currentUser.sessionActive);
}

export function getCurrentUserName() {
  return state.currentUser?.name || 'User';
}

export function saveConfig() {
  CalendarSync.saveConfig(state.config);
}

export function updateUIForAuthState(loggedIn) {
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

export function showLoginView() {
  updateUIForAuthState(false);
  state.currentView = 'login';
  const container = document.getElementById('app-view-container');
  if (container) {
    container.innerHTML = Views.login(state);
    import('./bindings/admin.js').then(({ bindLoginEvents }) => bindLoginEvents());
  }
}

export function establishSession(partner) {
  state.currentUser = {
    id: partner.id,
    name: partner.name,
    username: partner.username,
    password: partner.password,
    picture: partner.avatar || DEFAULT_AVATARS[0],
    role: partner.role,
    sessionActive: true
  };
  localStorage.setItem(LOCAL_SESSION_KEY, JSON.stringify(state.currentUser));
  const avatarImg = document.getElementById('user-avatar-img');
  if (avatarImg) avatarImg.src = state.currentUser.picture;
  updateUIForAuthState(true);
  updateAdminNavVisibility();
}

export function attemptLogin(username, password) {
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
  import('./router.js').then(({ router }) => router());
  return true;
}

export function logoutUser() {
  AuthManager.logout();
  state.currentUser = null;
  localStorage.removeItem(LOCAL_SESSION_KEY);
  addLog('Auth: User logged out.', 'info');
  showLoginView();
}

export function bindHomeSelectCreateNew(selectEl) {
  if (!selectEl) return;
  selectEl.addEventListener('change', (e) => {
    if (e.target.value === CREATE_NEW_HOME) {
      saveAddPartnerDraft();
      sessionStorage.setItem(RETURN_ADD_PARTNER_KEY, '1');
      window.location.hash = '#add-home';
    }
  });
}

export function saveAddPartnerDraft() {
  const draft = {
    type: document.getElementById('new-partner-type')?.value || flowState.activePartnerType,
    name: document.getElementById('new-partner-name')?.value || '',
    username: document.getElementById('new-partner-username')?.value || '',
    password: document.getElementById('new-partner-password')?.value || '',
    role: document.getElementById('new-partner-role')?.value || 'User'
  };
  sessionStorage.setItem(ADD_PARTNER_DRAFT_KEY, JSON.stringify(draft));
}

export function restoreAddPartnerDraft() {
  const raw = sessionStorage.getItem(ADD_PARTNER_DRAFT_KEY);
  if (!raw) return;
  sessionStorage.removeItem(ADD_PARTNER_DRAFT_KEY);
  try {
    const draft = JSON.parse(raw);
    if (draft.type) flowState.activePartnerType = draft.type;
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

export function selectNewHomeAfterReturn() {
  const homeId = sessionStorage.getItem(SELECT_HOME_KEY);
  if (!homeId) return;
  sessionStorage.removeItem(SELECT_HOME_KEY);
  const select = document.getElementById('new-partner-home');
  if (select) select.value = homeId;
}

export function bindAvatarPicker(containerSelector, onSelect) {
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

export function bindSleepingPartnerCheckboxes(container = document) {
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

export function updateAdminNavVisibility() {
  const showAdmin = isAdmin();
  const sideNavAdmin = document.getElementById('side-nav-admin');
  const mobileNavAdmin = document.getElementById('mobile-nav-admin');
  if (sideNavAdmin) sideNavAdmin.style.display = showAdmin ? 'flex' : 'none';
  if (mobileNavAdmin) mobileNavAdmin.style.display = showAdmin ? 'inline-flex' : 'none';
}
