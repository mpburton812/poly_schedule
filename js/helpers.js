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
export const LOCAL_SESSION_KEY = 'polyschedule_local_session';
export const GOOGLE_PROFILE_KEY = 'polyschedule_google_profile';
export const LEGACY_PROFILE_KEY = 'polyschedule_user_profile';
export const SEED_REFRESH_NOTICE_KEY = 'polyschedule_seed_refreshed';
export const CHANGE_LOG_STORAGE_KEY = 'polyschedule_change_log';

export function partnerDisplayFirstName(name) {
  if (!name) return '';
  return String(name).split(' ')[0];
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

/**
 * Restore seed sleeping rules when a partner profile lost its connections.
 * Returns true when config was modified.
 */
export function normalizeConfigPartners(config, defaultConfig) {
  if (!config?.partners || !defaultConfig?.partners) return false;

  let changed = false;
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
  const start = new Date(nightDate);
  start.setHours(22, 0, 0, 0);
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

export function buildBatchNightsPayload(startDateStr, nightCount, nightAssignments, config = {}) {
  const start = new Date(startDateStr);
  const batchNights = [];
  for (let i = 0; i < nightCount; i++) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    const dateStr = d.toISOString().split('T')[0];
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
  start.setHours(22, 0, 0, 0);
  return { batchNights, start: start.toISOString(), end: end.toISOString() };
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
