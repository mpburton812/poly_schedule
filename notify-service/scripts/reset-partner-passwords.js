#!/usr/bin/env node
/**
 * Reset passwords for one or more partners (lockout recovery).
 *
 * Usage (Render shell — no HTTP secret needed):
 *   node scripts/reset-partner-passwords.js mpburton kthompson jordan --password='TempPass123!'
 *
 * Usage (HTTP — uses NOTIFY_SECRET from env):
 *   NOTIFY_URL=https://polyschedule-notify.onrender.com \
 *   NOTIFY_SECRET=your-secret \
 *   node scripts/reset-partner-passwords.js mpburton kthompson --password='TempPass123!'
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { resetPartnerPassword } from '../reset-partner-password.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });

function parseArgs(argv) {
  const usernames = [];
  let password = process.env.RESET_PASSWORD || '';
  let useHttp = false;

  for (const arg of argv) {
    if (arg === '--http') {
      useHttp = true;
      continue;
    }
    if (arg.startsWith('--password=')) {
      password = arg.slice('--password='.length);
      continue;
    }
    if (arg.startsWith('--')) continue;
    usernames.push(arg);
  }

  return { usernames, password, useHttp };
}

async function resetViaHttp(username, password) {
  const baseUrl = (process.env.NOTIFY_URL || process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '');
  const secret = process.env.NOTIFY_SECRET || '';
  if (!baseUrl || !secret) {
    throw new Error('NOTIFY_URL and NOTIFY_SECRET are required for --http mode');
  }
  const res = await fetch(`${baseUrl}/v1/auth/reset-password`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Notify-Secret': secret
    },
    body: JSON.stringify({ username, password })
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(body.error || body.code || `HTTP ${res.status}`);
  }
  return body;
}

const { usernames, password, useHttp } = parseArgs(process.argv.slice(2));

if (!usernames.length || !password) {
  console.error('Usage: node scripts/reset-partner-passwords.js <username> [username...] --password=NewPass [--http]');
  process.exit(1);
}

let failed = 0;
for (const username of usernames) {
  try {
    if (useHttp) {
      const result = await resetViaHttp(username, password);
      console.log(`OK (http) ${result.username} (${result.partnerId})`);
    } else {
      const result = await resetPartnerPassword(username, password);
      if (!result.ok) {
        throw new Error(`${result.code}: ${result.message}`);
      }
      console.log(`OK ${result.username} (${result.partnerId})`);
    }
  } catch (err) {
    failed += 1;
    console.error(`FAIL ${username}: ${err.message}`);
  }
}

process.exit(failed > 0 ? 1 : 0);
