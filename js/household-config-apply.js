/**
 * Apply all household-wide admin settings from synced config to this device.
 */

import { applyGoogleIntegrationFromConfig } from './google-integration.js';
import { applyHouseholdServicesFromConfig } from './household-services.js';

export function applySyncedAdminSettingsFromConfig(config, options = {}) {
  const googleApplied = applyGoogleIntegrationFromConfig(config, options);
  const services = applyHouseholdServicesFromConfig(config);
  return { googleApplied, ...services };
}
