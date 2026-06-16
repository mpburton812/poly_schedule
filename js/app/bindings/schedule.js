import { state, flowState } from '../state.js';
import { renderView } from '../router.js';
import { openEventDetailsModal } from '../modals.js';
import { getWorkflowState, WORKFLOW } from '../../proposal-workflow.js';
import { SCHEDULE_VIEW_MODE_KEY } from '../../storage-keys.js';
import {
  SCHEDULE_VIEW_COMPACT,
  SCHEDULE_VIEW_NORMAL,
  getScheduleNavigationDays,
  normalizeScheduleViewMode
} from '../../schedule-view.js';
import { getMondayOfWeek, parseLocalDateString } from '../../helpers.js';

function setSelectedWeek(date) {
  state.selectedDate = getMondayOfWeek(date);
  renderView();
}

function getScheduleNavigationStep() {
  return getScheduleNavigationDays(flowState.scheduleViewMode);
}

function setScheduleViewMode(mode) {
  flowState.scheduleViewMode = normalizeScheduleViewMode(mode);
  localStorage.setItem(SCHEDULE_VIEW_MODE_KEY, flowState.scheduleViewMode);
  renderView();
}

export function loadStoredScheduleViewMode() {
  try {
    return normalizeScheduleViewMode(localStorage.getItem(SCHEDULE_VIEW_MODE_KEY));
  } catch {
    return SCHEDULE_VIEW_NORMAL;
  }
}

export function bindScheduleEvents() {
  document.querySelectorAll('.card-event, .card-sleeping').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const event = state.events.find(e => e.id === id);
      if (!event) return;

      if (getWorkflowState(event) === WORKFLOW.PROPOSED) {
        flowState.activeProposalsTab = 'proposed';
        flowState.highlightProposalId = id;
        window.location.hash = '#proposals';
        return;
      }

      openEventDetailsModal(event);
    });
  });

  const weekInput = document.getElementById('input-week-selector');
  if (weekInput) {
    weekInput.addEventListener('change', (e) => {
      if (!e.target.value) return;
      setSelectedWeek(parseLocalDateString(e.target.value));
    });
  }

  document.getElementById('btn-week-prev')?.addEventListener('click', (e) => {
    const step = Number(e.currentTarget?.dataset?.navDays) || getScheduleNavigationStep();
    const monday = getMondayOfWeek(state.selectedDate || new Date());
    monday.setDate(monday.getDate() - step);
    setSelectedWeek(monday);
  });

  document.getElementById('btn-week-next')?.addEventListener('click', (e) => {
    const step = Number(e.currentTarget?.dataset?.navDays) || getScheduleNavigationStep();
    const monday = getMondayOfWeek(state.selectedDate || new Date());
    monday.setDate(monday.getDate() + step);
    setSelectedWeek(monday);
  });

  document.getElementById('btn-week-picker')?.addEventListener('click', () => {
    if (!weekInput) return;
    if (typeof weekInput.showPicker === 'function') {
      weekInput.showPicker();
      return;
    }
    weekInput.focus();
    weekInput.click();
  });

  document.getElementById('btn-schedule-view-normal')?.addEventListener('click', () => {
    setScheduleViewMode(SCHEDULE_VIEW_NORMAL);
  });
  document.getElementById('btn-schedule-view-compact')?.addEventListener('click', () => {
    setScheduleViewMode(SCHEDULE_VIEW_COMPACT);
  });

  const partnerSelect = document.getElementById('filter-partner-select');
  if (partnerSelect) {
    partnerSelect.addEventListener('change', (e) => {
      state.filterPartner = e.target.value;
      renderView();
    });
  }
}
