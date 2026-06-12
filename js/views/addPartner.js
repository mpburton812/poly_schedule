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


export function addPartnerView(state, partnerType = 'active', selectedHomeId = '') {
    const isPassive = partnerType === 'passive';

    let partnersHtml = '';
    state.config.partners.forEach(partner => {
      partnersHtml += `
        <div style="border: 1px solid var(--outline-variant); padding: var(--space-md); border-radius: var(--radius-md); background-color: var(--surface-container-low); display: flex; flex-direction: column; gap: var(--space-sm);">
          <label style="display: flex; align-items: center; gap: var(--space-md); font-weight: bold; cursor: pointer;">
            <input type="checkbox" class="sleeping-partner-checkbox" data-partner-name="${partner.name}" style="accent-color: var(--primary); width: 18px; height: 18px;"/>
            <span>${partner.name}</span>
          </label>
          <div class="sleeping-partner-details" style="display: none; flex-direction: column; gap: var(--space-xs); margin-left: 28px; border-left: 2px solid var(--primary-container); padding-left: var(--space-md);">
            <div style="display: flex; gap: var(--space-md);">
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">Min Nights</label>
                <input class="form-input partner-min-nights" type="number" min="0" max="7" value="1" style="padding: 4px 8px; font-size: 0.8rem;"/>
              </div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;">
                <label class="form-label" style="font-size: 0.75rem;">Max Nights</label>
                <input class="form-input partner-max-nights" type="number" min="0" max="7" value="3" style="padding: 4px 8px; font-size: 0.8rem;"/>
              </div>
            </div>
          </div>
        </div>
      `;
    });

    const activeFieldsHtml = isPassive ? '' : `
            <div class="grid grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="new-partner-username">Username</label>
                <input class="form-input" id="new-partner-username" placeholder="e.g. robin" type="text"/>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label class="form-label" for="new-partner-password">Default Password</label>
                <input class="form-input" id="new-partner-password" placeholder="e.g. password123" type="password"/>
              </div>
            </div>

            <div class="form-group" style="margin-top: var(--space-sm);">
              <label class="form-label" for="new-partner-role">Role</label>
              <select class="form-input" id="new-partner-role">
                <option value="User">User</option>
                <option value="Admin">Admin</option>
              </select>
            </div>
    `;

    const sleepingSectionHtml = isPassive ? '' : `
        <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
          <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
            <h3 class="font-title-lg" style="font-weight: 700; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Sleeping Partner Connections</h3>
            <div class="form-group" id="solo-nights-group" style="display: none;">
              <label class="form-label" for="new-partner-solo-nights">Min Solo Nights</label>
              <input class="form-input" id="new-partner-solo-nights" type="number" min="0" max="7" value="2"/>
            </div>
            <div style="display: flex; flex-direction: column; gap: var(--space-md); margin-top: var(--space-xs);">
              ${partnersHtml}
            </div>
          </div>
        </div>
    `;

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-add-partner-back" aria-label="Cancel">
            <span class="material-symbols-outlined">arrow_back</span>
          </button>
          <h2 class="font-title-lg">${isPassive ? 'Add Passive Partner' : 'Add Active Partner'}</h2>
        </div>
        <button class="btn btn-filled" id="btn-submit-partner">Save Partner</button>
      </div>

      <div class="switch-selector" style="margin-bottom: var(--space-lg); max-width: 400px;">
        <button class="switch-btn ${!isPassive ? 'active' : ''}" id="btn-partner-type-active">Active User</button>
        <button class="switch-btn ${isPassive ? 'active' : ''}" id="btn-partner-type-passive">Passive Partner</button>
      </div>

      <input type="hidden" id="new-partner-type" value="${partnerType}"/>

      <div style="display: grid; grid-template-columns: 1fr; md:grid-template-columns: 2fr 1fr; gap: var(--space-xl); max-width: 900px;">
        <div style="display: flex; flex-direction: column; gap: var(--space-lg);">
          <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
            <h3 class="font-title-lg" style="font-weight: 700; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs);">Profile Information</h3>
            <div class="form-group">
              <label class="form-label" for="new-partner-name">Display Name</label>
              <input class="form-input" id="new-partner-name" placeholder="e.g. Robin Williams" type="text"/>
            </div>
            ${activeFieldsHtml}
            <div class="form-group" style="margin-top: var(--space-sm);">
              <label class="form-label" for="new-partner-home">Default Home</label>
              <select class="form-input" id="new-partner-home">
                ${renderHomeSelectOptions(state.config.residences, selectedHomeId)}
              </select>
            </div>
            ${isPassive ? '<p class="font-body-md" style="color: var(--on-surface-variant); font-size: 0.85rem;">Passive partners appear in scheduling but cannot log in.</p>' : ''}
          </div>
          <div class="bento-card" style="padding: var(--space-lg);">
            <h3 class="font-title-lg" style="font-weight: 700; border-bottom: 1px solid rgba(138,113,112,0.1); padding-bottom: var(--space-xs); margin-bottom: var(--space-md);">Select Avatar</h3>
            ${renderAvatarPickerHtml('', 'new-partner-avatar-options')}
          </div>
        </div>
        ${sleepingSectionHtml}
      </div>
    `;
  }