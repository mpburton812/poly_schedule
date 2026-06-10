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


export function logisticsView(state) {
    const showAdmin = state.currentUser ? (state.config?.partners?.find(p => p.id === state.currentUser.id)?.role === 'Admin') : false;

    let profilesHtml = '';
    state.config.partners.forEach(partner => {
      const passive = isPartnerPassive(partner);
      let badge = '';
      if (passive) {
        badge = `<span class="font-label-sm" style="background-color: var(--surface-container-highest); color: var(--on-surface-variant); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold;">PASSIVE</span>`;
      } else if (partner.role === 'Admin') {
        badge = `<span class="font-label-sm" style="background-color: var(--secondary-container); color: var(--on-secondary-container); padding: 2px 8px; border-radius: var(--radius-sm); font-size: 9px; font-weight: bold;">ADMIN</span>`;
      }
      const defaultHomeObj = state.config.residences.find(r => r.id === partner.defaultHome);
      const homeName = defaultHomeObj ? defaultHomeObj.name : 'None';
      const editBtn = showAdmin ? `
        <button class="btn btn-outline btn-edit-partner" data-partner-id="${partner.id}" style="padding: 4px 12px; font-size: 0.75rem; flex-shrink: 0;">
          <span class="material-symbols-outlined" style="font-size: 16px;">edit</span>
        </button>
      ` : '';

      profilesHtml += `
        <div class="bento-card partner-card" data-partner-id="${partner.id}" style="flex-direction: row; gap: var(--space-md); align-items: center; border: 1px solid var(--outline-variant); padding: var(--space-md);">
          <div class="profile-avatar" style="width: 56px; height: 56px; border-radius: var(--radius-full); overflow: hidden; flex-shrink: 0;">
            <img src="${partner.avatar || DEFAULT_AVATARS[0]}" alt="${partner.name}"/>
          </div>
          <div style="flex-grow: 1;">
            <div style="display: flex; justify-content: space-between; align-items: center; gap: var(--space-sm);">
              <h4 class="font-title-lg" style="font-size: 1.05rem; font-weight: 700;">${partner.name}</h4>
              ${badge}
            </div>
            <p class="font-body-md" style="color: var(--on-surface-variant); margin-top: 2px;">Default Home: <strong style="color: var(--secondary);">${homeName}</strong></p>
            ${passive ? '<p class="font-label-sm" style="color: var(--on-surface-variant); margin-top: 2px;">Not using the app — scheduling only</p>' : ''}
          </div>
          ${editBtn}
        </div>
      `;
    });

    let homesHtml = '';
    state.config.residences.forEach(home => {
      // Bedrooms list
      let bedroomsStr = '';
      if (home.bedroomDetails) {
        bedroomsStr = home.bedroomDetails.map(r => r.name).join(', ');
      } else {
        // Fallback bedroom names
        bedroomsStr = Array.from({ length: home.bedrooms }, (_, i) => `Bedroom ${i + 1}`).join(', ');
      }

      // Associated people list
      let peopleStr = '';
      if (home.associatedPeople && home.associatedPeople.length > 0) {
        peopleStr = `<div class="font-body-md" style="font-size: 0.8rem; color: var(--on-surface-variant); margin-top: 4px;">
          <span style="font-weight: bold;">Associated:</span> ${home.associatedPeople.join(', ')}
        </div>`;
      } else {
        // Fallback: check which partners have defaultHome === home.id
        const associated = state.config.partners.filter(p => p.defaultHome === home.id).map(p => p.name.split(' ')[0]);
        if (associated.length > 0) {
          peopleStr = `<div class="font-body-md" style="font-size: 0.8rem; color: var(--on-surface-variant); margin-top: 4px;">
            <span style="font-weight: bold;">Associated:</span> ${associated.join(', ')}
          </div>`;
        }
      }

      homesHtml += `
        <div class="bento-card home-card ${showAdmin ? 'home-card-editable' : ''}" data-home-id="${home.id}" style="padding: var(--space-md); background-color: var(--surface-container-high); border: none; ${showAdmin ? 'cursor: pointer;' : ''} transition: border 0.2s;">
          <div style="display: flex; justify-content: space-between; align-items: start;">
            <div style="display: flex; gap: var(--space-md); flex-grow: 1;">
              <div style="width: 44px; height: 44px; background-color: var(--primary-fixed); color: var(--on-primary-fixed); border-radius: var(--radius-default); display: flex; align-items: center; justify-content: center; flex-shrink: 0;">
                <span class="material-symbols-outlined">${home.name.toLowerCase().includes('loft') || home.name.toLowerCase().includes('apartment') ? 'apartment' : 'bungalow'}</span>
              </div>
              <div>
                <h4 class="font-title-lg" style="font-size: 1.05rem; font-weight: 700;">${home.name}</h4>
                <p class="font-label-sm" style="color: var(--on-surface-variant);">${home.address}</p>
                <div class="font-body-md" style="font-size: 0.8rem; color: var(--on-surface-variant); margin-top: 4px;">
                  <span style="font-weight: bold;">Rooms:</span> ${bedroomsStr}
                </div>
                ${peopleStr}
              </div>
            </div>
            <div style="display: flex; flex-direction: column; align-items: flex-end; gap: var(--space-xs);">
              <span class="font-label-sm" style="color: var(--secondary); font-weight: bold; display: flex; align-items: center; gap: 4px;">
                <span style="width: 6px; height: 6px; border-radius: var(--radius-full); background-color: var(--secondary); display: inline-block;"></span>
                ${home.bedrooms} Bedrooms
              </span>
              ${showAdmin ? `<button class="btn btn-outline btn-edit-home" data-home-id="${home.id}" style="padding: 4px 10px; font-size: 0.75rem;"><span class="material-symbols-outlined" style="font-size: 14px;">edit</span> Edit</button>` : ''}
            </div>
          </div>
        </div>
      `;
    });

    return `
      <div class="mb-xl" style="margin-bottom: var(--space-xl);">
        <h2 class="font-headline-lg">Logistics & Configuration</h2>
        <p class="font-body-lg" style="color: var(--on-surface-variant); margin-top: 4px; max-width: 650px;">
          Manage collective residences, sleeping quotas, partner preferences, and convert passive partners to active users.
        </p>
      </div>

      <div class="bento-grid">
        <!-- Collective Profiles -->
        <section class="bento-span-12" style="display: flex; flex-direction: column; gap: var(--space-md);">
          <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--space-sm);">
            <h3 class="font-title-lg" style="display: flex; align-items: center; gap: var(--space-base); font-weight: 700;">
              <span class="material-symbols-outlined text-primary">group</span> Collective Profiles
            </h3>
            <div style="display: flex; gap: var(--space-sm); flex-wrap: wrap;">
              <a href="#activate-partner" class="btn btn-outline" id="btn-activate-partner" style="padding: var(--space-xs) var(--space-md); font-size: 0.85rem; text-decoration: none;">
                <span class="material-symbols-outlined" style="font-size: 16px;">person_check</span> Activate Passive Partner
              </a>
              <a href="#add-partner" class="btn btn-filled" id="btn-add-partner" style="padding: var(--space-xs) var(--space-md); font-size: 0.85rem; text-decoration: none;">
                <span class="material-symbols-outlined" style="font-size: 16px;">person_add</span> Add Partner
              </a>
            </div>
          </div>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: var(--space-md);">
            ${profilesHtml}
          </div>
        </section>

        <!-- Homes & Locations -->
        <section class="bento-span-12" style="display: flex; flex-direction: column; gap: var(--space-md);">
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <h3 class="font-title-lg" style="display: flex; align-items: center; gap: var(--space-base); font-weight: 700;">
              <span class="material-symbols-outlined text-primary">home_work</span> Homes & Spaces
            </h3>
            <a href="#add-home" class="btn btn-outline" id="btn-add-home" style="padding: var(--space-xs) var(--space-md); font-size: 0.85rem; border-color: var(--primary); color: var(--primary); text-decoration: none;">
              <span class="material-symbols-outlined" style="font-size: 16px;">add_home</span> Add Home
            </a>
          </div>
          <div style="display: flex; flex-direction: column; gap: var(--space-base);">
            ${homesHtml}
          </div>
        </section>
      </div>
    `;
}