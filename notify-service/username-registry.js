import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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
}

function loadHouseholdsDoc() {
  return readJson(HOUSEHOLDS_PATH, { households: {} });
}

function isSameOwner(entry, householdId, partnerId) {
  return entry?.householdId === householdId && entry?.partnerId === partnerId;
}

function scanHouseholdCachesForUsername(normalized, { excludeHouseholdId = null, excludePartnerId = null } = {}) {
  const doc = loadHouseholdsDoc();
  for (const [householdId, household] of Object.entries(doc.households || {})) {
    for (const partner of household?.config?.partners || []) {
      if (partner?.passive || !partner?.username) continue;
      if (normalizeUsername(partner.username) !== normalized) continue;
      if (excludeHouseholdId && excludePartnerId
        && householdId === excludeHouseholdId
        && partner.id === excludePartnerId) {
        continue;
      }
      return { taken: true, householdId, partnerId: partner.id, source: 'cache' };
    }
  }
  return { taken: false };
}

export function isUsernameTaken(username, { excludeHouseholdId = null, excludePartnerId = null } = {}) {
  const normalized = normalizeUsername(username);
  if (!normalized) return { taken: false, normalized };

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
  if (!normalized || !householdId || !partnerId) {
    throw new Error('username, householdId, and partnerId are required');
  }

  const existing = isUsernameTaken(username, { excludeHouseholdId: householdId, excludePartnerId: partnerId });
  if (existing.taken) {
    const err = new Error('Username is already in use by another household.');
    err.code = 'USERNAME_TAKEN';
    throw err;
  }

  const doc = loadUsernamesDoc();
  doc.usernames[normalized] = {
    householdId,
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
      const err = new Error(`Username "${normalized}" is already registered to another household.`);
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
