import cors from 'cors';
import dotenv from 'dotenv';
import express from 'express';
import webpush from 'web-push';
import {
  upsertSubscription,
  removeSubscription,
  listRegisteredDevices
} from './store.js';
import { sendPushToPartners } from './send.js';
import { mountSyncRoutes } from './sync-routes.js';
import { mountAuthRoutes } from './auth-routes.js';
import { startWatchRenewalLoop } from './gcal-watch.js';
import { getGoogleIntegrationFromEnv, isGoogleIntegrationEnvManaged } from './google-integration-env.js';

dotenv.config();

const PORT = Number(process.env.PORT || 8787);
const NOTIFY_SECRET = process.env.NOTIFY_SECRET || 'dev-notify-secret-change-me';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@polyschedule.local';
let VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
let VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';

if (!VAPID_PUBLIC_KEY || !VAPID_PRIVATE_KEY) {
  const keys = webpush.generateVAPIDKeys();
  VAPID_PUBLIC_KEY = keys.publicKey;
  VAPID_PRIVATE_KEY = keys.privateKey;
  console.warn('[notify] Generated ephemeral VAPID keys. Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY for production.');
}

webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);

const app = express();
const allowedOrigins = (process.env.ALLOWED_ORIGINS || '*')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean);

app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }
    callback(new Error('Not allowed by CORS'));
  }
}));
app.use(express.json({ limit: '32kb' }));

function requireSecret(req, res, next) {
  const secret = req.get('X-Notify-Secret');
  if (!secret || secret !== NOTIFY_SECRET) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }
  next();
}

app.get('/health', (_req, res) => {
  res.json({ ok: true, service: 'polyschedule-notify' });
});

app.get('/v1/config', (_req, res) => {
  const googleIntegration = getGoogleIntegrationFromEnv();
  res.json({
    publicKey: VAPID_PUBLIC_KEY,
    googleIntegration,
    googleIntegrationServerManaged: isGoogleIntegrationEnvManaged()
  });
});

app.get('/v1/devices', requireSecret, (_req, res) => {
  res.json({ devices: listRegisteredDevices() });
});

app.post('/v1/subscriptions', requireSecret, (req, res) => {
  const { partnerId, subscription, householdId, deviceId } = req.body || {};
  if (!partnerId || !subscription?.endpoint) {
    res.status(400).json({ error: 'partnerId and subscription are required' });
    return;
  }
  upsertSubscription(partnerId, subscription, req.get('user-agent') || '', { householdId, deviceId });
  res.json({ ok: true });
});

app.delete('/v1/subscriptions', requireSecret, (req, res) => {
  const { partnerId, endpoint } = req.body || {};
  if (!partnerId || !endpoint) {
    res.status(400).json({ error: 'partnerId and endpoint are required' });
    return;
  }
  removeSubscription(partnerId, endpoint);
  res.json({ ok: true });
});

app.post('/v1/events', requireSecret, async (req, res) => {
  const {
    type = 'generic',
    proposalId = null,
    title,
    body,
    url,
    recipientIds = [],
    recipientEmails = {},
    dedupeKey
  } = req.body || {};

  const result = await sendPushToPartners({
    type,
    proposalId,
    title,
    body,
    url,
    recipientIds,
    recipientEmails,
    dedupeKey
  });
  res.json(result);
});

mountAuthRoutes(app, { requireSecret });
mountSyncRoutes(app, { requireSecret });

app.listen(PORT, () => {
  console.log(`[notify] listening on http://127.0.0.1:${PORT}`);
  startWatchRenewalLoop(async () => null);
});
