import {
  bumpHouseholdRevision,
  getHousehold,
  registerSyncDevice,
  upsertHouseholdCache
} from './sync-store.js';
import { addSseClient, removeSseClient, broadcastHouseholdSync } from './sync-broadcast.js';
import { registerGCalWatch, handleGCalWebhook } from './gcal-watch.js';

export function mountSyncRoutes(app, { requireSecret }) {
  app.post('/v1/sync/register', requireSecret, (req, res) => {
    const { householdId, partnerId, deviceId } = req.body || {};
    if (!householdId || !partnerId || !deviceId) {
      res.status(400).json({ error: 'householdId, partnerId, and deviceId are required' });
      return;
    }
    const row = registerSyncDevice({
      householdId,
      partnerId,
      deviceId,
      userAgent: req.get('user-agent') || ''
    });
    res.json({ ok: true, device: row });
  });

  app.get('/v1/sync/status', requireSecret, (req, res) => {
    const householdId = req.query.householdId;
    if (!householdId) {
      res.status(400).json({ error: 'householdId is required' });
      return;
    }
    const household = getHousehold(householdId);
    res.json({
      householdId,
      revision: household?.revision ?? 0,
      updatedAt: household?.updatedAt ?? null,
      hasConfigCache: !!household?.config,
      hasEventsCache: Array.isArray(household?.events)
    });
  });

  app.get('/v1/sync/config', requireSecret, (req, res) => {
    const householdId = req.query.householdId;
    const sinceRevision = Number(req.query.sinceRevision || 0);
    if (!householdId) {
      res.status(400).json({ error: 'householdId is required' });
      return;
    }
    const household = getHousehold(householdId);
    if (!household?.config || household.revision <= sinceRevision) {
      res.status(204).end();
      return;
    }
    res.json({
      householdId,
      revision: household.revision,
      updatedAt: household.updatedAt,
      config: household.config
    });
  });

  app.get('/v1/sync/events', requireSecret, (req, res) => {
    const householdId = req.query.householdId;
    const sinceRevision = Number(req.query.sinceRevision || 0);
    if (!householdId) {
      res.status(400).json({ error: 'householdId is required' });
      return;
    }
    const household = getHousehold(householdId);
    if (!Array.isArray(household?.events) || household.revision <= sinceRevision) {
      res.status(204).end();
      return;
    }
    res.json({
      householdId,
      revision: household.revision,
      updatedAt: household.updatedAt,
      events: household.events
    });
  });

  app.post('/v1/sync/push', requireSecret, (req, res) => {
    const {
      householdId,
      revision,
      config,
      events,
      actorPartnerId = null,
      scopes = ['config', 'events']
    } = req.body || {};

    if (!householdId) {
      res.status(400).json({ error: 'householdId is required' });
      return;
    }

    const nextRevision = revision ?? (getHousehold(householdId)?.revision || 0) + 1;
    const saved = upsertHouseholdCache(householdId, {
      revision: nextRevision,
      config: config !== undefined ? config : getHousehold(householdId)?.config,
      events: events !== undefined ? events : getHousehold(householdId)?.events,
      actorPartnerId
    });

    const pushResult = broadcastHouseholdSync({
      householdId,
      revision: saved.revision,
      scopes,
      actorPartnerId,
      excludeDeviceId: req.body?.excludeDeviceId || null
    });

    res.json({ ok: true, revision: saved.revision, push: pushResult });
  });

  app.post('/v1/sync/notify', requireSecret, (req, res) => {
    const {
      householdId,
      revision,
      scopes = ['config', 'events'],
      actorPartnerId = null,
      excludeDeviceId = null,
      config,
      events
    } = req.body || {};

    if (!householdId) {
      res.status(400).json({ error: 'householdId is required' });
      return;
    }

    const nextRevision = revision != null
      ? revision
      : (getHousehold(householdId)?.revision || 0) + 1;

    const meta = upsertHouseholdCache(householdId, {
      revision: nextRevision,
      config: config !== undefined ? config : getHousehold(householdId)?.config,
      events: events !== undefined ? events : getHousehold(householdId)?.events,
      actorPartnerId
    });

    const pushResult = broadcastHouseholdSync({
      householdId,
      revision: meta.revision,
      scopes,
      actorPartnerId,
      excludeDeviceId
    });

    res.json({ ok: true, revision: meta.revision, push: pushResult });
  });

  app.get('/v1/sync/stream', requireSecret, (req, res) => {
    const householdId = req.query.householdId;
    if (!householdId) {
      res.status(400).json({ error: 'householdId is required' });
      return;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    addSseClient(householdId, res);
    res.write(`data: ${JSON.stringify({ type: 'connected', householdId })}\n\n`);

    const heartbeat = setInterval(() => {
      try {
        res.write(': ping\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 25000);

    req.on('close', () => {
      clearInterval(heartbeat);
      removeSseClient(householdId, res);
    });
  });

  app.post('/v1/gcal/watch', requireSecret, async (req, res) => {
    try {
      const { householdId, calendarId, accessToken, apiKey } = req.body || {};
      const data = await registerGCalWatch({ householdId, calendarId, accessToken, apiKey });
      res.json({ ok: true, watch: data });
    } catch (err) {
      res.status(400).json({ error: err.message });
    }
  });

  app.post('/v1/gcal/webhook', (req, res) => {
    const channelToken = req.get('X-Goog-Channel-Token') || req.body?.token;
    const resourceState = req.get('X-Goog-Resource-State') || 'unknown';
    if (resourceState === 'sync') {
      res.status(200).end();
      return;
    }
    const result = handleGCalWebhook({ channelToken, resourceState });
    res.status(200).json(result);
  });
}
