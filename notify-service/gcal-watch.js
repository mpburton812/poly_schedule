import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { bumpHouseholdRevision } from './sync-store.js';
import { broadcastHouseholdSync } from './sync-broadcast.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, 'data');
const WATCHES_PATH = path.join(DATA_DIR, 'gcal-watches.json');

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

function loadWatchesDoc() {
  return readJson(WATCHES_PATH, { watches: [] });
}

function saveWatchesDoc(doc) {
  writeJson(WATCHES_PATH, doc);
}

function publicWebhookUrl() {
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  if (!base) return null;
  return `${base}/v1/gcal/webhook`;
}

export async function registerGCalWatch({
  householdId,
  calendarId,
  accessToken,
  apiKey
}) {
  const webhookUrl = publicWebhookUrl();
  if (!webhookUrl) {
    throw new Error('PUBLIC_BASE_URL is required to register Google Calendar watches');
  }
  if (!householdId || !calendarId || !accessToken || !apiKey) {
    throw new Error('householdId, calendarId, accessToken, and apiKey are required');
  }

  const channelId = `poly-${householdId}-${Date.now()}`;
  const url = `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/watch?key=${encodeURIComponent(apiKey)}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      id: channelId,
      type: 'web_hook',
      address: webhookUrl,
      token: householdId
    })
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Google Calendar watch failed (${res.status}): ${text.slice(0, 200)}`);
  }

  const data = await res.json();
  const doc = loadWatchesDoc();
  doc.watches = doc.watches.filter(w => w.householdId !== householdId);
  doc.watches.push({
    householdId,
    calendarId,
    channelId: data.id || channelId,
    resourceId: data.resourceId,
    expiration: data.expiration,
    registeredAt: new Date().toISOString()
  });
  saveWatchesDoc(doc);
  return data;
}

export function handleGCalWebhook({ channelToken, resourceState }) {
  const householdId = channelToken;
  if (!householdId) return { ok: false, reason: 'missing token' };

  const meta = bumpHouseholdRevision(householdId, { scopes: ['config', 'events'] });
  broadcastHouseholdSync({
    householdId,
    revision: meta.revision,
    scopes: ['config', 'events']
  });

  return { ok: true, householdId, resourceState, revision: meta.revision };
}

export async function renewExpiringWatches({ accessToken, apiKey, renewWithinMs = 86400000 } = {}) {
  if (!accessToken || !apiKey) return { renewed: 0, skipped: 'missing credentials' };
  const doc = loadWatchesDoc();
  const now = Date.now();
  let renewed = 0;

  for (const watch of doc.watches) {
    const expires = Number(watch.expiration || 0);
    if (expires && expires - now > renewWithinMs) continue;
    try {
      await registerGCalWatch({
        householdId: watch.householdId,
        calendarId: watch.calendarId,
        accessToken,
        apiKey
      });
      renewed += 1;
    } catch (err) {
      console.warn('[gcal-watch] renew failed', watch.householdId, err.message);
    }
  }

  return { renewed };
}

export function startWatchRenewalLoop(getCredentials) {
  const intervalMs = Number(process.env.GCAL_WATCH_RENEW_MS || 6 * 60 * 60 * 1000);
  setInterval(async () => {
    try {
      const creds = await getCredentials();
      if (!creds) return;
      const result = await renewExpiringWatches(creds);
      if (result.renewed) console.log('[gcal-watch] renewed', result.renewed);
    } catch (err) {
      console.warn('[gcal-watch] renewal loop error', err.message);
    }
  }, intervalMs);
}
