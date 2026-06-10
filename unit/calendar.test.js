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

  it('does not duplicate batch sleeping nights when updating an already-approved batch', async () => {
    const config = {
      partners: [
        { id: 'p1', name: 'Alex Rivera', username: 'alex' },
        { id: 'p2', name: 'Sam Davis', username: 'sam' }
      ],
      residences: [{ id: 'h1', name: 'Home', bedrooms: 2, bedroomDetails: [{ id: 'r1', name: 'Room A' }] }]
    };
    CalendarSync.config = config;
    CalendarSync.events.push({
      id: 'prop_batch',
      title: 'Batch Week',
      type: 'batch_sleeping',
      start: '2026-06-10T22:00:00.000Z',
      end: '2026-06-12T08:00:00.000Z',
      proposer: 'Alex Rivera',
      workflowState: WORKFLOW.APPROVED,
      status: 'confirmed',
      participantRoles: [
        { name: 'Alex Rivera', role: 'required' },
        { name: 'Sam Davis', role: 'required' }
      ],
      participants: ['Alex Rivera', 'Sam Davis'],
      responses: {
        'Alex Rivera': { status: 'accept', comment: 'Organizer' },
        'Sam Davis': { status: 'accept', comment: 'Looks good' }
      },
      batchNights: [{
        date: '2026-06-10',
        assignments: [{
          homeId: 'h1',
          roomId: 'r1',
          homeName: 'Home',
          roomName: 'Room A',
          participants: ['Alex Rivera', 'Sam Davis']
        }]
      }],
      expandedEventIds: ['e_prop_batch_0_0']
    });
    CalendarSync.events.push({
      id: 'e_prop_batch_0_0',
      type: 'sleeping',
      title: 'SLEEP: Room A: Alex Rivera & Sam Davis',
      start: '2026-06-10T22:00:00.000Z',
      end: '2026-06-11T08:00:00.000Z',
      homeId: 'h1',
      roomId: 'r1',
      homeName: 'Home',
      roomName: 'Room A',
      participants: ['Alex Rivera', 'Sam Davis'],
      status: 'confirmed',
      workflowState: WORKFLOW.APPROVED
    });

    const sleepingBefore = CalendarSync.events.filter(e => e.type === 'sleeping').length;
    await CalendarSync.updateEvent('prop_batch', {
      responses: {
        'Alex Rivera': { status: 'accept', comment: 'Organizer' },
        'Sam Davis': { status: 'accept', comment: 'Updated comment' }
      }
    });
    const sleepingAfter = CalendarSync.events.filter(e => e.type === 'sleeping').length;
    expect(sleepingAfter).toBe(sleepingBefore);
    const batch = CalendarSync.events.find(e => e.id === 'prop_batch');
    expect(batch.responses['Sam Davis'].comment).toBe('Updated comment');
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
