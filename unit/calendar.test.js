import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const local = {};
  const session = {};
  const localStorage = {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  };
  const sessionStorage = {
    getItem: (key) => (key in session ? session[key] : null),
    setItem: (key, value) => { session[key] = String(value); },
    removeItem: (key) => { delete session[key]; },
    clear: () => { Object.keys(session).forEach((key) => { delete session[key]; }); }
  };
  vi.stubGlobal('localStorage', localStorage);
  vi.stubGlobal('sessionStorage', sessionStorage);
  return { local, session };
});

import { CalendarSync } from '../js/calendar.js';
import { WORKFLOW } from '../js/proposal-workflow.js';
import { SEED_REFRESH_NOTICE_KEY } from '../js/helpers.js';

describe('CalendarSync offline workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('polyschedule_seed_version', '2');
    localStorage.setItem('polyschedule_local_config', JSON.stringify({
      groupName: 'Test',
      partners: [{ id: 'p1', name: 'Alex Rivera', username: 'alex' }],
      residences: [{ id: 'h1', name: 'Home', bedrooms: 2 }]
    }));
    localStorage.setItem('polyschedule_local_events', JSON.stringify([]));
    await CalendarSync.init('offline', null, () => {});
  });

  it('retracts a proposed proposal back to draft', async () => {
    CalendarSync.events.push({
      id: 'prop_retract',
      title: 'Retract Me',
      type: 'event',
      start: new Date().toISOString(),
      end: new Date(Date.now() + 3600000).toISOString(),
      proposer: 'Alex Rivera',
      workflowState: WORKFLOW.PROPOSED,
      status: 'pending',
      participantRoles: [{ name: 'Alex Rivera', role: 'required' }],
      participants: ['Alex Rivera'],
      responses: { 'Alex Rivera': { status: 'accept' } }
    });

    await CalendarSync.retractProposal('prop_retract');
    const updated = CalendarSync.events.find(e => e.id === 'prop_retract');
    expect(updated.workflowState).toBe(WORKFLOW.DRAFT);
    expect(updated.responses).toEqual({});
  });

  it('archives an approved proposal', async () => {
    CalendarSync.events.push({
      id: 'prop_archive',
      title: 'Archive Me',
      type: 'event',
      start: new Date().toISOString(),
      end: new Date(Date.now() + 3600000).toISOString(),
      proposer: 'Alex Rivera',
      workflowState: WORKFLOW.APPROVED,
      status: 'confirmed',
      participantRoles: [{ name: 'Alex Rivera', role: 'required' }],
      participants: ['Alex Rivera'],
      responses: { 'Alex Rivera': { status: 'accept' } }
    });

    await CalendarSync.archiveProposal('prop_archive');
    const updated = CalendarSync.events.find(e => e.id === 'prop_archive');
    expect(updated.workflowState).toBe(WORKFLOW.ARCHIVED);
    expect(updated.archivedAt).toBeTruthy();
  });
});

describe('CalendarSync seed refresh', () => {
  it('records a session notice when seed version is stale', async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem('polyschedule_seed_version', '1');
    await CalendarSync.init('offline', null, () => {});
    expect(sessionStorage.getItem(SEED_REFRESH_NOTICE_KEY)).toBe('1');
  });
});
