import { state, flowState } from '../state.js';
import { renderView } from '../router.js';
import { openEventDetailsModal } from '../modals.js';

export function bindScheduleEvents() {
  document.querySelectorAll('.card-event, .card-sleeping').forEach(card => {
    card.addEventListener('click', () => {
      const id = card.dataset.id;
      const event = state.events.find(e => e.id === id);
      if (event) {
        openEventDetailsModal(event);
      }
    });
  });

  document.querySelectorAll('.proposal-summary-card').forEach(card => {
    card.addEventListener('click', () => {
      flowState.activeProposalsTab = 'proposed';
      window.location.hash = '#proposals';
    });
  });

  const weekInput = document.getElementById('input-week-selector');
  if (weekInput) {
    weekInput.addEventListener('change', (e) => {
      state.selectedDate = new Date(e.target.value);
      renderView();
    });
  }

  const partnerSelect = document.getElementById('filter-partner-select');
  if (partnerSelect) {
    partnerSelect.addEventListener('change', (e) => {
      state.filterPartner = e.target.value;
      renderView();
    });
  }

  const residenceSelect = document.getElementById('filter-residence-select');
  if (residenceSelect) {
    residenceSelect.addEventListener('change', (e) => {
      state.filterResidence = e.target.value;
      renderView();
    });
  }
}
