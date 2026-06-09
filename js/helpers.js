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

export function isPartnerPassive(partner) {
  return partner?.passive === true || !partner?.username;
}

export function isPartnerActive(partner) {
  return partner && !isPartnerPassive(partner);
}

export function renderHomeSelectOptions(residences, selectedId = '') {
  const options = (residences || []).map(h =>
    `<option value="${h.id}" ${h.id === selectedId ? 'selected' : ''}>${h.name}</option>`
  ).join('');
  return `${options}<option value="${CREATE_NEW_HOME}">+ Create New Home</option>`;
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
