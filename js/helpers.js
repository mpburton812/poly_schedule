/**
 * Shared PolySchedule helpers
 */

export const DEFAULT_AVATARS = [
  'https://images.unsplash.com/photo-1552728080-b9153f7f9f9?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1444464666168-49d633b86797?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1501704778740-628eb39a9257?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1518837695005-2083093ee35b?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1522926193345-9a711b0863f6?w=150&auto=format&fit=crop&q=80',
  'https://images.unsplash.com/photo-1545249390-6bdfa286032f?w=150&auto=format&fit=crop&q=80'
];

export const LOGS_STORAGE_KEY = 'polyschedule_system_logs';
export const CREATE_NEW_HOME = '__create_new__';
export const RETURN_ADD_PARTNER_KEY = 'polyschedule_return_add_partner';
export const SELECT_HOME_KEY = 'polyschedule_select_home_id';
export const ADD_PARTNER_DRAFT_KEY = 'polyschedule_add_partner_draft';

export function isPartnerPassive(partner) {
  return partner?.passive === true || !partner?.username;
}

export function isPartnerActive(partner) {
  return partner && !isPartnerPassive(partner);
}

export function renderHomeSelectOptions(residences, selectedId = '') {
  const blankSelected = !selectedId ? 'selected' : '';
  const options = (residences || []).map(h =>
    `<option value="${h.id}" ${h.id === selectedId ? 'selected' : ''}>${h.name}</option>`
  ).join('');
  return `<option value="" ${blankSelected}>— None —</option>${options}<option value="${CREATE_NEW_HOME}">+ Create New Home</option>`;
}

export function render12HourTimePicker(prefix, label, hour12 = 7, minute = '00', ampm = 'PM') {
  const hours = Array.from({ length: 12 }, (_, i) => {
    const h = i + 1;
    return `<option value="${h}" ${h === hour12 ? 'selected' : ''}>${h}</option>`;
  }).join('');
  const minutes = ['00', '15', '30', '45'].map(m =>
    `<option value="${m}" ${m === minute ? 'selected' : ''}>${m}</option>`
  ).join('');
  const amSelected = ampm === 'AM' ? 'selected' : '';
  const pmSelected = ampm === 'PM' ? 'selected' : '';
  return `
    <div class="form-group" style="margin-bottom: 0;">
      <label class="form-label" for="${prefix}-hour">${label}</label>
      <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: var(--space-sm);">
        <select class="form-input" id="${prefix}-hour" aria-label="${label} hour">${hours}</select>
        <select class="form-input" id="${prefix}-minute" aria-label="${label} minute">${minutes}</select>
        <select class="form-input" id="${prefix}-ampm" aria-label="${label} AM or PM">
          <option value="AM" ${amSelected}>AM</option>
          <option value="PM" ${pmSelected}>PM</option>
        </select>
      </div>
    </div>
  `;
}

export function read12HourTime(prefix) {
  const hour12 = parseInt(document.getElementById(`${prefix}-hour`)?.value || '12', 10);
  const minute = parseInt(document.getElementById(`${prefix}-minute`)?.value || '0', 10);
  const ampm = document.getElementById(`${prefix}-ampm`)?.value || 'AM';
  let hours24 = hour12 % 12;
  if (ampm === 'PM') hours24 += 12;
  return { hours: hours24, minutes: minute };
}

export function getMinSoloNights(rules = {}) {
  if (rules.minSoloNights !== undefined) return rules.minSoloNights;
  return rules.maxSoloNights;
}

export function renderAvatarPickerHtml(selectedUrl, containerId) {
  const items = DEFAULT_AVATARS.map((av, idx) => {
    const isSelected = selectedUrl === av || (!selectedUrl && idx === 0);
    return `
      <div class="avatar-option ${isSelected ? 'selected' : ''}" data-url="${av}" style="width: 56px; height: 56px; border-radius: var(--radius-full); overflow: hidden; border: 3px solid ${isSelected ? 'var(--primary)' : 'transparent'}; cursor: pointer; transition: all 0.2s;">
        <img src="${av}" alt="Bird avatar ${idx + 1}" style="width: 100%; height: 100%; object-fit: cover;"/>
      </div>
    `;
  }).join('');
  return `<div style="display: flex; gap: var(--space-md); flex-wrap: wrap;" id="${containerId}">${items}</div>`;
}

export function parseHashParams() {
  const hash = window.location.hash || '';
  const qIndex = hash.indexOf('?');
  if (qIndex === -1) return {};
  const params = new URLSearchParams(hash.substring(qIndex + 1));
  const result = {};
  for (const [k, v] of params.entries()) result[k] = v;
  return result;
}

export function getRouteBase() {
  const hash = window.location.hash || '#schedule';
  return hash.substring(1).split('?')[0];
}
