import { describe, it, expect } from 'vitest';
import { mergePartnerAuthFields } from '../notify-service/partner-auth-merge.js';

describe('mergePartnerAuthFields', () => {
  it('preserves passwordHash when incoming sync config omits auth fields', () => {
    const previousConfig = {
      partners: [{ id: 'p1', username: 'alice', passwordHash: 'abc123' }]
    };
    const incomingConfig = {
      partners: [{ id: 'p1', username: 'alice', name: 'Alice Updated' }]
    };

    const merged = mergePartnerAuthFields(incomingConfig, previousConfig);
    expect(merged.partners[0].passwordHash).toBe('abc123');
    expect(merged.partners[0].name).toBe('Alice Updated');
  });

  it('keeps incoming passwordHash when admin sets a new password', () => {
    const previousConfig = {
      partners: [{ id: 'p1', username: 'alice', passwordHash: 'old-hash' }]
    };
    const incomingConfig = {
      partners: [{ id: 'p1', username: 'alice', passwordHash: 'new-hash' }]
    };

    const merged = mergePartnerAuthFields(incomingConfig, previousConfig);
    expect(merged.partners[0].passwordHash).toBe('new-hash');
  });

  it('preserves legacy plaintext passwords during migration', () => {
    const previousConfig = {
      partners: [{ id: 'p1', username: 'alice', password: 'legacy' }]
    };
    const incomingConfig = {
      partners: [{ id: 'p1', username: 'alice' }]
    };

    const merged = mergePartnerAuthFields(incomingConfig, previousConfig);
    expect(merged.partners[0].password).toBe('legacy');
  });
});
