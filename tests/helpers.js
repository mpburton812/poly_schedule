/**
 * E2E test environment: localStorage seed, notify login mock, fake Google creds.
 */
const { E2E_HOUSEHOLD_CONFIG, E2E_HOUSEHOLD_EVENTS } = require('./fixtures/household-seed');

const E2E_NOTIFY_URL = 'http://polyschedule-e2e-notify.test';
const E2E_NOTIFY_SECRET = 'e2e-notify-secret';
const E2E_HOUSEHOLD_ID = 'e2e-household';

function sanitizeConfigForClient(config) {
  const copy = JSON.parse(JSON.stringify(config));
  for (const partner of copy.partners || []) {
    delete partner.password;
    delete partner.passwordHash;
  }
  if (!copy.householdId) copy.householdId = E2E_HOUSEHOLD_ID;
  return copy;
}

function findLoginPartner(username, password) {
  const normalized = String(username || '').trim().toLowerCase();
  return (E2E_HOUSEHOLD_CONFIG.partners || []).find((partner) => {
    if (partner?.passive || !partner?.username) return false;
    if (String(partner.username).trim().toLowerCase() !== normalized) return false;
    return String(partner.password || '') === String(password || '');
  }) || null;
}

function buildLoginResponse(partner) {
  const config = sanitizeConfigForClient(E2E_HOUSEHOLD_CONFIG);
  return {
    ok: true,
    householdId: E2E_HOUSEHOLD_ID,
    partnerId: partner.id,
    groupName: config.groupName || 'E2E Household',
    googleIntegration: null,
    notifyService: {
      url: E2E_NOTIFY_URL,
      secret: E2E_NOTIFY_SECRET
    },
    partner: {
      id: partner.id,
      name: partner.name,
      username: partner.username,
      role: partner.role,
      avatar: partner.avatar,
      pronouns: partner.pronouns || null
    },
    config,
    events: E2E_HOUSEHOLD_EVENTS,
    revision: 1
  };
}

/** Disable service worker + clear caches so e2e always loads source from disk. */
async function installE2EServiceWorkerBypass(page) {
  await page.addInitScript(() => {
    if ('caches' in window) {
      void caches.keys().then((keys) => Promise.all(keys.map((key) => caches.delete(key))));
    }
    if (!('serviceWorker' in navigator)) return;
    const stubRegistration = {
      scope: '/',
      update: () => Promise.resolve(),
      unregister: () => Promise.resolve(true),
      addEventListener: () => {}
    };
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        register: () => Promise.resolve(stubRegistration),
        getRegistrations: () => Promise.resolve([]),
        addEventListener: () => {}
      }
    });
  });
}

/** Mock notify login + optional sync hub calls for Playwright. */
async function installE2ENotifyMock(page) {
  await page.route('**/version.json*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        branch: 'e2e',
        commit: 'e2e',
        notifyUrl: E2E_NOTIFY_URL
      })
    });
  });

  await page.route('**/googleapis.com/**', async (route) => {
    const url = route.request().url();
    if (url.includes('/calendars/') && url.includes('/events')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ items: [] })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({})
    });
  });

  await page.route('**/v1/auth/login', async (route) => {
    if (route.request().method() !== 'POST') {
      await route.fallback();
      return;
    }
    let body = {};
    try {
      body = route.request().postDataJSON() || {};
    } catch {
      body = {};
    }
    const partner = findLoginPartner(body.username, body.password);
    if (!partner) {
      await route.fulfill({
        status: 401,
        contentType: 'application/json',
        body: JSON.stringify({
          error: 'Invalid username or password.',
          code: 'INVALID_CREDENTIALS'
        })
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(buildLoginResponse(partner))
    });
  });

  await page.route(`${E2E_NOTIFY_URL}/**`, async (route) => {
    const path = new URL(route.request().url()).pathname;
    if (path.startsWith('/v1/usernames/check')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ available: true })
      });
      return;
    }
    if (path.startsWith('/v1/usernames/claim')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true })
      });
      return;
    }
    if (path.startsWith('/v1/sync/')) {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ ok: true, revision: 1 })
      });
      return;
    }
    if (path === '/v1/config') {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          publicKey: 'e2e-vapid-public-key',
          googleIntegrationServerManaged: true,
          googleIntegration: {
            clientId: 'e2e-client.apps.googleusercontent.com',
            apiKey: 'e2e-api-key',
            calendarId: 'primary'
          }
        })
      });
      return;
    }
    await route.fallback();
  });
}

/** Inject demo household + notify/google stubs before the app boots (e2e only). */
async function installE2EHouseholdSeed(page) {
  await installE2EServiceWorkerBypass(page);
  await installE2ENotifyMock(page);

  await page.addInitScript(({ config, events, notifyUrl, notifySecret }) => {
    window.__POLYSCHEDULE_E2E__ = true;
    localStorage.setItem('polyschedule_local_config', JSON.stringify(config));
    localStorage.setItem('polyschedule_local_events', JSON.stringify(events));
    localStorage.setItem('polyschedule_notify_url', notifyUrl);
    localStorage.setItem('polyschedule_notify_secret', notifySecret);
    sessionStorage.removeItem('polyschedule_add_partner_draft');
    sessionStorage.removeItem('polyschedule_return_add_partner');
    sessionStorage.removeItem('polyschedule_select_home_id');
  }, {
    config: { ...E2E_HOUSEHOLD_CONFIG, householdId: E2E_HOUSEHOLD_ID },
    events: E2E_HOUSEHOLD_EVENTS,
    notifyUrl: E2E_NOTIFY_URL,
    notifySecret: E2E_NOTIFY_SECRET
  });
}

module.exports = {
  installE2EHouseholdSeed,
  installE2ENotifyMock,
  E2E_NOTIFY_URL,
  E2E_NOTIFY_SECRET
};
