/**
 * Auth, session, logging, toasts, and shared UI helpers.
 */

import { AuthManager } from '../auth.js';
import { hashPassword } from '../crypto.js';
import { CalendarSync } from '../calendar.js';
import { isPastScheduledEvent } from '../gcal-sync.js';
import {
  dispatchProposalReviewPush,
  dispatchProposalVotePush,
  dispatchProposalApprovedPush,
  dispatchProposalDeclinedPush,
  dispatchProposalWithdrawnPush,
  buildProposalReviewRecipients
} from '../push-notifications.js';
import { Views, DEFAULT_AVATARS } from '../views.js';
import { escapeHtml } from '../escape.js';
import {
  LOGS_STORAGE_KEY,
  NOTIFICATIONS_BY_USER_KEY,
  LEGACY_NOTIFICATIONS_KEY,
  CREATE_NEW_HOME,
  RETURN_ADD_PARTNER_KEY,
  SELECT_HOME_KEY,
  ADD_PARTNER_DRAFT_KEY,
  LOCAL_SESSION_KEY,
  LEGACY_PROFILE_KEY,
  isPartnerPassive,
  needsHouseholdSetup,
  findPartnerByRef,
  partnerRefsMatch,
  getCurrentUserPartner,
  formatAppTime,
  formatAppDateTime
} from '../helpers.js';
import { normalizePronouns } from '../pronouns.js';
import {
  persistChangeLog,
  refreshChangeLogDom,
  migrateChangeLog,
  recordPromotionIfNeeded,
  isPromotionGroup
} from '../change-log.js';
import {
  getWorkflowState,
  getRequiredVoters,
  getResponseForParticipant,
  userNeedsProposalVote,
  WORKFLOW,
  isProposalType
} from '../proposal-workflow.js';
import { state, flowState, resetCreateFlowForUserSwitch } from './state.js';

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
  const time = formatAppTime();
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
      p.innerHTML = `<span class="console-time">[${escapeHtml(time)}]</span> <span style="color: ${color};">${escapeHtml(message)}</span>`;
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
  if (error.status) {
    detailParts.push(`httpStatus=${error.status}`);
  }
  if (error.code) {
    detailParts.push(`code=${error.code}`);
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

export function initChangeLog() {
  if (!state.changeLog?.length) return;
  if (state.changeLog.some(isPromotionGroup)) return;
  state.changeLog = migrateChangeLog(state.changeLog);
  persistChangeLog(state.changeLog);
}

export async function syncPromotionChangeLog() {
  try {
    const [versionRes, notesRes] = await Promise.all([
      fetch('version.json'),
      fetch('release-notes.json')
    ]);
    if (!versionRes.ok) return;
    const versionInfo = await versionRes.json();
    const releaseNotes = notesRes.ok ? await notesRes.json() : {};
    if (recordPromotionIfNeeded(state.changeLog, versionInfo, releaseNotes)) {
      persistChangeLog(state.changeLog);
      refreshChangeLogDom(state.changeLog);
    }
  } catch (err) {
    console.warn('Could not sync promotion change log', err);
  }
}


/** System log line attributed to the signed-in user (not a generic "Admin" label). */
export function logUserAction(message, type = 'info') {
  addLog(`${getCurrentUserName()}: ${message}`, type);
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
  const list = Array.isArray(store[userId]) ? store[userId] : [];
  list.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return list;
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
      timestamp: formatAppTime(),
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

export function notifyProposalReviewers(proposal, config, options = {}) {
  if (getWorkflowState(proposal) !== WORKFLOW.PROPOSED) return;
  const actingUserId = options.actingUserId || getCurrentUserId();
  getRequiredVoters(proposal.participantRoles || [], config).forEach(name => {
    if (partnerRefsMatch(config, name, proposal.proposer)) return;
    if (proposal.submittedBy && partnerRefsMatch(config, name, proposal.submittedBy)) return;
    const response = getResponseForParticipant(proposal, name, config);
    if (response?.status !== 'pending') return;
    const recipient = findPartnerByRef(config, name);
    if (!recipient || isPartnerPassive(recipient)) return;
    if (actingUserId && recipient.id === actingUserId) return;
    pushAppNotification({
      title: 'Proposal needs your review',
      description: `"${proposal.title}" from ${proposal.proposer} is waiting for your response.${isPastScheduledEvent(proposal) ? ' This proposal is scheduled in the past.' : ''}`,
      dedupeKey: `pending_${proposal.id}_${recipient.id}`,
      recipientId: recipient.id
    });
  });
  dispatchProposalReviewPush(proposal, config);
}

export function notifyProposerOfProposalVote(proposal, config, { voterName, vote, actingUserId = null }) {
  if (!proposal || !voterName || !vote) return;
  const proposer = findPartnerByRef(config, proposal.proposer);
  if (!proposer || isPartnerPassive(proposer)) return;
  if (partnerRefsMatch(config, voterName, proposal.proposer)) return;
  if (actingUserId && proposer.id === actingUserId) return;

  const voterFirst = voterName.split(' ')[0];
  pushAppNotification({
    title: 'New response on your proposal',
    description: `${voterFirst} ${vote === 'accept' ? 'accepted' : vote === 'reject' ? 'rejected' : 'abstained on'} "${proposal.title}".`,
    dedupeKey: `vote_${proposal.id}_${voterName}_${vote}`,
    recipientId: proposer.id
  });
  dispatchProposalVotePush(proposal, config, voterName, vote);
}

export function notifyProposalOutcome(proposal, config, { outcome, declinedBy = null }) {
  if (!proposal) return;
  const proposer = findPartnerByRef(config, proposal.proposer);
  if (!proposer || isPartnerPassive(proposer)) return;

  if (outcome === 'approved') {
    pushAppNotification({
      title: 'Proposal approved',
      description: `"${proposal.title}" was approved and added to the calendar.`,
      dedupeKey: `approved_${proposal.id}`,
      recipientId: proposer.id
    });
    dispatchProposalApprovedPush(proposal, config);
    return;
  }

  if (outcome === 'declined') {
    const byLine = declinedBy ? ` by ${declinedBy.split(' ')[0]}` : '';
    pushAppNotification({
      title: 'Proposal declined',
      description: `"${proposal.title}" was declined${byLine}.`,
      dedupeKey: `declined_${proposal.id}_${declinedBy || 'unknown'}`,
      recipientId: proposer.id
    });
    dispatchProposalDeclinedPush(proposal, config, declinedBy);
  }
}

export function notifyProposalWithdrawn(proposal, config, { kind = 'retracted', reason = '', actingUserId = null, actorName = null }) {
  if (!proposal || getWorkflowState(proposal) !== WORKFLOW.PROPOSED) return;
  const actor = actorName || getCurrentUserName();
  const actorFirst = actor.split(' ')[0];
  const reasonNote = reason ? ` Reason: ${reason}` : '';

  buildProposalReviewRecipients(proposal, config).forEach(recipient => {
    if (actingUserId && recipient.id === actingUserId) return;
    pushAppNotification({
      title: kind === 'cancelled' ? 'Proposal cancelled' : 'Proposal retracted',
      description: `${actorFirst} ${kind === 'cancelled' ? 'cancelled' : 'retracted'} "${proposal.title}".${reasonNote}`,
      dedupeKey: `${kind}_${proposal.id}_${recipient.id}`,
      recipientId: recipient.id
    });
  });

  dispatchProposalWithdrawnPush(proposal, config, { kind, reason, actingUserId, actorName: actor });
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
    <span>${escapeHtml(message)}</span>
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

export async function persistHouseholdConfig(logMessage) {
  try {
    const result = await CalendarSync.saveConfig(state.config);
    state.config = CalendarSync.config;
    if (logMessage) logUserAction(logMessage, 'info');
    return result;
  } catch (err) {
    showToast(`Failed to save changes: ${err.message}`, 'error');
    throw err;
  }
}

/** @deprecated Use persistHouseholdConfig — kept for fire-and-forget callers */
export function saveConfig(logMessage) {
  void persistHouseholdConfig(logMessage).catch(() => {});
}

/**
 * Update a partner's profile fields and propagate name changes across schedule data.
 */
export async function updatePartnerProfile(partnerId, updates) {
  const partner = state.config?.partners?.find((p) => p.id === partnerId);
  if (!partner) return false;

  const oldName = partner.name;
  if (updates.name && updates.name !== oldName) {
    CalendarSync.renamePartnerInEvents(oldName, updates.name);
  }

  if (updates.name !== undefined) partner.name = updates.name;
  if (updates.avatar !== undefined) partner.avatar = updates.avatar;
  if (updates.username !== undefined) partner.username = updates.username;
  if (updates.password !== undefined && updates.password !== '') {
    partner.passwordHash = await hashPassword(updates.password, partnerId);
    delete partner.password;
  }
  if (updates.pronouns !== undefined) partner.pronouns = normalizePronouns(updates.pronouns);
  if (updates.notificationEmail !== undefined) {
    partner.notificationEmail = String(updates.notificationEmail || '').trim();
  }

  await persistHouseholdConfig(`Updated profile for ${partner.name}`);

  if (state.currentUser?.id === partnerId) {
    establishSession(partner);
  }

  state.events = CalendarSync.events;
  import('./router.js').then(({ renderView }) => renderView());
  return true;
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

  const actorName = getCurrentUserName();
  resetCreateFlowForUserSwitch();
  establishSession(partner);
  addLog(`${actorName}: Impersonating user "${partner.name}".`, 'warning');
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
  import('../push-notifications.js').then(({ syncPushSubscriptionIfEnabled }) => {
    syncPushSubscriptionIfEnabled(partner.id);
  });
  import('../household-sync.js').then(({ startHouseholdSyncHub }) => {
    import('../calendar.js').then(({ CalendarSync }) => {
      import('./router.js').then(({ router }) => {
        startHouseholdSyncHub({
          CalendarSync,
          state,
          renderView: () => router()
        });
      });
    });
  });
}

export async function attemptLogin(username, password) {
  const trimmedUser = username.trim();
  const trimmedPassword = password.trim();
  const partnerCandidates = state.config?.partners?.filter(p => !isPartnerPassive(p) && p.username === trimmedUser);
  let authenticatedPartner = null;

  if (partnerCandidates && partnerCandidates.length > 0) {
    for (const p of partnerCandidates) {
      if (p.password === trimmedPassword) {
        p.passwordHash = await hashPassword(trimmedPassword, p.id);
        delete p.password;
        authenticatedPartner = p;
        break;
      } else if (p.passwordHash && p.passwordHash === await hashPassword(trimmedPassword, p.id)) {
        authenticatedPartner = p;
        break;
      }
    }
  }

  if (!authenticatedPartner) {
    const hint = needsHouseholdSetup(state.config)
      ? 'No household accounts exist yet — create the first admin account.'
      : 'Invalid username or password.';
    showToast(hint, 'error');
    addLog(`${trimmedUser}: Failed login attempt.`, 'warning');
    return false;
  }
  
  if (authenticatedPartner.passwordHash) {
    persistHouseholdConfig('Migrated password to hash.').catch(() => {});
  }

  establishSession(authenticatedPartner);
  addLog(`${authenticatedPartner.name}: Logged in successfully.`, 'info');
  showToast(`Welcome back, ${authenticatedPartner.name.split(' ')[0]}!`, 'success');
  window.location.hash = '#schedule';
  import('./router.js').then(({ router }) => router());
  return true;
}

export async function createFirstAdminPartner({ name, username, password }) {
  const trimmedName = name.trim();
  const trimmedUser = username.trim();
  const trimmedPassword = password.trim();

  if (!trimmedName || !trimmedUser || !trimmedPassword) {
    showToast('Name, username, and password are required.', 'warning');
    return false;
  }

  if (!state.config) {
    showToast('Household config is not loaded yet. Refresh and try again.', 'error');
    return false;
  }

  if (!needsHouseholdSetup(state.config)) {
    showToast('This household already has login accounts.', 'warning');
    return false;
  }

  const duplicate = state.config.partners?.find(p => p.username === trimmedUser);
  if (duplicate) {
    showToast('That username is already taken.', 'warning');
    return false;
  }

  const newId = `p_${crypto.randomUUID?.() || Date.now()}`;
  const passwordHash = await hashPassword(trimmedPassword, newId);

  const partner = {
    id: newId,
    name: trimmedName,
    username: trimmedUser,
    passwordHash,
    role: 'Admin',
    avatar: DEFAULT_AVATARS[0],
    pronouns: normalizePronouns(null),
    rules: {}
  };

  state.config.partners = state.config.partners || [];
  state.config.residences = state.config.residences || [];
  state.config.partners.push(partner);

  let saveResult;
  try {
    saveResult = await CalendarSync.saveConfig(state.config);
  } catch (err) {
    state.config.partners.pop();
    showToast(`Failed to save household: ${err.message}`, 'error');
    return false;
  }

  addLog(`${partner.name}: Created first admin account.`, 'info');
  establishSession(partner);
  if (saveResult?.needsAuth) {
    showToast(
      'Account created. Click Sync Google in the top bar to back up to Google Calendar.',
      'info'
    );
    const loginBtn = document.getElementById('btn-google-login');
    if (loginBtn) loginBtn.style.display = 'inline-flex';
  } else {
    showToast(`Welcome, ${partner.name.split(' ')[0]}!`, 'success');
  }
  window.location.hash = '#schedule';
  import('./router.js').then(({ router }) => router());
  return true;
}

export function logoutUser() {
  const name = getCurrentUserName();
  state.currentUser = null;
  localStorage.removeItem(LOCAL_SESSION_KEY);
  addLog(`${name}: Logged out.`, 'info');
  showLoginView();
}

/** Disconnect Google Calendar sync without ending the local partner session. */
export function logoutGoogleSync() {
  AuthManager.logout();
  logUserAction('Disconnected Google Calendar sync.', 'info');
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
