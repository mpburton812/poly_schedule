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


export function activatePartnerView(state) {
    const passivePartners = state.config.partners.filter(isPartnerPassive);
    const options = passivePartners.map(p => `<option value="${p.id}">${p.name}</option>`).join('');

    let sleepingHtml = '';
    state.config.partners.filter(p => !isPartnerPassive(p)).forEach(partner => {
      sleepingHtml += `
        <div style="border: 1px solid var(--outline-variant); padding: var(--space-md); border-radius: var(--radius-md);">
          <label style="display: flex; align-items: center; gap: var(--space-md); font-weight: bold; cursor: pointer;">
            <input type="checkbox" class="sleeping-partner-checkbox" data-partner-name="${partner.name}" style="accent-color: var(--primary); width: 18px; height: 18px;"/>
            <span>${partner.name}</span>
          </label>
          <div class="sleeping-partner-details" style="display: none; flex-direction: column; gap: var(--space-xs); margin-left: 28px; margin-top: var(--space-xs);">
            <div style="display: flex; gap: var(--space-md);">
              <div class="form-group" style="flex: 1; margin-bottom: 0;"><label class="form-label" style="font-size: 0.75rem;">Min Nights</label>
                <input class="form-input partner-min-nights" type="number" min="0" max="7" value="1"/></div>
              <div class="form-group" style="flex: 1; margin-bottom: 0;"><label class="form-label" style="font-size: 0.75rem;">Max Nights</label>
                <input class="form-input partner-max-nights" type="number" min="0" max="7" value="3"/></div>
            </div>
          </div>
        </div>
      `;
    });

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-activate-partner-back"><span class="material-symbols-outlined">arrow_back</span></button>
          <h2 class="font-title-lg">Activate Passive Partner</h2>
        </div>
        <button class="btn btn-filled" id="btn-submit-activate">Activate Partner</button>
      </div>
      <div style="max-width: 700px; display: flex; flex-direction: column; gap: var(--space-lg);">
        <div class="bento-card" style="padding: var(--space-lg);">
          <div class="form-group">
            <label class="form-label" for="activate-partner-select">Select Passive Partner</label>
            <select class="form-input" id="activate-partner-select">
              ${passivePartners.length ? options : '<option value="">No passive partners available</option>'}
            </select>
          </div>
          <div class="grid grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md); margin-top: var(--space-md);">
            <div class="form-group" style="margin-bottom: 0;"><label class="form-label" for="activate-username">Username</label>
              <input class="form-input" id="activate-username" type="text"/></div>
            <div class="form-group" style="margin-bottom: 0;"><label class="form-label" for="activate-password">Password</label>
              <input class="form-input" id="activate-password" type="password"/></div>
          </div>
          <div class="form-group" style="margin-top: var(--space-md);">
            <label class="form-label" for="activate-role">Role</label>
            <select class="form-input" id="activate-role"><option value="User">User</option><option value="Admin">Admin</option></select>
          </div>
          <div class="form-group" style="margin-top: var(--space-md);">
            <label class="form-label" for="activate-google-email">Google account email</label>
            <input class="form-input" id="activate-google-email" placeholder="partner@gmail.com" type="email" autocomplete="email"/>
            <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-xs);">
              Invites this Google account to the household calendar when activation is saved.
            </p>
          </div>
        </div>
        <div class="bento-card" style="padding: var(--space-lg);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Sleeping Partner Connections</h3>
          <div class="form-group" id="solo-nights-group" style="display: none;">
            <label class="form-label" for="activate-solo-nights">Min Solo Nights</label>
            <input class="form-input" id="activate-solo-nights" type="number" min="0" max="7" value="2"/>
          </div>
          <div style="display: flex; flex-direction: column; gap: var(--space-sm);">${sleepingHtml}</div>
        </div>
      </div>
    `;
  }