/**
 * Global application state and create-flow module variables.
 */

export const state = {
  currentView: 'schedule',
  currentUser: null,
  isOffline: typeof localStorage !== 'undefined' && localStorage.getItem('polyschedule_mode') !== 'sync',
  events: [],
  config: null,
  selectedDate: new Date(),
  filterPartner: 'all',
  filterResidence: 'all',
  notifications: typeof localStorage !== 'undefined'
    ? JSON.parse(localStorage.getItem('polyschedule_notifications') || '[]')
    : [],
  logs: [],
  changeLog: typeof localStorage !== 'undefined'
    ? JSON.parse(localStorage.getItem('polyschedule_change_log') || '[]')
    : []
};

/** Mutable cross-module UI flow state (import bindings are read-only in ES modules). */
export const flowState = {
  activeProposalsTab: 'proposed',
  currentCreateType: 'event',
  activePartnerType: 'active',
  currentDraftId: null,
  draftSaveTimer: null,
  soloEventMode: false
};

export const newProposalState = {
  participants: [],
  participantRoles: [],
  homeId: 'h1',
  roomId: 'r1',
  batchNightCount: 3,
  batchAssignments: [],
  batchStartDate: new Date().toISOString().split('T')[0],
  draftTitle: ''
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
}

export function resetCreateFlowForNavigation() {
  flowState.currentCreateType = 'event';
  flowState.currentDraftId = null;
  flowState.soloEventMode = false;
  resetNewProposalFormState();
}
