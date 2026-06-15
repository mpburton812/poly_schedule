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


export function editPartnerView(state, partnerId) {
    const partner = state.config.partners.find(p => p.id === partnerId);
    if (!partner) return '<p>Partner not found.</p>';
    const passive = isPartnerPassive(partner);

    let sleepingHtml = '';
    if (!passive) {
      let partnersCheckHtml = '';
      state.config.partners.filter(p => p.id !== partnerId).forEach(p => {
        const limit = partner.rules?.partnerLimits?.[p.name] || partner.rules?.partnerLimits?.[p.name.split(' ')[0]];
        const checked = limit ? 'checked' : '';
        partnersCheckHtml += `
          <div style="border: 1px solid var(--outline-variant); padding: var(--space-md); border-radius: var(--radius-md);">
            <label style="display: flex; align-items: center; gap: var(--space-md); font-weight: bold; cursor: pointer;">
              <input type="checkbox" class="sleeping-partner-checkbox" data-partner-name="${escapeHtml(p.name)}" ${checked} style="accent-color: var(--primary); width: 18px; height: 18px;"/>
              <span>${escapeHtml(p.name)}</span>
            </label>
            <div class="sleeping-partner-details" style="display: ${checked ? 'flex' : 'none'}; flex-direction: column; gap: var(--space-xs); margin-left: 28px; margin-top: var(--space-xs);">
              <div style="display: flex; gap: var(--space-md);">
                <div class="form-group" style="flex: 1; margin-bottom: 0;">
                  <label class="form-label" style="font-size: 0.75rem;">Min Nights</label>
                  <input class="form-input partner-min-nights" type="number" min="0" max="7" value="${limit?.min || 1}" style="padding: 4px 8px; font-size: 0.8rem;"/>
                </div>
                <div class="form-group" style="flex: 1; margin-bottom: 0;">
                  <label class="form-label" style="font-size: 0.75rem;">Max Nights</label>
                  <input class="form-input partner-max-nights" type="number" min="0" max="7" value="${limit?.max || 3}" style="padding: 4px 8px; font-size: 0.8rem;"/>
                </div>
              </div>
            </div>
          </div>
        `;
      });
      sleepingHtml = `
        <div class="bento-card" style="padding: var(--space-lg);">
          <h3 class="font-title-lg" style="font-weight: 700; margin-bottom: var(--space-md);">Sleeping Partners</h3>
          <div class="form-group">
            <label class="form-label" for="edit-partner-solo-nights">Min Solo Nights</label>
            <input class="form-input" id="edit-partner-solo-nights" type="number" min="0" max="7" value="${partner.rules?.minSoloNights ?? partner.rules?.maxSoloNights ?? 2}"/>
          </div>
          <div style="display: flex; flex-direction: column; gap: var(--space-sm); margin-top: var(--space-md);">${partnersCheckHtml}</div>
        </div>
      `;
    }

    const activeFields = passive ? '' : `
      <div class="grid grid-cols-2 gap-md" style="display: grid; grid-template-columns: 1fr 1fr; gap: var(--space-md);">
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="edit-partner-username">Username</label>
          <input class="form-input" id="edit-partner-username" type="text" value="${escapeHtml(partner.username || '')}"/>
        </div>
        <div class="form-group" style="margin-bottom: 0;">
          <label class="form-label" for="edit-partner-password">Password</label>
          <input class="form-input" id="edit-partner-password" type="password" value="" placeholder="Leave blank to keep unchanged"/>
        </div>
      </div>
      <div class="form-group">
        <label class="form-label" for="edit-partner-role">Role</label>
        <select class="form-input" id="edit-partner-role">
          <option value="User" ${partner.role === 'User' || (!partner.role || (partner.role !== 'Admin')) ? 'selected' : ''}>User</option>
          <option value="Admin" ${partner.role === 'Admin' ? 'selected' : ''}>Admin</option>
        </select>
      </div>
    `;

    return `
      <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: var(--space-lg);">
        <div style="display: flex; align-items: center; gap: var(--space-base);">
          <button class="btn-icon-only" id="btn-edit-partner-back"><span class="material-symbols-outlined">arrow_back</span></button>
          <h2 class="font-title-lg">Edit Partner: ${escapeHtml(partner.name)}</h2>
        </div>
        <div style="display: flex; gap: var(--space-sm);">
          <button class="btn btn-outline" id="btn-delete-edit-partner" style="color: var(--error); border-color: var(--error);">Delete Partner</button>
          <button class="btn btn-filled" id="btn-save-edit-partner">Save Changes</button>
        </div>
      </div>
      <input type="hidden" id="edit-partner-id" value="${partner.id}"/>
      <div style="display: grid; gap: var(--space-xl); max-width: 900px;">
        <div class="bento-card" style="padding: var(--space-lg); display: flex; flex-direction: column; gap: var(--space-md);">
          <div class="form-group"><label class="form-label" for="edit-partner-name">Display Name</label>
            <input class="form-input" id="edit-partner-name" type="text" value="${escapeHtml(partner.name)}"/></div>
          <div class="form-group">
            <label class="form-label" for="edit-partner-notification-email">Notification email (optional)</label>
            <input class="form-input" id="edit-partner-notification-email" type="email" placeholder="partner@example.com" value="${escapeHtml(partner.notificationEmail || '')}"/>
            <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-xs);">Email backup when push is unavailable.</p>
          </div>
          <div class="form-group">
            <label class="form-label" for="edit-partner-google-email">Google Calendar account email</label>
            <input class="form-input" id="edit-partner-google-email" type="email" placeholder="partner@gmail.com" value="${escapeHtml(partner.googleEmail || '')}"/>
            <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-xs);">Saving updates household config and invites this Google account to the shared calendar when connected.</p>
            <p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: var(--space-xs);">Matches this partner when they change events directly in Google Calendar.</p>
          </div>
          ${activeFields}
          <div class="form-group">
            <label class="form-label" for="edit-partner-home">Default Home</label>
            <select class="form-input" id="edit-partner-home">${renderHomeSelectOptions(state.config.residences, partner.defaultHome)}</select>
          </div>
          ${renderAvatarPickerHtml(partner.avatar, 'edit-partner-avatar-options')}
        </div>
        ${sleepingHtml}
      </div>
    `;
  }