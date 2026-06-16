import { state, flowState } from '../state.js';
import { renderView } from '../router.js';
import { openEventDetailsModal } from '../modals.js';
import { getWorkflowState, WORKFLOW } from '../../proposal-workflow.js';
import { getMondayOfWeek, parseLocalDateString } from '../../helpers.js';

function setSelectedWeek(date) {
  state.selectedDate = getMondayOfWeek(date);
  renderView();
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

  document.getElementById('btn-week-prev')?.addEventListener('click', () => {
    const monday = getMondayOfWeek(state.selectedDate || new Date());
    monday.setDate(monday.getDate() - 7);
    setSelectedWeek(monday);
  });

  document.getElementById('btn-week-next')?.addEventListener('click', () => {
    const monday = getMondayOfWeek(state.selectedDate || new Date());
    monday.setDate(monday.getDate() + 7);
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

  const partnerSelect = document.getElementById('filter-partner-select');
  if (partnerSelect) {
    partnerSelect.addEventListener('change', (e) => {
      state.filterPartner = e.target.value;
      renderView();
    });
  }
}
