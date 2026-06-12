import { describe, expect, it } from 'vitest';
import {
  buildInitialResponses,
  evaluateProposedProposal,
  filterProposalsForTab,
  getProposalOutcome,
  getRequiredVoters,
  isSoloEventProposal,
  userNeedsProposalVote,
  WORKFLOW
} from '../js/proposal-workflow.js';

describe('evaluateProposedProposal', () => {
  it('declines when a required participant rejects', () => {
    const result = evaluateProposedProposal({
      type: 'event',
      workflowState: WORKFLOW.PROPOSED,
      participantRoles: [
        { name: 'Alex Rivera', role: 'required' },
        { name: 'Sam Davis', role: 'required' }
      ],
      responses: {
        'Alex Rivera': { status: 'accept' },
        'Sam Davis': { status: 'reject' }
      }
    }, { partners: [] });
    expect(result.transition).toBe('declined');
    expect(result.declinedBy).toBe('Sam Davis');
  });

  it('optional reject does not decline proposal', () => {
    const result = evaluateProposedProposal({
      type: 'event',
      workflowState: WORKFLOW.PROPOSED,
      participantRoles: [
        { name: 'Alex Rivera', role: 'required' },
        { name: 'Sam Davis', role: 'required' },
        { name: 'Jordan Smith', role: 'optional' }
      ],
      responses: {
        'Alex Rivera': { status: 'accept' },
        'Sam Davis': { status: 'pending' },
        'Jordan Smith': { status: 'reject' }
      }
    }, { partners: [] });
    expect(result.transition).toBeNull();
  });

  it('approves event when required voters accept or abstain', () => {
    const result = evaluateProposedProposal({
      type: 'event',
      workflowState: WORKFLOW.PROPOSED,
      participantRoles: [
        { name: 'Alex Rivera', role: 'required' },
        { name: 'Sam Davis', role: 'required' },
        { name: 'Jordan Smith', role: 'required' }
      ],
      responses: {
        'Alex Rivera': { status: 'accept' },
        'Sam Davis': { status: 'accept' },
        'Jordan Smith': { status: 'abstain' }
      }
    }, { partners: [] });
    expect(result.transition).toBe('approved');
  });
});

describe('getProposalOutcome', () => {
  it('returns confirmed when all votes are accept or abstain for events', () => {
    const responses = {
      'Michael Burton': { status: 'accept' },
      'Katie Thompson': { status: 'accept' },
      'Jordan Lee': { status: 'abstain' }
    };
    expect(getProposalOutcome(responses, 'event')).toBe('confirmed');
  });
});

describe('isSoloEventProposal', () => {
  it('returns true when only proposer is required', () => {
    const config = { partners: [{ id: 'p1', name: 'Alex Rivera', username: 'alex' }] };
    expect(isSoloEventProposal({
      type: 'event',
      proposer: 'Alex Rivera',
      participantRoles: [{ name: 'Alex Rivera', role: 'required' }]
    }, config)).toBe(true);
  });

  it('returns false when others are required', () => {
    const config = { partners: [
      { id: 'p1', name: 'Alex Rivera' },
      { id: 'p2', name: 'Sam Davis' }
    ] };
    expect(isSoloEventProposal({
      type: 'event',
      proposer: 'Alex Rivera',
      participantRoles: [
        { name: 'Alex Rivera', role: 'required' },
        { name: 'Sam Davis', role: 'required' }
      ]
    }, config)).toBe(false);
  });
});

describe('getRequiredVoters', () => {
  it('excludes passive partners from required voters', () => {
    const voters = getRequiredVoters([
      { name: 'Alex Rivera', role: 'required' },
      { name: 'Casey Chen', role: 'optional' }
    ], {
      partners: [{ name: 'Casey Chen', passive: true }]
    });
    expect(voters).toEqual(['Alex Rivera']);
  });
});

describe('userNeedsProposalVote', () => {
  const config = {
    partners: [
      { id: 'p1', name: 'Michael Burton', username: 'mpburton' },
      { id: 'p2', name: 'Katie Thompson', username: 'katie' }
    ]
  };

  it('returns false for the proposer even when they are a required participant', () => {
    const proposal = {
      type: 'event',
      workflowState: WORKFLOW.PROPOSED,
      proposer: 'Michael Burton',
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' }
      ],
      responses: {
        'Michael Burton': { status: 'accept' },
        'Katie Thompson': { status: 'pending' }
      }
    };
    expect(userNeedsProposalVote(proposal, 'p1', config)).toBe(false);
    expect(userNeedsProposalVote(proposal, 'Michael Burton', config)).toBe(false);
  });

  it('returns true for other required voters with pending responses', () => {
    const proposal = {
      type: 'event',
      workflowState: WORKFLOW.PROPOSED,
      proposer: 'Michael Burton',
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' }
      ],
      responses: {
        'Michael Burton': { status: 'accept' },
        'Katie Thompson': { status: 'pending' }
      }
    };
    expect(userNeedsProposalVote(proposal, 'p2', config)).toBe(true);
  });

  it('returns false for the user who submitted on someone else\'s behalf', () => {
    const proposal = {
      type: 'event',
      workflowState: WORKFLOW.PROPOSED,
      proposer: 'Michael Burton',
      submittedBy: 'Katie Thompson',
      participantRoles: [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' }
      ],
      responses: {
        'Michael Burton': { status: 'accept' },
        'Katie Thompson': { status: 'accept', comment: 'Submitted on behalf' }
      }
    };
    expect(userNeedsProposalVote(proposal, 'p2', config)).toBe(false);
    expect(userNeedsProposalVote(proposal, 'Katie Thompson', config)).toBe(false);
  });
});

describe('buildInitialResponses', () => {
  const config = {
    partners: [
      { id: 'p1', name: 'Michael Burton', username: 'mpburton' },
      { id: 'p2', name: 'Katie Thompson', username: 'katie' }
    ]
  };

  it('auto-accepts the submitter when they submit on someone else\'s behalf', () => {
    const responses = buildInitialResponses(
      'Michael Burton',
      [
        { name: 'Michael Burton', role: 'required' },
        { name: 'Katie Thompson', role: 'required' }
      ],
      config,
      'Katie Thompson'
    );
    expect(responses['Michael Burton'].status).toBe('accept');
    expect(responses['Katie Thompson'].status).toBe('accept');
    expect(responses['Katie Thompson'].comment).toBe('Submitted on behalf');
  });
});

describe('filterProposalsForTab', () => {
  const config = { partners: [{ id: 'p1', name: 'Alex Rivera' }] };
  const events = [
    { id: '1', type: 'event', workflowState: WORKFLOW.DRAFT, proposer: 'Alex Rivera' },
    { id: '2', type: 'event', workflowState: WORKFLOW.PROPOSED, proposer: 'Alex Rivera' },
    { id: '3', type: 'event', workflowState: WORKFLOW.APPROVED, proposer: 'Alex Rivera' },
    { id: '4', type: 'event', workflowState: WORKFLOW.ARCHIVED, proposer: 'Alex Rivera' },
    { id: '5', type: 'event', workflowState: WORKFLOW.DECLINED, proposer: 'Alex Rivera' }
  ];

  it('groups approved and declined under resolved; archived has its own tab', () => {
    const resolved = filterProposalsForTab(events, 'resolved', 'Alex Rivera', config);
    expect(resolved.map((e) => e.id)).toEqual(['3', '5']);
    expect(filterProposalsForTab(events, 'archived', 'Alex Rivera', config).map((e) => e.id)).toEqual(['4']);
  });
});
