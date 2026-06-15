import {
  PUSH_TYPE_PREFS_KEY,
  NOTIFY_URL_KEY,
  NOTIFY_SECRET_KEY,
  PUSH_ENABLED_KEY,
  PUSH_QUIET_HOURS_KEY,
  PUSH_QUIET_START_KEY,
  PUSH_QUIET_END_KEY,
  LOCAL_CONFIG_KEY
} from './storage-keys.js';
/**
 * Web Push registration and dispatch for PolySchedule.
 */

import {
  findPartnerByRef,
  isPartnerPassive,
  partnerRefsMatch,
  partnerDisplayFirstName
} from './helpers.js';
import { isPastScheduledEvent } from './gcal-sync.js';
import {
  WORKFLOW,
  getWorkflowState,
  getRequiredVoters,
  getResponseForParticipant
} from './proposal-workflow.js';


export const PUSH_TYPE_LABELS = {
  'proposal-submitted': 'Proposals need my review',
  'proposal-vote': 'Votes on my proposals',
  'proposal-approved': 'Proposal approved',
  'proposal-declined': 'Proposal declined',
  'proposal-retracted': 'Proposal retracted',
  'proposal-cancelled': 'Proposal cancelled',
  'gcal-event-created': 'Events added in Google Calendar',
  'gcal-event-deleted': 'Events removed in Google Calendar',
  'event-comment': 'Comments on my events'
};

export function getPushTypePrefs() {
  try {
    return JSON.parse(localStorage.getItem(PUSH_TYPE_PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

export function isPushTypeEnabled(type) {
  if (!type || type === 'test' || type === 'household-sync') return true;
  return getPushTypePrefs()[type] !== false;
}

export function savePushTypePrefs(prefs) {
  localStorage.setItem(PUSH_TYPE_PREFS_KEY, JSON.stringify(prefs || {}));
}

export function buildRecipientEmails(recipientIds = [], config) {
  const emails = {};
  (recipientIds || []).forEach(id => {
    const partner = config?.partners?.find(p => p.id === id);
    const email = partner?.notificationEmail?.trim();
    if (email) emails[id] = email;
  });
  return emails;
}

function attachRecipientEmails(payload, config) {
  if (!payload || !config) return payload;
  return {
    ...payload,
    recipientEmails: buildRecipientEmails(payload.recipientIds, config)
  };
}

export function getPushConfig() {
  return {
    url: (localStorage.getItem(NOTIFY_URL_KEY) || '').replace(/\/$/, ''),
    secret: localStorage.getItem(NOTIFY_SECRET_KEY) || '',
    enabled: localStorage.getItem(PUSH_ENABLED_KEY) === '1',
    quietHours: localStorage.getItem(PUSH_QUIET_HOURS_KEY) === '1',
    quietStart: parseInt(localStorage.getItem(PUSH_QUIET_START_KEY) || '22', 10),
    quietEnd: parseInt(localStorage.getItem(PUSH_QUIET_END_KEY) || '8', 10)
  };
}

export function isPushSupported() {
  return typeof window !== 'undefined'
    && 'serviceWorker' in navigator
    && 'PushManager' in window
    && 'Notification' in window;
}

export function isIosDevice() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
}

export function isStandalonePwa() {
  return window.matchMedia('(display-mode: standalone)').matches
    || window.navigator.standalone === true;
}

export function isPushConfigured() {
  const { url, secret } = getPushConfig();
  return !!(url && secret);
}

export function isWithinQuietHours(now = new Date()) {
  const { quietHours, quietStart, quietEnd } = getPushConfig();
  if (!quietHours) return false;
  const hour = now.getHours();
  if (quietStart > quietEnd) {
    return hour >= quietStart || hour < quietEnd;
  }
  return hour >= quietStart && hour < quietEnd;
}

export function shouldDispatchPush(eventType = null, now = new Date()) {
  if (!isPushConfigured()) return false;
  if (isWithinQuietHours(now)) return false;
  if (eventType && !isPushTypeEnabled(eventType)) return false;
  return true;
}

export function getPushStatusLabel() {
  if (!isPushSupported()) return 'Not supported in this browser';
  if (!isPushConfigured()) return 'Waiting for admin to configure the notify service';
  if (!getPushConfig().enabled) return 'Disabled on this device';
  if (Notification.permission === 'granted') {
    return isWithinQuietHours()
      ? 'Enabled · quiet hours (in-app alerts still on)'
      : 'Enabled on this device';
  }
  if (Notification.permission === 'denied') return 'Blocked in browser settings';
  return 'Not enabled yet';
}

export function voteActionLabel(vote) {
  if (vote === 'accept') return 'accepted';
  if (vote === 'reject') return 'rejected';
  if (vote === 'abstain') return 'abstained';
  return 'responded to';
}

function scheduleUrl() {
  return './index.html#schedule';
}

function proposalsUrl(proposalId = null) {
  return proposalId
    ? `./index.html#proposals?highlight=${encodeURIComponent(proposalId)}`
    : './index.html#proposals';
}

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map(char => char.charCodeAt(0)));
}

async function fetchNotifyPublicKey(baseUrl) {
  const res = await fetch(`${baseUrl}/v1/config`);
  if (!res.ok) throw new Error('Could not load notify service config');
  const data = await res.json();
  if (!data.publicKey) throw new Error('Notify service did not return a public key');
  return data.publicKey;
}

export function findProposerPartner(proposal, config) {
  return findPartnerByRef(config, proposal.proposer);
}

export function buildProposalReviewRecipients(proposal, config) {
  if (getWorkflowState(proposal) !== WORKFLOW.PROPOSED) return [];
  const recipients = [];
  getRequiredVoters(proposal.participantRoles || [], config).forEach(name => {
    if (partnerRefsMatch(config, name, proposal.proposer)) return;
    if (proposal.submittedBy && partnerRefsMatch(config, name, proposal.submittedBy)) return;
    const response = getResponseForParticipant(proposal, name, config);
    if (response?.status !== 'pending') return;
    const recipient = findPartnerByRef(config, name);
    if (!recipient || isPartnerPassive(recipient)) return;
    recipients.push(recipient);
  });
  return recipients;
}

export function buildProposalSubmittedPushPayload(proposal, config) {
  const pastNote = isPastScheduledEvent(proposal) ? ' This proposal is scheduled in the past.' : '';
  return {
    type: 'proposal-submitted',
    proposalId: proposal.id,
    title: 'Proposal needs your review',
    body: `"${proposal.title}" from ${proposal.proposer} is waiting for your response.${pastNote}`,
    url: proposalsUrl(proposal.id),
    dedupeKey: `pending_${proposal.id}`,
    recipientIds: buildProposalReviewRecipients(proposal, config).map(r => r.id)
  };
}

export function buildProposalVotePushPayload(proposal, config, voterName, vote) {
  const proposer = findProposerPartner(proposal, config);
  if (!proposer) return null;
  const voterFirst = partnerDisplayFirstName(voterName);
  return {
    type: 'proposal-vote',
    proposalId: proposal.id,
    title: 'New response on your proposal',
    body: `${voterFirst} ${voteActionLabel(vote)} "${proposal.title}".`,
    url: proposalsUrl(proposal.id),
    dedupeKey: `vote_${proposal.id}_${voterName}_${vote}`,
    recipientIds: [proposer.id]
  };
}

export function buildProposalApprovedPushPayload(proposal, config) {
  const proposer = findProposerPartner(proposal, config);
  if (!proposer) return null;
  return {
    type: 'proposal-approved',
    proposalId: proposal.id,
    title: 'Proposal approved',
    body: `"${proposal.title}" was approved and added to the calendar.`,
    url: proposalsUrl(proposal.id),
    dedupeKey: `approved_${proposal.id}`,
    recipientIds: [proposer.id]
  };
}

export function buildProposalDeclinedPushPayload(proposal, config, declinedBy = null) {
  const proposer = findProposerPartner(proposal, config);
  if (!proposer) return null;
  const byLine = declinedBy ? ` by ${partnerDisplayFirstName(declinedBy)}` : '';
  return {
    type: 'proposal-declined',
    proposalId: proposal.id,
    title: 'Proposal declined',
    body: `"${proposal.title}" was declined${byLine}.`,
    url: proposalsUrl(proposal.id),
    dedupeKey: `declined_${proposal.id}_${declinedBy || 'unknown'}`,
    recipientIds: [proposer.id]
  };
}

export function buildProposalWithdrawnPushPayload(proposal, config, options = {}) {
  const { reason = '', actingUserId = null, kind = 'retracted' } = options;
  const actor = findPartnerByRef(config, options.actorName) || null;
  const actorFirst = actor ? partnerDisplayFirstName(actor.name) : 'Someone';
  const reasonNote = reason ? ` Reason: ${reason}` : '';
  const recipients = buildProposalReviewRecipients(proposal, config)
    .filter(r => !actingUserId || r.id !== actingUserId);
  if (!recipients.length) return null;
  return {
    type: kind === 'cancelled' ? 'proposal-cancelled' : 'proposal-retracted',
    proposalId: proposal.id,
    title: kind === 'cancelled' ? 'Proposal cancelled' : 'Proposal retracted',
    body: `${actorFirst} ${kind === 'cancelled' ? 'cancelled' : 'retracted'} "${proposal.title}".${reasonNote}`,
    url: proposalsUrl(proposal.id),
    dedupeKey: `${kind}_${proposal.id}`,
    recipientIds: recipients.map(r => r.id)
  };
}

async function registerSubscriptionWithServer(partnerId, subscription) {
  const { url, secret } = getPushConfig();
  let householdId = null;
  try {
    const config = JSON.parse(localStorage.getItem(LOCAL_CONFIG_KEY) || 'null');
    householdId = config?.householdId || null;
  } catch {
    householdId = null;
  }
  const { getDeviceId } = await import('./household-sync.js');
  const res = await fetch(`${url}/v1/subscriptions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Notify-Secret': secret
    },
    body: JSON.stringify({
      partnerId,
      subscription,
      householdId,
      deviceId: getDeviceId()
    })
  });
  if (!res.ok) throw new Error('Failed to register push subscription');
}

export async function dispatchPushEvent(payload) {
  const recipientIds = (payload?.recipientIds || []).filter(Boolean);
  if (!recipientIds.length) return { skipped: 'no recipients' };
  if (!shouldDispatchPush(payload.type)) {
    if (!isPushConfigured()) return { skipped: 'not configured' };
    if (isWithinQuietHours()) return { skipped: 'quiet hours' };
    if (!isPushTypeEnabled(payload.type)) return { skipped: 'type disabled' };
    return { skipped: 'push blocked' };
  }

  const { url, secret } = getPushConfig();
  try {
    const res = await fetch(`${url}/v1/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Notify-Secret': secret
      },
      body: JSON.stringify({ ...payload, recipientIds })
    });
    if (!res.ok) throw new Error('Notify service rejected the event');
    return res.json();
  } catch (err) {
    console.warn('[push] Failed to dispatch push event', err);
    return { error: err?.message || 'dispatch failed' };
  }
}

function formatPushDispatchFailure(result) {
  if (result?.skipped) {
    if (result.skipped === 'quiet hours') {
      return 'Test skipped during quiet hours. Disable quiet hours or try again later.';
    }
    return `Test skipped (${result.skipped}).`;
  }
  if (result?.error) return result.error;

  const sent = Number(result?.sent || 0);
  if (sent > 0) return null;

  const serverError = result?.errors?.[0]?.message;
  if (serverError) {
    return `Notify service could not reach this device (${serverError}). Try Disable, then Enable push again.`;
  }
  return 'Notify service did not deliver to any registered device. Try Disable, then Enable push again. If this persists, check Admin → Registered push devices.';
}

export async function showLocalTestNotification() {
  if (typeof Notification === 'undefined' || Notification.permission !== 'granted') {
    return false;
  }
  const registration = await navigator.serviceWorker.ready;
  await registration.showNotification('Test notification', {
    body: 'Push notifications are working on this device.',
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    tag: 'polyschedule-test',
    data: { url: './index.html#settings' }
  });
  return true;
}

export async function enablePushOnThisDevice(partnerId) {
  if (!isPushSupported()) throw new Error('Push notifications are not supported here');
  if (!isPushConfigured()) throw new Error('Notify service is not configured yet');
  if (isIosDevice() && !isStandalonePwa()) {
    throw new Error('On iPhone, add PolySchedule to your Home Screen first, then enable notifications.');
  }

  const permission = await Notification.requestPermission();
  if (permission !== 'granted') throw new Error('Notification permission was not granted');

  const { url } = getPushConfig();
  const registration = await navigator.serviceWorker.ready;
  const publicKey = await fetchNotifyPublicKey(url);

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey)
    });
  }

  await registerSubscriptionWithServer(partnerId, subscription.toJSON());
  localStorage.setItem(PUSH_ENABLED_KEY, '1');
  return subscription;
}

export async function disablePushOnThisDevice(partnerId) {
  localStorage.setItem(PUSH_ENABLED_KEY, '0');
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (!subscription) return;

  const { url, secret } = getPushConfig();
  if (url && secret) {
    await fetch(`${url}/v1/subscriptions`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'X-Notify-Secret': secret
      },
      body: JSON.stringify({ partnerId, endpoint: subscription.endpoint })
    }).catch(() => {});
  }
  await subscription.unsubscribe().catch(() => {});
}

export async function syncPushSubscriptionIfEnabled(partnerId) {
  if (!partnerId || !getPushConfig().enabled || !isPushConfigured()) return;
  if (Notification.permission !== 'granted') return;
  try {
    await enablePushOnThisDevice(partnerId);
  } catch {
    // Silent refresh failure; user can re-enable from Settings.
  }
}

export async function dispatchProposalReviewPush(proposal, config) {
  return dispatchPushEvent(attachRecipientEmails(buildProposalSubmittedPushPayload(proposal, config), config));
}

export async function dispatchProposalVotePush(proposal, config, voterName, vote) {
  return dispatchPushEvent(attachRecipientEmails(buildProposalVotePushPayload(proposal, config, voterName, vote), config));
}

export async function dispatchProposalApprovedPush(proposal, config) {
  return dispatchPushEvent(attachRecipientEmails(buildProposalApprovedPushPayload(proposal, config), config));
}

export async function dispatchProposalDeclinedPush(proposal, config, declinedBy) {
  return dispatchPushEvent(attachRecipientEmails(buildProposalDeclinedPushPayload(proposal, config, declinedBy), config));
}

export async function dispatchProposalWithdrawnPush(proposal, config, options) {
  return dispatchPushEvent(attachRecipientEmails(buildProposalWithdrawnPushPayload(proposal, config, options), config));
}

export function buildGCalEventCreatedPushPayload(event, config, { actorLabel = null, actorPartnerId = null, label = null, when = null } = {}) {
  const recipients = (config?.partners || [])
    .map((p) => p.id)
    .filter((id) => id && id !== actorPartnerId);
  if (!recipients.length) return null;
  const actorLine = actorLabel ? ` by ${actorLabel}` : '';
  return {
    type: 'gcal-event-created',
    proposalId: event?.id || 'gcal',
    title: 'New calendar event',
    body: `"${label || event?.title || 'Event'}" was added${actorLine}${when ? ` (${when})` : ''}.`,
    url: scheduleUrl(),
    dedupeKey: `gcal_add_${event?.id}`,
    recipientIds: recipients
  };
}

export function buildGCalEventDeletedPushPayload(event, config, {
  actorLabel = null,
  actorPartnerId = null,
  label = null,
  when = null,
  recipientIds = []
} = {}) {
  const ids = (recipientIds || []).filter((id) => id && id !== actorPartnerId);
  if (!ids.length) return null;
  return {
    type: 'gcal-event-deleted',
    proposalId: event?.id || 'gcal',
    title: 'Calendar event cancelled',
    body: `"${label || event?.title || 'Event'}"${when ? ` (${when})` : ''} was removed by ${actorLabel || 'someone'}.`,
    url: scheduleUrl(),
    dedupeKey: `gcal_del_${event?.id}_${actorPartnerId || 'unknown'}`,
    recipientIds: ids
  };
}

export async function dispatchGCalEventCreatedPush(event, config, options = {}) {
  return dispatchPushEvent(attachRecipientEmails(buildGCalEventCreatedPushPayload(event, config, options), config));
}

export async function dispatchGCalEventDeletedPush(event, config, options = {}) {
  return dispatchPushEvent(attachRecipientEmails(buildGCalEventDeletedPushPayload(event, config, options), config));
}

export function buildEventCommentPushPayload(event, config, {
  authorName,
  commentText,
  actingUserId = null,
  recipientIds = [],
  label = null
} = {}) {
  const ids = (recipientIds || []).filter((id) => id && id !== actingUserId);
  if (!ids.length) return null;
  const authorFirst = authorName?.split(' ')[0] || 'Someone';
  const preview = commentText?.length > 100 ? `${commentText.slice(0, 97)}…` : commentText;
  const ws = getWorkflowState(event);
  const url = ws === WORKFLOW.PROPOSED
    ? proposalsUrl(event?.id)
    : scheduleUrl();
  return {
    type: 'event-comment',
    proposalId: event?.id || 'comment',
    title: 'New comment',
    body: `${authorFirst} on "${label || event?.title || 'Event'}": ${preview}`,
    url,
    dedupeKey: `comment_${event?.id}_${authorFirst}`,
    recipientIds: ids
  };
}

export async function dispatchEventCommentPush(event, config, options = {}) {
  return dispatchPushEvent(attachRecipientEmails(buildEventCommentPushPayload(event, config, options), config));
}

export async function sendTestPush(partnerId) {
  if (!partnerId) throw new Error('You must be logged in to test push notifications.');
  if (!isPushConfigured()) throw new Error('Notify service is not configured');

  await enablePushOnThisDevice(partnerId);
  await showLocalTestNotification();

  const result = await dispatchPushEvent({
    type: 'test',
    proposalId: 'test',
    title: 'Test notification',
    body: 'Push notifications are working on this device.',
    url: './index.html#settings',
    dedupeKey: `test_${partnerId}_${Date.now()}`,
    recipientIds: [partnerId]
  });

  const failure = formatPushDispatchFailure(result);
  if (failure) throw new Error(failure);

  return result;
}

export function saveQuietHoursSettings({ enabled, startHour, endHour }) {
  localStorage.setItem(PUSH_QUIET_HOURS_KEY, enabled ? '1' : '0');
  if (Number.isFinite(startHour)) {
    localStorage.setItem(PUSH_QUIET_START_KEY, String(startHour));
  }
  if (Number.isFinite(endHour)) {
    localStorage.setItem(PUSH_QUIET_END_KEY, String(endHour));
  }
}

export async function fetchRegisteredDevices() {
  const { url, secret } = getPushConfig();
  if (!url || !secret) throw new Error('Notify service is not configured');
  let res;
  try {
    res = await fetch(`${url}/v1/devices`, {
      headers: { 'X-Notify-Secret': secret }
    });
  } catch {
    throw new Error(`Could not reach notify service at ${url}. Is it running?`);
  }
  if (res.status === 401) {
    throw new Error('Notify secret rejected. Check Admin → Notify Secret matches NOTIFY_SECRET on the service.');
  }
  if (res.status === 404) {
    throw new Error('Device list not available — restart the notify service (npm run notify) to pick up the latest version.');
  }
  if (!res.ok) throw new Error(`Could not load registered devices (HTTP ${res.status}).`);
  return res.json();
}
