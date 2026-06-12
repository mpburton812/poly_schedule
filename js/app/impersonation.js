import { state, resetCreateFlowForUserSwitch } from './state.js';
import { isPartnerPassive } from '../helpers.js';
import { establishSession, isAdmin, isLoggedIn } from './session.js';
import { showToast } from './toast.js';
import { addLog } from './operation-log.js';

export function updateImpersonationBanner() {
  const banner = document.getElementById('impersonation-banner');
  const select = document.getElementById('impersonation-select');
  if (!banner || !select) return;

  if (!isLoggedIn() || !isAdmin()) {
    banner.style.display = 'none';
    return;
  }

  const activePartners = (state.config?.partners || []).filter(p => !isPartnerPassive(p));
  select.innerHTML = activePartners.map(p =>
    `<option value="${p.id}" ${p.id === state.currentUser?.id ? 'selected' : ''}>${p.name}</option>`
  ).join('');
  banner.style.display = 'flex';
}

export function impersonatePartner(partnerId) {
  const partner = state.config?.partners?.find(p => p.id === partnerId && !isPartnerPassive(p));
  if (!partner) return;
  if (partner.id === state.currentUser?.id) return;

  const actorName = state.currentUser?.name || 'Admin';
  resetCreateFlowForUserSwitch();
  establishSession(partner);
  addLog(`${actorName}: Impersonating user "${partner.name}".`, 'warning');
  showToast(`Viewing as ${partner.name.split(' ')[0]}`, 'info');
  
  import('./render-bus.js').then(({ requestRender }) => requestRender());
}

export function bindImpersonationBanner() {
  const select = document.getElementById('impersonation-select');
  if (!select || select.dataset.bound) return;
  select.dataset.bound = '1';
  select.addEventListener('change', () => {
    impersonatePartner(select.value);
  });
}
