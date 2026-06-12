import { getHousehold } from './sync-store.js';
import { isUsernameTaken, normalizeUsername } from './username-registry.js';
import { verifyPartnerPassword } from './crypto.js';

function sanitizeConfigForClient(config) {
  if (!config) return null;
  const copy = JSON.parse(JSON.stringify(config));
  for (const partner of copy.partners || []) {
    delete partner.password;
    delete partner.passwordHash;
  }
  return copy;
}

function findLoginPartner(config, normalizedUsername) {
  return (config?.partners || []).find((partner) => {
    if (partner?.passive || !partner?.username) return false;
    return normalizeUsername(partner.username) === normalizedUsername;
  }) || null;
}

export function mountAuthRoutes(app) {
  app.post('/v1/auth/login', async (req, res) => {
    const username = String(req.body?.username || '').trim();
    const password = String(req.body?.password || '');

    if (!username || !password) {
      res.status(400).json({ error: 'username and password are required', code: 'BAD_REQUEST' });
      return;
    }

    const lookup = isUsernameTaken(username);
    if (!lookup.taken || !lookup.householdId || !lookup.partnerId) {
      res.status(401).json({ error: 'Invalid username or password.', code: 'INVALID_CREDENTIALS' });
      return;
    }

    const household = getHousehold(lookup.householdId);
    const config = household?.config;
    if (!config) {
      res.status(503).json({
        error: 'Household data is not available yet. Ask an admin to open PolySchedule on a connected device first.',
        code: 'HOUSEHOLD_UNAVAILABLE'
      });
      return;
    }

    const partner = findLoginPartner(config, lookup.normalized || normalizeUsername(username));
    if (!partner || partner.id !== lookup.partnerId) {
      res.status(401).json({ error: 'Invalid username or password.', code: 'INVALID_CREDENTIALS' });
      return;
    }

    const valid = await verifyPartnerPassword(partner, password);
    if (!valid) {
      res.status(401).json({ error: 'Invalid username or password.', code: 'INVALID_CREDENTIALS' });
      return;
    }

    res.json({
      ok: true,
      householdId: lookup.householdId,
      partnerId: partner.id,
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
}
