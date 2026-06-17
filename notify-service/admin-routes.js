import { buildUserHealthReport } from './user-health.js';
import { listRegisteredUsernames, pruneOrphanedUsernames } from './username-registry.js';
import { releaseUsername } from './username-registry.js';
import {
  createHouseholdPartner,
  deleteHouseholdPartner,
  claimHouseholdPartnerUsername
} from './household-partners.js';

export function mountAdminRoutes(app, { requireSecret }) {
  app.get('/v1/admin/usernames', requireSecret, (req, res) => {
    const householdId = req.query.householdId || null;
    res.json({
      usernames: listRegisteredUsernames(householdId ? { householdId } : {})
    });
  });

  app.get('/v1/admin/users/health', requireSecret, (req, res) => {
    const householdId = req.query.householdId || null;
    res.json(buildUserHealthReport(householdId));
  });

  app.post('/v1/admin/usernames/prune-orphans', requireSecret, (req, res) => {
    const removed = pruneOrphanedUsernames();
    res.json({ ok: true, removed, count: removed.length });
  });

  app.post('/v1/usernames/release', requireSecret, (req, res) => {
    const { username, householdId = null, partnerId = null } = req.body || {};
    if (!username) {
      res.status(400).json({ error: 'username is required' });
      return;
    }
    const released = releaseUsername(username, householdId, partnerId);
    if (!released) {
      res.status(404).json({ error: 'Username is not registered.', code: 'NOT_FOUND' });
      return;
    }
    res.json({ ok: true, username });
  });

  app.post('/v1/usernames/claim-after-persist', requireSecret, (req, res) => {
    const { username, householdId, partnerId } = req.body || {};
    if (!username || !householdId || !partnerId) {
      res.status(400).json({ error: 'username, householdId, and partnerId are required' });
      return;
    }
    try {
      const row = claimHouseholdPartnerUsername(householdId, partnerId, username);
      res.json({ ok: true, username: row });
    } catch (err) {
      if (err.code === 'USERNAME_TAKEN') {
        res.status(409).json({ error: err.message, code: err.code });
        return;
      }
      if (err.code === 'PARTNER_NOT_IN_HOUSEHOLD') {
        res.status(404).json({ error: err.message, code: err.code });
        return;
      }
      res.status(400).json({ error: err.message, code: err.code || 'BAD_REQUEST' });
    }
  });

  app.post('/v1/household/partners', requireSecret, async (req, res) => {
    const { householdId, partner, actorPartnerId = null } = req.body || {};
    if (!householdId || !partner) {
      res.status(400).json({ error: 'householdId and partner are required' });
      return;
    }
    try {
      const result = await createHouseholdPartner(householdId, partner, { actorPartnerId });
      res.json({ ok: true, ...result });
    } catch (err) {
      if (err.code === 'USERNAME_TAKEN' || err.code === 'USERNAME_CONFLICT') {
        res.status(409).json({ error: err.message, code: err.code });
        return;
      }
      if (err.code === 'PARTNER_EXISTS') {
        res.status(409).json({ error: err.message, code: err.code });
        return;
      }
      res.status(400).json({ error: err.message, code: err.code || 'BAD_REQUEST' });
    }
  });

  app.delete('/v1/household/partners/:partnerId', requireSecret, (req, res) => {
    const householdId = req.query.householdId || req.body?.householdId;
    const partnerId = req.params.partnerId;
    if (!householdId || !partnerId) {
      res.status(400).json({ error: 'householdId and partnerId are required' });
      return;
    }
    try {
      const result = deleteHouseholdPartner(householdId, partnerId, {
        actorPartnerId: req.body?.actorPartnerId || null
      });
      res.json({ ok: true, ...result });
    } catch (err) {
      const status = err.code === 'NOT_FOUND' ? 404 : 400;
      res.status(status).json({ error: err.message, code: err.code || 'BAD_REQUEST' });
    }
  });
}
