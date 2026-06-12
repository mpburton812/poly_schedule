import { describe, it, expect } from 'vitest';
import { hashPassword as clientHash } from '../js/crypto.js';
import { hashPassword as serverHash, verifyPartnerPassword } from '../notify-service/crypto.js';

describe('notify-service password verification', () => {
  it('matches client PBKDF2 hashes using partner id as salt', async () => {
    const partnerId = 'p_test_123';
    const password = 'secret-pass';
    const passwordHash = await clientHash(password, partnerId);
    const partner = { id: partnerId, passwordHash };
    expect(await serverHash(password, partnerId)).toBe(passwordHash);
    expect(await verifyPartnerPassword(partner, password)).toBe(true);
    expect(await verifyPartnerPassword(partner, 'wrong')).toBe(false);
  });

  it('accepts legacy plaintext passwords during migration', async () => {
    const partner = { id: 'p1', password: 'legacy' };
    expect(await verifyPartnerPassword(partner, 'legacy')).toBe(true);
  });
});
