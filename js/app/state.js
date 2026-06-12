import {
  CHANGE_LOG_KEY
} from '../storage-keys.js';
/**
 * Global application state and create-flow module variables.
 */

export const state = {
  currentView: 'schedule',
  currentUser: null,
  calendarStatus: 'unknown',
  events: [],
  config: null,
  selectedDate: new Date(),
  filterPartner: 'all',
  filterResidence: 'all',
  notifications: [],
  logs: [],
  changeLog: typeof localStorage !== 'undefined'
    ? JSON.parse(localStorage.getItem(CHANGE_LOG_KEY) || '[]')
    : []
};

const listeners = [];

export function subscribe(listener) {
  listeners.push(listener);
  return () => {
    const idx = listeners.indexOf(listener);
    if (idx > -1) listeners.splice(idx, 1);
  };
}

export function dispatch(action) {
  switch (action.type) {
    case 'SYNC_EVENTS':
      state.events = action.payload;
      break;
    case 'SYNC_CONFIG':
      state.config = action.payload;
      break;
    case 'SET_VIEW':
      state.currentView = action.payload;
      break;
    case 'SET_USER':
      state.currentUser = action.payload;
      break;
    case 'UPDATE_FILTERS':
      Object.assign(state, action.payload);
      break;
    case 'ADD_LOG':
      state.logs.push(action.payload);
      break;
    case 'ADD_NOTIFICATION':
      state.notifications.push(action.payload);
      break;
    default:
      console.warn('Unknown action:', action.type);
  }
  listeners.forEach(l => l(state, action));
}


/** Mutable cross-module UI flow state (import bindings are read-only in ES modules). */
export const flowState = {
  activeProposalsTab: 'proposed',
  currentCreateType: 'event',
  activePartnerType: 'active',
  currentDraftId: null,
  draftSaveTimer: null,
  soloEventMode: false,
  highlightProposalId: null
};

export const newProposalState = {
  participants: [],
  participantRoles: [],
  homeId: 'h1',
  roomId: 'r1',
  batchNightCount: 3,
  batchAssignments: [],
  batchStartDate: new Date().toISOString().split('T')[0],
  draftTitle: '',
  draftNotes: '',
  draftVisibility: 'standard'
};

export function resetNewProposalFormState() {
  newProposalState.participants = [];
  newProposalState.participantRoles = [];
  newProposalState.draftTitle = '';
  newProposalState.homeId = 'h1';
  newProposalState.roomId = 'r1';
  newProposalState.batchNightCount = 3;
  newProposalState.batchAssignments = [];
  newProposalState.batchStartDate = new Date().toISOString().split('T')[0];
  newProposalState.draftNotes = '';
  newProposalState.draftVisibility = 'standard';
}

export function resetCreateFlowForNavigation() {
  flowState.currentCreateType = 'event';
  flowState.currentDraftId = null;
  flowState.soloEventMode = false;
  resetNewProposalFormState();
}

/** Clear in-progress create state when switching impersonation / signed-in user. */
export function resetCreateFlowForUserSwitch() {
  resetCreateFlowForNavigation();
  if (typeof window !== 'undefined' && window.location.hash.includes('#create')) {
    window.history.replaceState({}, '', '#create');
  }
}
