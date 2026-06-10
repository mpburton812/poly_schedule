/**
 * Auth, session, logging, toasts, and shared UI helpers.
 */

import { AuthManager } from '../auth.js';
import { CalendarSync } from '../calendar.js';
import { Views, DEFAULT_AVATARS } from '../views.js';
import {
  LOGS_STORAGE_KEY,
  CHANGE_LOG_STORAGE_KEY,
  NOTIFICATIONS_BY_USER_KEY,
  LEGACY_NOTIFICATIONS_KEY,
  CREATE_NEW_HOME,
  RETURN_ADD_PARTNER_KEY,
  SELECT_HOME_KEY,
  ADD_PARTNER_DRAFT_KEY,
  LOCAL_SESSION_KEY,
  LEGACY_PROFILE_KEY,
  isPartnerPassive,
  findPartnerByRef,
  partnerRefsMatch
} from '../helpers.js';
import {
  getWorkflowState,
  getRequiredVoters,
  getResponseForParticipant,
  userNeedsProposalVote,
  WORKFLOW,
  isProposalType
} from '../proposal-workflow.js';
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

export function addLog(message, type = 'info', meta = null) {
  const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
  const entry = { time, message, type, timestamp: Date.now(), ...(meta || {}) };
  state.logs.push(entry);
  if (state.logs.length > 100) state.logs.shift();
  localStorage.setItem(LOGS_STORAGE_KEY, JSON.stringify(state.logs));

  if (typeof document !== 'undefined') {
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
}

/** Collect ambient context useful when diagnosing user-facing failures. */
export function buildOperationSupportContext(context = {}) {
  return {
    user: getCurrentUserName(),
    syncMode: CalendarSync.mode || (state.isOffline ? 'offline' : 'unknown'),
    view: state.currentView,
    route: typeof window !== 'undefined' ? (window.location.hash || window.location.pathname) : '',
    ...context
  };
}

/**
 * Record a user-facing operation failure in the live system log (localStorage export).
 * Includes the error message plus support context for troubleshooting.
 */
export function logOperationError(operation, err, context = {}) {
  const error = err instanceof Error ? err : new Error(String(err ?? 'Unknown error'));
  const support = buildOperationSupportContext(context);
  const detailParts = [`error=${error.message}`];

  if (error.name && error.name !== 'Error') {
    detailParts.push(`type=${error.name}`);
  }
  Object.entries(support).forEach(([key, value]) => {
    if (value == null || value === '') return;
    detailParts.push(`${key}=${String(value)}`);
  });
  if (error.stack) {
    detailParts.push(`stack=${error.stack.split('\n').slice(1, 4).map(line => line.trim()).join(' | ')}`);
  }

  const message = `${operation} failed · ${detailParts.join(' · ')}`;
  addLog(message, 'error', {
    operation,
    errorMessage: error.message,
    errorName: error.name,
    support,
    stack: error.stack || null
  });
  console.error(`[${operation}]`, error, support);
  return message;
}

export function addChangeLog(action, detail = '') {
  const actor = getCurrentUserName();
  const time = new Date().toLocaleString();
  const entry = { time, actor, action, detail, timestamp: Date.now() };
  state.changeLog.unshift(entry);
  if (state.changeLog.length > 200) state.changeLog.pop();
  localStorage.setItem(CHANGE_LOG_STORAGE_KEY, JSON.stringify(state.changeLog));

  const changeBodies = document.querySelectorAll('#change-log-body');
  changeBodies.forEach(body => {
    const p = document.createElement('p');
    p.className = 'console-line';
    p.innerHTML = `<span class="console-time">[${time}]</span> <strong>${actor}</strong>: ${action}${detail ? ` — ${detail}` : ''}`;
    body.prepend(p);
  });
}

export function getCurrentUserId() {
  return state.currentUser?.id || null;
}

function loadNotificationsStore() {
  try {
    const parsed = JSON.parse(localStorage.getItem(NOTIFICATIONS_BY_USER_KEY) || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function saveNotificationsStore(store) {
  localStorage.setItem(NOTIFICATIONS_BY_USER_KEY, JSON.stringify(store));
}

export function loadNotificationsForUser(userId) {
  if (!userId) return [];
  const store = loadNotificationsStore();
  return Array.isArray(store[userId]) ? store[userId] : [];
}

export function saveNotificationsForUser(userId, notifications) {
  if (!userId) return;
  const store = loadNotificationsStore();
  store[userId] = notifications;
  saveNotificationsStore(store);
}

export function persistCurrentUserNotifications() {
  const userId = getCurrentUserId();
  if (userId) saveNotificationsForUser(userId, state.notifications);
}

export function refreshCurrentUserNotifications() {
  const userId = getCurrentUserId();
  state.notifications = userId ? loadNotificationsForUser(userId) : [];
  updateNotificationsBadge();
}

export function pushAppNotification({ title, description, dedupeKey, recipientId = null }) {
  const targetUserId = recipientId || getCurrentUserId();
  if (!targetUserId) return false;

  const appendNotification = (list) => {
    if (dedupeKey && list.some(n => n.dedupeKey === dedupeKey)) {
      return { list, added: false };
    }
    const notification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      title,
      description,
      timestamp: new Date().toLocaleTimeString('en-GB', { hour12: false }),
      read: false,
      dedupeKey: dedupeKey || null,
      recipientId: targetUserId
    };
    const next = [notification, ...list];
    if (next.length > 50) next.pop();
    return { list: next, added: true };
  };

  if (targetUserId === getCurrentUserId()) {
    const result = appendNotification([...state.notifications]);
    if (!result.added) return false;
    state.notifications = result.list;
    saveNotificationsForUser(targetUserId, state.notifications);
    updateNotificationsBadge();
    return true;
  }

  const remote = loadNotificationsForUser(targetUserId);
  const result = appendNotification([...remote]);
  if (!result.added) return false;
  saveNotificationsForUser(targetUserId, result.list);
  return true;
}

export function notifyProposalReviewers(proposal, config) {
  if (getWorkflowState(proposal) !== WORKFLOW.PROPOSED) return;
  getRequiredVoters(proposal.participantRoles || [], config).forEach(name => {
    if (partnerRefsMatch(config, name, proposal.proposer)) return;
    const response = getResponseForParticipant(proposal, name, config);
    if (response?.status !== 'pending') return;
    const recipient = findPartnerByRef(config, name);
    if (!recipient || isPartnerPassive(recipient)) return;
    pushAppNotification({
      title: 'Proposal needs your review',
      description: `"${proposal.title}" from ${proposal.proposer} is waiting for your response.`,
      dedupeKey: `pending_${proposal.id}_${recipient.id}`,
      recipientId: recipient.id
    });
  });
}

export function syncPendingProposalAlertsForUser() {
  if (!state.currentUser || !state.config) return;
  const userRef = state.currentUser.id || getCurrentUserName();

  (state.events || []).forEach(proposal => {
    if (!isProposalType(proposal.type)) return;
    if (!userNeedsProposalVote(proposal, userRef, state.config)) return;
    pushAppNotification({
      title: 'Proposal needs your review',
      description: `"${proposal.title}" from ${proposal.proposer} is waiting for your response.`,
      dedupeKey: `pending_${proposal.id}_${state.currentUser.id}`
    });
  });
}

export function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'bento-card';
  toast.setAttribute('role', 'status');
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
  if (typeof document === 'undefined') return;
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

export function saveConfig(auditAction = null, auditDetail = '') {
  CalendarSync.saveConfig(state.config);
  if (auditAction) addChangeLog(auditAction, auditDetail);
}

export function updateImpersonationBanner() {
  const banner = document.getElementById('impersonation-banner');
  const select = document.getElementById('impersonation-select');
  if (!banner || !select) return;

  if (!isLoggedIn() || !isAdmin()) {
    banner.style.display = 'none';
    return;
  }

  const activePartners = (state.config?.partners || []).filter(p => !isPartnerPassive(p));
  select.innerHTML = activePartners.map(p =>
    `<option value="${p.id}" ${p.id === state.currentUser.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');
  banner.style.display = 'flex';
}

export function impersonatePartner(partnerId) {
  const partner = state.config?.partners?.find(p => p.id === partnerId && !isPartnerPassive(p));
  if (!partner) return;
  if (partner.id === state.currentUser?.id) return;

  establishSession(partner);
  addLog(`Admin: Impersonating user "${partner.name}".`, 'warning');
  addChangeLog('Impersonated user', partner.name);
  showToast(`Viewing as ${partner.name.split(' ')[0]}`, 'info');
  import('./router.js').then(({ router }) => router());
}

export function bindImpersonationBanner() {
  const select = document.getElementById('impersonation-select');
  if (!select || select.dataset.bound) return;
  select.dataset.bound = '1';
  select.addEventListener('change', () => {
    impersonatePartner(select.value);
  });
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
  updateImpersonationBanner();
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
  refreshCurrentUserNotifications();
  syncPendingProposalAlertsForUser();
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
  state.currentUser = null;
  localStorage.removeItem(LOCAL_SESSION_KEY);
  addLog('Auth: Local session ended.', 'info');
  showLoginView();
}

/** Disconnect Google Calendar sync without ending the local partner session. */
export function logoutGoogleSync() {
  AuthManager.logout();
  addLog('Auth: Google sync disconnected.', 'info');
  showToast('Google Calendar sync disconnected.', 'info');
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

export { bindAvatarPicker } from '../avatar.js';
