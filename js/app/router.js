import { CalendarSync } from '../calendar.js';
import { Views } from '../views.js';
import {
  parseHashParams,
  getRouteBase,
  getCurrentUserPartner,
  canCreateSleepingProposals,
  ADD_PARTNER_DRAFT_KEY,
  SELECT_HOME_KEY
} from '../helpers.js';
import {
  state,
  flowState,
  newProposalState,
  resetCreateFlowForNavigation
} from './state.js';
import {
  isAdmin,
  isLoggedIn,
  showLoginView,
  syncPendingProposalAlertsForUser
} from './context.js';
import { bindScheduleEvents } from './bindings/schedule.js';
import { bindProposalsEvents } from './bindings/proposals.js';
import {
  bindCreateEvents,
  ensureBatchAssignments,
  ensureCreateDraftSync
} from './bindings/create.js';
import { bindLogisticsEvents, bindSettingsEvents } from './bindings/logistics.js';
import {
  bindAdminEvents,
  bindAddPartnerEvents,
  bindAddHomeEvents,
  bindEditPartnerEvents,
  bindEditHomeEvents,
  bindActivatePartnerEvents
} from './bindings/admin.js';

export function router() {
  if (!isLoggedIn()) {
    showLoginView();
    return;
  }

  CalendarSync.syncProposalStatuses();
  CalendarSync.processAutoArchive();
  state.events = CalendarSync.events;
  syncPendingProposalAlertsForUser();

  const view = getRouteBase();
  const params = parseHashParams();

  if (view === 'admin' && !isAdmin()) {
    window.location.hash = '#schedule';
    return;
  }

  if ((view === 'edit-partner' || view === 'edit-home') && !isAdmin()) {
    window.location.hash = '#logistics';
    return;
  }

  if (view === 'add-partner') {
    const draftRaw = sessionStorage.getItem(ADD_PARTNER_DRAFT_KEY);
    if (draftRaw) {
      try {
        const draft = JSON.parse(draftRaw);
        if (draft.type) flowState.activePartnerType = draft.type;
      } catch { /* ignore */ }
    } else if (state.currentView !== 'add-partner') {
      flowState.activePartnerType = 'active';
    }
  }

  state.currentView = view;

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

  renderView();
}

export function renderView() {
  const container = document.getElementById('app-view-container');
  if (!container) return;

  const fab = document.getElementById('fab-quick-add');
  if (state.currentView === 'create' || state.currentView === 'settings' || state.currentView === 'add-partner' || state.currentView === 'add-home' || state.currentView === 'edit-partner' || state.currentView === 'edit-home' || state.currentView === 'activate-partner') {
    if (fab) fab.style.display = 'none';
  } else {
    if (fab) fab.style.display = 'flex';
  }

  if (state.currentView === 'schedule') {
    container.innerHTML = Views.schedule(state);
    bindScheduleEvents();
  } else if (state.currentView === 'proposals') {
    container.innerHTML = Views.proposals(state, flowState.activeProposalsTab);
    bindProposalsEvents();
  } else if (state.currentView === 'create') {
    const params = parseHashParams();
    if (!params.draft) {
      resetCreateFlowForNavigation();
    }

    const canUseSleepingProposals = canCreateSleepingProposals(state.config, state.currentUser);

    if ((flowState.currentCreateType === 'sleeping' || flowState.currentCreateType === 'batch_sleeping') && !canUseSleepingProposals) {
      flowState.currentCreateType = 'event';
    }
    if (flowState.currentCreateType === 'batch_sleeping') {
      ensureBatchAssignments(newProposalState.batchNightCount);
    }
    ensureCreateDraftSync();
    container.innerHTML = Views.createProposal(state, flowState.currentCreateType, {
      ...newProposalState,
      soloEventMode: flowState.soloEventMode
    });
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
    const selectedHomeId = sessionStorage.getItem(SELECT_HOME_KEY) || '';
    if (selectedHomeId) sessionStorage.removeItem(SELECT_HOME_KEY);
    container.innerHTML = Views.addPartner(state, flowState.activePartnerType, selectedHomeId);
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
