import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
});

import {
  buildProposalReviewRecipients,
  buildProposalSubmittedPushPayload,
  buildProposalVotePushPayload,
  buildProposalApprovedPushPayload,
  buildProposalDeclinedPushPayload,
  buildProposalWithdrawnPushPayload,
  buildRecipientEmails,
  isWithinQuietHours,
  isPushTypeEnabled,
  savePushTypePrefs,
  saveQuietHoursSettings,
  shouldDispatchPush,
  voteActionLabel,
  PUSH_TYPE_LABELS
} from '../js/push-notifications.js';
import { WORKFLOW } from '../js/proposal-workflow.js';

const config = {
  partners: [
    { id: 'p1', name: 'Michael Burton', username: 'michael', role: 'Admin' },
    { id: 'p2', name: 'Katie Thompson', username: 'katie', role: 'User' },
    { id: 'p3', name: 'Bailey', username: 'bailey', role: 'User', passive: true }
  ]
};

describe('buildProposalReviewRecipients', () => {
  it('includes required active voters except the proposer', () => {
    const proposal = {
      id: 'prop_1',
      type: 'event',
      title: 'Dinner',
      proposer: 'Michael Burton',
      workflowState: WORKFLOW.PROPOSED,
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' },
        { name: 'Bailey', role: 'optional' }
      ],
      responses: {
        'Michael Burton': { status: 'accept', comment: '' },
        'Katie Thompson': { status: 'pending', comment: '' }
      }
    };

    const recipients = buildProposalReviewRecipients(proposal, config);
    expect(recipients.map(r => r.id)).toEqual(['p2']);
  });
});

describe('buildProposalSubmittedPushPayload', () => {
  it('builds a proposal-submitted event for pending reviewers', () => {
    const proposal = {
      id: 'prop_1',
      type: 'event',
      title: 'Dinner',
      proposer: 'Michael Burton',
      workflowState: WORKFLOW.PROPOSED,
      start: '2026-06-10T23:00:00.000Z',
      end: '2026-06-11T01:00:00.000Z',
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' }
      ],
      responses: {
        'Michael Burton': { status: 'accept', comment: '' },
        'Katie Thompson': { status: 'pending', comment: '' }
      }
    };

    const payload = buildProposalSubmittedPushPayload(proposal, config);
    expect(payload.type).toBe('proposal-submitted');
    expect(payload.recipientIds).toEqual(['p2']);
    expect(payload.body).toContain('Dinner');
    expect(payload.dedupeKey).toBe('pending_prop_1');
  });

  it('excludes the user who submitted on someone else\'s behalf', () => {
    const proposal = {
      id: 'prop_2',
      type: 'event',
      title: 'Dinner',
      proposer: 'Michael Burton',
      submittedBy: 'Katie Thompson',
      workflowState: WORKFLOW.PROPOSED,
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' }
      ],
      responses: {
        'Michael Burton': { status: 'accept' },
        'Katie Thompson': { status: 'accept', comment: 'Submitted on behalf' }
      }
    };

    const recipients = buildProposalReviewRecipients(proposal, config);
    expect(recipients.map(r => r.id)).toEqual([]);
  });
});

describe('voteActionLabel', () => {
  it('maps vote statuses to readable verbs', () => {
    expect(voteActionLabel('accept')).toBe('accepted');
    expect(voteActionLabel('reject')).toBe('rejected');
    expect(voteActionLabel('abstain')).toBe('abstained');
  });
});

describe('isWithinQuietHours', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns false when quiet hours are disabled', () => {
    localStorage.setItem('polyschedule_push_quiet_hours', '0');
    expect(isWithinQuietHours(new Date(2026, 5, 9, 23, 0, 0))).toBe(false);
  });

  it('returns true overnight when quiet hours are enabled', () => {
    localStorage.setItem('polyschedule_push_quiet_hours', '1');
    localStorage.setItem('polyschedule_push_quiet_start', '22');
    localStorage.setItem('polyschedule_push_quiet_end', '8');
    expect(isWithinQuietHours(new Date(2026, 5, 9, 23, 0, 0))).toBe(true);
    expect(isWithinQuietHours(new Date(2026, 5, 9, 10, 0, 0))).toBe(false);
  });
});

describe('phase 2 push payloads', () => {
  const proposal = {
    id: 'prop_1',
    type: 'event',
    title: 'Dinner',
    proposer: 'Michael Burton',
    workflowState: WORKFLOW.PROPOSED,
    participantRoles: [
      { name: 'Michael Burton', role: 'required' },
      { name: 'Katie Thompson', role: 'required' }
    ],
    responses: {
      'Michael Burton': { status: 'accept' },
      'Katie Thompson': { status: 'pending' }
    }
  };

  it('builds vote notification for proposer', () => {
    const payload = buildProposalVotePushPayload(proposal, config, 'Katie Thompson', 'accept');
    expect(payload?.recipientIds).toEqual(['p1']);
    expect(payload?.body).toContain('Katie');
    expect(payload?.body).toContain('accepted');
  });

  it('builds approved notification for proposer', () => {
    const payload = buildProposalApprovedPushPayload(proposal, config);
    expect(payload?.recipientIds).toEqual(['p1']);
    expect(payload?.type).toBe('proposal-approved');
  });

  it('builds declined notification for proposer', () => {
    const payload = buildProposalDeclinedPushPayload(proposal, config, 'Katie Thompson');
    expect(payload?.recipientIds).toEqual(['p1']);
    expect(payload?.body).toContain('declined');
  });

  it('builds retract notification for pending reviewers', () => {
    const payload = buildProposalWithdrawnPushPayload(proposal, config, {
      kind: 'retracted',
      actorName: 'Michael Burton',
      actingUserId: 'p1'
    });
    expect(payload?.recipientIds).toEqual(['p2']);
    expect(payload?.type).toBe('proposal-retracted');
  });

  it('builds cancelled notification for pending reviewers', () => {
    const payload = buildProposalWithdrawnPushPayload(proposal, config, {
      kind: 'cancelled',
      actorName: 'Michael Burton',
      actingUserId: 'p1'
    });
    expect(payload?.type).toBe('proposal-cancelled');
    expect(payload?.title).toBe('Proposal cancelled');
  });
});

describe('shouldDispatchPush', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('polyschedule_notify_url', 'http://127.0.0.1:8787');
    localStorage.setItem('polyschedule_notify_secret', 'secret');
  });

  it('returns false when notify service is not configured', () => {
    localStorage.removeItem('polyschedule_notify_url');
    expect(shouldDispatchPush('proposal-submitted')).toBe(false);
  });

  it('returns false during quiet hours', () => {
    localStorage.setItem('polyschedule_push_quiet_hours', '1');
    localStorage.setItem('polyschedule_push_quiet_start', '22');
    localStorage.setItem('polyschedule_push_quiet_end', '8');
    expect(shouldDispatchPush('proposal-submitted', new Date(2026, 5, 9, 23, 0, 0))).toBe(false);
  });

  it('returns false when the event type is disabled', () => {
    savePushTypePrefs({ 'proposal-vote': false });
    expect(shouldDispatchPush('proposal-vote')).toBe(false);
    expect(shouldDispatchPush('proposal-submitted')).toBe(true);
  });
});

describe('saveQuietHoursSettings', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('persists quiet hours preferences', () => {
    saveQuietHoursSettings({ enabled: true, startHour: 21, endHour: 7 });
    expect(localStorage.getItem('polyschedule_push_quiet_hours')).toBe('1');
    expect(localStorage.getItem('polyschedule_push_quiet_start')).toBe('21');
    expect(localStorage.getItem('polyschedule_push_quiet_end')).toBe('7');
  });
});

describe('buildRecipientEmails', () => {
  it('maps recipient ids to partner notification emails', () => {
    const emails = buildRecipientEmails(['p1', 'p2'], {
      partners: [
        { id: 'p1', name: 'Michael', notificationEmail: 'm@example.com' },
        { id: 'p2', name: 'Katie' }
      ]
    });
    expect(emails).toEqual({ p1: 'm@example.com' });
  });
});

describe('PUSH_TYPE_LABELS', () => {
  it('defines labels for all workflow push types', () => {
    expect(PUSH_TYPE_LABELS['proposal-submitted']).toBeTruthy();
    expect(PUSH_TYPE_LABELS['proposal-vote']).toBeTruthy();
    expect(PUSH_TYPE_LABELS['proposal-approved']).toBeTruthy();
    expect(PUSH_TYPE_LABELS['proposal-declined']).toBeTruthy();
    expect(PUSH_TYPE_LABELS['proposal-retracted']).toBeTruthy();
    expect(PUSH_TYPE_LABELS['proposal-cancelled']).toBeTruthy();
    expect(PUSH_TYPE_LABELS['event-comment']).toBeTruthy();
  });

  it('defaults event types to enabled', () => {
    localStorage.clear();
    expect(isPushTypeEnabled('proposal-vote')).toBe(true);
  });
});
