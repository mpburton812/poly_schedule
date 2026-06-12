import { RulesEngine } from '../rules.js';
import { escapeHtml } from '../escape.js';
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


export function editHomeView(state, homeId) {
    const home = state.config.residences.find(h => h.id === homeId);
    if (!home) return '<p>Home not found.</p>';

    let bedroomInputs = '';
    const count = home.bedrooms || home.bedroomDetails?.length || 1;
    for (let i = 0; i < count; i++) {
      const bedName = home.bedroomDetails?.[i]?.name || `Bedroom ${i + 1}`;
      bedroomInputs += `<div class="form-group" style="margin-bottom: var(--space-xs);"><input class="form-input bedroom-name-input" type="text" data-index="${i}" value="${escapeHtml(bedName)}"/></div>`;
    }

    let partnersHtml = '';
    state.config.partners.forEach(partner => {
      const associated = home.associatedPeople?.includes(partner.name) || partner.defaultHome === home.id;
      partnersHtml += `
        <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-xs);">
          <input type="checkbox" class="home-associated-partner" data-partner-name="${escapeHtml(partner.name)}" ${associated ? 'checked' : ''} style="accent-color: var(--primary); width: 18px; height: 18px;"/>
          <span>${escapeHtml(partner.name)}</span>
        </label>
      `;
    });

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-edit-home-back"><span class="material-symbols-outlined">arrow_back</span></button>
          <h2 class="font-title-lg">Edit Home: ${escapeHtml(home.name)}</h2>
        </div>
        <div style="display: flex; gap: var(--space-sm);">
          <button class="btn btn-outline" id="btn-delete-edit-home" style="color: var(--error); border-color: var(--error);">Delete Home</button>
          <button class="btn btn-filled" id="btn-save-edit-home">Save Changes</button>
        </div>
      </div>
      <input type="hidden" id="edit-home-id" value="${home.id}"/>
      <div style="display: grid; gap: var(--space-xl); max-width: 900px; grid-template-columns: 2fr 1fr;">
        <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
          <div class="form-group"><label class="form-label" for="edit-home-name">Home Name</label>
            <input class="form-input" id="edit-home-name" type="text" value="${escapeHtml(home.name)}"/></div>
          <div class="form-group"><label class="form-label" for="edit-home-address">Address</label>
            <input class="form-input" id="edit-home-address" type="text" value="${escapeHtml(home.address)}"/></div>
          <div class="form-group"><label class="form-label" for="edit-home-bedrooms-count">Number of Bedrooms</label>
            <input class="form-input" id="edit-home-bedrooms-count" type="number" min="1" max="10" value="${count}"/></div>
          <div id="bedroom-names-container"><h4 class="font-label-md" style="font-weight: bold;">Bedroom Names</h4>${bedroomInputs}</div>
        </div>
        <div class="bento-card" style="padding: var(--space-lg);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Associated People</h3>
          <div style="display: flex; flex-direction: column; gap: var(--space-xs);">${partnersHtml}</div>
        </div>
      </div>
    `;
  }