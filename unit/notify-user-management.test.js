import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyschedule-login-'));
process.env.DATA_DIR = tempDir;

const { resolvePartnerLoginContext } = await import('../notify-service/login-context.js');
const { claimUsername, isUsernameTaken, pruneOrphanedUsernames, releaseUsername } = await import('../notify-service/username-registry.js');
const { upsertHouseholdCache } = await import('../notify-service/sync-store.js');
const { createHouseholdPartner, deleteHouseholdPartner } = await import('../notify-service/household-partners.js');
const { buildUserHealthReport } = await import('../notify-service/user-health.js');

describe('notify-service login context', () => {
  beforeEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('returns USERNAME_UNKNOWN when username is not registered', () => {
    const result = resolvePartnerLoginContext('missing');
    expect(result.error?.code).toBe('USERNAME_UNKNOWN');
  });

  it('returns PARTNER_NOT_IN_HOUSEHOLD when registry exists without partner row', () => {
    upsertHouseholdCache('household-a', {
      revision: 1,
      config: { partners: [], residences: [] }
    });
    claimUsername('keegan', 'household-a', 'p9');
    const result = resolvePartnerLoginContext('keegan');
    expect(result.error?.code).toBe('PARTNER_NOT_IN_HOUSEHOLD');
  });

  it('resolves partner when registry and household config agree', () => {
    upsertHouseholdCache('household-a', {
      revision: 1,
      config: {
        partners: [{ id: 'p1', name: 'Alex', username: 'alex', passwordHash: 'hash' }]
      }
    });
    claimUsername('alex', 'household-a', 'p1');
    const result = resolvePartnerLoginContext('alex');
    expect(result.partner?.id).toBe('p1');
  });
});

describe('notify-service household partners', () => {
  beforeEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
    upsertHouseholdCache('household-a', {
      revision: 1,
      config: { partners: [], residences: [] }
    });
  });

  it('creates an active partner and registers username atomically', async () => {
    const result = await createHouseholdPartner('household-a', {
      id: 'p2',
      name: 'Keegan',
      username: 'keegan',
      passwordHash: 'hash',
      role: 'User'
    });
    expect(result.partner?.username).toBe('keegan');
    const login = resolvePartnerLoginContext('keegan');
    expect(login.partner?.id).toBe('p2');
  });

  it('deletes partner and releases username', () => {
    upsertHouseholdCache('household-a', {
      revision: 2,
      config: {
        partners: [{ id: 'p2', name: 'Keegan', username: 'keegan', passwordHash: 'hash' }],
        residences: []
      }
    });
    claimUsername('keegan', 'household-a', 'p2');
    deleteHouseholdPartner('household-a', 'p2');
    expect(releaseUsername('keegan', 'household-a', 'p2')).toBe(false);
    expect(resolvePartnerLoginContext('keegan').error?.code).toBe('USERNAME_UNKNOWN');
  });
});

describe('notify-service user health', () => {
  beforeEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  it('reports registry orphans', () => {
    claimUsername('orphan', 'household-a', 'p9');
    const report = buildUserHealthReport('household-a');
    expect(report.summary.registryOrphans).toBe(1);
    expect(report.partners.some((row) => row.username === 'orphan' && row.issues.includes('registry_orphan'))).toBe(true);
  });
});

describe('notify-service username availability', () => {
  beforeEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  it('treats registry orphans as available', () => {
    claimUsername('thegayagenda', 'probe-orphan-scan', 'probe');
    expect(isUsernameTaken('thegayagenda').taken).toBe(false);
    const removed = pruneOrphanedUsernames();
    expect(removed).toContain('thegayagenda');
    expect(isUsernameTaken('thegayagenda').taken).toBe(false);
  });

  it('still blocks usernames owned by an active partner', () => {
    upsertHouseholdCache('household-a', {
      revision: 1,
      config: {
        partners: [{ id: 'p1', name: 'Alex', username: 'alex', passwordHash: 'hash' }]
      }
    });
    claimUsername('alex', 'household-a', 'p1');
    expect(isUsernameTaken('alex').taken).toBe(true);
  });
});
