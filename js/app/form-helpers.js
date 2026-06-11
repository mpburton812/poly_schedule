import { flowState } from './state.js';
import { RETURN_ADD_PARTNER_KEY, SELECT_HOME_KEY, ADD_PARTNER_DRAFT_KEY, CREATE_NEW_HOME } from '../helpers.js';

export function bindHomeSelectCreateNew(selectEl) {
  if (!selectEl) return;
  selectEl.addEventListener('change', (e) => {
    if (e.target.value === CREATE_NEW_HOME) {
      saveAddPartnerDraft();
      sessionStorage.setItem(RETURN_ADD_PARTNER_KEY, '1');
      window.location.hash = '#add-home';
    }
  });
}

export function saveAddPartnerDraft() {
  const draft = {
    type: document.getElementById('new-partner-type')?.value || flowState.activePartnerType,
    name: document.getElementById('new-partner-name')?.value || '',
    username: document.getElementById('new-partner-username')?.value || '',
    password: document.getElementById('new-partner-password')?.value || '',
    role: document.getElementById('new-partner-role')?.value || 'User'
  };
  sessionStorage.setItem(ADD_PARTNER_DRAFT_KEY, JSON.stringify(draft));
}

export function restoreAddPartnerDraft() {
  const raw = sessionStorage.getItem(ADD_PARTNER_DRAFT_KEY);
  if (!raw) return;
  sessionStorage.removeItem(ADD_PARTNER_DRAFT_KEY);
  try {
    const draft = JSON.parse(raw);
    if (draft.type) flowState.activePartnerType = draft.type;
    const nameEl = document.getElementById('new-partner-name');
    const userEl = document.getElementById('new-partner-username');
    const pwdEl = document.getElementById('new-partner-password');
    const roleEl = document.getElementById('new-partner-role');
    if (nameEl && draft.name) nameEl.value = draft.name;
    if (userEl && draft.username) userEl.value = draft.username;
    if (pwdEl && draft.password) pwdEl.value = draft.password;
    if (roleEl && draft.role) roleEl.value = draft.role;
  } catch { /* ignore corrupt draft */ }
}

export function selectNewHomeAfterReturn() {
  const homeId = sessionStorage.getItem(SELECT_HOME_KEY);
  if (!homeId) return;
  sessionStorage.removeItem(SELECT_HOME_KEY);
  const select = document.getElementById('new-partner-home');
  if (select) select.value = homeId;
}

export function bindSleepingPartnerCheckboxes(container = document) {
  const checkboxes = container.querySelectorAll('.sleeping-partner-checkbox');
  const soloNightsGroup = container.querySelector('#solo-nights-group');
  checkboxes.forEach(cb => {
    cb.addEventListener('change', () => {
      const details = cb.closest('div').querySelector('.sleeping-partner-details');
      if (details) details.style.display = cb.checked ? 'flex' : 'none';
      if (soloNightsGroup) {
        soloNightsGroup.style.display = Array.from(checkboxes).some(c => c.checked) ? 'block' : 'none';
      }
    });
  });
}
