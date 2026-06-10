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


export function addHomeView(state) {
    // Generate partner checkboxes for association
    let partnersHtml = '';
    state.config.partners.forEach(partner => {
      partnersHtml += `
        <label style="display: flex; align-items: center; gap: var(--space-md); cursor: pointer; padding: var(--space-xs);">
          <input type="checkbox" class="home-associated-partner" data-partner-name="${partner.name}" style="accent-color: var(--primary); width: 18px; height: 18px;"/>
          <span>${partner.name}</span>
        </label>
      `;
    });

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-add-home-back" aria-label="Cancel">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 class="font-title-lg">Add New Home & Space</h2>
        </div>
        <button class="btn btn-filled" id="btn-submit-home">Save Home</button>
      </div>

      <div style="display: grid; grid-template-columns: 1fr; md:grid-template-columns: 2fr 1fr; gap: var(--space-xl); max-width: 900px;">
        <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
          <!-- Core residence fields -->
          <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
            <h3 class="font-title-lg" style="font-weight: 700; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Home Details</h3>
            
            <div class="form-group">
              <label class="form-label" for="new-home-name">Home Name</label>
              <input class="form-input" id="new-home-name" placeholder="e.g. Mountain Retreat" type="text"/>
            </div>

            <div class="form-group">
              <label class="form-label" for="new-home-address">Address <span class="font-label-sm" style="color: var(--on-surface-variant);">(Optional)</span></label>
              <input class="form-input" id="new-home-address" placeholder="e.g. 742 Evergreen Terrace" type="text"/>
            </div>

            <div class="form-group">
              <label class="form-label" for="new-home-bedrooms-count">Number of Bedrooms</label>
              <input class="form-input" id="new-home-bedrooms-count" type="number" min="1" max="10" value="1"/>
            </div>

            <!-- Optional Bedroom Names Container -->
            <div style="display: flex; flex-direction: column; gap: var(--space-sm); margin-top: var(--space-sm);" id="bedroom-names-container">
              <h4 class="font-label-md" style="font-weight: bold;">Bedroom Names (Optional)</h4>
              <div class="form-group" style="margin-bottom: 0;">
                <input class="form-input bedroom-name-input" placeholder="Bedroom 1 Name (e.g. Master Suite)" type="text" data-index="0"/>
              </div>
            </div>
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
          <!-- Associated partners -->
          <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
            <h3 class="font-title-lg" style="font-weight: 700; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Associated People</h3>
            <p class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.8rem; margin-bottom: var(--space-xs);">
              Select which people are associated with or reside at this home.
            </p>
            <div style="display: flex; flex-direction: column; gap: var(--space-xs);">
              ${partnersHtml}
            </div>
          </div>
        </div>
      </div>
    `;
  }