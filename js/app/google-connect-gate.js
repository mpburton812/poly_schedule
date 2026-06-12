import { AuthManager } from '../auth.js';
import { Views } from '../views.js';
import { isGoogleCalendarReady, setCalendarStatus } from '../calendar-status.js';
import { showToast } from './toast.js';

let gateActive = false;

export function isGoogleGateActive() {
  return gateActive;
}

export function needsGoogleCalendarConnect() {
  return !isGoogleCalendarReady();
}

export function showGoogleConnectGate() {
  gateActive = true;
  const container = document.getElementById('app-view-container');
  if (!container) return;
  container.innerHTML = Views.googleConnectGate();
  bindGoogleConnectGateEvents();
}

export function dismissGoogleConnectGate() {
  gateActive = false;
}

function bindGoogleConnectGateEvents() {
  document.getElementById('btn-google-connect-gate')?.addEventListener('click', () => {
    try {
      setCalendarStatus('connecting');
      AuthManager.login();
    } catch (err) {
      setCalendarStatus('disconnected');
      showToast(err.message || 'Could not start Google sign-in.', 'error');
    }
  });

  document.getElementById('btn-google-gate-logout')?.addEventListener('click', () => {
    dismissGoogleConnectGate();
    import('./session.js').then(({ logoutUser }) => logoutUser());
  });
}
