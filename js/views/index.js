import { RulesEngine } from '../rules.js';
import {
  DEFAULT_AVATARS,
  isPartnerPassive,
  renderHomeSelectOptions,
  renderAvatarPickerHtml,
  render12HourTimePicker,
  responseStatusLabel,
  defaultBatchAssignment,
  defaultBatchNight,
  normalizeBatchNight,
  getBedroomOptionsForHome,
  getCurrentUserPartner,
  hasSleepingPartnerConnections
} from '../helpers.js';
import {
  WORKFLOW,
  filterProposalsForTab,
  getWorkflowState,
  allowsAbstain,
  isPassivePerson,
  getAutoArchiveDays,
  isCalendarEvent
} from '../proposal-workflow.js';

export { DEFAULT_AVATARS };

import { scheduleView } from './schedule.js';
import { proposalsView } from './proposals.js';
import { createProposalView } from './createProposal.js';
import { logisticsView } from './logistics.js';
import { settingsView } from './settings.js';
import { adminView } from './admin.js';
import { addPartnerView } from './addPartner.js';
import { addHomeView } from './addHome.js';
import { loginView, createHouseholdView } from './login.js';
import { googleConnectGateView } from './googleConnectGate.js';
import { editPartnerView } from './editPartner.js';
import { editHomeView } from './editHome.js';
import { activatePartnerView } from './activatePartner.js';

export const Views = {
  schedule: scheduleView,
  proposals: proposalsView,
  createProposal: createProposalView,
  logistics: logisticsView,
  settings: settingsView,
  admin: adminView,
  addPartner: addPartnerView,
  addHome: addHomeView,
  login: loginView,
  createHousehold: createHouseholdView,
  googleConnectGate: googleConnectGateView,
  editPartner: editPartnerView,
  editHome: editHomeView,
  activatePartner: activatePartnerView
};
