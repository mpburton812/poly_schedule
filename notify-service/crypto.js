import crypto from 'crypto';
import { promisify } from 'util';

const pbkdf2 = promisify(crypto.pbkdf2);

/** Matches client js/crypto.js (PBKDF2-SHA256, 100k iterations, partner id as salt). */
export async function hashPassword(password, salt = 'polyschedule') {
  if (!password) return '';
  const hash = await pbkdf2(String(password), String(salt), 100000, 32, 'sha256');
  return hash.toString('hex');
}

export async function verifyPartnerPassword(partner, password) {
  if (!partner || !password) return false;
  if (partner.password && partner.password === password) return true;
  if (partner.passwordHash) {
    return partner.passwordHash === await hashPassword(password, partner.id);
  }
  return false;
}
