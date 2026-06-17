import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'polyschedule-usernames-'));

process.env.DATA_DIR = tempDir;

const {
  claimUsername,
  isUsernameTaken,
  syncHouseholdUsernames
} = await import('../notify-service/username-registry.js');
const { upsertHouseholdCache } = await import('../notify-service/sync-store.js');

describe('notify-service username registry', () => {
  beforeEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it('claims and detects taken usernames across households', () => {
    upsertHouseholdCache('household-a', {
      revision: 1,
      config: { partners: [{ id: 'p1', username: 'mpburton' }] }
    });
    claimUsername('mpburton', 'household-a', 'p1');
    expect(isUsernameTaken('mpburton').taken).toBe(true);
    expect(isUsernameTaken('mpburton', { excludeHouseholdId: 'household-a', excludePartnerId: 'p1' }).taken).toBe(false);
  });

  it('syncs usernames from household config and rejects conflicts', () => {
    claimUsername('alex', 'household-a', 'p1');
    expect(() => syncHouseholdUsernames('household-b', {
      partners: [{ id: 'p9', username: 'alex', role: 'Admin' }]
    })).toThrow(/already registered/);
  });
});
