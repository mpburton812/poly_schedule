import { describe, expect, it } from 'vitest';
import {
  VISIBILITY,
  canUserSeeEventDetails,
  canUserSeeSleepingArrangement,
  getEventDisplayPolicy
} from '../js/event-privacy.js';
import { formatGCalDescription, appendEventComment } from '../js/event-comments.js';

const config = {
  partners: [
    { id: 'p1', name: 'Alex Rivera', rules: { partnerLimits: { 'Sam Davis': { max: 3 } } } },
    { id: 'p2', name: 'Sam Davis', rules: {} },
    { id: 'p3', name: 'Jordan Lee', rules: {} }
  ]
};

describe('event privacy', () => {
  const privateEvent = {
    title: 'Secret Dinner',
    type: 'event',
    visibility: VISIBILITY.PRIVATE,
    proposer: 'Alex Rivera',
    participants: ['Alex Rivera', 'Sam Davis'],
    participantRoles: [{ name: 'Alex Rivera', role: 'required' }, { name: 'Sam Davis', role: 'required' }]
  };

  it('shows full details to invitees only', () => {
    expect(canUserSeeEventDetails(privateEvent, 'Alex Rivera', config)).toBe(true);
    expect(canUserSeeEventDetails(privateEvent, 'Jordan Lee', config)).toBe(false);
    const redacted = getEventDisplayPolicy(privateEvent, 'Jordan Lee', config);
    expect(redacted.title).toBe('Private');
    expect(redacted.redacted).toBe(true);
  });

  it('shows sleeping arrangements to non-invitees in private mode', () => {
    const sleeping = {
      ...privateEvent,
      type: 'sleeping',
      roomName: 'North Bedroom',
      participants: ['Alex Rivera', 'Sam Davis']
    };
    expect(canUserSeeSleepingArrangement(sleeping, 'Jordan Lee', config)).toBe(true);
    const display = getEventDisplayPolicy(sleeping, 'Jordan Lee', config);
    expect(display.showSleepingArrangement).toBe(true);
    expect(display.title).toBe('Private');
  });

  it('hides sleeping arrangements from non-invitees in super private mode', () => {
    const sleeping = {
      ...privateEvent,
      type: 'sleeping',
      visibility: VISIBILITY.SUPER_PRIVATE,
      roomName: 'North Bedroom',
      participants: ['Alex Rivera', 'Sam Davis']
    };
    expect(canUserSeeSleepingArrangement(sleeping, 'Jordan Lee', config)).toBe(false);
    const display = getEventDisplayPolicy(sleeping, 'Jordan Lee', config);
    expect(display.showSleepingArrangement).toBe(false);
  });
});

describe('event comments', () => {
  it('formats readable GCal description with notes and comments', () => {
    const event = {
      notes: 'Potluck',
      comments: [{ id: '1', author: 'Alex', text: 'I am bringing pie', createdAt: '2026-06-10T18:00:00.000Z' }]
    };
    const description = formatGCalDescription(event);
    expect(description).toContain('Potluck');
    expect(description).toContain('--- Comments ---');
    expect(description).toContain('Alex');
    expect(description).toContain('I am bringing pie');
  });

  it('appends comments with ids', () => {
    const event = { comments: [] };
    const entry = appendEventComment(event, 'Sam Davis', 'Running late');
    expect(entry?.text).toBe('Running late');
    expect(event.comments).toHaveLength(1);
  });
});
