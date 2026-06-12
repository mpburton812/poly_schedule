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
import { LOCAL_CONFIG_KEY, LOCAL_EVENTS_KEY } from '../js/storage-keys.js';
import { WORKFLOW } from '../js/proposal-workflow.js';

describe('CalendarSync cache workflow', () => {
  beforeEach(async () => {
    localStorage.clear();
    sessionStorage.clear();
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify({
      groupName: 'Test',
      partners: [{ id: 'p1', name: 'Alex Rivera', username: 'alex' }],
      residences: [{ id: 'h1', name: 'Home', bedrooms: 2 }]
    }));
    localStorage.setItem(LOCAL_EVENTS_KEY, JSON.stringify([]));
    await CalendarSync.init('cache', null, () => {});
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

  it('removes expanded batch nights when deleting a batch parent', async () => {
    CalendarSync.events.push({
      id: 'prop_batch_del',
      title: 'Batch Week',
      type: 'batch_sleeping',
      start: '2026-06-10T22:00:00.000Z',
      end: '2026-06-12T08:00:00.000Z',
      status: 'confirmed',
      workflowState: WORKFLOW.APPROVED,
      expandedEventIds: ['e_child_1', 'e_child_2']
    });
    CalendarSync.events.push(
      { id: 'e_child_1', type: 'sleeping', title: 'Night 1', start: '2026-06-10T22:00:00.000Z', end: '2026-06-11T08:00:00.000Z', status: 'confirmed' },
      { id: 'e_child_2', type: 'sleeping', title: 'Night 2', start: '2026-06-11T22:00:00.000Z', end: '2026-06-12T08:00:00.000Z', status: 'confirmed' }
    );

    await CalendarSync.deleteEvent('prop_batch_del');
    expect(CalendarSync.events.find(e => e.id === 'prop_batch_del')).toBeUndefined();
    expect(CalendarSync.events.find(e => e.id === 'e_child_1')).toBeUndefined();
    expect(CalendarSync.events.find(e => e.id === 'e_child_2')).toBeUndefined();
  });

  it('deletes seed sleeping events without calling Google Calendar', async () => {
    CalendarSync.events.push({
      id: 's99',
      title: "SLEEP: Room: Michael Burton & Katie Thompson",
      type: 'sleeping',
      start: new Date().toISOString(),
      end: new Date(Date.now() + 36000000).toISOString(),
      participants: ['Michael Burton', 'Katie Thompson'],
      status: 'confirmed',
      workflowState: WORKFLOW.APPROVED
    });

    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    await CalendarSync.deleteEvent('s99');
    expect(CalendarSync.events.find(e => e.id === 's99')).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});

describe('CalendarSync first install', () => {
  it('starts with no household when no saved config exists', async () => {
    localStorage.clear();
    await CalendarSync.init('cache', null, () => {});
    expect(CalendarSync.config).toBeNull();
    expect(CalendarSync.events).toEqual([]);
  });

  it('keeps saved config on subsequent loads', async () => {
    localStorage.clear();
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify({
      residences: [],
      partners: [{ id: 'custom', name: 'Custom User', username: 'custom', password: 'x', role: 'Admin' }]
    }));
    localStorage.setItem(LOCAL_EVENTS_KEY, '[]');
    await CalendarSync.init('cache', null, () => {});
    const config = JSON.parse(localStorage.getItem(LOCAL_CONFIG_KEY));
    expect(config.partners[0].id).toBe('custom');
  });
});
