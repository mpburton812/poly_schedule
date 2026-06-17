import { CalendarSync } from '../calendar.js';
import { Views } from '../views.js';
import { ensureGoogleCredentialsFromConfig, isGoogleIntegrationServerManaged } from '../google-integration.js';
import { hasGoogleIntegrationCredentials, isGoogleCalendarReady, setCalendarStatus } from '../calendar-status.js';
import { state, flowState } from './state.js';
import { isAdmin, hasAdminSessionAccess } from './session.js';
import { showToast } from './toast.js';
import { getCurrentUserPartner } from '../helpers.js';
import { beginPartnerGoogleConnect, isGoogleSessionValidForPartner } from '../google-partner-session.js';

let gateActive = false;

export function isGoogleGateActive() {
  return gateActive;
}

export function needsGoogleCalendarConnect() {
  if (typeof window !== 'undefined' && window.__POLYSCHEDULE_E2E__) {
    return false;
  }
  if (!isGoogleCalendarReady()) return true;
  const partner = getCurrentUserPartner(state.config, state.currentUser);
  if (partner && !isGoogleSessionValidForPartner(partner)) {
    return true;
  }
  return false;
}

export function canBypassGoogleConnectGate(view) {
  if (view === 'settings') return true;
  return view === 'admin' && hasAdminSessionAccess();
}

export function prepareGoogleConnectGate() {
  ensureGoogleCredentialsFromConfig(state.config, { CalendarSync });
  return hasGoogleIntegrationCredentials();
}

export function showGoogleConnectGate() {
  gateActive = true;
  const container = document.getElementById('app-view-container');
  if (!container) return;

  const credentialsReady = prepareGoogleConnectGate();
  container.innerHTML = Views.googleConnectGate({
    credentialsReady,
    isAdminUser: hasAdminSessionAccess(),
    serverManagedGoogle: isGoogleIntegrationServerManaged()
  });
  bindGoogleConnectGateEvents();
}

export function dismissGoogleConnectGate() {
  gateActive = false;
}

function bindGoogleConnectGateEvents() {
  document.getElementById('btn-google-connect-gate')?.addEventListener('click', () => {
    try {
      prepareGoogleConnectGate();
      setCalendarStatus('connecting');
      const partner = getCurrentUserPartner(state.config, state.currentUser);
      beginPartnerGoogleConnect(partner);
    } catch (err) {
      setCalendarStatus('disconnected');
      showToast(err.message || 'Could not start Google sign-in.', 'error');
    }
  });

  document.getElementById('btn-retry-server-google-config')?.addEventListener('click', () => {
    void (async () => {
      const { bootstrapServerGoogleIntegration } = await import('../notify-public-config.js');
      await bootstrapServerGoogleIntegration({ CalendarSync, force: true });
      showGoogleConnectGate();
    })();
  });

  document.getElementById('btn-open-admin-google-setup')?.addEventListener('click', () => {
    dismissGoogleConnectGate();
    flowState.adminFocusSection = 'google';
    window.location.hash = '#admin';
    import('./router.js').then(({ router }) => router());
  });

  document.getElementById('btn-google-gate-logout')?.addEventListener('click', () => {
    dismissGoogleConnectGate();
    import('./session.js').then(({ logoutUser }) => logoutUser());
  });
}
