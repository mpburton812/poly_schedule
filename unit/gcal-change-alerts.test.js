import { describe, expect, it } from 'vitest';
import {
  resolveGCalActor,
  detectGCalExternalChanges,
  isTrackableCalendarEvent,
  snapshotTrackableEvents
} from '../js/gcal-change-alerts.js';

const config = {
  partners: [
    { id: 'p1', name: 'Alex Rivera', notificationEmail: 'alex@example.com' },
    { id: 'p2', name: 'Sam Davis', notificationEmail: 'sam@example.com' }
  ]
};

describe('gcal-change-alerts', () => {
  it('tracks approved calendar events with real GCal ids', () => {
    expect(isTrackableCalendarEvent({ id: 'abc123', type: 'event', status: 'confirmed' })).toBe(true);
    expect(isTrackableCalendarEvent({ id: 'prop_1', type: 'event', status: 'confirmed' })).toBe(false);
    expect(isTrackableCalendarEvent({ id: 'abc123', type: 'batch_sleeping', status: 'confirmed' })).toBe(false);
  });

  it('resolves actor from organizer email to household partner', () => {
    const actor = resolveGCalActor({
      organizer: { email: 'alex@example.com', displayName: 'Alex Rivera', id: 'google-user-1' }
    }, config);
    expect(actor.partnerId).toBe('p1');
    expect(actor.label).toBe('Alex Rivera');
    expect(actor.googleId).toBe('google-user-1');
  });

  it('prefers googleEmail over notificationEmail for actor matching', () => {
    const cfg = {
      partners: [{
        id: 'p1',
        name: 'Alex Rivera',
        notificationEmail: 'notify@example.com',
        googleEmail: 'alex@gmail.com'
      }]
    };
    expect(resolveGCalActor({ organizer: { email: 'alex@gmail.com' } }, cfg).partnerId).toBe('p1');
    expect(resolveGCalActor({ organizer: { email: 'notify@example.com' } }, cfg).partnerId).toBe('p1');
    expect(resolveGCalActor({ organizer: { email: 'other@gmail.com' } }, cfg).partnerId).toBeNull();
  });

  it('detects added and removed events while skipping local mutations', async () => {
    const previous = [
      { id: 'gcal_old', title: 'Old Dinner', type: 'event', status: 'confirmed', participants: ['Alex Rivera', 'Sam Davis'] }
    ];
    const next = [
      { id: 'gcal_new', title: 'New Dinner', type: 'event', status: 'confirmed', participants: ['Alex Rivera'] }
    ];
    const muted = new Set(['gcal_new']);

    const changes = await detectGCalExternalChanges({
      previousEvents: previous,
      nextEvents: next,
      config,
      locallyMutedIds: muted,
      gcalItems: [
        { id: 'gcal_new', summary: 'New Dinner', organizer: { email: 'sam@example.com', id: 'g2' } }
      ]
    });

    expect(changes.added).toHaveLength(0);
    expect(changes.removed).toHaveLength(1);
    expect(changes.removed[0].event.id).toBe('gcal_old');
  });

  it('detects externally added events', async () => {
    const previous = [
      { id: 'gcal_existing', title: 'Existing', type: 'event', status: 'confirmed', participants: [] }
    ];
    const next = [
      { id: 'gcal_existing', title: 'Existing', type: 'event', status: 'confirmed', participants: [] },
      { id: 'gcal_new', title: 'Surprise Party', type: 'event', status: 'confirmed', participants: [] }
    ];
    const changes = await detectGCalExternalChanges({
      previousEvents: previous,
      nextEvents: next,
      config,
      locallyMutedIds: new Set(),
      gcalItems: [{ id: 'gcal_new', summary: 'Surprise Party', creator: { email: 'alex@example.com' } }]
    });
    expect(changes.added).toHaveLength(1);
    expect(changes.added[0].actor.partnerId).toBe('p1');
  });

  it('builds snapshots ignoring drafts', () => {
    const map = snapshotTrackableEvents([
      { id: 'g1', type: 'event', status: 'confirmed' },
      { id: 'prop_1', type: 'event', status: 'draft', workflowState: 'draft' }
    ]);
    expect(map.size).toBe(1);
    expect(map.has('g1')).toBe(true);
  });
});
