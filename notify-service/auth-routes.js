import { getHousehold } from './sync-store.js';
import { verifyPartnerPassword } from './crypto.js';
import { getFixedHouseholdId } from './fixed-household.js';
import { resolvePartnerLoginContext, resetPartnerPassword } from './reset-partner-password.js';

function sanitizeConfigForClient(config) {
  if (!config) return null;
  const copy = JSON.parse(JSON.stringify(config));
  for (const partner of copy.partners || []) {
    delete partner.password;
    delete partner.passwordHash;
  }
  return copy;
}

function sanitizeGoogleIntegration(config) {
  const gi = config?.googleIntegration;
  if (!gi?.clientId || !gi?.apiKey) return null;
  return {
    clientId: gi.clientId,
    apiKey: gi.apiKey,
    calendarId: gi.calendarId || 'primary'
  };
}

function sanitizeNotifyService(config) {
  const notify = config?.notifyService;
  if (!notify?.url || !notify?.secret) return null;
  return {
    url: notify.url.replace(/\/$/, ''),
    secret: notify.secret
  };
}

function resolveLoginContext(username) {
  const ctx = resolvePartnerLoginContext(username);
  if (!ctx) {
    const fixedHouseholdId = getFixedHouseholdId();
    if (fixedHouseholdId) {
      const household = getHousehold(fixedHouseholdId);
      if (!household?.config) {
        return {
          error: {
            status: 503,
            body: {
              error: 'Household data is not available yet. Ask an admin to open PolySchedule on a connected device first.',
              code: 'HOUSEHOLD_UNAVAILABLE'
            }
          }
        };
      }
    }
    return {
      error: {
        status: 401,
        body: { error: 'Invalid username or password.', code: 'INVALID_CREDENTIALS' }
      }
    };
  }
  return ctx;
}

export function mountAuthRoutes(app, { requireSecret } = {}) {
  app.post('/v1/auth/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !password) {
      res.status(400).json({ error: 'username and password are required', code: 'BAD_REQUEST' });
      return;
    }

    const ctx = resolveLoginContext(username);
    if (ctx.error) {
      res.status(ctx.error.status).json(ctx.error.body);
      return;
    }

    const { householdId, household, partner } = ctx;
    const valid = await verifyPartnerPassword(partner, password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password.', code: 'INVALID_CREDENTIALS' });
      return;
    }

    const config = household.config;
    res.json({
      ok: true,
      householdId,
      partnerId: partner.id,
      groupName: config?.groupName || '',
      googleIntegration: sanitizeGoogleIntegration(config),
      notifyService: sanitizeNotifyService(config),
      partner: {
        id: partner.id,
        name: partner.name,
        username: partner.username,
        role: partner.role,
        avatar: partner.avatar,
        pronouns: partner.pronouns || null
      },
      config: sanitizeConfigForClient(config),
      events: Array.isArray(household.events) ? household.events : [],
      revision: household.revision ?? 0
    });
  });

  if (requireSecret) {
    app.post('/v1/auth/reset-password', requireSecret, async (req, res) => {
      const username = String(req.body?.username || '').trim();
      const password = String(req.body?.password || '');

      if (!username || !password) {
        res.status(400).json({ error: 'username and password are required', code: 'BAD_REQUEST' });
        return;
      }

      const result = await resetPartnerPassword(username, password);
      if (!result.ok) {
        const status = result.code === 'NOT_FOUND' ? 404 : 400;
        res.status(status).json({ error: result.message, code: result.code });
        return;
      }

      res.json({
        ok: true,
        householdId: result.householdId,
        partnerId: result.partnerId,
        username: result.username
      });
    });
  }
}
