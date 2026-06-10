import { describe, expect, it } from 'vitest';
import {
  findPartnerByRef,
  partnerRefsMatch,
  partnerDisplayFirstName,
  getPartnerById
} from '../js/helpers.js';
import { canUserSeeProposal } from '../js/proposal-workflow.js';

const config = {
  partners: [
    { id: 'p1', name: 'Alex Rivera', username: 'alex', rules: { minSoloNights: 2 } },
    { id: 'p2', name: 'Sam Davis', username: 'sam' }
  ]
};

describe('findPartnerByRef', () => {
  it('resolves stable partner id', () => {
    expect(findPartnerByRef(config, 'p1')?.name).toBe('Alex Rivera');
  });

  it('falls back to full display name', () => {
    expect(findPartnerByRef(config, 'Sam Davis')?.id).toBe('p2');
  });

  it('falls back to first-name legacy reference', () => {
    expect(findPartnerByRef(config, 'Alex')?.id).toBe('p1');
  });
});

describe('partnerRefsMatch', () => {
  it('matches id to display name for the same partner', () => {
    expect(partnerRefsMatch(config, 'p1', 'Alex Rivera')).toBe(true);
  });

  it('does not match different partners', () => {
    expect(partnerRefsMatch(config, 'p1', 'Sam Davis')).toBe(false);
  });
});

describe('partnerDisplayFirstName', () => {
  it('returns first token of display name', () => {
    expect(partnerDisplayFirstName('Alex Rivera')).toBe('Alex');
  });
});

describe('getPartnerById', () => {
  it('returns null for unknown id', () => {
    expect(getPartnerById(config, 'missing')).toBeNull();
  });
});

describe('canUserSeeProposal', () => {
  it('allows participants matched by partner id', () => {
    const proposal = {
      proposer: 'Sam Davis',
      participantRoles: [{ name: 'p1', role: 'required' }]
    };
    expect(canUserSeeProposal(proposal, 'Alex Rivera', config)).toBe(true);
  });

  it('allows proposer visibility', () => {
    const proposal = {
      proposer: 'Sam Davis',
      participantRoles: [{ name: 'Alex Rivera', role: 'required' }]
    };
    expect(canUserSeeProposal(proposal, 'Sam Davis', config)).toBe(true);
  });
});
