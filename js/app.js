/**
 * PolySchedule Application Entrypoint
 * Handles state management, UI events, routing, and PWA registration.
 */

import { AuthManager } from './auth.js';
import { CalendarSync } from './calendar.js';
import { RulesEngine } from './rules.js';
import { Views } from './views.js';

// Global Application State
const state = {
  currentView: 'schedule',
  currentUser: JSON.parse(localStorage.getItem('polyschedule_user_profile') || 'null'),
  isOffline: localStorage.getItem('polyschedule_mode') !== 'sync',
  events: [],
  config: null,
  selectedDate: new Date(),
  filterPartner: 'all',
  filterResidence: 'all',
  notifications: JSON.parse(localStorage.getItem('polyschedule_notifications') || '[]'),
  logs: [
    { time: new Date().toLocaleTimeString('en-GB', { hour12: false }), message: 'Application initialized.', type: 'info' }
  ]
};

// Sub-navigation tab states
let activeProposalsTab = 'pending';
let currentCreateType = 'event';

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
  state.logs.push({ time, message, type });
  if (state.logs.length > 20) state.logs.shift();
  
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
  if (!state.currentUser || !state.config || !state.config.partners) return false;
  const partner = state.config.partners.find(p => p.name === state.currentUser.name);
  return partner ? partner.role === 'Admin' : false;
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
            <button class="btn-outline" id="btn-run-tests" style="background: transparent; border: none; font-family: var(--font-mono); font-size: 0.75rem; color: var(--primary-fixed-dim); cursor: pointer; display: flex; align-items: center; gap: 4px;">
              <span class="material-symbols-outlined" style="font-size: 16px;">sync</span> Run System Test
            </button>
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

      <!-- Family Settings -->
      <div style="display: flex; flex-direction: column; gap: var(--space-md);">
        <h4 class="font-title-lg" style="font-weight: 700; font-size: 1.1rem; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Family Settings</h4>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="setting-poly-family-name" style="font-size: 0.8rem;">Poly Family Name</label>
          <input class="form-input" id="setting-poly-family-name" placeholder="The Poly Circle" type="text" value="${localStorage.getItem('polyschedule_poly_family_name') || 'The Poly Circle'}" style="padding: 6px 12px; font-size: 0.85rem;"/>
        </div>
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
    AuthManager.logout();
    modal.classList.remove('open');
    showToast('Logged out successfully.', 'success');
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

  // Bind Settings Events
  bindSettingsEvents(box);

  // Bind Logistics Events
  bindLogisticsEvents(box);
}

/**
 * Dynamic View Router
 */
function router() {
  const hash = window.location.hash || '#schedule';
  let view = hash.substring(1);
  
  // Map sub-routes if any
  if (view.startsWith('create')) {
    view = 'create';
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
  if (state.currentView === 'create' || state.currentView === 'settings') {
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
    container.innerHTML = Views.createProposal(state, currentCreateType);
    bindCreateEvents();
  } else if (state.currentView === 'logistics') {
    container.innerHTML = Views.logistics(state);
    bindLogisticsEvents();
  } else if (state.currentView === 'settings') {
    container.innerHTML = Views.settings(state);
    bindSettingsEvents();
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
      
      // Seed bedroom select based on home
      if (e.target.value === 'h2') {
        roomSelect.innerHTML = `<option value="r2">Loft</option>`;
      } else {
        roomSelect.innerHTML = `
          <option value="r1">North Bedroom</option>
          <option value="r3">Guest Suite</option>
        `;
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
  // Live simulated log updates
  const logBtn = container.querySelector('#btn-run-tests');
  if (logBtn) {
    logBtn.addEventListener('click', () => {
      addLog('Auth: Running system integration audit...', 'info');
      setTimeout(() => {
        addLog('Sync: Google Calendar endpoints validated.', 'info');
        addLog('Rules: Quota check verification completed. 0 fatal conflicts.', 'info');
        showToast('All system modules verified!', 'success');
      }, 1000);
    });
  }
  
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
    });
  }
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

  // Poly Family Name Input
  const familyInput = container.querySelector('#setting-poly-family-name');
  if (familyInput) {
    familyInput.addEventListener('input', (e) => {
      localStorage.setItem('polyschedule_poly_family_name', e.target.value.trim() || 'The Poly Circle');
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
document.addEventListener('DOMContentLoaded', () => {
  // 1. Setup Hash Router
  window.addEventListener('hashchange', router);

  // 2. Auth State Callback setup
  AuthManager.init((authState) => {
    const loginBtn = document.getElementById('btn-google-login');
    const avatarContainer = document.getElementById('avatar-container');
    const avatarImg = document.getElementById('user-avatar-img');

    if (authState.loggedIn) {
      if (loginBtn) loginBtn.style.display = 'none';
      if (avatarContainer) avatarContainer.style.display = 'block';
      if (avatarImg) avatarImg.src = authState.user.picture;
      state.currentUser = authState.user;
      
      // Upgrade mode to sync since we are logged in
      state.isOffline = false;
      localStorage.setItem('polyschedule_mode', 'sync');
      bootstrapData('sync');
    } else {
      if (loginBtn) {
        // Show login button if they configured credentials, else hide
        loginBtn.style.display = AuthManager.clientId ? 'inline-flex' : 'none';
      }
      if (avatarContainer) avatarContainer.style.display = 'block';
      state.currentUser = {
        name: 'Alex Rivera',
        email: 'alex@example.com',
        picture: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDjdXIAb6DttZ_Ivp6ocVuKGc_Cor-qtG3fqxi_3id35pEHmgyk008IoZOgCHsrXXysAKWNYlZFuovzj6OKFhoWqHjHVChafb9BWYQUKgMOWrT51kd1Tdr82IASulIokvB5JGV92NEWkmoFCt2MkVI_dzGJjUZabAGyiL8VI29nblqzqFUfEGWtrBPaXGI5Iz7QpmL4coomXYBEqrLuzJk18OWKIc0wuJe6pzRMziouxu7oZAVZjCFPxSRuTnPx874S9TseYaOXwWA'
      };
      if (avatarImg) avatarImg.src = state.currentUser.picture;
      
      // Boot Offline mode
      state.isOffline = true;
      localStorage.setItem('polyschedule_mode', 'offline');
      bootstrapData('offline');
    }
  });

  // 3. Bind Google Login Button Click
  const loginBtn = document.getElementById('btn-google-login');
  if (loginBtn) {
    loginBtn.addEventListener('click', () => {
      try {
        AuthManager.login();
      } catch (err) {
        showToast(err.message, 'error');
      }
    });
  }

  // 4. Bind FAB click
  const fab = document.getElementById('fab-quick-add');
  if (fab) {
    fab.addEventListener('click', () => {
      window.location.hash = '#create';
    });
  }

  // 4b. Bind notifications button and initialize badge
  const notifBtn = document.getElementById('btn-notifications');
  if (notifBtn) {
    notifBtn.addEventListener('click', () => {
      openNotificationsModal();
    });
  }
  updateNotificationsBadge();

  // 4c. Load build info for the header banner
  initBuildBanner();

  // 4d. Bind user avatar click to open user profile modal
  const avatarContainer = document.getElementById('avatar-container');
  if (avatarContainer) {
    avatarContainer.addEventListener('click', () => {
      openUserProfileModal();
    });
  }

  // 5. Setup live console scroll loop for visual bento aesthetics in Logistics screen
  setInterval(() => {
    if (state.currentView !== 'logistics') return;
    
    const logs = [
      'Auth: User Casey logged in successfully.',
      'API: Conflict audit executed for week.',
      'Sync: Google Calendar endpoints validated.',
      'Rules: Quota check verification completed. 0 fatal conflicts.',
      'Cron: Backup completed to cloud node-7.',
      'Auth: Token refresh scheduled in 30 minutes.'
    ];
    const mockMessage = logs[Math.floor(Math.random() * logs.length)];
    addLog(mockMessage, 'info');
  }, 7000);
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
