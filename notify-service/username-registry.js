import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { getFixedHouseholdId } from './fixed-household.js';
import {
  isDatabaseEnabled,
  writeUsernameRegistryToDatabase
} from './household-db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const USERNAMES_PATH = path.join(DATA_DIR, 'usernames.json');
const HOUSEHOLDS_PATH = path.join(DATA_DIR, 'households.json');

function readJson(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fallback;
  }
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(value, null, 2));
}

export function normalizeUsername(username) {
  return String(username || '').trim().toLowerCase();
}

function loadUsernamesDoc() {
  return readJson(USERNAMES_PATH, { usernames: {} });
}

function saveUsernamesDoc(doc) {
  writeJson(USERNAMES_PATH, doc);
  if (isDatabaseEnabled()) {
    void writeUsernameRegistryToDatabase(doc.usernames || {});
  }
}

function loadHouseholdsDoc() {
  return readJson(HOUSEHOLDS_PATH, { households: {} });
}

function isSameOwner(entry, householdId, partnerId) {
  return entry?.householdId === householdId && entry?.partnerId === partnerId;
}

function scanHouseholdCachesForUsername(normalized, { excludeHouseholdId = null, excludePartnerId = null, householdId = null } = {}) {
  const doc = loadHouseholdsDoc();
  const entries = householdId
    ? [[householdId, doc.households?.[householdId]]].filter(([, row]) => row)
    : Object.entries(doc.households || {});
  for (const [hid, household] of entries) {
    for (const partner of household?.config?.partners || []) {
      if (partner?.passive || !partner?.username) continue;
      if (normalizeUsername(partner.username) !== normalized) continue;
      if (excludeHouseholdId && excludePartnerId
        && hid === excludeHouseholdId
        && partner.id === excludePartnerId) {
        continue;
      }
      return { taken: true, householdId: hid, partnerId: partner.id, source: 'cache' };
    }
  }
  return { taken: false };
}

export function isUsernameTaken(username, { excludeHouseholdId = null, excludePartnerId = null } = {}) {
  const normalized = normalizeUsername(username);
  if (!normalized) return { taken: false, normalized };

  const fixedHouseholdId = getFixedHouseholdId();
  if (fixedHouseholdId) {
    const cacheHit = scanHouseholdCachesForUsername(normalized, {
      excludeHouseholdId,
      excludePartnerId,
      householdId: fixedHouseholdId
    });
    if (cacheHit.taken) return { ...cacheHit, normalized };
    return { taken: false, normalized };
  }

  const doc = loadUsernamesDoc();
  const entry = doc.usernames[normalized];
  if (entry && !isSameOwner(entry, excludeHouseholdId, excludePartnerId)) {
    return { taken: true, householdId: entry.householdId, partnerId: entry.partnerId, source: 'registry' };
  }

  const cacheHit = scanHouseholdCachesForUsername(normalized, { excludeHouseholdId, excludePartnerId });
  if (cacheHit.taken) return { ...cacheHit, normalized };

  return { taken: false, normalized };
}

export function claimUsername(username, householdId, partnerId) {
  const normalized = normalizeUsername(username);
  const fixedHouseholdId = getFixedHouseholdId();
  const targetHouseholdId = fixedHouseholdId || householdId;
  if (!normalized || !targetHouseholdId || !partnerId) {
    throw new Error('username, householdId, and partnerId are required');
  }

  const existing = isUsernameTaken(username, {
    excludeHouseholdId: targetHouseholdId,
    excludePartnerId: partnerId
  });
  if (existing.taken) {
    const err = new Error('Username is already in use by another partner.');
    err.code = 'USERNAME_TAKEN';
    throw err;
  }

  const doc = loadUsernamesDoc();
  doc.usernames[normalized] = {
    householdId: targetHouseholdId,
    partnerId,
    updatedAt: new Date().toISOString()
  };
  saveUsernamesDoc(doc);
  return doc.usernames[normalized];
}

export function releaseUsername(username, householdId, partnerId) {
  const normalized = normalizeUsername(username);
  if (!normalized) return false;

  const doc = loadUsernamesDoc();
  const entry = doc.usernames[normalized];
  if (!entry) return false;
  if (householdId && partnerId && !isSameOwner(entry, householdId, partnerId)) return false;

  delete doc.usernames[normalized];
  saveUsernamesDoc(doc);
  return true;
}

export function listRegisteredUsernames({ householdId = null } = {}) {
  const doc = loadUsernamesDoc();
  return Object.entries(doc.usernames || {})
    .filter(([, entry]) => !householdId || entry.householdId === householdId)
    .map(([username, entry]) => ({
      username,
      householdId: entry.householdId,
      partnerId: entry.partnerId,
      updatedAt: entry.updatedAt || null
    }));
}

export function syncHouseholdUsernames(householdId, config) {
  if (!householdId || !config) return;

  const doc = loadUsernamesDoc();
  const desired = new Map();

  for (const partner of config.partners || []) {
    if (partner?.passive || !partner?.username || !partner?.id) continue;
    desired.set(normalizeUsername(partner.username), partner.id);
  }

  for (const [normalized, entry] of Object.entries(doc.usernames)) {
    if (entry.householdId !== householdId) continue;
    if (!desired.has(normalized) || desired.get(normalized) !== entry.partnerId) {
      delete doc.usernames[normalized];
    }
  }

  for (const [normalized, partnerId] of desired.entries()) {
    const existing = doc.usernames[normalized];
    if (existing && !isSameOwner(existing, householdId, partnerId)) {
      const err = new Error(`Username "${normalized}" is already registered to another partner.`);
      err.code = 'USERNAME_CONFLICT';
      throw err;
    }
    doc.usernames[normalized] = {
      householdId,
      partnerId,
      updatedAt: new Date().toISOString()
    };
  }

  saveUsernamesDoc(doc);
}
