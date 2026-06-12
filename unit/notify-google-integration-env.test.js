import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  getGoogleIntegrationFromEnv,
  isGoogleIntegrationEnvManaged,
  mergeGoogleIntegrationIntoConfig,
  resolveGoogleIntegration
} from '../notify-service/google-integration-env.js';

const ENV_KEYS = ['GOOGLE_CLIENT_ID', 'GOOGLE_API_KEY', 'GOOGLE_CALENDAR_ID'];

describe('notify google-integration-env', () => {
  beforeEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('returns null when env vars are missing', () => {
    expect(getGoogleIntegrationFromEnv()).toBeNull();
    expect(isGoogleIntegrationEnvManaged()).toBe(false);
  });

  it('reads credentials from env with default calendar id', () => {
    process.env.GOOGLE_CLIENT_ID = 'client.apps.googleusercontent.com';
    process.env.GOOGLE_API_KEY = 'AIza-test';
    expect(getGoogleIntegrationFromEnv()).toEqual({
      clientId: 'client.apps.googleusercontent.com',
      apiKey: 'AIza-test',
      calendarId: 'primary'
    });
    expect(isGoogleIntegrationEnvManaged()).toBe(true);
  });

  it('prefers env credentials over household config', () => {
    process.env.GOOGLE_CLIENT_ID = 'env-client';
    process.env.GOOGLE_API_KEY = 'env-key';
    process.env.GOOGLE_CALENDAR_ID = 'shared@group.calendar.google.com';

    expect(resolveGoogleIntegration({
      googleIntegration: {
        clientId: 'local-client',
        apiKey: 'local-key',
        calendarId: 'primary'
      }
    })).toEqual({
      clientId: 'env-client',
      apiKey: 'env-key',
      calendarId: 'shared@group.calendar.google.com',
      serverManaged: true
    });
  });

  it('falls back to household config when env is unset', () => {
    expect(resolveGoogleIntegration({
      googleIntegration: {
        clientId: 'local-client',
        apiKey: 'local-key',
        calendarId: 'household@group.calendar.google.com'
      }
    })).toEqual({
      clientId: 'local-client',
      apiKey: 'local-key',
      calendarId: 'household@group.calendar.google.com',
      serverManaged: false
    });
  });

  it('merges resolved integration into household config', () => {
    process.env.GOOGLE_CLIENT_ID = 'env-client';
    process.env.GOOGLE_API_KEY = 'env-key';

    const merged = mergeGoogleIntegrationIntoConfig({
      groupName: 'Test Household',
      partners: []
    });

    expect(merged.googleIntegration).toEqual({
      clientId: 'env-client',
      apiKey: 'env-key',
      calendarId: 'primary'
    });
    expect(merged.groupName).toBe('Test Household');
  });
});
