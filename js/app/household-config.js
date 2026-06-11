import { state } from './state.js';
import { CalendarSync } from '../calendar.js';
import { hashPassword } from '../crypto.js';
import { normalizePronouns } from '../pronouns.js';
import { logUserAction } from './operation-log.js';
import { showToast } from './toast.js';
import { establishSession } from './session.js';

export async function persistHouseholdConfig(logMessage) {
  try {
    const result = await CalendarSync.saveConfig(state.config);
    state.config = CalendarSync.config;
    if (logMessage) logUserAction(logMessage, 'info');
    return result;
  } catch (err) {
    showToast(\`Failed to save changes: \${err.message}\`, 'error');
    throw err;
  }
}

export function saveConfig(logMessage) {
  void persistHouseholdConfig(logMessage).catch(() => {});
}

export async function updatePartnerProfile(partnerId, updates) {
  const partner = state.config?.partners?.find((p) => p.id === partnerId);
  if (!partner) return false;

  const oldName = partner.name;
  if (updates.name && updates.name !== oldName) {
    CalendarSync.renamePartnerInEvents(oldName, updates.name);
  }

  if (updates.name !== undefined) partner.name = updates.name;
  if (updates.avatar !== undefined) partner.avatar = updates.avatar;
  if (updates.username !== undefined) partner.username = updates.username;
  if (updates.password !== undefined && updates.password !== '') {
    partner.passwordHash = await hashPassword(updates.password, partnerId);
    delete partner.password;
  }
  if (updates.pronouns !== undefined) partner.pronouns = normalizePronouns(updates.pronouns);
  if (updates.notificationEmail !== undefined) {
    partner.notificationEmail = String(updates.notificationEmail || '').trim();
  }

  await persistHouseholdConfig(\`Updated profile for \${partner.name}\`);

  if (state.currentUser?.id === partnerId) {
    establishSession(partner);
  }

  state.events = CalendarSync.events;
  import('./render-bus.js').then(({ requestRender }) => requestRender());
  return true;
}
