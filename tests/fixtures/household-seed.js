/**
 * Demo household used only by Playwright e2e tests — not loaded by the app.
 */
const E2E_HOUSEHOLD_CONFIG = {
  residences: [
    {
      id: 'h1',
      name: "Michael's Place",
      address: '',
      bedrooms: 1,
      bedroomDetails: [{ id: 'r1', name: "Michael's Bedroom" }],
      associatedPeople: ['Michael Burton']
    },
    {
      id: 'h2',
      name: "Katie's Place",
      address: '',
      bedrooms: 1,
      bedroomDetails: [{ id: 'r1', name: "Katie's Bedroom" }],
      associatedPeople: ['Katie Thompson']
    },
    {
      id: 'h3',
      name: 'The Lake House',
      address: '',
      bedrooms: 1,
      bedroomDetails: [{ id: 'r1', name: 'The Lakehouse Bedroom' }],
      associatedPeople: ['Katie Thompson']
    }
  ],
  partners: [
    {
      id: 'p1',
      name: 'Michael Burton',
      username: 'mpburton',
      password: 'password',
      role: 'Admin',
      defaultHome: 'h1',
      avatar: 'assets/images/icons/bird_blue.png',
      pronouns: { preset: 'he/him' },
      rules: {
        partnerLimits: { 'Katie Thompson': { min: 1, max: 4 } }
      }
    },
    {
      id: 'p2',
      name: 'Katie Thompson',
      username: 'kthompson',
      password: 'password',
      role: 'Admin',
      defaultHome: 'h2',
      avatar: 'assets/images/icons/bird_green.png',
      pronouns: { preset: 'she/her' },
      rules: {
        partnerLimits: { 'Michael Burton': { min: 1, max: 4 } }
      }
    },
    {
      id: 'p3',
      name: 'Zachery',
      passive: true,
      defaultHome: 'h3',
      avatar: 'assets/images/icons/bird_orange.png',
      pronouns: { preset: 'he/him' },
      rules: {}
    },
    {
      id: 'p4',
      name: 'Bailey',
      passive: true,
      defaultHome: '',
      avatar: 'assets/images/icons/bird_red.png',
      pronouns: { preset: 'they/them' },
      rules: {}
    },
    {
      id: 'p5',
      name: 'Jordan Lee',
      username: 'jordan',
      password: 'password',
      role: 'User',
      defaultHome: 'h3',
      avatar: 'assets/images/icons/bird_yellow.png',
      pronouns: { preset: 'they/them' },
      rules: { minSoloNights: 2 }
    }
  ]
};

function relativeEventIso(offsetDays, hour, minute, durationHours = 1) {
  const start = new Date();
  start.setDate(start.getDate() + offsetDays);
  start.setHours(hour, minute, 0, 0);
  const end = new Date(start);
  end.setHours(start.getHours() + durationHours);
  return { start: start.toISOString(), end: end.toISOString() };
}

const E2E_HOUSEHOLD_EVENTS = [
  {
    id: 'e1',
    title: 'Date Night',
    type: 'event',
    ...relativeEventIso(0, 19, 0, 2.5),
    location: "Michael's Place",
    participants: ['Michael Burton', 'Katie Thompson'],
    participantRoles: [
      { name: 'Michael Burton', role: 'required' },
      { name: 'Katie Thompson', role: 'required' }
    ],
    workflowState: 'approved',
    status: 'confirmed',
    revision: 1
  },
  {
    id: 'e2',
    title: 'Lake House Game Night',
    type: 'event',
    ...relativeEventIso(2, 20, 0, 3),
    location: 'The Lake House',
    participants: ['Michael Burton', 'Katie Thompson', 'Zachery'],
    participantRoles: [
      { name: 'Michael Burton', role: 'required' },
      { name: 'Katie Thompson', role: 'required' },
      { name: 'Zachery', role: 'optional' }
    ],
    workflowState: 'approved',
    status: 'confirmed',
    revision: 1
  },
  {
    id: 's1',
    title: "SLEEP: Michael's Bedroom: Michael Burton",
    type: 'sleeping',
    start: relativeEventIso(0, 22, 0).start,
    end: relativeEventIso(1, 8, 0).start,
    homeId: 'h1',
    roomId: 'r1',
    roomName: "Michael's Bedroom",
    homeName: "Michael's Place",
    participants: ['Michael Burton'],
    participantRoles: [{ name: 'Michael Burton', role: 'required' }],
    workflowState: 'approved',
    status: 'confirmed',
    revision: 1
  },
  {
    id: 's2',
    title: "SLEEP: Katie's Bedroom: Katie Thompson",
    type: 'sleeping',
    start: relativeEventIso(1, 22, 0).start,
    end: relativeEventIso(2, 8, 0).start,
    homeId: 'h2',
    roomId: 'r1',
    roomName: "Katie's Bedroom",
    homeName: "Katie's Place",
    participants: ['Katie Thompson'],
    participantRoles: [{ name: 'Katie Thompson', role: 'required' }],
    workflowState: 'approved',
    status: 'confirmed',
    revision: 1
  },
  {
    id: 'p_e1',
    title: 'Weekend at The Lake House',
    type: 'event',
    ...relativeEventIso(5, 12, 0, 6),
    location: 'The Lake House',
    participants: ['Michael Burton', 'Katie Thompson'],
    participantRoles: [
      { name: 'Michael Burton', role: 'required' },
      { name: 'Katie Thompson', role: 'required' }
    ],
    proposer: 'Michael Burton',
    workflowState: 'proposed',
    status: 'pending',
    revision: 1,
    responses: {
      'Michael Burton': { status: 'accept', comment: 'Already packing the cooler.' },
      'Katie Thompson': { status: 'pending', comment: '' }
    }
  },
  {
    id: 'p_s1',
    title: "Sleeping : Katie : The Lake House The Lakehouse Bedroom",
    type: 'sleeping',
    start: relativeEventIso(4, 22, 0).start,
    end: relativeEventIso(6, 8, 0).start,
    homeId: 'h3',
    roomId: 'r1',
    roomName: 'The Lakehouse Bedroom',
    homeName: 'The Lake House',
    participants: ['Michael Burton', 'Katie Thompson', 'Zachery'],
    participantRoles: [
      { name: 'Michael Burton', role: 'required' },
      { name: 'Katie Thompson', role: 'required' },
      { name: 'Zachery', role: 'optional' }
    ],
    proposer: 'Michael Burton',
    workflowState: 'proposed',
    status: 'pending',
    revision: 1,
    responses: {
      'Michael Burton': { status: 'accept', comment: '' },
      'Katie Thompson': { status: 'accept', comment: 'Sounds cozy!' }
    }
  }
];

module.exports = { E2E_HOUSEHOLD_CONFIG, E2E_HOUSEHOLD_EVENTS };
