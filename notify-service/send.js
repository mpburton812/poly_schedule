import webpush from 'web-push';
import {
  findSubscriptionsForPartners,
  markDedupeKey,
  removeSubscription
} from './store.js';
import { sendEmailFallback } from './email.js';

export async function sendPushToPartners({
  type,
  title,
  body,
  url,
  recipientIds = [],
  recipientEmails = {},
  dedupeKey,
  proposalId = null
}) {
  if (!recipientIds.length) {
    return { ok: true, sent: 0, skipped: 'no recipients' };
  }

  const perRecipientDedupe = dedupeKey || `${type}_${proposalId || 'unknown'}`;
  const targets = findSubscriptionsForPartners(recipientIds);
  const pushSentFor = new Set();

  const payload = JSON.stringify({
    title: title || 'PolySchedule Update',
    body: body || 'You have a schedule update.',
    url: url || './index.html#proposals'
  });

  let sent = 0;
  let removed = 0;
  const errors = [];

  await Promise.all(targets.map(async (row) => {
    const key = `${perRecipientDedupe}_${row.partnerId}`;
    if (!markDedupeKey(key)) return;

    try {
      await webpush.sendNotification(row.subscription, payload);
      sent += 1;
      pushSentFor.add(row.partnerId);
    } catch (err) {
      const status = err?.statusCode || err?.status;
      if (status === 404 || status === 410) {
        removeSubscription(row.partnerId, row.subscription.endpoint);
        removed += 1;
        return;
      }
      errors.push({ partnerId: row.partnerId, status, message: err?.message || 'send failed' });
    }
  }));

  let emailed = 0;
  for (const partnerId of recipientIds) {
    if (pushSentFor.has(partnerId)) continue;
    const email = recipientEmails[partnerId];
    if (!email) continue;
    const emailKey = `${perRecipientDedupe}_email_${partnerId}`;
    if (!markDedupeKey(emailKey)) continue;
    try {
      const result = await sendEmailFallback({ to: email, subject: title, body, url });
      if (result.sent) emailed += 1;
    } catch (err) {
      errors.push({ partnerId, channel: 'email', message: err?.message || 'email failed' });
    }
  }

  return { ok: true, sent, emailed, removed, errors };
}
