import webpush from 'web-push';
import { findSubscriptionsForPartners } from './store.js';
import { listHouseholdPartnerIds } from './sync-store.js';

/** @type {Map<string, Set<import('http').ServerResponse>>} */
const sseClients = new Map();

export function addSseClient(householdId, res) {
  if (!sseClients.has(householdId)) sseClients.set(householdId, new Set());
  sseClients.get(householdId).add(res);
}

export function removeSseClient(householdId, res) {
  const set = sseClients.get(householdId);
  if (!set) return;
  set.delete(res);
  if (!set.size) sseClients.delete(householdId);
}

export function broadcastHouseholdSync({
  householdId,
  revision,
  scopes = ['config', 'events'],
  actorPartnerId = null,
  excludeDeviceId = null
}) {
  const payload = {
    type: 'household-sync',
    householdId,
    revision,
    scopes,
    actorPartnerId,
    excludeDeviceId,
    updatedAt: new Date().toISOString()
  };

  const set = sseClients.get(householdId);
  if (set) {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const res of set) {
      try {
        res.write(data);
      } catch {
        set.delete(res);
      }
    }
  }

  return sendHouseholdSyncPush({
    householdId,
    revision,
    scopes,
    excludeDeviceId,
    actorPartnerId
  });
}

async function sendHouseholdSyncPush({
  householdId,
  revision,
  scopes,
  excludeDeviceId,
  actorPartnerId
}) {
  const partnerIds = listHouseholdPartnerIds(householdId, { excludeDeviceId });
  if (!partnerIds.length) return { sent: 0 };

  const targets = findSubscriptionsForPartners(partnerIds);
  const payload = JSON.stringify({
    type: 'household-sync',
    title: 'Schedule updated',
    body: 'Your household schedule was updated.',
    url: './index.html',
    householdId,
    revision,
    scopes,
    actorPartnerId,
    silent: true
  });

  let sent = 0;
  await Promise.all(targets.map(async (row) => {
    try {
      await webpush.sendNotification(row.subscription, payload);
      sent += 1;
    } catch {
      // stale subscriptions cleaned elsewhere
    }
  }));

  return { sent };
}
