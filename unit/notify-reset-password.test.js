import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { hashPassword, verifyPartnerPassword } from '../notify-service/crypto.js';
import { upsertHouseholdCache, getHousehold } from '../notify-service/sync-store.js';
import { resetPartnerPassword } from '../notify-service/reset-partner-password.js';

describe('resetPartnerPassword', () => {
  let tempDir;

  beforeEach(() => {
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'poly-notify-reset-'));
    process.env.DATA_DIR = tempDir;
    delete process.env.HOUSEHOLD_ID;
  });

  afterEach(() => {
    delete process.env.DATA_DIR;
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('sets a new password hash for an existing partner', async () => {
    const householdId = 'hh_test';
    const partnerId = 'p_admin';
    upsertHouseholdCache(householdId, {
      revision: 1,
      config: {
        partners: [{
          id: partnerId,
          username: 'kathompson',
          name: 'Kath',
          role: 'Admin'
        }],
        residences: []
      },
      events: []
    });

    const result = await resetPartnerPassword('kathompson', 'TempPass123!');
    expect(result.ok).toBe(true);

    const household = getHousehold(householdId);
    const partner = household.config.partners.find((row) => row.id === partnerId);
    expect(partner.passwordHash).toBe(await hashPassword('TempPass123!', partnerId));
    expect(await verifyPartnerPassword(partner, 'TempPass123!')).toBe(true);
    expect(await verifyPartnerPassword(partner, 'wrong')).toBe(false);
  });

  it('returns NOT_FOUND for unknown usernames', async () => {
    const result = await resetPartnerPassword('nobody', 'TempPass123!');
    expect(result.ok).toBe(false);
    expect(result.code).toBe('NOT_FOUND');
  });
});
