#!/usr/bin/env node
/**
 * Generate a cryptographically secure NOTIFY_SECRET for Render / Admin.
 *
 * Usage:
 *   node scripts/generate-notify-secret.js
 */
import crypto from 'crypto';

const secret = crypto.randomBytes(48).toString('hex');
console.log('Generated NOTIFY_SECRET (copy to Render and PolySchedule Admin):\n');
console.log(secret);
console.log('\nRotation steps:');
console.log('1. Set NOTIFY_SECRET on Render → redeploy notify service');
console.log('2. Admin → Notify secret → Save (same value)');
console.log('3. Hard refresh PolySchedule on each device');
