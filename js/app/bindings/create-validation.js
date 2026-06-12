import { CalendarSync } from '../../calendar.js';
import { RulesEngine } from '../../rules.js';
import { escapeHtml } from '../../escape.js';
import {

import {
  ensureBatchAssignments,
  syncBatchAssignmentsFromDom,
  readBatchAssignmentsFromDom,
  updateBatchPartnerLocks,
} from './create-batch.js';
import {
  highlightBatchRowErrors,
  formatWarningList,
  showProposalRulesBanner,
  updateMicroCalendarConflicts,
  runRulesChecks,
  evaluateCurrentBatchProposalWarnings
} from './create-validation.js';
import {
  requireCurrentUserInSleepingProposal,
  ensureCurrentUserSelectedForSleeping,
  updateSleepingArrangementTitle,
  preserveCreateFormDraft,
  loadDraftIntoForm,
  syncParticipantRolesFromParticipants,
  collectProposalFormData,
  scheduleDraftSave,
  ensureCreateDraftSync,
  submitCurrentProposal
} from './create-form.js';


