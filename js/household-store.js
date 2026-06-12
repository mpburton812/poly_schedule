import {
  MODE_KEY,
  LAST_SYNC_REVISION_KEY,
  LOCAL_CONFIG_KEY
} from './storage-keys.js';
import {
  normalizeHouseholdConfigShape,
  pickNewerHouseholdConfig,
  normalizeConfigPartners,
  syncAllHomeAssociationDefaults,
  removePartnerReferences,
  removeHomeReferences,
  renamePartnerReferences
} from './helpers.js';
import { CalendarAPI } from './gcal-api.js';

const EMPTY_HOUSEHOLD = {
  residences: [],
  partners: []
};

function createEmptyHousehold() {
  return JSON.parse(JSON.stringify(EMPTY_HOUSEHOLD));
}

export const HouseholdStore = {
  config: null,
  
  async loadConfig(context) {
    let localConfig = null;
    try {
      const saved = localStorage.getItem(LOCAL_CONFIG_KEY);
      if (saved) localConfig = JSON.parse(saved);
    } catch {
      localConfig = null;
    }

    if (context.mode === 'offline') {
      if (localConfig) {
        this.config = normalizeHouseholdConfigShape(localConfig);
      } else {
        this.config = createEmptyHousehold();
        localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
      }
    } else {
      const { canWriteToGoogleCalendar } = await import('./gcal-sync.js');
      let configSource = 'remote';
      
      try {
        const configEvent = await CalendarAPI.findConfigEvent({
          calendarId: context.calendarId,
          apiKey: context.apiKey,
          accessToken: context.accessToken
        });
        
        if (configEvent?.description) {
          const gcalConfig = JSON.parse(configEvent.description);
          const picked = pickNewerHouseholdConfig(localConfig, gcalConfig);
          this.config = picked.config;
          configSource = picked.source;
          context.configEventId = configEvent.id;
        } else if (localConfig) {
          this.config = normalizeHouseholdConfigShape(localConfig);
          configSource = 'local';
        } else {
          this.config = createEmptyHousehold();
          if (canWriteToGoogleCalendar(context)) {
            await CalendarAPI.saveConfigEvent({
              calendarId: context.calendarId,
              apiKey: context.apiKey,
              accessToken: context.accessToken,
              configData: this.config
            });
          }
        }
      } catch (e) {
        console.error('Failed to load config from GCal, falling back to local', e);
        this.config = localConfig ? normalizeHouseholdConfigShape(localConfig) : createEmptyHousehold();
        configSource = localConfig ? 'local' : 'empty';
      }

      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));

      if (configSource === 'local' && canWriteToGoogleCalendar(context)) {
        try {
          await CalendarAPI.saveConfigEvent({
            calendarId: context.calendarId,
            apiKey: context.apiKey,
            accessToken: context.accessToken,
            configData: this.config,
            configEventId: context.configEventId
          });
        } catch (e) {
          console.warn('[GCal] Failed to upload newer local config', e);
        }
      }
    }

    normalizeHouseholdConfigShape(this.config);

    const syncMod = await import('./household-sync.js');
    const identityChanged = syncMod.ensureHouseholdIdentity(this.config);
    if (this.config?.syncRevision != null) {
      localStorage.setItem(LAST_SYNC_REVISION_KEY, String(this.config.syncRevision));
    }
    
    if (identityChanged) {
      if (context.mode === 'offline') {
        localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
      } else {
        try {
          await CalendarAPI.saveConfigEvent({
            calendarId: context.calendarId,
            apiKey: context.apiKey,
            accessToken: context.accessToken,
            configData: this.config,
            configEventId: context.configEventId
          });
          localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
        } catch (e) {
          console.warn('[sync] Failed to persist household identity to GCal', e);
        }
      }
    }

    await this.normalizeAndPersistConfig(context);

    const { applySyncedAdminSettingsFromConfig } = await import('./household-config-apply.js');
    applySyncedAdminSettingsFromConfig(this.config, { CalendarSync: context });
    
    return this.config;
  },

  async normalizeAndPersistConfig(context) {
    let changed = normalizeConfigPartners(this.config, EMPTY_HOUSEHOLD);
    if (syncAllHomeAssociationDefaults(this.config)) changed = true;
    if (!changed) return;

    if (context.mode === 'offline') {
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
      return;
    }

    try {
      await CalendarAPI.saveConfigEvent({
        calendarId: context.calendarId,
        apiKey: context.apiKey,
        accessToken: context.accessToken,
        configData: this.config,
        configEventId: context.configEventId
      });
    } catch (e) {
      console.error('Failed to persist normalized config to Google Calendar', e);
    }
  },

  async saveConfig(context, newConfig, eventsArray) {
    const syncMod = await import('./household-sync.js');
    const { canWriteToGoogleCalendar } = await import('./gcal-sync.js');
    syncMod.ensureHouseholdIdentity(newConfig);
    syncMod.bumpSyncRevision(newConfig);

    this.config = newConfig;
    localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(newConfig));

    let gcalSynced = false;
    let needsAuth = false;

    if (canWriteToGoogleCalendar(context)) {
      try {
        await CalendarAPI.saveConfigEvent({
          calendarId: context.calendarId,
          apiKey: context.apiKey,
          accessToken: context.accessToken,
          configData: newConfig,
          configEventId: context.configEventId
        });
        gcalSynced = true;
      } catch (e) {
        if (e.code === 'GOOGLE_AUTH_EXPIRED' || e.status === 401) {
          console.warn('[GCal] Config saved locally; Google sign-in required to sync.', e);
          needsAuth = true;
        } else {
          console.error('Failed to save config to GCal', e);
          throw e;
        }
      }
    } else if (context.mode === 'sync') {
      needsAuth = true;
    }

    if (gcalSynced || (syncMod.isSyncHubConfigured() && localStorage.getItem(MODE_KEY) === 'sync')) {
      try {
        await syncMod.afterHouseholdWrite(['config'], {
          config: newConfig,
          events: eventsArray,
          revision: newConfig.syncRevision
        });
      } catch (err) {
        console.warn('[sync] Failed to notify after config save', err);
      }
    }

    if (context.onStateUpdate) {
      context.onStateUpdate();
    }

    return { gcalSynced, needsAuth };
  },

  renamePartnerInEvents(context, eventsArray, oldName, newName) {
    if (!oldName || !newName || oldName === newName) return;
    renamePartnerReferences(this.config, eventsArray, oldName, newName);
    if (context.mode === 'sync') {
      this.saveConfig(context, this.config, eventsArray).catch(err => console.error('Failed to save config to GCal', err));
      context.syncEventsToGCal(eventsArray.map(e => e.id));
    } else {
      context.persistEvents();
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
    }
  },

  removePartner(context, eventsArray, partnerId) {
    const partner = this.config?.partners?.find(p => p.id === partnerId);
    if (!partner) return false;
    removePartnerReferences(this.config, eventsArray, partnerId, partner.name);
    this.config.partners = this.config.partners.filter(p => p.id !== partnerId);
    if (context.mode === 'sync') {
      this.saveConfig(context, this.config, eventsArray).catch(err => console.error('Failed to save config to GCal', err));
      context.syncEventsToGCal(eventsArray.map(e => e.id));
    } else {
      context.persistEvents();
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
    }
    if (context.onStateUpdate) context.onStateUpdate();
    return true;
  },

  removeHome(context, eventsArray, homeId) {
    const home = this.config?.residences?.find(h => h.id === homeId);
    if (!home) return false;
    removeHomeReferences(this.config, eventsArray, homeId);
    this.config.residences = this.config.residences.filter(h => h.id !== homeId);
    if (context.mode === 'sync') {
      this.saveConfig(context, this.config, eventsArray).catch(err => console.error('Failed to save config to GCal', err));
      context.syncEventsToGCal(eventsArray.map(e => e.id));
    } else {
      context.persistEvents();
      localStorage.setItem(LOCAL_CONFIG_KEY, JSON.stringify(this.config));
    }
    if (context.onStateUpdate) context.onStateUpdate();
    return true;
  }
};
