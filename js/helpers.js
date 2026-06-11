/**
 * Shared PolySchedule helpers
 */

import { normalizePronouns } from './pronouns.js';
import { DEFAULT_AVATARS, migrateAvatarUrl, isCustomAvatar } from './avatar.js';

export { DEFAULT_AVATARS, migrateAvatarUrl, isCustomAvatar };

export const LOGS_STORAGE_KEY = 'polyschedule_system_logs';
export const CREATE_NEW_HOME = '__create_new__';
export const RETURN_ADD_PARTNER_KEY = 'polyschedule_return_add_partner';
export const SELECT_HOME_KEY = 'polyschedule_select_home_id';
export const ADD_PARTNER_DRAFT_KEY = 'polyschedule_add_partner_draft';
export const LOCAL_SESSION_KEY = 'polyschedule_local_session';
export const GOOGLE_PROFILE_KEY = 'polyschedule_google_profile';
export const LEGACY_PROFILE_KEY = 'polyschedule_user_profile';
export const CHANGE_LOG_STORAGE_KEY = 'polyschedule_change_log';
export const NOTIFICATIONS_BY_USER_KEY = 'polyschedule_notifications_by_user';
export const LEGACY_NOTIFICATIONS_KEY = 'polyschedule_notifications';
export const LOCAL_CONFIG_KEY = 'polyschedule_local_config';
export const LOCAL_EVENTS_KEY = 'polyschedule_local_events';

export function partnerDisplayFirstName(name) {
  if (!name) return '';
  return String(name).split(' ')[0];
}

const APP_TIME_OPTS = { hour: 'numeric', minute: '2-digit', hour12: true };
const APP_DATETIME_OPTS = {
  month: 'short',
  day: 'numeric',
  year: 'numeric',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true
};

/** Locale time string with AM/PM (e.g. 3:45 PM). */
export function formatAppTime(date = new Date()) {
  return new Date(date).toLocaleTimeString(undefined, APP_TIME_OPTS);
}

/** Locale date + time with AM/PM. */
export function formatAppDateTime(date = new Date()) {
  return new Date(date).toLocaleString(undefined, APP_DATETIME_OPTS);
}

/** Parse YYYY-MM-DD as a local calendar date (avoids UTC midnight shifting the day). */
export function parseLocalDateString(dateStr, hours = 12, minutes = 0, seconds = 0, ms = 0) {
  if (!dateStr) return new Date(NaN);
  const match = String(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return new Date(dateStr);
  const [, y, m, d] = match.map(Number);
  return new Date(y, m - 1, d, hours, minutes, seconds, ms);
}

/** Format a Date as YYYY-MM-DD in local time. */
export function formatLocalDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Resolve a partner by stable id or legacy display-name reference.
 */
export function findPartnerByRef(config, ref) {
  if (!ref || !config?.partners) return null;
  const byId = getPartnerById(config, ref);
  if (byId) return byId;
  const text = String(ref);
  return config.partners.find(p => p.name === text)
    || config.partners.find(p => partnerDisplayFirstName(p.name) === partnerDisplayFirstName(text))
    || null;
}

/** True when two partner references point at the same config partner. */
export function partnerRefsMatch(config, refA, refB) {
  if (!refA || !refB) return false;
  if (refA === refB) return true;
  const a = findPartnerByRef(config, refA);
  const b = findPartnerByRef(config, refB);
  if (a && b) return a.id === b.id;
  return partnerDisplayFirstName(refA) === partnerDisplayFirstName(refB);
}

export function isPartnerPassive(partner) {
  return partner?.passive === true || !partner?.username;
}

export function isPartnerActive(partner) {
  return partner && !isPartnerPassive(partner);
}

/** Whether this partner can sign in with username and password. */
export function canPartnerLogin(partner) {
  return isPartnerActive(partner)
    && !!String(partner.username || '').trim()
    && !!String(partner.password || '').length;
}

/** True when the household has no login-capable partners yet. */
export function needsHouseholdSetup(config) {
  return !(config?.partners || []).some(canPartnerLogin);
}

/** Ensure household config has required top-level arrays. */
export function normalizeHouseholdConfigShape(config) {
  if (!config || typeof config !== 'object') {
    return { partners: [], residences: [] };
  }
  if (!Array.isArray(config.partners)) config.partners = [];
  if (!Array.isArray(config.residences)) config.residences = [];
  return config;
}

/**
 * Prefer the config that has household data or the higher sync revision.
 * @returns {{ config: object, source: 'local'|'remote'|'empty' }}
 */
export function pickNewerHouseholdConfig(local, remote) {
  const normalizedLocal = local
    ? normalizeHouseholdConfigShape(JSON.parse(JSON.stringify(local)))
    : null;
  const normalizedRemote = remote
    ? normalizeHouseholdConfigShape(JSON.parse(JSON.stringify(remote)))
    : null;

  if (!normalizedLocal && !normalizedRemote) {
    return { config: { partners: [], residences: [] }, source: 'empty' };
  }
  if (!normalizedLocal) return { config: normalizedRemote, source: 'remote' };
  if (!normalizedRemote) return { config: normalizedLocal, source: 'local' };

  const localHasUsers = normalizedLocal.partners.some(canPartnerLogin);
  const remoteHasUsers = normalizedRemote.partners.some(canPartnerLogin);
  if (localHasUsers && !remoteHasUsers) {
    return { config: normalizedLocal, source: 'local' };
  }
  if (remoteHasUsers && !localHasUsers) {
    return { config: normalizedRemote, source: 'remote' };
  }

  const localRev = normalizedLocal.syncRevision || 0;
  const remoteRev = normalizedRemote.syncRevision || 0;
  if (localRev !== remoteRev) {
    return localRev > remoteRev
      ? { config: normalizedLocal, source: 'local' }
      : { config: normalizedRemote, source: 'remote' };
  }

  const localScore = normalizedLocal.partners.length + normalizedLocal.residences.length;
  const remoteScore = normalizedRemote.partners.length + normalizedRemote.residences.length;
  return localScore >= remoteScore
    ? { config: normalizedLocal, source: 'local' }
    : { config: normalizedRemote, source: 'remote' };
}

export function getPartnerById(config, partnerId) {
  if (!partnerId || !config?.partners) return null;
  return config.partners.find(p => p.id === partnerId) || null;
}

/**
 * When a home's associated people list changes, sync partner defaultHome values.
 */
export function applyHomeAssociationDefaults(config, homeId, associatedPeople = []) {
  if (!config?.partners || !homeId) return false;

  const associatedSet = new Set(associatedPeople || []);
  let changed = false;

  config.partners.forEach(partner => {
    const isAssociated = associatedSet.has(partner.name);
    if (isAssociated && partner.defaultHome !== homeId) {
      partner.defaultHome = homeId;
      changed = true;
    } else if (!isAssociated && partner.defaultHome === homeId) {
      partner.defaultHome = '';
      changed = true;
    }
  });

  return changed;
}

/** Apply associatedPeople from every residence to partner defaultHome (e.g. on config load). */
export function syncAllHomeAssociationDefaults(config) {
  if (!config?.residences?.length) return false;
  let changed = false;
  config.residences.forEach(home => {
    if (applyHomeAssociationDefaults(config, home.id, home.associatedPeople || [])) {
      changed = true;
    }
  });
  return changed;
}

export function getCurrentUserPartner(config, currentUser) {
  if (!currentUser) return null;
  return getPartnerById(config, currentUser.id)
    || config?.partners?.find(p => p.name === currentUser.name)
    || null;
}

export function hasSleepingPartnerConnections(partner) {
  return !!(partner?.rules?.partnerLimits && Object.keys(partner.rules.partnerLimits).length > 0);
}

/** Admins may propose sleeping arrangements; others need sleeping partner rules configured. */
export function canCreateSleepingProposals(config, currentUser) {
  const partner = getCurrentUserPartner(config, currentUser);
  if (partner?.role === 'Admin') return true;
  return hasSleepingPartnerConnections(partner);
}

/** Non-admins must be included in sleeping proposal invitees. */
export function mustIncludeCurrentUserInSleepingProposal(config, currentUser) {
  const partner = getCurrentUserPartner(config, currentUser);
  return partner?.role !== 'Admin';
}

/** Keep the signed-in partner first in invitee pickers. */
export function sortPartnersWithCurrentUserFirst(partners, config, currentUser) {
  const list = [...(partners || [])];
  const current = getCurrentUserPartner(config, currentUser);
  if (!current) return list;
  const idx = list.findIndex(p => p.id === current.id);
  if (idx <= 0) return list;
  const [me] = list.splice(idx, 1);
  return [me, ...list];
}

/**
 * Restore seed sleeping rules when a partner profile lost its connections.
 * Returns true when config was modified.
 */
export function normalizeConfigPartners(config, defaultConfig) {
  if (!config?.partners || !defaultConfig?.partners) return false;

  let changed = false;

  const beforeCount = config.partners.length;
  config.partners = (config.partners || []).filter((partner) =>
    partner.name !== 'Guest User' && partner.username !== 'guest'
  );
  if (config.partners.length !== beforeCount) changed = true;

  defaultConfig.partners.forEach(defaultPartner => {
    const partner = config.partners.find(p => p.id === defaultPartner.id);
    if (!partner) return;

    partner.rules = partner.rules || {};
    const savedLimits = partner.rules.partnerLimits || {};
    const defaultLimits = defaultPartner.rules?.partnerLimits || {};

    if (Object.keys(defaultLimits).length > 0 && Object.keys(savedLimits).length === 0) {
      partner.rules.partnerLimits = JSON.parse(JSON.stringify(defaultLimits));
      changed = true;
    }

    if (partner.rules.minSoloNights === undefined && defaultPartner.rules?.minSoloNights !== undefined) {
      partner.rules.minSoloNights = defaultPartner.rules.minSoloNights;
      changed = true;
    }
  });

  config.partners.forEach((partner, index) => {
    if (!partner.pronouns) {
      const seedPartner = defaultConfig.partners.find((p) => p.id === partner.id);
      partner.pronouns = seedPartner?.pronouns
        ? JSON.parse(JSON.stringify(seedPartner.pronouns))
        : normalizePronouns(null);
      changed = true;
    }

    const seedPartner = defaultConfig.partners.find((p) => p.id === partner.id);
    const fallbackIndex = seedPartner
      ? defaultConfig.partners.indexOf(seedPartner)
      : index;
    const migratedAvatar = migrateAvatarUrl(partner.avatar, fallbackIndex);
    if (migratedAvatar !== partner.avatar) {
      partner.avatar = migratedAvatar;
      changed = true;
    }
  });

  return changed;
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

/**
 * Propagate a partner display-name change across config and events.
 */
export function renamePartnerReferences(config, events, oldName, newName) {
  if (!oldName || !newName || oldName === newName) return;

  (config?.partners || []).forEach(partner => {
    if (partner.rules?.partnerLimits?.[oldName]) {
      partner.rules.partnerLimits[newName] = partner.rules.partnerLimits[oldName];
      delete partner.rules.partnerLimits[oldName];
    }
  });

  (config?.residences || []).forEach(home => {
    if (Array.isArray(home.associatedPeople)) {
      home.associatedPeople = home.associatedPeople.map(n => n === oldName ? newName : n);
    }
  });

  (events || []).forEach(event => {
    if (event.proposer === oldName) event.proposer = newName;

    if (Array.isArray(event.participants)) {
      event.participants = event.participants.map(p => p === oldName ? newName : p);
    }

    if (event.responses?.[oldName]) {
      event.responses[newName] = event.responses[oldName];
      delete event.responses[oldName];
    }

    if (event.type === 'batch_sleeping' && Array.isArray(event.batchNights)) {
      event.batchNights.forEach(night => {
        (night.assignments || []).forEach(assign => {
          assign.participants = (assign.participants || []).map(p => p === oldName ? newName : p);
        });
      });
    }
  });
}

export { getProposalOutcome } from './proposal-workflow.js';

export function responseStatusLabel(status) {
  if (status === 'accept') return 'Approved';
  if (status === 'reject') return 'Rejected';
  if (status === 'abstain') return 'Abstained';
  return 'Awaiting';
}

export function defaultBatchNight(config) {
  const assign = defaultBatchAssignment(config);
  return {
    assignments: [{
      ...assign,
      participants: [...(assign.participants || [])]
    }]
  };
}

export function cloneBatchNight(night) {
  const source = night?.assignments
    ? night
    : { assignments: [{ ...night, participants: [...(night.participants || [])] }] };
  return {
    assignments: (source.assignments || []).map(a => ({
      homeId: a.homeId,
      roomId: a.roomId,
      homeName: a.homeName,
      roomName: a.roomName,
      participants: [...(a.participants || [])]
    }))
  };
}

export function normalizeBatchNight(night, config) {
  if (night?.assignments?.length) return cloneBatchNight(night);
  if (night?.homeId) {
    return { assignments: [{ ...night, participants: [...(night.participants || [])] }] };
  }
  return defaultBatchNight(config);
}

/**
 * Remove a partner from config references and events.
 */
export function removePartnerReferences(config, events, partnerId, partnerName) {
  if (!partnerName) return;

  const nameFirst = partnerName.split(' ')[0];

  (config?.partners || []).forEach(partner => {
    if (partner.id === partnerId) return;
    if (partner.rules?.partnerLimits) {
      Object.keys(partner.rules.partnerLimits).forEach(key => {
        if (key === partnerName || key.split(' ')[0] === nameFirst) {
          delete partner.rules.partnerLimits[key];
        }
      });
    }
  });

  (config?.residences || []).forEach(home => {
    if (Array.isArray(home.associatedPeople)) {
      home.associatedPeople = home.associatedPeople.filter(n =>
        n !== partnerName && n.split(' ')[0] !== nameFirst
      );
    }
  });

  (events || []).forEach(event => {
    if (event.proposer === partnerName) {
      event.proposer = '(removed)';
    }

    if (Array.isArray(event.participants)) {
      event.participants = event.participants.filter(p =>
        p !== partnerName && p.split(' ')[0] !== nameFirst
      );
    }

    if (event.responses) {
      delete event.responses[partnerName];
      Object.keys(event.responses).forEach(key => {
        if (key.split(' ')[0] === nameFirst) delete event.responses[key];
      });
    }

    if (event.type === 'batch_sleeping' && Array.isArray(event.batchNights)) {
      event.batchNights.forEach(night => {
        (night.assignments || []).forEach(assign => {
          assign.participants = (assign.participants || []).filter(p =>
            p !== partnerName && p.split(' ')[0] !== nameFirst
          );
        });
      });
    }
  });
}

/**
 * Clear home references before removing a residence.
 */
export function removeHomeReferences(config, events, homeId) {
  (config?.partners || []).forEach(partner => {
    if (partner.defaultHome === homeId) partner.defaultHome = '';
  });

  (config?.residences || []).forEach(home => {
    if (home.id === homeId) return;
    if (Array.isArray(home.associatedPeople)) {
      home.associatedPeople = home.associatedPeople.filter(() => true);
    }
  });

  (events || []).forEach(event => {
    if (event.homeId === homeId) {
      event.homeName = event.homeName ? `${event.homeName} (removed)` : '(removed home)';
    }
    if (event.type === 'batch_sleeping' && Array.isArray(event.batchNights)) {
      event.batchNights.forEach(night => {
        (night.assignments || []).forEach(assign => {
          if (assign.homeId === homeId) {
            assign.homeName = assign.homeName ? `${assign.homeName} (removed)` : '(removed home)';
          }
        });
      });
    }
  });
}

export function defaultBatchAssignment(config) {
  const home = config?.residences?.[0];
  if (!home) {
    return { homeId: '', roomId: '', homeName: '', roomName: '', participants: [] };
  }
  let roomId = 'r1';
  let roomName = 'Bedroom 1';
  if (home.bedroomDetails?.length) {
    roomId = home.bedroomDetails[0].id;
    roomName = home.bedroomDetails[0].name;
  }
  return {
    homeId: home.id,
    roomId,
    homeName: home.name,
    roomName,
    participants: []
  };
}

export function getBedroomOptionsForHome(home) {
  if (!home) return [];
  if (home.bedroomDetails?.length) {
    return home.bedroomDetails.map(r => ({ id: r.id, name: r.name }));
  }
  const count = home.bedrooms || 1;
  return Array.from({ length: count }, (_, i) => ({
    id: `r${i + 1}`,
    name: `Bedroom ${i + 1}`
  }));
}

export function nightAssignmentToSleepingEvent(nightDate, assign, id = 'temp') {
  const start = parseLocalDateString(nightDate, 22, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  end.setHours(8, 0, 0, 0);
  return {
    id,
    type: 'sleeping',
    start: start.toISOString(),
    end: end.toISOString(),
    homeId: assign.homeId,
    roomId: assign.roomId,
    homeName: assign.homeName,
    roomName: assign.roomName,
    participants: assign.participants || [],
    status: 'pending'
  };
}

export function batchProposalToSleepingEvents(batchProposal) {
  const events = [];
  (batchProposal.batchNights || []).forEach((night, nightIdx) => {
    (night.assignments || []).forEach((assign, assignIdx) => {
      events.push(nightAssignmentToSleepingEvent(
        night.date,
        assign,
        `${batchProposal.id || 'batch'}_${nightIdx}_${assignIdx}`
      ));
    });
  });
  return events;
}

export function expandBatchSleepingToEvents(batchProposal) {
  const events = [];
  (batchProposal.batchNights || []).forEach((night, nightIdx) => {
    (night.assignments || []).forEach((assign, assignIdx) => {
      const sleeping = nightAssignmentToSleepingEvent(
        night.date,
        assign,
        `e_${batchProposal.id}_${nightIdx}_${assignIdx}`
      );
      sleeping.status = 'confirmed';
      sleeping.title = `SLEEP: ${assign.roomName}: ${(assign.participants || []).join(' & ')}`;
      events.push(sleeping);
    });
  });
  return events;
}

/** Remove duplicate confirmed sleeping events created by repeated batch approvals. */
export function sleepingEventFingerprint(event) {
  if (event.type !== 'sleeping') return null;
  const day = new Date(event.start).toISOString().slice(0, 10);
  const participants = [...(event.participants || [])].sort().join('|');
  return `${day}|${event.homeId || ''}|${event.roomId || ''}|${participants}|${event.title || ''}`;
}

export function dedupeDuplicateSleepingEvents(events) {
  const removeIds = new Set();
  const seen = new Map();

  (events || []).forEach(event => {
    const fp = sleepingEventFingerprint(event);
    if (!fp) return;
    if (seen.has(fp)) {
      removeIds.add(event.id);
    } else {
      seen.set(fp, event.id);
    }
  });

  return {
    events: (events || []).filter(event => !removeIds.has(event.id)),
    removedIds: [...removeIds]
  };
}

export function reconcileBatchExpandedIds(events) {
  (events || []).forEach(event => {
    if (event.type !== 'batch_sleeping' || !Array.isArray(event.expandedEventIds)) return;
    event.expandedEventIds = event.expandedEventIds.filter(id =>
      events.some(e => e.id === id)
    );
  });
  return events;
}

export function renderBatchNightsReviewHtml(batchNights = []) {
  if (!batchNights?.length) return '';

  const nightsHtml = batchNights.map((night, index) => {
    const dateLabel = new Date(`${night.date}T12:00:00`).toLocaleDateString(undefined, {
      weekday: 'short',
      month: 'short',
      day: 'numeric'
    });
    const assignmentRows = (night.assignments || []).map(assign => {
      const people = (assign.participants || []).map(partnerDisplayFirstName).join(', ') || 'No one assigned';
      const location = `${assign.homeName || 'Home'} · ${assign.roomName || 'Room'}`;
      return `<li>${location} — ${people}</li>`;
    }).join('');

    return `
      <div style="padding: var(--space-xs) 0;${index < batchNights.length - 1 ? ' border-bottom: 1px solid var(--outline-variant);' : ''}">
        <div class="font-label-md" style="font-weight: 600; margin-bottom: 4px;">Night ${index + 1} · ${dateLabel}</div>
        <ul style="margin: 0; padding-left: 1.25rem; color: var(--on-surface); font-size: 0.85rem; line-height: 1.5;">
          ${assignmentRows || '<li>No room assignments</li>'}
        </ul>
      </div>
    `;
  }).join('');

  return `
    <div class="batch-proposal-nights" style="margin-top: var(--space-sm); padding: var(--space-sm) var(--space-md); background: var(--surface-container-high); border-radius: var(--radius-default);">
      <div class="font-label-sm" style="color: var(--on-surface-variant); margin-bottom: var(--space-xs); letter-spacing: 0.04em;">NIGHT-BY-NIGHT PLAN</div>
      ${nightsHtml}
    </div>
  `;
}

export function buildBatchNightsPayload(startDateStr, nightCount, nightAssignments, config = {}) {
  const start = parseLocalDateString(startDateStr, 22, 0, 0, 0);
  const batchNights = [];
  for (let i = 0; i < nightCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = formatLocalDateString(d);
    const night = normalizeBatchNight(nightAssignments[i], config);
    const assignments = (night.assignments || [])
      .filter(a => (a.participants || []).length > 0)
      .map(a => ({
        homeId: a.homeId,
        roomId: a.roomId,
        homeName: a.homeName,
        roomName: a.roomName,
        participants: [...(a.participants || [])]
      }));
    batchNights.push({ date: dateStr, assignments });
  }
  const end = new Date(start);
  end.setDate(start.getDate() + nightCount);
  end.setHours(8, 0, 0, 0);
  return { batchNights, start: start.toISOString(), end: end.toISOString() };
}

export { renderAvatarPickerHtml } from './avatar.js';

export function formatPersonConflictNotice(conflicts = []) {
  if (!conflicts?.length) return '';
  if (conflicts.length === 1) return `<p>${conflicts[0].message}</p>`;
  return `<ul class="banner-alert-list">${conflicts.map(c => `<li>${c.message}</li>`).join('')}</ul>`;
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
