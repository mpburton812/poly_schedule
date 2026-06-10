import { describe, expect, it } from 'vitest';
import {
  evaluateProposedProposal,
  getProposalOutcome,
  getRequiredVoters,
  isSoloEventProposal,
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
      'Guest User': { status: 'abstain' }
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
