import { describe, it, expect, vi } from 'vitest';

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
  CONNECTION_STATUS,
  resolvePartnerLimitEntry,
  isPendingPartnerConnection,
  isApprovedPartnerConnection,
  isActivePartnerConnection,
  setPendingPartnerConnection,
  clearPartnerConnectionEntry,
  syncBidirectionalApprovedConnection,
  buildPartnerConnectionProposalPayload,
  releasePartnerConnectionProposal,
  formatPartnerConnectionProposalSummary
} from '../js/partner-connection.js';
import { WORKFLOW } from '../js/proposal-workflow.js';

describe('partner-connection', () => {
  const config = {
    partners: [
      { id: 'p1', name: 'Alex', rules: {} },
      { id: 'p2', name: 'Jordan', rules: {} }
    ]
  };

  it('tracks pending and approved partner limit entries', () => {
    setPendingPartnerConnection(config, 'p1', 'Jordan', 'prop_1');
    const pending = resolvePartnerLimitEntry(config.partners[0], 'Jordan');
    expect(isPendingPartnerConnection(pending)).toBe(true);
    expect(isActivePartnerConnection(config.partners[0], 'Jordan')).toBe(true);

    clearPartnerConnectionEntry(config, 'p1', 'Jordan');
    expect(resolvePartnerLimitEntry(config.partners[0], 'Jordan')).toBeNull();

    syncBidirectionalApprovedConnection(config, config.partners[0], config.partners[1]);
    const approved = resolvePartnerLimitEntry(config.partners[0], 'Jordan');
    expect(isApprovedPartnerConnection(approved)).toBe(true);
    expect(approved.status).toBe(CONNECTION_STATUS.APPROVED);
    expect(isApprovedPartnerConnection(resolvePartnerLimitEntry(config.partners[1], 'Alex'))).toBe(true);
  });

  it('builds partner connection proposal payload', () => {
    const payload = buildPartnerConnectionProposalPayload(config, config.partners[0], config.partners[1], 'Alex');
    expect(payload.type).toBe('partner_connection');
    expect(payload.connectionInitiatorId).toBe('p1');
    expect(payload.connectionTargetId).toBe('p2');
    expect(payload.workflowState).toBe(WORKFLOW.DRAFT);
    expect(payload.participants).toEqual(['Alex', 'Jordan']);
  });

  it('releases pending state when proposal is cleared', () => {
    const localConfig = JSON.parse(JSON.stringify(config));
    setPendingPartnerConnection(localConfig, 'p1', 'Jordan', 'prop_x');
    const proposal = {
      id: 'prop_x',
      type: 'partner_connection',
      connectionInitiatorId: 'p1',
      connectionTargetName: 'Jordan'
    };
    expect(releasePartnerConnectionProposal(localConfig, proposal)).toBe(true);
    expect(resolvePartnerLimitEntry(localConfig.partners[0], 'Jordan')).toBeNull();
  });

  it('formats connection summary for reviewers', () => {
    const proposal = buildPartnerConnectionProposalPayload(config, config.partners[0], config.partners[1], 'Alex');
    const summary = formatPartnerConnectionProposalSummary(proposal, config);
    expect(summary).toContain('Alex');
    expect(summary).toContain('Jordan');
  });
});
