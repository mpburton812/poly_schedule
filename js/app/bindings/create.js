import { CalendarSync } from '../../calendar.js';
import { RulesEngine } from '../../rules.js';
import { escapeHtml } from '../../escape.js';
import {
  parseHashParams,
  isPartnerPassive,
  findPartnerByRef,
  read12HourTime,
  parseLocalDateString,
  defaultBatchAssignment,
  defaultBatchNight,
  cloneBatchNight,
  normalizeBatchNight,
  getBedroomOptionsForHome,
  buildBatchNightsPayload,
  formatAppTime,
  mustIncludeCurrentUserInSleepingProposal,
  resolvePersonConflictMessage
} from '../../helpers.js';
import { pastScheduleWarning } from '../../gcal-sync.js';
import { normalizeRecurrence } from '../../recurrence.js';
import {
  WORKFLOW,
  getWorkflowState,
  normalizeParticipantRoles,
  isSoloEventProposal
} from '../../proposal-workflow.js';
import {
  state,
  flowState,
  newProposalState,
  resetNewProposalFormState
} from '../state.js';
import {
  logUserAction,
  showToast,
  getCurrentUserName,
  getCurrentUserId,
  notifyProposalReviewers,
  logOperationError
} from '../context.js';
import { renderView } from '../router.js';

function requireCurrentUserInSleepingProposal() {
  return mustIncludeCurrentUserInSleepingProposal(state.config, state.currentUser);
}

function ensureCurrentUserSelectedForSleeping() {
  if (flowState.currentCreateType !== 'sleeping' || !requireCurrentUserInSleepingProposal()) return;
  const currentUserName = getCurrentUserName();
  if (!newProposalState.participants.includes(currentUserName)) {
    newProposalState.participants.unshift(currentUserName);
    syncParticipantRolesFromParticipants();
  }
}

export function updateSleepingArrangementTitle() {
  if (flowState.currentCreateType !== 'sleeping') return;
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
  }

  const locationPart = [homeName, roomName].filter(Boolean).join(' ');
  titleInput.value = locationPart
    ? `Sleeping : ${names} : ${locationPart}`
    : `Sleeping : ${names}`;
}

export function ensureBatchAssignments(count) {
  const n = Math.min(14, Math.max(1, count || 1));
  const defaultNight = defaultBatchNight(state.config);
  while (newProposalState.batchAssignments.length < n) {
    newProposalState.batchAssignments.push(cloneBatchNight(defaultNight));
  }
  newProposalState.batchAssignments = newProposalState.batchAssignments.slice(0, n);
  newProposalState.batchAssignments = newProposalState.batchAssignments.map(night =>
    normalizeBatchNight(night, state.config)
  );
  newProposalState.batchNightCount = n;
}

export function syncBatchAssignmentsFromDom() {
  if (flowState.currentCreateType !== 'batch_sleeping') return;
  document.querySelectorAll('.batch-night-row').forEach(row => {
    const idx = parseInt(row.dataset.nightIndex, 10);
    const assignments = [];
    row.querySelectorAll('.batch-assignment-block').forEach(block => {
      const homeSelect = block.querySelector('.batch-home-select');
      const roomSelect = block.querySelector('.batch-room-select');
      if (!homeSelect || !roomSelect) return;
      const homeObj = state.config.residences.find(h => h.id === homeSelect.value);
      assignments.push({
        homeId: homeSelect.value,
        roomId: roomSelect.value,
        homeName: homeObj?.name || '',
        roomName: roomSelect.options[roomSelect.selectedIndex]?.text || '',
        participants: Array.from(block.querySelectorAll('.batch-partner-cb:checked')).map(cb => cb.dataset.partner)
      });
    });
    newProposalState.batchAssignments[idx] = { assignments };
  });
}

export function highlightBatchRowErrors(warnings) {
  document.querySelectorAll('.batch-night-row').forEach(row => {
    row.classList.remove('batch-night-row-error');
    row.removeAttribute('title');
  });
  document.querySelectorAll('.batch-assignment-block').forEach(block => {
    block.classList.remove('batch-assignment-error');
    block.removeAttribute('title');
  });

  warnings.forEach(w => {
    if (w.nightIndex === undefined) return;
    const row = document.querySelector(`.batch-night-row[data-night-index="${w.nightIndex}"]`);
    if (!row) return;
    row.classList.add('batch-night-row-error');
    row.title = w.message;
    if (w.assignIndex !== undefined) {
      const block = row.querySelector(`.batch-assignment-block[data-assign-index="${w.assignIndex}"]`);
      if (block) {
        block.classList.add('batch-assignment-error');
        block.title = w.message;
      }
    }
  });
}

export function readBatchAssignmentsFromDom() {
  syncBatchAssignmentsFromDom();
  return newProposalState.batchAssignments;
}

function personConflictContext() {
  return {
    viewerRef: getCurrentUserId() || getCurrentUserName(),
    config: state.config,
    events: state.events
  };
}

export function formatWarningList(warnings, context = {}) {
  if (!warnings.length) return '';
  const lines = warnings.map((w) => {
    if (w.type === 'PERSON_CONFLICT') {
      return resolvePersonConflictMessage(w, context);
    }
    return w.message;
  });
  if (lines.length === 1) return escapeHtml(lines[0]);
  return `<ul class="banner-alert-list">${lines.map((line) => `<li>${escapeHtml(line)}</li>`).join('')}</ul>`;
}

export function showProposalRulesBanner(warnings) {
  const banner = document.getElementById('proposal-rules-banner');
  const titleEl = document.getElementById('banner-warning-title');
  const descEl = document.getElementById('banner-warning-desc');
  const conflictNotice = document.getElementById('micro-cal-conflict-notice');
  if (!banner) return;

  if (warnings.length > 0) {
    banner.classList.remove('hidden');
    const personConflictWarnings = warnings.filter(w => w.type === 'PERSON_CONFLICT');
    const pastScheduleWarnings = warnings.filter(w => w.type === 'PAST_SCHEDULE');
    const capacityWarnings = warnings.filter(w => w.type === 'CAPACITY_CONFLICT');
    const partnerMaxWarnings = warnings.filter(w => w.type === 'PARTNER_MAX_LIMIT');
    const preferenceWarnings = warnings.filter(w =>
      w.type !== 'CAPACITY_CONFLICT'
      && w.type !== 'PARTNER_MAX_LIMIT'
      && w.type !== 'PERSON_CONFLICT'
      && w.type !== 'PAST_SCHEDULE'
    );
    const pastScheduleHtml = pastScheduleWarnings.length
      ? `<ul class="banner-alert-list">${pastScheduleWarnings.map(w => `<li>${w.message}</li>`).join('')}</ul>`
      : '';
    const pastOnly = pastScheduleWarnings.length > 0 && personConflictWarnings.length === 0;
    const hasSleepingRules = capacityWarnings.length > 0 || partnerMaxWarnings.length > 0 || preferenceWarnings.length > 0;
    const useAdvisoryBanner = personConflictWarnings.length > 0 || (pastOnly && !hasSleepingRules);

    if (useAdvisoryBanner) {
      const titles = [];
      if (personConflictWarnings.length) {
        titles.push(personConflictWarnings.length > 1 ? 'Person Schedule Conflicts' : 'Person Schedule Conflict');
      }
      if (pastScheduleWarnings.length) {
        titles.push('Past Schedule');
      }
      titleEl.textContent = titles.join(' · ');
      const parts = [];
      if (personConflictWarnings.length) {
        parts.push(formatWarningList(personConflictWarnings, personConflictContext()));
      }
      if (pastScheduleWarnings.length) {
        parts.push(`<ul class="banner-alert-list">${pastScheduleWarnings.map(w => `<li>${w.message}</li>`).join('')}</ul>`);
      }
      parts.push('<p class="font-label-sm" style="margin-top: var(--space-xs); opacity: 0.9;">You can still submit. Reviewers will see this during approval.</p>');
      descEl.innerHTML = parts.join('');
      banner.style.backgroundColor = '#fff8e1';
      banner.style.color = '#5d4037';
      banner.style.borderColor = '#f9a825';
    } else if (capacityWarnings.length > 0) {
      titleEl.textContent = capacityWarnings.length > 1 ? 'Room Capacity Conflicts' : 'Room Capacity Conflict';
      descEl.innerHTML = pastScheduleHtml + formatWarningList(capacityWarnings);
      banner.style.backgroundColor = 'var(--error-container)';
      banner.style.color = 'var(--on-error-container)';
      banner.style.borderColor = 'var(--error)';
    } else if (partnerMaxWarnings.length > 0) {
      titleEl.textContent = partnerMaxWarnings.length > 1 ? 'Extended Stay Alerts' : 'Extended Stay Alert';
      descEl.innerHTML = pastScheduleHtml + formatWarningList(partnerMaxWarnings);
      banner.style.backgroundColor = 'var(--tertiary-fixed)';
      banner.style.color = 'var(--on-tertiary-fixed)';
      banner.style.borderColor = 'var(--tertiary)';
    } else {
      titleEl.textContent = preferenceWarnings.length > 1 ? 'Preference Limit Alerts' : 'Preference Limit Alert';
      descEl.innerHTML = pastScheduleHtml + `<ul class="banner-alert-list">${preferenceWarnings.map(w => `<li>${w.message}</li>`).join('')}</ul>`;
      banner.style.backgroundColor = 'var(--tertiary-fixed)';
      banner.style.color = 'var(--on-tertiary-fixed)';
      banner.style.borderColor = 'var(--tertiary)';
    }

    if (conflictNotice) {
      if (capacityWarnings.length > 0) {
        conflictNotice.style.display = 'block';
        conflictNotice.innerHTML = formatWarningList(capacityWarnings);
      } else {
        conflictNotice.style.display = 'none';
        conflictNotice.innerHTML = '';
      }
    }
  } else {
    banner.classList.add('hidden');
    titleEl.textContent = '';
    descEl.innerHTML = '';
    if (conflictNotice) {
      conflictNotice.style.display = 'none';
      conflictNotice.innerHTML = '';
    }
  }
}

export function updateBatchPartnerLocks() {
  document.querySelectorAll('.batch-night-row').forEach(row => {
    const assignedInPriorBlocks = new Set();
    row.querySelectorAll('.batch-assignment-block').forEach(block => {
      block.querySelectorAll('.batch-partner-cb').forEach(cb => {
        const label = cb.closest('.batch-partner-label');
        const partner = cb.dataset.partner;
        if (assignedInPriorBlocks.has(partner)) {
          cb.disabled = true;
          cb.checked = false;
          label?.classList.add('batch-partner-disabled');
        } else {
          cb.disabled = false;
          label?.classList.remove('batch-partner-disabled');
        }
      });
      block.querySelectorAll('.batch-partner-cb:checked').forEach(cb => {
        assignedInPriorBlocks.add(cb.dataset.partner);
      });
    });
  });
}

export function updateMicroCalendarConflicts(warnings) {
  const grid = document.getElementById('micro-cal-grid');
  if (!grid) return;
  grid.querySelectorAll('.micro-calendar-cell').forEach(cell => {
    cell.classList.remove('micro-calendar-cell-conflict');
  });

  const startInput = document.getElementById('prop-start-date');
  if (!startInput) return;

  const start = parseLocalDateString(startInput.value, 12, 0, 0, 0);
  warnings.filter(w => w.type === 'CAPACITY_CONFLICT' && w.nightIndex !== undefined).forEach(w => {
    const d = new Date(start);
    d.setDate(start.getDate() + w.nightIndex);
    const dateStr = d.toISOString().split('T')[0];
    const cell = grid.querySelector(`.micro-calendar-cell[data-date="${dateStr}"]`);
    cell?.classList.add('micro-calendar-cell-conflict');
  });
}

export function preserveCreateFormDraft() {
  const titleEl = document.getElementById('prop-title');
  if (titleEl) newProposalState.draftTitle = titleEl.value;
  const notesEl = document.getElementById('prop-notes');
  if (notesEl) newProposalState.draftNotes = notesEl.value;
  const visibilityEl = document.getElementById('prop-visibility');
  if (visibilityEl) newProposalState.draftVisibility = visibilityEl.value || 'standard';
  syncRecurrenceStateFromDom();
}

export function loadDraftIntoForm(draftId) {
  const draft = state.events.find(e => e.id === draftId);
  if (!draft || getWorkflowState(draft) !== WORKFLOW.DRAFT) return false;

  flowState.currentDraftId = draftId;
  flowState.currentCreateType = draft.type || 'event';
  newProposalState.participants = [...(draft.participants || [])];
  newProposalState.participantRoles = (draft.participantRoles || []).map(p => ({ ...p }));
  if (!newProposalState.participantRoles.length && newProposalState.participants.length) {
    newProposalState.participantRoles = normalizeParticipantRoles(newProposalState.participants, state.config, flowState.currentCreateType);
  }
  newProposalState.draftTitle = draft.title || '';
  newProposalState.draftNotes = draft.notes || '';
  newProposalState.draftVisibility = draft.visibility || 'standard';
  flowState.soloEventMode = draft.type === 'event' && isSoloEventProposal(draft, state.config);
  newProposalState.homeId = draft.homeId || 'h1';
  newProposalState.roomId = draft.roomId || 'r1';
  newProposalState.homeName = draft.homeName;
  newProposalState.roomName = draft.roomName;
  newProposalState.batchNightCount = draft.batchNights?.length || draft.batchNightCount || 3;
  newProposalState.batchAssignments = draft.batchNights
    ? draft.batchNights.map(n => ({ assignments: (n.assignments || []).map(a => ({ ...a, participants: [...(a.participants || [])] })) }))
    : [];
  newProposalState.batchStartDate = draft.start
    ? new Date(draft.start).toISOString().split('T')[0]
    : new Date().toISOString().split('T')[0];
  if (draft.recurrence?.frequency) {
    newProposalState.recurrenceEnabled = true;
    newProposalState.recurrenceFrequency = draft.recurrence.frequency;
    newProposalState.recurrenceCount = draft.recurrence.count || 12;
  } else {
    newProposalState.recurrenceEnabled = false;
    newProposalState.recurrenceFrequency = 'weekly';
    newProposalState.recurrenceCount = 12;
  }
  return true;
}

export function syncParticipantRolesFromParticipants() {
  const existing = Object.fromEntries((newProposalState.participantRoles || []).map(p => [p.name, p.role]));
  newProposalState.participantRoles = newProposalState.participants.map(name => {
    const partner = findPartnerByRef(state.config, name);
    if (partner && isPartnerPassive(partner)) {
      return { name, role: 'optional' };
    }
    return { name, role: existing[name] === 'optional' ? 'optional' : 'required' };
  });
}

function readProposalVisibility() {
  return document.getElementById('prop-visibility')?.value || newProposalState.draftVisibility || 'standard';
}

function syncRecurrenceStateFromDom() {
  newProposalState.recurrenceFrequency = document.getElementById('prop-recurrence-frequency')?.value
    || newProposalState.recurrenceFrequency
    || 'weekly';
  const countVal = parseInt(document.getElementById('prop-recurrence-count')?.value, 10);
  newProposalState.recurrenceCount = Number.isFinite(countVal) ? countVal : newProposalState.recurrenceCount;
}

function readRecurrenceFromForm() {
  if (flowState.soloEventMode) return null;
  if (flowState.currentCreateType === 'batch_sleeping') return null;
  if (!newProposalState.recurrenceEnabled) return null;
  syncRecurrenceStateFromDom();
  return normalizeRecurrence({
    frequency: newProposalState.recurrenceFrequency,
    count: newProposalState.recurrenceCount
  });
}

function setCreateProposalMode(type, recurring = false) {
  preserveCreateFormDraft();
  flowState.currentCreateType = type;
  newProposalState.recurrenceEnabled = recurring && (type === 'event' || type === 'sleeping');
  if (type === 'batch_sleeping') {
    ensureBatchAssignments(newProposalState.batchNightCount || 3);
  }
  scheduleDraftSave();
  renderView();
}

function bindRecurrenceControls() {
  document.querySelectorAll('[data-recurrence-freq]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const freq = btn.dataset.recurrenceFreq || 'weekly';
      newProposalState.recurrenceFrequency = freq;
      const hidden = document.getElementById('prop-recurrence-frequency');
      if (hidden) hidden.value = freq;
      document.querySelectorAll('[data-recurrence-freq]').forEach((b) => {
        b.classList.toggle('active', b.dataset.recurrenceFreq === freq);
      });
      scheduleDraftSave();
      renderView();
    });
  });

  const countEl = document.getElementById('prop-recurrence-count');
  if (countEl) {
    countEl.addEventListener('change', () => {
      syncRecurrenceStateFromDom();
      scheduleDraftSave();
      renderView();
    });
  }
}

const PRIVACY_HINTS = {
  standard: 'Everyone in the household can see event details on the schedule.',
  private: 'Only invitees see details; others see times only (sleeping arrangements still visible).',
  super_private: 'Only invitees can see details — everyone else sees a private placeholder.'
};

function bindVisibilityTabs() {
  const tabs = document.getElementById('prop-visibility-tabs');
  const input = document.getElementById('prop-visibility');
  const hint = document.getElementById('prop-visibility-hint');
  if (!tabs || !input) return;

  tabs.querySelectorAll('[data-visibility]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.visibility || 'standard';
      input.value = value;
      tabs.querySelectorAll('.switch-btn').forEach((b) => {
        b.classList.toggle('active', b.dataset.visibility === value);
      });
      if (hint) hint.textContent = PRIVACY_HINTS[value] || PRIVACY_HINTS.standard;
      newProposalState.draftVisibility = value;
      scheduleDraftSave();
    });
  });
}

export function collectProposalFormData() {
  const titleInput = document.getElementById('prop-title');
  const startInput = document.getElementById('prop-start-date');
  const currentUserName = getCurrentUserName();
  syncParticipantRolesFromParticipants();

  if (flowState.currentCreateType === 'batch_sleeping') {
    const durationVal = document.getElementById('prop-duration')?.value || '1';
    const nightCount = Math.min(14, Math.max(1, parseInt(durationVal, 10) || 1));
    const assignments = readBatchAssignmentsFromDom();
    const { batchNights, start, end } = buildBatchNightsPayload(startInput?.value || newProposalState.batchStartDate, nightCount, assignments, state.config);
    const participantSet = new Set();
    batchNights.forEach(night => {
      (night.assignments || []).forEach(a => (a.participants || []).forEach(p => participantSet.add(p)));
    });
    if (requireCurrentUserInSleepingProposal() && !participantSet.has(currentUserName)) {
      participantSet.add(currentUserName);
    }
    const participants = Array.from(participantSet);
    return {
      title: titleInput?.value.trim() || 'Untitled Batch',
      type: 'batch_sleeping',
      start,
      end,
      batchNights,
      participants,
      participantRoles: normalizeParticipantRoles(participants, state.config, 'batch_sleeping'),
      proposer: currentUserName,
      notes: document.getElementById('prop-notes')?.value?.trim() || '',
      visibility: readProposalVisibility()
    };
  }

  const dateStr = startInput?.value || newProposalState.batchStartDate;
  let startD = parseLocalDateString(dateStr, 0, 0, 0, 0);
  if (Number.isNaN(startD.getTime())) {
    startD = new Date();
  }
  let endD = new Date(startD);
  if (flowState.currentCreateType === 'sleeping') {
    endD.setDate(startD.getDate() + 1);
  } else {
    const startTime = read12HourTime('prop-start');
    const endTime = read12HourTime('prop-end');
    startD = parseLocalDateString(dateStr, startTime.hours, startTime.minutes, 0, 0);
    endD = parseLocalDateString(dateStr, endTime.hours, endTime.minutes, 0, 0);
    if (endD <= startD) endD = new Date(startD.getTime() + 3600000);
  }

  if (
    (flowState.currentCreateType === 'sleeping' || flowState.currentCreateType === 'event')
    && requireCurrentUserInSleepingProposal()
    && !newProposalState.participants.includes(currentUserName)
  ) {
    newProposalState.participants.unshift(currentUserName);
  }
  if (flowState.currentCreateType === 'event' && flowState.soloEventMode) {
    newProposalState.participants = [currentUserName];
  }
  syncParticipantRolesFromParticipants();

  const data = {
    title: titleInput?.value.trim() || 'Untitled Proposal',
    type: flowState.currentCreateType,
    start: startD.toISOString(),
    end: endD.toISOString(),
    participants: [...newProposalState.participants],
    participantRoles: [...newProposalState.participantRoles],
    proposer: currentUserName,
    notes: document.getElementById('prop-notes')?.value?.trim() || '',
    visibility: readProposalVisibility()
  };

  if (flowState.currentCreateType === 'sleeping') {
    const homeSelect = document.getElementById('sleep-home-select');
    const roomSelect = document.getElementById('sleep-room-select');
    const homeObj = state.config?.residences?.find(h => h.id === newProposalState.homeId);
    data.homeId = newProposalState.homeId;
    data.roomId = newProposalState.roomId;
    data.homeName = (homeSelect?.selectedIndex >= 0
      ? homeSelect.options[homeSelect.selectedIndex].text
      : (homeObj?.name || newProposalState.homeName || '')).trim();
    data.roomName = (roomSelect?.selectedIndex >= 0
      ? roomSelect.options[roomSelect.selectedIndex].text
      : (newProposalState.roomName || '')).trim();
  } else if (flowState.currentCreateType === 'event') {
    data.location = document.getElementById('event-location')?.value?.trim() || '';
  }

  const recurrence = readRecurrenceFromForm();
  if (recurrence) data.recurrence = recurrence;

  return data;
}

export function scheduleDraftSave() {
  if (!flowState.currentDraftId) return;
  clearTimeout(flowState.draftSaveTimer);
  flowState.draftSaveTimer = setTimeout(async () => {
    try {
      const data = collectProposalFormData();
      await CalendarSync.saveDraft(flowState.currentDraftId, data);
      const statusEl = document.getElementById('draft-autosave-status');
      if (statusEl) {
        statusEl.textContent = `Draft saved ${formatAppTime()}`;
      }
    } catch (err) {
      console.error('Draft auto-save failed', err);
    }
  }, 600);
}

export function ensureCreateDraftSync() {
  const params = parseHashParams();
  if (params.draft) {
    if (flowState.currentDraftId !== params.draft) {
      if (loadDraftIntoForm(params.draft)) {
        return;
      }
      flowState.currentDraftId = null;
      window.history.replaceState({}, '', '#create');
    } else {
      return;
    }
  }
  if (flowState.currentDraftId) return;

  const currentUserName = getCurrentUserName();
  const now = new Date();
  const draft = {
    id: `prop_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    title: 'Untitled Proposal',
    type: flowState.currentCreateType || 'event',
    start: now.toISOString(),
    end: new Date(now.getTime() + 3600000).toISOString(),
    participants: [],
    participantRoles: [],
    proposer: currentUserName,
    location: '',
    workflowState: WORKFLOW.DRAFT,
    status: 'draft',
    revision: 1,
    responses: {},
    approvedAt: null,
    archivedAt: null,
    autoArchiveAt: null,
    expandedEventIds: []
  };
  CalendarSync.events.push(draft);
  CalendarSync.persistLocalEventsMirror();
  state.events = CalendarSync.events;
  flowState.currentDraftId = draft.id;
  resetNewProposalFormState();
  window.history.replaceState({}, '', `#create?draft=${draft.id}`);
}

export function gatherSleepingProposalWarnings() {
  if (flowState.currentCreateType === 'batch_sleeping') {
    return evaluateCurrentBatchProposalWarnings();
  }
  if (flowState.currentCreateType !== 'sleeping') return [];

  const startInput = document.getElementById('prop-start-date');
  if (!startInput) return [];

  const currentUserName = getCurrentUserName();
  const startD = parseLocalDateString(startInput.value, 22, 0, 0, 0);
  const endD = parseLocalDateString(startInput.value, 0, 0, 0, 0);
  endD.setDate(startD.getDate() + 1);
  const participants = [...newProposalState.participants];
  if (requireCurrentUserInSleepingProposal() && !participants.includes(currentUserName)) {
    participants.unshift(currentUserName);
  }

  const tempProposal = {
    id: flowState.currentDraftId || 'temp_create',
    type: 'sleeping',
    start: startD.toISOString(),
    end: endD.toISOString(),
    participants,
    homeId: newProposalState.homeId,
    roomId: newProposalState.roomId,
    roomName: newProposalState.roomName,
    recurrence: readRecurrenceFromForm()
  };

  return RulesEngine.evaluateSleepingProposal(
    tempProposal,
    state.events,
    state.config,
    state.config.partners
  );
}

function applySoloMinWarningsToProposalData(data, warnings) {
  const soloWarnings = (warnings || []).filter(w => w.type === 'SOLO_MIN_LIMIT');
  if (!soloWarnings.length) return false;
  data.ruleWarnings = soloWarnings.map(w => ({ type: w.type, message: w.message }));
  const block = soloWarnings.map(w => `- ${w.message}`).join('\n');
  const prefix = 'Minimum solo nights alert (submitter acknowledged):\n';
  data.notes = data.notes?.trim() ? `${data.notes.trim()}\n\n${prefix}${block}` : `${prefix}${block}`;
  return true;
}

function confirmSoloMinWarnings(warnings) {
  const soloWarnings = (warnings || []).filter(w => w.type === 'SOLO_MIN_LIMIT');
  if (!soloWarnings.length) return true;
  const lines = soloWarnings.map(w => `• ${w.message}`).join('\n');
  return window.confirm(
    `This proposal may leave someone below their minimum solo nights for the week:\n\n${lines}\n\nSubmit anyway? Reviewers will see this on the proposal.`
  );
}

export async function submitCurrentProposal() {
  const btnSubmit = document.getElementById('btn-submit-proposal');
  if (btnSubmit?.dataset.submitting === '1') return;

  const titleInput = document.getElementById('prop-title');
  if (!titleInput?.value.trim()) {
    showToast('Please enter a title for the proposal.', 'warning');
    return;
  }

  if (flowState.currentCreateType === 'batch_sleeping') {
    const durationVal = document.getElementById('prop-duration')?.value || '1';
    const nightCount = Math.min(14, Math.max(1, parseInt(durationVal, 10) || 1));
    const assignments = readBatchAssignmentsFromDom();
    const startInput = document.getElementById('prop-start-date');
    const { batchNights } = buildBatchNightsPayload(startInput.value, nightCount, assignments, state.config);
    const emptyNight = batchNights.findIndex(n => !(n.assignments || []).length);
    if (emptyNight !== -1) {
      showToast(`Night ${emptyNight + 1} needs at least one room with people assigned.`, 'warning');
      return;
    }
    const currentUserName = getCurrentUserName();
    const batchParticipants = new Set();
    batchNights.forEach(night => {
      (night.assignments || []).forEach(a => (a.participants || []).forEach(p => batchParticipants.add(p)));
    });
    if (batchParticipants.size === 0) {
      showToast('Assign at least one person to the batch schedule.', 'warning');
      return;
    }
    if (requireCurrentUserInSleepingProposal() && !batchParticipants.has(currentUserName)) {
      showToast('You must assign yourself to at least one night.', 'warning');
      return;
    }
    const batchWarnings = evaluateCurrentBatchProposalWarnings();
    if (RulesEngine.hasBatchRoomConflicts(batchWarnings)) {
      showProposalRulesBanner(batchWarnings);
      highlightBatchRowErrors(batchWarnings);
      showToast('Cannot submit until all room conflicts are resolved.', 'error');
      return;
    }
    if (!confirmSoloMinWarnings(batchWarnings)) return;
  } else if (flowState.currentCreateType === 'sleeping') {
    ensureCurrentUserSelectedForSleeping();
    if (newProposalState.participants.length === 0) {
      showToast('Select at least one person for this sleeping arrangement.', 'warning');
      return;
    }
    if (requireCurrentUserInSleepingProposal() && !newProposalState.participants.includes(getCurrentUserName())) {
      showToast('You must include yourself in this sleeping arrangement.', 'warning');
      return;
    }
    const sleepingWarnings = gatherSleepingProposalWarnings();
    if (!confirmSoloMinWarnings(sleepingWarnings)) return;
  } else if (flowState.currentCreateType === 'event') {
    const dateStr = document.getElementById('prop-start-date').value;
    const startTime = read12HourTime('prop-start');
    const endTime = read12HourTime('prop-end');
    const startD = parseLocalDateString(dateStr, startTime.hours, startTime.minutes, 0, 0);
    const endD = parseLocalDateString(dateStr, endTime.hours, endTime.minutes, 0, 0);
    if (endD <= startD) {
      showToast('End time must be after start time.', 'warning');
      return;
    }
  }

  if (btnSubmit) {
    btnSubmit.dataset.submitting = '1';
    btnSubmit.disabled = true;
  }

  try {
    ensureCreateDraftSync();

    const data = collectProposalFormData();
    let draftId = flowState.currentDraftId;
    if (!draftId) {
      ensureCreateDraftSync();
      draftId = flowState.currentDraftId;
    }
    if (!draftId) {
      throw new Error('Draft could not be created');
    }

    if (flowState.currentCreateType === 'sleeping' || flowState.currentCreateType === 'batch_sleeping') {
      applySoloMinWarningsToProposalData(data, gatherSleepingProposalWarnings());
    }

    const proposalPayload = { ...data, id: draftId, type: flowState.currentCreateType };
    const advisoryWarnings = [];
    const pastWarning = pastScheduleWarning(proposalPayload);
    if (pastWarning) advisoryWarnings.push(pastWarning);

    if (flowState.currentCreateType === 'event') {
      const personConflicts = RulesEngine.evaluateEventPersonConflicts(
        proposalPayload,
        state.events,
        state.config,
        { viewerRef: getCurrentUserId() || getCurrentUserName() }
      );
      data.personConflicts = personConflicts;
      advisoryWarnings.push(...personConflicts);
    }

    if (advisoryWarnings.length) {
      showProposalRulesBanner(advisoryWarnings);
      if (pastWarning) {
        showToast(pastWarning.message, 'warning');
      }
      const personCount = advisoryWarnings.filter(w => w.type === 'PERSON_CONFLICT').length;
      if (personCount) {
        showToast(
          personCount === 1
            ? 'Person schedule conflict detected. Reviewers will be notified during approval.'
            : `${personCount} person schedule conflicts detected. Reviewers will be notified during approval.`,
          'warning'
        );
      }
    }

    const saved = await CalendarSync.saveDraft(draftId, data);
    draftId = saved?.id || draftId;
    flowState.currentDraftId = draftId;

    await CalendarSync.submitProposal(draftId, { submittedBy: getCurrentUserName() });
    state.events = CalendarSync.events;

    const finalEvent = state.events.find(e => e.id === draftId);

    if (finalEvent && getWorkflowState(finalEvent) === WORKFLOW.APPROVED) {
      if (isSoloEventProposal(finalEvent, state.config)) {
        showToast('Personal event confirmed and added to your calendar.', 'success');
      } else {
        showToast('Proposal approved and added to your calendar.', 'success');
      }
      flowState.currentDraftId = null;
      flowState.soloEventMode = false;
      window.location.hash = '#schedule';
    } else {
      if (finalEvent) notifyProposalReviewers(finalEvent, state.config, { actingUserId: getCurrentUserId() });
      showToast('Proposal submitted successfully!', 'success');
      flowState.currentDraftId = null;
      flowState.soloEventMode = false;
      flowState.activeProposalsTab = 'proposed';
      window.location.hash = '#proposals';
    }
    logUserAction(`Submitted proposal: "${data.title}"`);
  } catch (err) {
    logOperationError('Proposal submit', err, {
      draftId: flowState.currentDraftId,
      proposalType: flowState.currentCreateType,
      proposalTitle: document.getElementById('prop-title')?.value?.trim() || '',
      soloEvent: flowState.soloEventMode
    });
    showToast(err?.message || 'Failed to submit proposal.', 'error');
  } finally {
    if (btnSubmit) {
      delete btnSubmit.dataset.submitting;
      btnSubmit.disabled = false;
    }
  }
}

export function runRulesChecks() {
  const data = collectProposalFormData();
  data.id = flowState.currentDraftId;
  data.type = flowState.currentCreateType;

  if (flowState.currentCreateType === 'event') {
    const warnings = [
      ...RulesEngine.evaluateEventPersonConflicts(data, state.events, state.config, {
        viewerRef: getCurrentUserId() || getCurrentUserName()
      }),
      pastScheduleWarning(data)
    ].filter(Boolean);
    showProposalRulesBanner(warnings);
    return;
  }

  if (flowState.currentCreateType === 'sleeping' || flowState.currentCreateType === 'batch_sleeping') {
    const pastWarning = pastScheduleWarning(data);
    const startInput = document.getElementById('prop-start-date');
    if (!startInput) {
      showProposalRulesBanner(pastWarning ? [pastWarning] : []);
      return;
    }

    let warnings = [];

    if (flowState.currentCreateType === 'batch_sleeping') {
      warnings = evaluateCurrentBatchProposalWarnings();
    } else {
      const currentUserName = getCurrentUserName();
      const startD = parseLocalDateString(startInput.value, 22, 0, 0, 0);
      const endD = parseLocalDateString(startInput.value, 0, 0, 0, 0);
      endD.setDate(startD.getDate() + 1);
      const participants = [...newProposalState.participants];
      if (requireCurrentUserInSleepingProposal() && !participants.includes(currentUserName)) {
        participants.unshift(currentUserName);
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
      warnings = RulesEngine.evaluateSleepingProposal(
        tempProposal,
        state.events,
        state.config,
        state.config.partners
      );
    }

    if (pastWarning) warnings.unshift(pastWarning);
    showProposalRulesBanner(warnings);
    if (flowState.currentCreateType === 'batch_sleeping') {
      highlightBatchRowErrors(warnings);
      updateBatchPartnerLocks();
    }
    updateMicroCalendarConflicts(warnings);
    return;
  }
}

export function evaluateCurrentBatchProposalWarnings() {
  const startInput = document.getElementById('prop-start-date');
  const durationVal = document.getElementById('prop-duration')?.value || '1';
  if (!startInput) return [];

  const nightCount = Math.min(14, Math.max(1, parseInt(durationVal, 10) || 1));
  const assignments = readBatchAssignmentsFromDom();
  const { batchNights, start, end } = buildBatchNightsPayload(
    startInput.value,
    nightCount,
    assignments,
    state.config
  );
  const currentUserName = getCurrentUserName();
  const participantSet = new Set();
  batchNights.forEach(night => {
    (night.assignments || []).forEach(a => (a.participants || []).forEach(p => participantSet.add(p)));
  });
  if (requireCurrentUserInSleepingProposal() && !participantSet.has(currentUserName)) {
    participantSet.add(currentUserName);
  }

  const tempProposal = {
    id: flowState.currentDraftId || 'temp_create',
    type: 'batch_sleeping',
    start,
    end,
    batchNights,
    participants: Array.from(participantSet)
  };

  return RulesEngine.evaluateBatchSleepingProposal(
    tempProposal,
    state.events,
    state.config,
    state.config.partners
  );
}

export function bindCreateEvents() {
  document.querySelectorAll('.circle-partner-option').forEach(opt => {
    const name = opt.dataset.name;
    if (newProposalState.participants.includes(name)) {
      opt.style.opacity = '1';
      const avatar = opt.querySelector('.profile-avatar');
      if (avatar) avatar.style.borderColor = 'var(--primary)';
    }
  });

  const btnEvent = document.getElementById('btn-toggle-event');
  const btnRecurringEvent = document.getElementById('btn-toggle-recurring-event');
  const btnSleep = document.getElementById('btn-toggle-sleeping');
  const btnRecurringSleep = document.getElementById('btn-toggle-recurring-sleeping');
  const btnBatch = document.getElementById('btn-toggle-batch-sleeping');

  btnEvent?.addEventListener('click', () => setCreateProposalMode('event', false));
  btnRecurringEvent?.addEventListener('click', () => setCreateProposalMode('event', true));
  btnSleep?.addEventListener('click', () => setCreateProposalMode('sleeping', false));
  btnRecurringSleep?.addEventListener('click', () => setCreateProposalMode('sleeping', true));
  btnBatch?.addEventListener('click', () => setCreateProposalMode('batch_sleeping', false));

  document.querySelectorAll('.circle-partner-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      if (e.target.closest('.role-toggle-btn')) return;
      if (flowState.soloEventMode && flowState.currentCreateType === 'event') {
        flowState.soloEventMode = false;
        const soloCb = document.getElementById('solo-event-checkbox');
        if (soloCb) soloCb.checked = false;
      }
      const name = opt.dataset.name;
      const currentUserName = getCurrentUserName();
      const idx = newProposalState.participants.indexOf(name);

      if (idx === -1) {
        newProposalState.participants.push(name);
        opt.classList.add('selected');
      } else {
        if (
          flowState.currentCreateType === 'sleeping'
          && requireCurrentUserInSleepingProposal()
          && name === currentUserName
        ) {
          showToast('You must stay included in this sleeping arrangement.', 'info');
          return;
        }
        newProposalState.participants.splice(idx, 1);
        newProposalState.participantRoles = newProposalState.participantRoles.filter(p => p.name !== name);
        opt.classList.remove('selected');
      }

      syncParticipantRolesFromParticipants();
      runRulesChecks();
      updateSleepingArrangementTitle();
      scheduleDraftSave();
      renderView();
    });
  });

  document.querySelectorAll('.role-toggle-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const name = btn.dataset.name;
      const entry = newProposalState.participantRoles.find(p => p.name === name);
      if (entry) {
        entry.role = entry.role === 'required' ? 'optional' : 'required';
      }
      scheduleDraftSave();
      renderView();
    });
  });

  const soloCheckbox = document.getElementById('solo-event-checkbox');
  if (soloCheckbox) {
    soloCheckbox.addEventListener('change', () => {
      flowState.soloEventMode = soloCheckbox.checked;
      const currentUserName = getCurrentUserName();
      if (flowState.soloEventMode) {
        newProposalState.participants = [currentUserName];
        newProposalState.participantRoles = [{ name: currentUserName, role: 'required' }];
      }
      scheduleDraftSave();
      renderView();
    });
  }

  const titleInputEl = document.getElementById('prop-title');
  if (titleInputEl) {
    titleInputEl.addEventListener('input', () => {
      newProposalState.draftTitle = titleInputEl.value;
      scheduleDraftSave();
    });
  }

  const notesInputEl = document.getElementById('prop-notes');
  if (notesInputEl) {
    notesInputEl.addEventListener('input', () => {
      newProposalState.draftNotes = notesInputEl.value;
      scheduleDraftSave();
    });
  }

  bindVisibilityTabs();
  bindRecurrenceControls();

  const startDateInput = document.getElementById('prop-start-date');
  const durationInput = document.getElementById('prop-duration');
  if (startDateInput) {
    startDateInput.addEventListener('change', () => {
      if (flowState.currentCreateType === 'batch_sleeping') {
        preserveCreateFormDraft();
        syncBatchAssignmentsFromDom();
        newProposalState.batchStartDate = startDateInput.value;
        renderView();
      } else {
        runRulesChecks();
        scheduleDraftSave();
      }
    });
  }
  if (durationInput) {
    const applyBatchNightCount = (force = false) => {
      preserveCreateFormDraft();
      syncBatchAssignmentsFromDom();
      const raw = durationInput.value.trim();
      if (!force && raw === '') return;
      const parsed = parseInt(raw, 10);
      ensureBatchAssignments(Number.isNaN(parsed) ? newProposalState.batchNightCount || 1 : parsed);
      scheduleDraftSave();
      renderView();
    };

    durationInput.addEventListener('input', () => {
      if (flowState.currentCreateType === 'batch_sleeping') {
        const raw = durationInput.value.trim();
        if (raw === '') return;
        const parsed = parseInt(raw, 10);
        if (Number.isNaN(parsed)) return;
        applyBatchNightCount();
      } else {
        runRulesChecks();
        scheduleDraftSave();
      }
    });

    durationInput.addEventListener('change', () => {
      if (flowState.currentCreateType === 'batch_sleeping') {
        applyBatchNightCount(true);
      }
    });

    durationInput.addEventListener('blur', () => {
      if (flowState.currentCreateType !== 'batch_sleeping') return;
      if (durationInput.value.trim() === '') {
        applyBatchNightCount(true);
      }
    });
  }

  document.querySelectorAll('.batch-night-row').forEach(row => {
    row.querySelectorAll('.batch-assignment-block').forEach(block => {
      const homeSelect = block.querySelector('.batch-home-select');
      const roomSelect = block.querySelector('.batch-room-select');
      if (homeSelect && roomSelect) {
        homeSelect.addEventListener('change', () => {
          const homeObj = state.config.residences.find(h => h.id === homeSelect.value);
          const bedrooms = getBedroomOptionsForHome(homeObj);
          roomSelect.innerHTML = bedrooms.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
          runRulesChecks();
        });
        roomSelect.addEventListener('change', runRulesChecks);
      }
      block.querySelectorAll('.batch-partner-cb').forEach(cb => {
        cb.addEventListener('change', () => {
          updateBatchPartnerLocks();
          runRulesChecks();
        });
      });
    });
  });

  document.querySelectorAll('.btn-batch-copy').forEach(btn => {
    btn.addEventListener('click', () => {
      preserveCreateFormDraft();
      syncBatchAssignmentsFromDom();
      const idx = parseInt(btn.dataset.nightIndex, 10);
      if (idx > 0 && newProposalState.batchAssignments[idx - 1]) {
        newProposalState.batchAssignments[idx] = cloneBatchNight(newProposalState.batchAssignments[idx - 1]);
        renderView();
      }
    });
  });

  document.querySelectorAll('.btn-batch-add-room').forEach(btn => {
    btn.addEventListener('click', () => {
      preserveCreateFormDraft();
      syncBatchAssignmentsFromDom();
      const idx = parseInt(btn.dataset.nightIndex, 10);
      const night = normalizeBatchNight(newProposalState.batchAssignments[idx], state.config);
      const defaultAssign = defaultBatchAssignment(state.config);
      night.assignments.push({
        ...defaultAssign,
        participants: [...(defaultAssign.participants || [])]
      });
      newProposalState.batchAssignments[idx] = night;
      renderView();
    });
  });

  document.querySelectorAll('.btn-batch-remove-room').forEach(btn => {
    btn.addEventListener('click', () => {
      preserveCreateFormDraft();
      syncBatchAssignmentsFromDom();
      const row = btn.closest('.batch-night-row');
      const nightIdx = parseInt(row?.dataset.nightIndex, 10);
      const assignIdx = parseInt(btn.dataset.assignIndex, 10);
      const night = normalizeBatchNight(newProposalState.batchAssignments[nightIdx], state.config);
      if (night.assignments.length > 1) {
        night.assignments.splice(assignIdx, 1);
        newProposalState.batchAssignments[nightIdx] = night;
        renderView();
      }
    });
  });

  if (flowState.currentCreateType === 'sleeping') {
    const participantCountBefore = newProposalState.participants.length;
    ensureCurrentUserSelectedForSleeping();
    if (newProposalState.participants.length !== participantCountBefore) {
      scheduleDraftSave();
      renderView();
      return;
    }
    updateSleepingArrangementTitle();
    runRulesChecks();
  } else if (flowState.currentCreateType === 'batch_sleeping') {
    updateBatchPartnerLocks();
    runRulesChecks();
  } else if (flowState.currentCreateType === 'event') {
    ['prop-start-hour', 'prop-start-minute', 'prop-start-ampm', 'prop-end-hour', 'prop-end-minute', 'prop-end-ampm'].forEach((id) => {
      document.getElementById(id)?.addEventListener('change', () => {
        runRulesChecks();
        scheduleDraftSave();
      });
    });
    runRulesChecks();
  }

  const homeSelect = document.getElementById('sleep-home-select');
  const roomSelect = document.getElementById('sleep-room-select');
  if (homeSelect && roomSelect) {
    homeSelect.addEventListener('change', (e) => {
      newProposalState.homeId = e.target.value;
      const homeObj = state.config.residences.find(h => h.id === e.target.value);
      newProposalState.homeName = homeObj ? homeObj.name : '';

      if (homeObj) {
        if (homeObj.bedroomDetails && homeObj.bedroomDetails.length > 0) {
          roomSelect.innerHTML = homeObj.bedroomDetails.map(r => `<option value="${r.id}">${r.name}</option>`).join('');
        } else {
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

  updateSleepingArrangementTitle();

  const btnSubmit = document.getElementById('btn-submit-proposal');
  if (btnSubmit) {
    btnSubmit.type = 'button';
    btnSubmit.onclick = () => {
      void submitCurrentProposal();
    };
  }
}
