import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  stripProposalPrefix,
  serializeEventMeta,
  parseGCalEventItem,
  formatGCalSummary,
  resolveSyncBootstrapMode,
  GCAL_CONFIG_SUMMARY
} from '../js/gcal-sync.js';

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

describe('stripProposalPrefix', () => {
  it('removes proposal prefixes from titles', () => {
    expect(stripProposalPrefix('[PROPOSAL] Dinner')).toBe('Dinner');
    expect(stripProposalPrefix('[PROPOSAL-SLEEP] Lake House')).toBe('Lake House');
  });
});

describe('serializeEventMeta / parseGCalEventItem', () => {
  it('round-trips workflow metadata through GCal description JSON', () => {
    const source = {
      id: 'evt_1',
      title: 'Team Dinner',
      type: 'event',
      status: 'pending',
      workflowState: 'proposed',
      proposer: 'Alex Rivera',
      participantRoles: [{ name: 'Alex Rivera', role: 'required' }],
      participants: ['Alex Rivera', 'Sam Davis'],
      responses: { 'Alex Rivera': { status: 'accept', comment: '' } },
      start: '2026-06-10T18:00:00.000Z',
      end: '2026-06-10T21:00:00.000Z'
    };

    const gcalItem = {
      id: 'gcal_abc',
      summary: formatGCalSummary(source),
      description: JSON.stringify(serializeEventMeta(source), null, 2),
      start: { dateTime: source.start },
      end: { dateTime: source.end },
      location: ''
    };

    const parsed = parseGCalEventItem(gcalItem);
    expect(parsed.title).toBe('Team Dinner');
    expect(parsed.workflowState).toBe('proposed');
    expect(parsed.participantRoles).toEqual(source.participantRoles);
    expect(parsed.responses['Alex Rivera'].status).toBe('accept');
  });

  it('skips config events', () => {
    expect(parseGCalEventItem({ summary: GCAL_CONFIG_SUMMARY })).toBeNull();
  });
});

describe('resolveSyncBootstrapMode', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns sync when mode, credentials, and token are present', () => {
    localStorage.setItem('polyschedule_mode', 'sync');
    localStorage.setItem('polyschedule_client_id', 'client');
    localStorage.setItem('polyschedule_api_key', 'key');
    localStorage.setItem('polyschedule_access_token', 'token');
    expect(resolveSyncBootstrapMode()).toBe('sync');
  });

  it('returns offline when token is missing', () => {
    localStorage.setItem('polyschedule_mode', 'sync');
    localStorage.setItem('polyschedule_client_id', 'client');
    localStorage.setItem('polyschedule_api_key', 'key');
    expect(resolveSyncBootstrapMode()).toBe('offline');
  });
});
