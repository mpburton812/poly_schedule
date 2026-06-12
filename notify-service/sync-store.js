import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { mergePartnerAuthFields } from './partner-auth-merge.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const HOUSEHOLDS_PATH = path.join(DATA_DIR, 'households.json');
const REGISTRY_PATH = path.join(DATA_DIR, 'sync-devices.json');

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

function loadHouseholdsDoc() {
  return readJson(HOUSEHOLDS_PATH, { households: {} });
}

function saveHouseholdsDoc(doc) {
  writeJson(HOUSEHOLDS_PATH, doc);
}

export function getHousehold(householdId) {
  if (!householdId) return null;
  const doc = loadHouseholdsDoc();
  return doc.households[householdId] || null;
}

export function upsertHouseholdCache(householdId, { revision, config, events, actorPartnerId = null }) {
  if (!householdId) return null;
  const doc = loadHouseholdsDoc();
  const prev = doc.households[householdId] || {};
  let nextConfig = config !== undefined ? config : prev.config ?? null;
  if (config !== undefined && prev.config) {
    nextConfig = mergePartnerAuthFields(
      JSON.parse(JSON.stringify(config)),
      prev.config
    );
  }
  const next = {
    revision: revision ?? prev.revision ?? 0,
    updatedAt: new Date().toISOString(),
    lastActorPartnerId: actorPartnerId || prev.lastActorPartnerId || null,
    config: nextConfig,
    events: events !== undefined ? events : prev.events ?? null
  };
  doc.households[householdId] = next;
  saveHouseholdsDoc(doc);
  return next;
}

export function bumpHouseholdRevision(householdId, { actorPartnerId = null, scopes = [] } = {}) {
  const prev = getHousehold(householdId) || { revision: 0 };
  const revision = (prev.revision || 0) + 1;
  const next = upsertHouseholdCache(householdId, {
    revision,
    config: prev.config,
    events: prev.events,
    actorPartnerId
  });
  return { ...next, scopes };
}

function loadRegistryDoc() {
  return readJson(REGISTRY_PATH, { devices: [] });
}

function saveRegistryDoc(doc) {
  writeJson(REGISTRY_PATH, doc);
}

export function registerSyncDevice({
  householdId,
  partnerId,
  deviceId,
  userAgent = ''
}) {
  if (!householdId || !partnerId || !deviceId) return null;
  const doc = loadRegistryDoc();
  const idx = doc.devices.findIndex(d => d.deviceId === deviceId);
  const row = {
    householdId,
    partnerId,
    deviceId,
    userAgent,
    updatedAt: new Date().toISOString()
  };
  if (idx >= 0) doc.devices[idx] = row;
  else doc.devices.push(row);
  saveRegistryDoc(doc);
  return row;
}

export function listHouseholdDevices(householdId, { excludeDeviceId = null } = {}) {
  const doc = loadRegistryDoc();
  return doc.devices.filter(d =>
    d.householdId === householdId && d.deviceId !== excludeDeviceId
  );
}

export function listHouseholdPartnerIds(householdId, { excludeDeviceId = null } = {}) {
  const ids = new Set();
  listHouseholdDevices(householdId, { excludeDeviceId }).forEach(d => ids.add(d.partnerId));
  return Array.from(ids);
}
