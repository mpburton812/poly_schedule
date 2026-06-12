#!/usr/bin/env node
/**
 * Emergency partner password reset (notify service lockout recovery).
 *
 * Usage:
 *   NOTIFY_SECRET=your-secret node scripts/reset-partner-password.js kathompson 'NewTempPass123!'
 *
 * Or on Render shell from notify-service directory:
 *   node scripts/reset-partner-password.js kathompson 'NewTempPass123!'
 */

import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { resetPartnerPassword } from '../reset-partner-password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

const [username, password] = process.argv.slice(2);

if (!username || !password) {
  console.error('Usage: node scripts/reset-partner-password.js <username> <new-password>');
  process.exit(1);
}

const result = await resetPartnerPassword(username, password);
if (!result.ok) {
  console.error(`Reset failed (${result.code}): ${result.message}`);
  process.exit(1);
}

console.log(`Password reset for ${result.username} (${result.partnerId}) in household ${result.householdId}.`);
