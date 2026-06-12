import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LOGS_STORAGE_KEY } from '../js/storage-keys.js';

const storage = vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
  return { local };
});

vi.mock('../js/calendar.js', () => ({
  CalendarSync: { mode: 'offline' }
}));

const pushMocks = vi.hoisted(() => ({
  dispatchProposalReviewPush: vi.fn().mockResolvedValue({ ok: true }),
  dispatchProposalVotePush: vi.fn().mockResolvedValue({ ok: true }),
  dispatchProposalApprovedPush: vi.fn().mockResolvedValue({ ok: true }),
  dispatchProposalDeclinedPush: vi.fn().mockResolvedValue({ ok: true }),
  dispatchProposalWithdrawnPush: vi.fn().mockResolvedValue({ ok: true })
}));

vi.mock('../js/push-notifications.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, ...pushMocks };
});

describe('system log rendering', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { state } = await import('../js/app/state.js');
    state.logs = [];
  });

  it('marks user events and renders them with the user line class', async () => {
    const { logUserAction, isUserLogEntry, renderSystemLogLine } = await import('../js/app/operation-log.js');
    logUserAction('Submitted proposal: "Dinner".', 'info', 'Michael Burton');
    const entry = JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY))[0];
    expect(isUserLogEntry(entry)).toBe(true);
    expect(entry.user).toBe('Michael Burton');
    expect(renderSystemLogLine(entry)).toContain('console-line--user');
    expect(renderSystemLogLine(entry)).toContain('Michael Burton: Submitted proposal');
  });

  it('keeps operational errors as non-user log lines', async () => {
    const { logOperationError, isUserLogEntry, renderSystemLogLine } = await import('../js/app/context.js');
    logOperationError('Proposal submit', new Error('Network failed'), { proposalTitle: 'Dinner' });
    const entry = JSON.parse(localStorage.getItem(LOGS_STORAGE_KEY))[0];
    expect(isUserLogEntry(entry)).toBe(false);
    expect(renderSystemLogLine(entry)).not.toContain('console-line--user');
    expect(renderSystemLogLine(entry)).toContain('var(--error)');
  });
});

describe('logOperationError', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { state } = await import('../js/app/state.js');
    state.logs = [];
    state.currentUser = { name: 'Michael Burton', sessionActive: true };
    state.currentView = 'create';
    state.calendarStatus = 'disconnected';
  });

  it('persists error details and support context to system logs', async () => {
    const { logOperationError, loadPersistedLogs } = await import('../js/app/context.js');
    const err = new Error('Failed to update calendar event on Google Calendar');

    logOperationError('Proposal submit', err, {
      draftId: 'prop_123',
      proposalTitle: 'Dinner'
    });

    const saved = loadPersistedLogs();
    expect(saved).toHaveLength(1);
    expect(saved[0].type).toBe('error');
    expect(saved[0].operation).toBe('Proposal submit');
    expect(saved[0].errorMessage).toBe(err.message);
    expect(saved[0].support.user).toBe('Michael Burton');
    expect(saved[0].support.draftId).toBe('prop_123');
    expect(saved[0].message).toContain('Proposal submit failed');
    expect(saved[0].message).toContain('draftId=prop_123');
    expect(localStorage.getItem(LOGS_STORAGE_KEY)).toContain('Proposal submit failed');
  });
});

describe('pushAppNotification', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { state } = await import('../js/app/state.js');
    state.notifications = [];
    state.currentUser = { id: 'p1', name: 'Michael Burton', sessionActive: true };
    state.config = {
      partners: [
        { id: 'p1', name: 'Michael Burton', username: 'mpburton' },
        { id: 'p2', name: 'Katie Thompson', username: 'katie' }
      ]
    };
  });

  it('stores review alerts for the recipient user, not the current user', async () => {
    const { state } = await import('../js/app/state.js');
    const {
      pushAppNotification,
      loadNotificationsForUser,
      refreshCurrentUserNotifications
    } = await import('../js/app/context.js');

    pushAppNotification({
      title: 'Proposal needs your review',
      description: '"This week" from Michael Burton is waiting for your response.',
      dedupeKey: 'pending_prop1_p2',
      recipientId: 'p2'
    });

    expect(loadNotificationsForUser('p2')).toHaveLength(1);
    refreshCurrentUserNotifications();
    expect(state.notifications).toHaveLength(0);
  });
});

describe('notifyProposalReviewers', () => {
  beforeEach(async () => {
    localStorage.clear();
    const { state } = await import('../js/app/state.js');
    state.notifications = [];
    state.currentUser = { id: 'p2', name: 'Katie Thompson', sessionActive: true };
    state.config = {
      partners: [
        { id: 'p1', name: 'Michael Burton', username: 'mpburton' },
        { id: 'p2', name: 'Katie Thompson', username: 'katie' }
      ]
    };
    state.events = [];
  });

  it('does not notify the acting user who just submitted on someone else\'s behalf', async () => {
    const { state } = await import('../js/app/state.js');
    const {
      notifyProposalReviewers,
      loadNotificationsForUser,
      refreshCurrentUserNotifications
    } = await import('../js/app/context.js');
    const { WORKFLOW } = await import('../js/proposal-workflow.js');

    const proposal = {
      id: 'prop_1',
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
        'Katie Thompson': { status: 'pending' }
      }
    };

    notifyProposalReviewers(proposal, state.config, { actingUserId: 'p2' });
    refreshCurrentUserNotifications();
    expect(state.notifications).toHaveLength(0);
    expect(loadNotificationsForUser('p1')).toHaveLength(0);
  });
});

describe('phase 2 notification helpers', () => {
  beforeEach(async () => {
    localStorage.clear();
    Object.values(pushMocks).forEach(fn => fn.mockClear());
    const { state } = await import('../js/app/state.js');
    state.notifications = [];
    state.currentUser = { id: 'p2', name: 'Katie Thompson', sessionActive: true };
    state.config = {
      partners: [
        { id: 'p1', name: 'Michael Burton', username: 'mpburton' },
        { id: 'p2', name: 'Katie Thompson', username: 'katie' }
      ]
    };
  });

  it('notifyProposerOfProposalVote alerts the proposer and dispatches push', async () => {
    const { state } = await import('../js/app/state.js');
    const { loadNotificationsForUser, notifyProposerOfProposalVote } = await import('../js/app/context.js');
    const { WORKFLOW } = await import('../js/proposal-workflow.js');

    const proposal = {
      id: 'prop_1',
      type: 'event',
      title: 'Dinner',
      proposer: 'Michael Burton',
      workflowState: WORKFLOW.PROPOSED,
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' }
      ]
    };

    notifyProposerOfProposalVote(proposal, state.config, {
      voterName: 'Katie Thompson',
      vote: 'accept',
      actingUserId: 'p2'
    });

    expect(loadNotificationsForUser('p1')).toHaveLength(1);
    expect(loadNotificationsForUser('p1')[0].title).toBe('New response on your proposal');
    expect(pushMocks.dispatchProposalVotePush).toHaveBeenCalledOnce();
  });

  it('notifyProposalOutcome alerts proposer on approval', async () => {
    const { state } = await import('../js/app/state.js');
    const { loadNotificationsForUser, notifyProposalOutcome } = await import('../js/app/context.js');

    notifyProposalOutcome(
      { id: 'prop_1', title: 'Dinner', proposer: 'Michael Burton' },
      state.config,
      { outcome: 'approved' }
    );

    expect(loadNotificationsForUser('p1')).toHaveLength(1);
    expect(loadNotificationsForUser('p1')[0].title).toBe('Proposal approved');
    expect(pushMocks.dispatchProposalApprovedPush).toHaveBeenCalledOnce();
  });

  it('notifyProposalWithdrawn alerts pending reviewers', async () => {
    const { state } = await import('../js/app/state.js');
    const { loadNotificationsForUser, notifyProposalWithdrawn } = await import('../js/app/context.js');
    const { WORKFLOW } = await import('../js/proposal-workflow.js');

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

    notifyProposalWithdrawn(proposal, state.config, {
      kind: 'retracted',
      actingUserId: 'p1',
      actorName: 'Michael Burton'
    });

    expect(loadNotificationsForUser('p2')).toHaveLength(1);
    expect(loadNotificationsForUser('p2')[0].title).toBe('Proposal retracted');
    expect(pushMocks.dispatchProposalWithdrawnPush).toHaveBeenCalledOnce();
  });
});
