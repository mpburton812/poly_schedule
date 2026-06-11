const { E2E_HOUSEHOLD_CONFIG, E2E_HOUSEHOLD_EVENTS } = require('./fixtures/household-seed');

/** Inject demo household into localStorage before the app boots (e2e only). */
async function installE2EHouseholdSeed(page) {
  await page.addInitScript(({ config, events }) => {
    localStorage.setItem('polyschedule_local_config', JSON.stringify(config));
    localStorage.setItem('polyschedule_local_events', JSON.stringify(events));
    sessionStorage.removeItem('polyschedule_add_partner_draft');
    sessionStorage.removeItem('polyschedule_return_add_partner');
    sessionStorage.removeItem('polyschedule_select_home_id');
  }, { config: E2E_HOUSEHOLD_CONFIG, events: E2E_HOUSEHOLD_EVENTS });
}

module.exports = { installE2EHouseholdSeed };
