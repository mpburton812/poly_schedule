import { state, resetCreateFlowForUserSwitch } from './state.js';
import { isPartnerPassive } from '../helpers.js';
import {
  establishSession,
  hasAdminSessionAccess,
  isAdmin,
  isLoggedIn,
  restoreImpersonatorFromSession
} from './session.js';
import { showToast } from './toast.js';
import { logUserAction } from './operation-log.js';

export function updateImpersonationBanner() {
  const banner = document.getElementById('impersonation-banner');
  const select = document.getElementById('impersonation-select');
  if (!banner || !select) return;

  if (!isLoggedIn() || !hasAdminSessionAccess()) {
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

  const actorName = state.currentUser?.name || 'Admin';
  const returningToImpersonator = state.impersonatorId && partner.id === state.impersonatorId;
  const stayingAsSelf = !state.impersonatorId && partner.id === state.currentUser?.id;

  if (stayingAsSelf) return;

  if (returningToImpersonator) {
    state.impersonatorId = null;
  } else if (isAdmin() && !state.impersonatorId) {
    state.impersonatorId = state.currentUser.id;
  }

  resetCreateFlowForUserSwitch();
  establishSession(partner);
  logUserAction(`Impersonating user "${partner.name}".`, 'warning', actorName);
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
