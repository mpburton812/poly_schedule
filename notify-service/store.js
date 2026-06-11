import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const STORE_PATH = path.join(DATA_DIR, 'subscriptions.json');
const DEDUPE_PATH = path.join(DATA_DIR, 'dedupe.json');

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

export function loadSubscriptions() {
  return readJson(STORE_PATH, { subscriptions: [] });
}

export function saveSubscriptions(data) {
  writeJson(STORE_PATH, data);
}

export function upsertSubscription(partnerId, subscription, userAgent = '', meta = {}) {
  const data = loadSubscriptions();
  const endpoint = subscription?.endpoint;
  if (!partnerId || !endpoint) return null;

  const existingIdx = data.subscriptions.findIndex(
    s => s.partnerId === partnerId && s.subscription?.endpoint === endpoint
  );
  const row = {
    partnerId,
    subscription,
    userAgent,
    householdId: meta.householdId || null,
    deviceId: meta.deviceId || null,
    updatedAt: new Date().toISOString()
  };
  if (existingIdx >= 0) {
    data.subscriptions[existingIdx] = row;
  } else {
    data.subscriptions.push(row);
  }
  saveSubscriptions(data);
  return row;
}

export function removeSubscription(partnerId, endpoint) {
  const data = loadSubscriptions();
  const before = data.subscriptions.length;
  data.subscriptions = data.subscriptions.filter(
    s => !(s.partnerId === partnerId && s.subscription?.endpoint === endpoint)
  );
  if (data.subscriptions.length !== before) {
    saveSubscriptions(data);
    return true;
  }
  return false;
}

export function findSubscriptionsForPartners(partnerIds = []) {
  const ids = new Set(partnerIds.filter(Boolean));
  const data = loadSubscriptions();
  return data.subscriptions.filter(s => ids.has(s.partnerId));
}

export function listRegisteredDevices() {
  const data = loadSubscriptions();
  const grouped = {};
  data.subscriptions.forEach(row => {
    if (!grouped[row.partnerId]) {
      grouped[row.partnerId] = { partnerId: row.partnerId, devices: [] };
    }
    grouped[row.partnerId].devices.push({
      endpointPreview: `${String(row.subscription?.endpoint || '').slice(0, 40)}…`,
      userAgent: row.userAgent || 'Unknown device',
      updatedAt: row.updatedAt
    });
  });
  return Object.values(grouped).sort((a, b) => a.partnerId.localeCompare(b.partnerId));
}

export function loadDedupeKeys() {
  return readJson(DEDUPE_PATH, { keys: {} });
}

export function markDedupeKey(key, ttlMs = 86400000) {
  if (!key) return false;
  const data = loadDedupeKeys();
  const now = Date.now();
  Object.keys(data.keys).forEach(k => {
    if (data.keys[k] <= now) delete data.keys[k];
  });
  if (data.keys[key] && data.keys[key] > now) return false;
  data.keys[key] = now + ttlMs;
  writeJson(DEDUPE_PATH, data);
  return true;
}
