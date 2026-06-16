/**
 * Minimal household used only by Playwright e2e tests — not loaded by the app.
 * Events are created in tests; no demo schedule data is pre-seeded.
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
    }
  ],
  partners: [
    {
      id: 'p1',
      name: 'Michael Burton',
      username: 'mpburton',
      password: 'password',
      role: 'Admin',
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
      avatar: 'assets/images/icons/bird_orange.png',
      pronouns: { preset: 'he/him' },
      rules: {}
    },
    {
      id: 'p4',
      name: 'Bailey',
      passive: true,
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
      avatar: 'assets/images/icons/bird_yellow.png',
      pronouns: { preset: 'they/them' },
      rules: { minSoloNights: 2 }
    }
  ]
};

const E2E_HOUSEHOLD_EVENTS = [];

module.exports = { E2E_HOUSEHOLD_CONFIG, E2E_HOUSEHOLD_EVENTS };
