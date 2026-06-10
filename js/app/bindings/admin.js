import { CalendarSync } from '../../calendar.js';
import {
  CREATE_NEW_HOME,
  RETURN_ADD_PARTNER_KEY,
  SELECT_HOME_KEY,
  ADD_PARTNER_DRAFT_KEY,
  isPartnerPassive,
  applyHomeAssociationDefaults
} from '../../helpers.js';
import {
  setAutoArchiveDays,
  getAutoArchiveDays
} from '../../proposal-workflow.js';
import {
  state,
  flowState
} from '../state.js';
import {
  addLog,
  showToast,
  saveConfig,
  addChangeLog,
  attemptLogin,
  bindHomeSelectCreateNew,
  saveAddPartnerDraft,
  restoreAddPartnerDraft,
  selectNewHomeAfterReturn,
  bindAvatarPicker,
  bindSleepingPartnerCheckboxes
} from '../context.js';
import { renderView } from '../router.js';
import { bindLogisticsEvents, bindGoogleCredentialsEvents } from './logistics.js';

export function bindAdminEvents() {
  const btnSave = document.getElementById('btn-save-group-name');
  const familyInput = document.getElementById('admin-poly-family-name');
  if (btnSave && familyInput) {
    btnSave.addEventListener('click', () => {
      const name = familyInput.value.trim() || 'The Poly Circle';
      localStorage.setItem('polyschedule_poly_family_name', name);
      addLog(`Admin: Group name updated to "${name}".`, 'info');
      addChangeLog('Updated group name', name);
      showToast('Group name saved.', 'success');
    });
  }

  const btnArchiveSave = document.getElementById('btn-save-auto-archive');
  const archiveInput = document.getElementById('admin-auto-archive-days');
  if (btnArchiveSave && archiveInput) {
    btnArchiveSave.addEventListener('click', () => {
      const days = parseInt(archiveInput.value, 10);
      setAutoArchiveDays(Number.isFinite(days) ? days : 7);
      addLog(`Admin: Auto-archive set to ${getAutoArchiveDays()} day(s).`, 'info');
      addChangeLog('Updated auto-archive setting', `${getAutoArchiveDays()} day(s)`);
      showToast('Archive setting saved.', 'success');
    });
  }

  bindLogisticsEvents(document);
  bindGoogleCredentialsEvents(document);
}

export function bindLoginEvents() {
  const btnLogin = document.getElementById('btn-login');
  const usernameInput = document.getElementById('login-username');
  const passwordInput = document.getElementById('login-password');

  const submit = () => {
    if (!usernameInput?.value || !passwordInput?.value) {
      showToast('Please enter username and password.', 'warning');
      return;
    }
    attemptLogin(usernameInput.value, passwordInput.value);
  };

  if (btnLogin) btnLogin.addEventListener('click', submit);
  if (passwordInput) {
    passwordInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') submit();
    });
  }
}

export function bindAddPartnerEvents() {
  restoreAddPartnerDraft();
  selectNewHomeAfterReturn();

  const btnBack = document.getElementById('btn-add-partner-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      window.location.hash = '#logistics';
    });
  }

  const btnActive = document.getElementById('btn-partner-type-active');
  const btnPassive = document.getElementById('btn-partner-type-passive');
  if (btnActive) {
    btnActive.addEventListener('click', () => {
      flowState.activePartnerType = 'active';
      renderView();
    });
  }
  if (btnPassive) {
    btnPassive.addEventListener('click', () => {
      flowState.activePartnerType = 'passive';
      renderView();
    });
  }

  bindHomeSelectCreateNew(document.getElementById('new-partner-home'));
  const getSelectedAvatar = bindAvatarPicker('#new-partner-avatar-options', {
    onError: (msg) => showToast(msg, 'warning')
  });
  bindSleepingPartnerCheckboxes();

  const btnSubmit = document.getElementById('btn-submit-partner');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => {
      const name = document.getElementById('new-partner-name').value.trim();
      const partnerType = document.getElementById('new-partner-type')?.value || flowState.activePartnerType;
      const isPassive = partnerType === 'passive';
      const defaultHome = document.getElementById('new-partner-home').value;

      if (defaultHome === CREATE_NEW_HOME) {
        saveAddPartnerDraft();
        sessionStorage.setItem(RETURN_ADD_PARTNER_KEY, '1');
        window.location.hash = '#add-home';
        return;
      }

      if (!name) {
        showToast('Display Name is required.', 'warning');
        return;
      }

      let username, password, role;
      if (!isPassive) {
        username = document.getElementById('new-partner-username').value.trim();
        password = document.getElementById('new-partner-password').value.trim();
        role = document.getElementById('new-partner-role').value;
        if (!username || !password) {
          showToast('Username and password are required for active users.', 'warning');
          return;
        }
        const exists = state.config.partners.some(p => p.username === username || p.name === name);
        if (exists) {
          showToast('A partner with this Display Name or Username already exists.', 'warning');
          return;
        }
      } else if (state.config.partners.some(p => p.name === name)) {
        showToast('A partner with this Display Name already exists.', 'warning');
        return;
      }

      const selectedAvatar = getSelectedAvatar();
      const rules = {};
      if (!isPassive) {
        const checkboxes = document.querySelectorAll('.sleeping-partner-checkbox');
        const anyChecked = Array.from(checkboxes).some(c => c.checked);
        if (anyChecked) {
          rules.minSoloNights = parseInt(document.getElementById('new-partner-solo-nights').value, 10) || 2;
          delete rules.maxSoloNights;
          rules.partnerLimits = {};
          checkboxes.forEach(cb => {
            if (cb.checked) {
              const partnerName = cb.dataset.partnerName;
              const minNights = parseInt(cb.closest('div').querySelector('.partner-min-nights').value) || 0;
              const maxNights = parseInt(cb.closest('div').querySelector('.partner-max-nights').value) || 7;
              rules.partnerLimits[partnerName] = { min: minNights, max: maxNights };
              const otherPartner = state.config.partners.find(p => p.name === partnerName);
              if (otherPartner) {
                if (!otherPartner.rules) otherPartner.rules = {};
                if (!otherPartner.rules.partnerLimits) otherPartner.rules.partnerLimits = {};
                otherPartner.rules.partnerLimits[name] = { min: minNights, max: maxNights };
              }
            }
          });
        }
      }

      const newId = 'p' + Date.now();
      const newPartner = isPassive
        ? { id: newId, name, passive: true, defaultHome, avatar: selectedAvatar, rules: {} }
        : { id: newId, name, username, password, role, defaultHome, avatar: selectedAvatar, rules };

      state.config.partners.push(newPartner);
      saveConfig(isPassive ? 'Added passive partner' : 'Added partner', name);
      addLog(`Logistics: ${isPassive ? 'Passive' : 'Active'} partner "${name}" added.`, 'info');
      showToast(`Partner "${name}" added successfully!`, 'success');
      window.location.hash = '#logistics';
    });
  }
}

export function bindAddHomeEvents() {
  const returningToPartner = sessionStorage.getItem(RETURN_ADD_PARTNER_KEY) === '1';

  const btnBack = document.getElementById('btn-add-home-back');
  if (btnBack) {
    btnBack.addEventListener('click', () => {
      if (returningToPartner) {
        window.location.hash = '#add-partner';
      } else {
        window.location.hash = '#logistics';
      }
    });
  }

  const bedroomsInput = document.getElementById('new-home-bedrooms-count');
  const bedroomContainer = document.getElementById('bedroom-names-container');

  if (bedroomsInput && bedroomContainer) {
    bedroomsInput.addEventListener('input', () => {
      const count = Math.max(1, parseInt(bedroomsInput.value) || 1);
      let inputsHtml = '<h4 class="font-label-md" style="font-weight: bold;">Bedroom Names (Optional)</h4>';
      for (let i = 0; i < count; i++) {
        inputsHtml += `
          <div class="form-group" style="margin-bottom: var(--space-xs);">
            <input class="form-input bedroom-name-input" placeholder="Bedroom ${i + 1} Name (e.g. Bedroom ${i + 1})" type="text" data-index="${i}"/>
          </div>
        `;
      }
      bedroomContainer.innerHTML = inputsHtml;
    });
  }

  const btnSubmit = document.getElementById('btn-submit-home');
  if (btnSubmit) {
    btnSubmit.addEventListener('click', () => {
      const name = document.getElementById('new-home-name').value.trim();
      const address = document.getElementById('new-home-address').value.trim();

      if (!name) {
        showToast('Please fill in Home Name.', 'warning');
        return;
      }

      const bedroomsCount = Math.max(1, parseInt(bedroomsInput.value) || 1);

      const bedroomInputs = document.querySelectorAll('.bedroom-name-input');
      const bedroomsList = [];
      for (let i = 0; i < bedroomsCount; i++) {
        const input = Array.from(bedroomInputs).find(inp => parseInt(inp.dataset.index) === i);
        const bedName = (input && input.value.trim()) ? input.value.trim() : `Bedroom ${i + 1}`;
        bedroomsList.push({ id: `r${i + 1}`, name: bedName });
      }

      const associatedCheckboxes = document.querySelectorAll('.home-associated-partner');
      const associatedPeople = [];
      associatedCheckboxes.forEach(cb => {
        if (cb.checked) {
          associatedPeople.push(cb.dataset.partnerName);
        }
      });

      const newHomeId = 'h' + (state.config.residences.length + 1);
      const newHome = {
        id: newHomeId,
        name,
        address: address || '',
        bedrooms: bedroomsCount,
        bedroomDetails: bedroomsList,
        associatedPeople
      };

      state.config.residences.push(newHome);
      applyHomeAssociationDefaults(state.config, newHomeId, associatedPeople);
      if (sessionStorage.getItem(RETURN_ADD_PARTNER_KEY) === '1') {
        sessionStorage.setItem(SELECT_HOME_KEY, newHomeId);
      }
      saveConfig('Added home', name);
      addLog(`Logistics: Home "${name}" added.`, 'info');
      showToast(`Home "${name}" added successfully!`, 'success');

      if (sessionStorage.getItem(RETURN_ADD_PARTNER_KEY) === '1') {
        sessionStorage.removeItem(RETURN_ADD_PARTNER_KEY);
        window.location.hash = '#add-partner';
      } else {
        window.location.hash = '#logistics';
      }
    });
  }
}

export function bindEditPartnerEvents() {
  document.getElementById('btn-edit-partner-back')?.addEventListener('click', () => {
    window.location.hash = '#logistics';
  });

  bindHomeSelectCreateNew(document.getElementById('edit-partner-home'));
  const editPartnerId = document.getElementById('edit-partner-id')?.value;
  const editPartner = state.config.partners.find(p => p.id === editPartnerId);
  const getSelectedAvatar = bindAvatarPicker('#edit-partner-avatar-options', {
    initialUrl: editPartner?.avatar,
    onError: (msg) => showToast(msg, 'warning')
  });
  bindSleepingPartnerCheckboxes();

  document.getElementById('btn-save-edit-partner')?.addEventListener('click', () => {
    const partnerId = document.getElementById('edit-partner-id').value;
    const partner = state.config.partners.find(p => p.id === partnerId);
    if (!partner) return;

    const name = document.getElementById('edit-partner-name').value.trim();
    const defaultHome = document.getElementById('edit-partner-home').value;
    if (defaultHome === CREATE_NEW_HOME) {
      window.location.hash = '#add-home';
      return;
    }
    if (!name) {
      showToast('Display Name is required.', 'warning');
      return;
    }

    const oldName = partner.name;
    if (oldName !== name) {
      CalendarSync.renamePartnerInEvents(oldName, name);
    }

    partner.name = name;
    partner.defaultHome = defaultHome;
    partner.avatar = getSelectedAvatar();

    if (!isPartnerPassive(partner)) {
      partner.username = document.getElementById('edit-partner-username').value.trim();
      partner.password = document.getElementById('edit-partner-password').value.trim();
      partner.role = document.getElementById('edit-partner-role').value;
      partner.rules = partner.rules || {};
      partner.rules.minSoloNights = parseInt(document.getElementById('edit-partner-solo-nights')?.value, 10) || 2;
      delete partner.rules.maxSoloNights;
      const nextLimits = { ...(partner.rules.partnerLimits || {}) };
      document.querySelectorAll('.sleeping-partner-checkbox').forEach(cb => {
        const pName = cb.dataset.partnerName;
        if (cb.checked) {
          nextLimits[pName] = {
            min: parseInt(cb.closest('div').querySelector('.partner-min-nights').value) || 0,
            max: parseInt(cb.closest('div').querySelector('.partner-max-nights').value) || 7
          };
        } else {
          delete nextLimits[pName];
        }
      });
      partner.rules.partnerLimits = nextLimits;
    }

    saveConfig('Updated partner', name);
    addLog(`Admin: Partner "${name}" updated.`, 'info');
    showToast(`Partner "${name}" updated.`, 'success');
    window.location.hash = '#logistics';
  });

  document.getElementById('btn-delete-edit-partner')?.addEventListener('click', () => {
    const partnerId = document.getElementById('edit-partner-id').value;
    const partner = state.config.partners.find(p => p.id === partnerId);
    if (!partner) return;

    if (state.currentUser?.id === partnerId) {
      showToast('You cannot delete your own account.', 'warning');
      return;
    }

    const adminCount = state.config.partners.filter(p => p.role === 'Admin' && !isPartnerPassive(p)).length;
    if (partner.role === 'Admin' && adminCount <= 1) {
      showToast('Cannot delete the only admin account.', 'warning');
      return;
    }

    if (!confirm(`Delete partner "${partner.name}"? This cannot be undone.`)) return;

    CalendarSync.removePartner(partnerId);
    state.config = CalendarSync.config;
    state.events = CalendarSync.events;
    addLog(`Admin: Partner "${partner.name}" deleted.`, 'warning');
    showToast(`Partner "${partner.name}" deleted.`, 'success');
    window.location.hash = '#logistics';
  });
}

export function bindEditHomeEvents() {
  document.getElementById('btn-edit-home-back')?.addEventListener('click', () => {
    window.location.hash = '#logistics';
  });

  const bedroomsInput = document.getElementById('edit-home-bedrooms-count');
  const bedroomContainer = document.getElementById('bedroom-names-container');

  if (bedroomsInput && bedroomContainer) {
    bedroomsInput.addEventListener('input', () => {
      const homeId = document.getElementById('edit-home-id').value;
      const home = state.config.residences.find(h => h.id === homeId);
      const count = Math.max(1, parseInt(bedroomsInput.value) || 1);
      let inputsHtml = '<h4 class="font-label-md" style="font-weight: bold;">Bedroom Names</h4>';
      for (let i = 0; i < count; i++) {
        const existing = home?.bedroomDetails?.[i]?.name || '';
        inputsHtml += `<div class="form-group" style="margin-bottom: var(--space-xs);"><input class="form-input bedroom-name-input" type="text" data-index="${i}" value="${existing}"/></div>`;
      }
      bedroomContainer.innerHTML = inputsHtml;
    });
  }

  document.getElementById('btn-save-edit-home')?.addEventListener('click', () => {
    const homeId = document.getElementById('edit-home-id').value;
    const home = state.config.residences.find(h => h.id === homeId);
    if (!home) return;

    const name = document.getElementById('edit-home-name').value.trim();
    const address = document.getElementById('edit-home-address').value.trim();
    const bedroomsCount = Math.max(1, parseInt(bedroomsInput.value) || 1);

    if (!name || !address) {
      showToast('Home Name and Address are required.', 'warning');
      return;
    }

    const bedroomInputs = document.querySelectorAll('.bedroom-name-input');
    const bedroomsList = [];
    for (let i = 0; i < bedroomsCount; i++) {
      const input = Array.from(bedroomInputs).find(inp => parseInt(inp.dataset.index) === i);
      bedroomsList.push({ id: `r${i + 1}`, name: (input?.value.trim()) || `Bedroom ${i + 1}` });
    }

    const associatedPeople = [];
    document.querySelectorAll('.home-associated-partner').forEach(cb => {
      if (cb.checked) associatedPeople.push(cb.dataset.partnerName);
    });

    home.name = name;
    home.address = address;
    home.bedrooms = bedroomsCount;
    home.bedroomDetails = bedroomsList;
    home.associatedPeople = associatedPeople;
    applyHomeAssociationDefaults(state.config, homeId, associatedPeople);

    saveConfig('Updated home', name);
    addLog(`Admin: Home "${name}" updated.`, 'info');
    showToast(`Home "${name}" updated.`, 'success');
    window.location.hash = '#logistics';
  });

  document.getElementById('btn-delete-edit-home')?.addEventListener('click', () => {
    const homeId = document.getElementById('edit-home-id').value;
    const home = state.config.residences.find(h => h.id === homeId);
    if (!home) return;

    if (!confirm(`Delete home "${home.name}"? Partners linked to this home will have their default home cleared.`)) return;

    CalendarSync.removeHome(homeId);
    state.config = CalendarSync.config;
    state.events = CalendarSync.events;
    addLog(`Admin: Home "${home.name}" deleted.`, 'warning');
    showToast(`Home "${home.name}" deleted.`, 'success');
    window.location.hash = '#logistics';
  });
}

export function bindActivatePartnerEvents() {
  document.getElementById('btn-activate-partner-back')?.addEventListener('click', () => {
    window.location.hash = '#logistics';
  });

  bindSleepingPartnerCheckboxes();

  document.getElementById('btn-submit-activate')?.addEventListener('click', () => {
    const partnerId = document.getElementById('activate-partner-select').value;
    const partner = state.config.partners.find(p => p.id === partnerId);
    if (!partner || !isPartnerPassive(partner)) {
      showToast('Select a passive partner to activate.', 'warning');
      return;
    }

    const username = document.getElementById('activate-username').value.trim();
    const password = document.getElementById('activate-password').value.trim();
    const role = document.getElementById('activate-role').value;

    if (!username || !password) {
      showToast('Username and password are required.', 'warning');
      return;
    }

    if (state.config.partners.some(p => p.username === username && p.id !== partnerId)) {
      showToast('Username already in use.', 'warning');
      return;
    }

    partner.username = username;
    partner.password = password;
    partner.role = role;
    delete partner.passive;

    const rules = {};
    const checkboxes = document.querySelectorAll('.sleeping-partner-checkbox');
    const anyChecked = Array.from(checkboxes).some(c => c.checked);
    if (anyChecked) {
      rules.minSoloNights = parseInt(document.getElementById('activate-solo-nights').value, 10) || 2;
      delete rules.maxSoloNights;
      rules.partnerLimits = {};
      checkboxes.forEach(cb => {
        if (cb.checked) {
          const pName = cb.dataset.partnerName;
          rules.partnerLimits[pName] = {
            min: parseInt(cb.closest('div').querySelector('.partner-min-nights').value) || 0,
            max: parseInt(cb.closest('div').querySelector('.partner-max-nights').value) || 7
          };
        }
      });
    }
    partner.rules = rules;

    saveConfig('Activated partner', partner.name);
    showToast(`"${partner.name}" is now an active user!`, 'success');
    window.location.hash = '#logistics';
  });
}
