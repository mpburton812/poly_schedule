import { CalendarSync } from '../../calendar.js';
import { RulesEngine } from '../../rules.js';
import {
  parseHashParams,
  isPartnerPassive,
  findPartnerByRef,
  read12HourTime,
  defaultBatchAssignment,
  defaultBatchNight,
  cloneBatchNight,
  normalizeBatchNight,
  getBedroomOptionsForHome,
  buildBatchNightsPayload
} from '../../helpers.js';
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
import { addLog, showToast, getCurrentUserName, notifyProposalReviewers, addChangeLog } from '../context.js';
import { renderView } from '../router.js';

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
  } else {
    roomName = 'North Bedroom';
  }

  titleInput.value = `Sleeping : ${names} : ${homeName} ${roomName}`;
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

export function formatWarningList(warnings) {
  if (!warnings.length) return '';
  if (warnings.length === 1) return warnings[0].message;
  return `<ul class="banner-alert-list">${warnings.map(w => `<li>${w.message}</li>`).join('')}</ul>`;
}

export function showProposalRulesBanner(warnings) {
  const banner = document.getElementById('proposal-rules-banner');
  const titleEl = document.getElementById('banner-warning-title');
  const descEl = document.getElementById('banner-warning-desc');
  const conflictNotice = document.getElementById('micro-cal-conflict-notice');
  if (!banner) return;

  if (warnings.length > 0) {
    banner.classList.remove('hidden');
    const capacityWarnings = warnings.filter(w => w.type === 'CAPACITY_CONFLICT');
    const partnerMaxWarnings = warnings.filter(w => w.type === 'PARTNER_MAX_LIMIT');
    const preferenceWarnings = warnings.filter(w =>
      w.type !== 'CAPACITY_CONFLICT' && w.type !== 'PARTNER_MAX_LIMIT'
    );

    if (capacityWarnings.length > 0) {
      titleEl.textContent = capacityWarnings.length > 1 ? 'Room Capacity Conflicts' : 'Room Capacity Conflict';
      descEl.innerHTML = formatWarningList(capacityWarnings);
      banner.style.backgroundColor = 'var(--error-container)';
      banner.style.color = 'var(--on-error-container)';
      banner.style.borderColor = 'var(--error)';
    } else if (partnerMaxWarnings.length > 0) {
      titleEl.textContent = partnerMaxWarnings.length > 1 ? 'Extended Stay Alerts' : 'Extended Stay Alert';
      descEl.innerHTML = formatWarningList(partnerMaxWarnings);
      banner.style.backgroundColor = 'var(--tertiary-fixed)';
      banner.style.color = 'var(--on-tertiary-fixed)';
      banner.style.borderColor = 'var(--tertiary)';
    } else {
      titleEl.textContent = preferenceWarnings.length > 1 ? 'Preference Limit Alerts' : 'Preference Limit Alert';
      descEl.innerHTML = `<ul class="banner-alert-list">${preferenceWarnings.map(w => `<li>${w.message}</li>`).join('')}</ul>`;
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

  const start = new Date(startInput.value + 'T12:00:00');
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
    if (!participantSet.has(currentUserName)) participantSet.add(currentUserName);
    const participants = Array.from(participantSet);
    return {
      title: titleInput?.value.trim() || 'Untitled Batch',
      type: 'batch_sleeping',
      start,
      end,
      batchNights,
      participants,
      participantRoles: normalizeParticipantRoles(participants, state.config, 'batch_sleeping'),
      proposer: currentUserName
    };
  }

  const startD = new Date(startInput?.value || newProposalState.batchStartDate);
  let endD = new Date(startD);
  if (flowState.currentCreateType === 'sleeping') {
    const durationVal = document.getElementById('prop-duration')?.value || '1';
    const nights = parseInt(durationVal, 10) || 1;
    endD.setDate(startD.getDate() + nights);
  } else {
    const startTime = read12HourTime('prop-start');
    const endTime = read12HourTime('prop-end');
    startD.setHours(startTime.hours, startTime.minutes, 0, 0);
    endD.setHours(endTime.hours, endTime.minutes, 0, 0);
    if (endD <= startD) endD = new Date(startD.getTime() + 3600000);
  }

  if (!newProposalState.participants.includes(currentUserName)) {
    newProposalState.participants.push(currentUserName);
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
    proposer: currentUserName
  };

  if (flowState.currentCreateType === 'sleeping') {
    data.homeId = newProposalState.homeId;
    data.roomId = newProposalState.roomId;
    data.homeName = newProposalState.homeName || 'The Sanctuary';
    data.roomName = newProposalState.roomName || 'North Bedroom';
  } else if (flowState.currentCreateType === 'event') {
    data.location = document.getElementById('event-location')?.value || 'The Loft at Main St';
  }
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
        statusEl.textContent = `Draft saved ${new Date().toLocaleTimeString()}`;
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
      loadDraftIntoForm(params.draft);
    }
    return;
  }
  if (flowState.currentDraftId) return;

  const currentUserName = getCurrentUserName();
  const now = new Date();
  const draft = {
    id: `prop_${Date.now()}`,
    title: 'Untitled Proposal',
    type: 'event',
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
  CalendarSync.persistEvents();
  state.events = CalendarSync.events;
  flowState.currentDraftId = draft.id;
  resetNewProposalFormState();
  window.history.replaceState({}, '', `#create?draft=${draft.id}`);
}

export function runRulesChecks() {
  if (flowState.currentCreateType !== 'sleeping' && flowState.currentCreateType !== 'batch_sleeping') return;

  const startInput = document.getElementById('prop-start-date');
  const durationVal = document.getElementById('prop-duration')?.value || '1';
  if (!startInput) return;

  const currentUserName = getCurrentUserName();
  let warnings = [];

  if (flowState.currentCreateType === 'batch_sleeping') {
    const nightCount = Math.min(14, Math.max(1, parseInt(durationVal, 10) || 1));
    const assignments = readBatchAssignmentsFromDom();
    const { batchNights, start, end } = buildBatchNightsPayload(startInput.value, nightCount, assignments, state.config);
    const participantSet = new Set();
    batchNights.forEach(night => {
      (night.assignments || []).forEach(a => (a.participants || []).forEach(p => participantSet.add(p)));
    });
    if (!participantSet.has(currentUserName)) participantSet.add(currentUserName);

    const tempProposal = {
      id: 'temp_create',
      type: 'batch_sleeping',
      start,
      end,
      batchNights,
      participants: Array.from(participantSet)
    };
    warnings = RulesEngine.evaluateBatchSleepingProposal(
      tempProposal,
      state.events,
      state.config,
      state.config.partners
    );
  } else {
    const startD = new Date(startInput.value);
    const endD = new Date(startD);
    endD.setDate(startD.getDate() + (parseInt(durationVal, 10) || 1));
    const participants = [...newProposalState.participants];
    if (!participants.includes(currentUserName)) participants.push(currentUserName);

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

  showProposalRulesBanner(warnings);
  if (flowState.currentCreateType === 'batch_sleeping') {
    highlightBatchRowErrors(warnings);
    updateBatchPartnerLocks();
  }
  updateMicroCalendarConflicts(warnings);
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
  const btnSleep = document.getElementById('btn-toggle-sleeping');
  const btnBatch = document.getElementById('btn-toggle-batch-sleeping');
  if (btnEvent && btnSleep) {
    btnEvent.addEventListener('click', () => {
      preserveCreateFormDraft();
      flowState.currentCreateType = 'event';
      scheduleDraftSave();
      renderView();
    });
    btnSleep.addEventListener('click', () => {
      preserveCreateFormDraft();
      flowState.currentCreateType = 'sleeping';
      scheduleDraftSave();
      renderView();
    });
  }
  if (btnBatch) {
    btnBatch.addEventListener('click', () => {
      preserveCreateFormDraft();
      flowState.currentCreateType = 'batch_sleeping';
      ensureBatchAssignments(newProposalState.batchNightCount || 3);
      scheduleDraftSave();
      renderView();
    });
  }

  document.querySelectorAll('.circle-partner-option').forEach(opt => {
    opt.addEventListener('click', (e) => {
      if (e.target.closest('.role-toggle-btn')) return;
      if (flowState.soloEventMode && flowState.currentCreateType === 'event') {
        flowState.soloEventMode = false;
        const soloCb = document.getElementById('solo-event-checkbox');
        if (soloCb) soloCb.checked = false;
      }
      const name = opt.dataset.name;
      const idx = newProposalState.participants.indexOf(name);

      if (idx === -1) {
        newProposalState.participants.push(name);
        opt.classList.add('selected');
      } else {
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
    durationInput.addEventListener('input', () => {
      if (flowState.currentCreateType === 'batch_sleeping') {
        preserveCreateFormDraft();
        syncBatchAssignmentsFromDom();
        ensureBatchAssignments(parseInt(durationInput.value, 10) || 1);
        scheduleDraftSave();
        renderView();
      } else {
        runRulesChecks();
        scheduleDraftSave();
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

  if (flowState.currentCreateType === 'batch_sleeping') {
    updateBatchPartnerLocks();
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
    btnSubmit.addEventListener('click', async () => {
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
      } else if (flowState.currentCreateType === 'event') {
        const startD = new Date(document.getElementById('prop-start-date').value);
        const endD = new Date(startD);
        const startTime = read12HourTime('prop-start');
        const endTime = read12HourTime('prop-end');
        startD.setHours(startTime.hours, startTime.minutes, 0, 0);
        endD.setHours(endTime.hours, endTime.minutes, 0, 0);
        if (endD <= startD) {
          showToast('End time must be after start time.', 'warning');
          return;
        }
      }

      if (!flowState.currentDraftId) {
        ensureCreateDraftSync();
      }

      try {
        const data = collectProposalFormData();
        const draftId = flowState.currentDraftId;
        await CalendarSync.saveDraft(draftId, data);
        await CalendarSync.submitProposal(draftId);
        const finalEvent = state.events.find(e => e.id === draftId);

        if (finalEvent && getWorkflowState(finalEvent) === WORKFLOW.APPROVED) {
          if (isSoloEventProposal(finalEvent, state.config)) {
            showToast('Personal event confirmed and added to your calendar.', 'success');
          } else {
            showToast('Proposal approved and added to your calendar.', 'success');
          }
          addChangeLog('Proposal approved', finalEvent.title);
          flowState.currentDraftId = null;
          flowState.soloEventMode = false;
          window.location.hash = '#schedule';
        } else {
          if (finalEvent) notifyProposalReviewers(finalEvent, state.config);
          showToast('Proposal submitted successfully!', 'success');
          addChangeLog('Proposal submitted', finalEvent?.title || data.title);
          flowState.currentDraftId = null;
          flowState.soloEventMode = false;
          flowState.activeProposalsTab = 'proposed';
          window.location.hash = '#proposals';
        }
        addLog(`Submitted proposal: "${data.title}"`);
      } catch (err) {
        showToast('Failed to submit proposal.', 'error');
      }
    });
  }
}
