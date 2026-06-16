/**
 * Apply all household-wide admin settings from synced config to this device.
 */

import { applyGoogleIntegrationFromConfig } from './google-integration.js';
import { applyHouseholdServicesFromConfig } from './household-services.js';
import { hydrateOperationLogsFromConfig } from './app/operation-log.js';

export function applySyncedAdminSettingsFromConfig(config, options = {}) {
  const googleApplied = applyGoogleIntegrationFromConfig(config, options);
  const services = applyHouseholdServicesFromConfig(config);
  hydrateOperationLogsFromConfig(config);
  return { googleApplied, ...services };
}
