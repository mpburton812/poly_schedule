import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LEGACY_PRESET_AVATARS } from '../js/avatar.js';
import {
  canPartnerLogin,
  canCreateSleepingProposals,
  dedupeDuplicateSleepingEvents,
  mustIncludeCurrentUserInSleepingProposal,
  needsHouseholdSetup,
  pickNewerHouseholdConfig,
  sortPartnersWithCurrentUserFirst,
  normalizeConfigPartners,
  parseLocalDateString,
  getMondayOfWeek,
  findPartnerByCalendarEmail,
  renderBatchNightsReviewHtml,
  getPartnerAssociatedHomeNames,
  isOtherSleepLocation,
  SLEEP_LOCATION_OTHER
} from '../js/helpers.js';
import { DEFAULT_AVATARS } from '../js/helpers.js';

vi.hoisted(() => {
  const local = {};
  vi.stubGlobal('localStorage', {
    getItem: (key) => (key in local ? local[key] : null),
    setItem: (key, value) => { local[key] = String(value); },
    removeItem: (key) => { delete local[key]; },
    clear: () => { Object.keys(local).forEach((key) => { delete local[key]; }); }
  });
});

describe('normalizeConfigPartners', () => {
  it('restores empty sleeping rules from defaults', () => {
    const config = {
      partners: [{
        id: 'p1',
        name: 'Alex Rivera',
        rules: { minSoloNights: 2, partnerLimits: {} }
      }]
    };
    const defaults = {
      partners: [{
        id: 'p1',
        name: 'Alex Rivera',
        rules: { minSoloNights: 2, partnerLimits: { Sam: { min: 3, max: 3 } } }
      }]
    };
    const changed = normalizeConfigPartners(config, defaults);
    expect(changed).toBe(true);
    expect(config.partners[0].rules.partnerLimits.Sam).toEqual({ min: 3, max: 3 });
  });

  it('adds default pronouns when missing', () => {
    const config = {
      partners: [{ id: 'p9', name: 'New Partner', rules: {} }]
    };
    const defaults = { partners: [] };
    const changed = normalizeConfigPartners(config, defaults);
    expect(changed).toBe(true);
    expect(config.partners[0].pronouns.preset).toBe('they/them');
  });

  it('migrates legacy Unsplash avatars to local bird icons', () => {
    const config = {
      partners: [{
        id: 'p1',
        name: 'Alex Rivera',
        avatar: LEGACY_PRESET_AVATARS[2],
        rules: {}
      }]
    };
    const defaults = {
      partners: [{
        id: 'p1',
        name: 'Alex Rivera',
        avatar: DEFAULT_AVATARS[0],
        rules: {}
      }]
    };
    const changed = normalizeConfigPartners(config, defaults);
    expect(changed).toBe(true);
    expect(config.partners[0].avatar).toBe(DEFAULT_AVATARS[2]);
  });
});

describe('parseLocalDateString', () => {
  it('parses YYYY-MM-DD in local time without shifting to the previous day', () => {
    const date = parseLocalDateString('2026-06-10', 19, 0, 0, 0);
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(5);
    expect(date.getDate()).toBe(10);
    expect(date.getHours()).toBe(19);
  });
});

describe('getMondayOfWeek', () => {
  it('returns Monday 00:00 for a mid-week date', () => {
    const monday = getMondayOfWeek(new Date(2026, 5, 11)); // Wed Jun 11 2026
    expect(monday.getDay()).toBe(1);
    expect(monday.getDate()).toBe(8);
    expect(monday.getHours()).toBe(0);
  });
});

describe('findPartnerByCalendarEmail', () => {
  const config = {
    partners: [
      { id: 'p1', name: 'Alex', googleEmail: 'alex@gmail.com', notificationEmail: 'notify@example.com' },
      { id: 'p2', name: 'Sam', notificationEmail: 'sam@example.com' }
    ]
  };

  it('matches googleEmail first', () => {
    expect(findPartnerByCalendarEmail(config, 'alex@gmail.com')?.id).toBe('p1');
  });

  it('falls back to notificationEmail', () => {
    expect(findPartnerByCalendarEmail(config, 'sam@example.com')?.id).toBe('p2');
    expect(findPartnerByCalendarEmail(config, 'notify@example.com')?.id).toBe('p1');
  });
});

describe('dedupeDuplicateSleepingEvents', () => {
  it('removes duplicate confirmed sleeping events with the same night and room', () => {
    const events = [
      {
        id: 'sleep1',
        type: 'sleeping',
        title: 'SLEEP: Room A: Alex & Sam',
        start: '2026-06-10T22:00:00.000Z',
        end: '2026-06-11T08:00:00.000Z',
        homeId: 'h1',
        roomId: 'r1',
        participants: ['Alex', 'Sam']
      },
      {
        id: 'sleep2',
        type: 'sleeping',
        title: 'SLEEP: Room A: Alex & Sam',
        start: '2026-06-10T22:00:00.000Z',
        end: '2026-06-11T08:00:00.000Z',
        homeId: 'h1',
        roomId: 'r1',
        participants: ['Alex', 'Sam']
      }
    ];
    const { events: deduped, removedIds } = dedupeDuplicateSleepingEvents(events);
    expect(deduped).toHaveLength(1);
    expect(removedIds).toHaveLength(1);
  });
});

describe('renderBatchNightsReviewHtml', () => {
  it('lists nights with locations and participants', () => {
    const html = renderBatchNightsReviewHtml([
      {
        date: '2026-06-10',
        assignments: [{
          homeName: 'Lake House',
          roomName: 'North Bedroom',
          participants: ['Michael Burton', 'Katie Thompson']
        }]
      }
    ]);
    expect(html).toContain('NIGHT-BY-NIGHT PLAN');
    expect(html).toContain('Night 1');
    expect(html).toContain('Lake House · North Bedroom');
    expect(html).toContain('Michael, Katie');
  });
});

describe('pickNewerHouseholdConfig', () => {
  it('prefers local config when it has login users and remote does not', () => {
    const local = {
      syncRevision: 1,
      partners: [{ id: 'p1', username: 'admin', password: 'x' }],
      residences: [{ id: 'h1', name: 'Home' }]
    };
    const remote = { syncRevision: 5, partners: [], residences: [] };
    const picked = pickNewerHouseholdConfig(local, remote);
    expect(picked.source).toBe('local');
    expect(picked.config.partners).toHaveLength(1);
    expect(picked.config.residences).toHaveLength(1);
  });

  it('prefers higher sync revision when both have users', () => {
    const local = {
      syncRevision: 2,
      partners: [{ id: 'p1', username: 'a', password: 'b' }],
      residences: []
    };
    const remote = {
      syncRevision: 4,
      partners: [{ id: 'p2', username: 'c', password: 'd' }],
      residences: []
    };
    const picked = pickNewerHouseholdConfig(local, remote);
    expect(picked.source).toBe('remote');
    expect(picked.config.syncRevision).toBe(4);
  });
});

describe('sleeping proposal helpers', () => {
  const config = {
    partners: [
      { id: 'p1', name: 'Alex Rivera', username: 'alex', role: 'Admin' },
      { id: 'p2', name: 'Sam Lee', username: 'sam', role: 'User', rules: { partnerLimits: { 'Alex Rivera': { min: 1, max: 3 } } } }
    ]
  };

  it('lets admins create sleeping proposals without partner limits', () => {
    expect(canCreateSleepingProposals(config, { id: 'p1', name: 'Alex Rivera' })).toBe(true);
  });

  it('requires sleeping connections for non-admin users', () => {
    expect(canCreateSleepingProposals(config, { id: 'p2', name: 'Sam Lee' })).toBe(true);
    const noRules = { partners: [{ id: 'p3', name: 'Jordan', username: 'jordan', role: 'User', rules: {} }] };
    expect(canCreateSleepingProposals(noRules, { id: 'p3', name: 'Jordan' })).toBe(false);
  });

  it('requires non-admins but not admins to be invitees', () => {
    expect(mustIncludeCurrentUserInSleepingProposal(config, { id: 'p1' })).toBe(false);
    expect(mustIncludeCurrentUserInSleepingProposal(config, { id: 'p2' })).toBe(true);
  });

  it('sorts the current user to the front of partner lists and alphabetizes the rest', () => {
    const sorted = sortPartnersWithCurrentUserFirst(config.partners, config, { id: 'p2' });
    expect(sorted[0].id).toBe('p2');
    expect(sorted.slice(1).map((p) => p.name)).toEqual(['Alex Rivera']);
  });
});

describe('getPartnerAssociatedHomeNames', () => {
  it('returns home names from associatedPeople', () => {
    const config = {
      residences: [
        { id: 'h1', name: "Michael's Place", associatedPeople: ['Michael Burton'] },
        { id: 'h2', name: "Izzy's Place", associatedPeople: ['Izzy Chen'] },
        { id: 'h3', name: 'Shared Loft', associatedPeople: ['Michael Burton', 'Katie Thompson'] }
      ],
      partners: [{ id: 'p1', name: 'Michael Burton' }]
    };
    expect(getPartnerAssociatedHomeNames(config, 'Michael Burton')).toEqual([
      "Michael's Place",
      'Shared Loft'
    ]);
    expect(getPartnerAssociatedHomeNames(config, 'Unknown')).toEqual([]);
  });
});

describe('sleep location other', () => {
  it('detects other sleep location id', () => {
    expect(isOtherSleepLocation(SLEEP_LOCATION_OTHER)).toBe(true);
    expect(isOtherSleepLocation('h1')).toBe(false);
  });
});

describe('household login readiness', () => {
  it('detects when setup is required', () => {
    expect(needsHouseholdSetup({ partners: [] })).toBe(true);
    expect(needsHouseholdSetup({
      partners: [{ id: 'p1', name: 'Passive', passive: true }]
    })).toBe(true);
    expect(needsHouseholdSetup({
      partners: [{ id: 'p1', name: 'Admin', username: 'admin', password: 'secret' }]
    })).toBe(false);
  });

  it('requires username and password for login', () => {
    expect(canPartnerLogin({ username: 'a', password: 'b' })).toBe(true);
    expect(canPartnerLogin({ username: 'a', passwordHash: 'hash' })).toBe(true);
    expect(canPartnerLogin({ username: 'a' })).toBe(false);
    expect(canPartnerLogin({ passive: true, username: 'a', password: 'b' })).toBe(false);
  });
});
