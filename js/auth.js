import {
  CLIENT_ID_KEY,
  API_KEY_KEY,
  ACCESS_TOKEN_KEY,
  ACCESS_TOKEN_EXPIRY_KEY
} from './storage-keys.js';
/**
 * PolySchedule Google Authentication Helper
 * Manages Google Identity Services OAuth 2.0 flow and local credentials configurations.
 */

import { GOOGLE_PROFILE_KEY, LEGACY_PROFILE_KEY } from './storage-keys.js';

const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;

export const AuthManager = {
  clientId: localStorage.getItem(CLIENT_ID_KEY) || '',
  apiKey: localStorage.getItem(API_KEY_KEY) || '',
  tokenClient: null,
  accessToken: localStorage.getItem(ACCESS_TOKEN_KEY) || '',
  accessTokenExpiry: Number(localStorage.getItem(ACCESS_TOKEN_EXPIRY_KEY) || 0),
  userProfile: JSON.parse(localStorage.getItem(GOOGLE_PROFILE_KEY) || localStorage.getItem(LEGACY_PROFILE_KEY) || 'null'),
  onAuthStateChange: null,
  onAuthError: null,
  _pendingTokenPromise: null,

  init(callback) {
    this.onAuthStateChange = callback;
    this.loadGapiAndGis();

    // Notify app of initial state
    if (this.accessToken && this.userProfile) {
      callback({ loggedIn: true, user: this.userProfile, mode: 'sync' });
    } else {
      callback({ loggedIn: false, user: null, mode: 'offline' });
    }
  },

  reloadFromStorage() {
    this.clientId = localStorage.getItem(CLIENT_ID_KEY) || '';
    this.apiKey = localStorage.getItem(API_KEY_KEY) || '';
    this.accessToken = localStorage.getItem(ACCESS_TOKEN_KEY) || '';
    this.accessTokenExpiry = Number(localStorage.getItem(ACCESS_TOKEN_EXPIRY_KEY) || 0);
  },

  persistToken(tokenResponse) {
    this.accessToken = tokenResponse.access_token;
    localStorage.setItem(ACCESS_TOKEN_KEY, this.accessToken);
    const expiresIn = Number(tokenResponse.expires_in) || 3600;
    this.accessTokenExpiry = Date.now() + expiresIn * 1000 - TOKEN_REFRESH_BUFFER_MS;
    localStorage.setItem(ACCESS_TOKEN_EXPIRY_KEY, String(this.accessTokenExpiry));
  },

  clearStoredToken() {
    this.accessToken = '';
    this.accessTokenExpiry = 0;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
    localStorage.removeItem(ACCESS_TOKEN_EXPIRY_KEY);
  },

  isAccessTokenExpired() {
    if (!this.accessToken) return true;
    if (!this.accessTokenExpiry) return false;
    return Date.now() >= this.accessTokenExpiry;
  },

  setCredentials(clientId, apiKey) {
    const clientChanged = !!(this.clientId && this.clientId !== clientId);
    this.clientId = clientId;
    this.apiKey = apiKey;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    localStorage.setItem(API_KEY_KEY, apiKey);
    if (clientChanged) {
      this.clearStoredToken();
    }

    this.loadGapiAndGis();
  },

  clearCredentials() {
    this.clientId = '';
    this.apiKey = '';
    this.userProfile = null;
    localStorage.removeItem(CLIENT_ID_KEY);
    localStorage.removeItem(API_KEY_KEY);
    this.clearStoredToken();
    localStorage.removeItem(GOOGLE_PROFILE_KEY);
    localStorage.removeItem(LEGACY_PROFILE_KEY);

    if (this.onAuthStateChange) {
      this.onAuthStateChange({ loggedIn: false, user: null, mode: 'offline' });
    }
  },

  loadGapiAndGis() {
    if (!this.clientId) return;

    // Dynamically load Google APIs if not present
    if (!window.gapiScriptLoaded && !window.gapiScriptLoading) {
      window.gapiScriptLoading = true;
      const gapiScript = document.createElement('script');
      gapiScript.src = 'https://apis.google.com/js/api.js';
      gapiScript.async = true;
      gapiScript.defer = true;
      gapiScript.onload = () => { window.gapiScriptLoaded = true; };
      gapiScript.onerror = () => { window.gapiScriptLoading = false; };
      document.head.appendChild(gapiScript);
    }

    if (!window.gisScriptLoaded && !window.gisScriptLoading) {
      window.gisScriptLoading = true;
      const gisScript = document.createElement('script');
      gisScript.src = 'https://accounts.google.com/gsi/client';
      gisScript.async = true;
      gisScript.defer = true;
      gisScript.onload = () => {
        window.gisScriptLoaded = true;
        this.initTokenClient();
      };
      gisScript.onerror = () => { window.gisScriptLoading = false; };
      document.head.appendChild(gisScript);
    } else if (window.gisScriptLoaded) {
      this.initTokenClient();
    }
  },

  initTokenClient() {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) return;

    this.tokenClient = window.google.accounts.oauth2.initTokenClient({
      client_id: this.clientId,
      scope: 'https://www.googleapis.com/auth/calendar openid email profile',
      callback: (tokenResponse) => {
        if (tokenResponse.error !== undefined) {
          console.error('Google Auth Error:', tokenResponse);
          const hint = tokenResponse.error === 'popup_closed_by_user'
            ? 'Google sign-in was cancelled.'
            : `Google sign-in failed (${tokenResponse.error}${tokenResponse.error_description ? `: ${tokenResponse.error_description}` : ''}). Check OAuth JavaScript origins for this site in Google Cloud Console.`;
          if (this.onAuthError) this.onAuthError(hint);
          if (this._pendingTokenPromise) {
            this._pendingTokenPromise.reject(new Error(hint));
            this._pendingTokenPromise = null;
          }
          return;
        }
        this.persistToken(tokenResponse);
        this.fetchUserProfile();
        if (this._pendingTokenPromise) {
          this._pendingTokenPromise.resolve(tokenResponse);
          this._pendingTokenPromise = null;
        }
      },
    });
  },

  requestAccessToken(options = {}) {
    return new Promise((resolve, reject) => {
      if (!this.clientId) {
        reject(new Error('Google Calendar is not configured for this household. An admin must set OAuth Client ID and API Key under Admin → Google Calendar Settings.'));
        return;
      }
      if (!this.tokenClient) {
        this.initTokenClient();
      }
      if (!this.tokenClient) {
        reject(new Error('Google identity client library is still loading. Please try again in a few seconds.'));
        return;
      }
      this._pendingTokenPromise = { resolve, reject };
      this.tokenClient.requestAccessToken(options);
    });
  },

  /** User-initiated sign-in. Reuses prior consent silently when possible. */
  login(options = {}) {
    this.reloadFromStorage();
    return this.requestAccessToken(this.buildTokenRequestOptions(options));
  },

  buildTokenRequestOptions({
    forceConsent = false,
    selectAccount = false,
    loginHint = ''
  } = {}) {
    const hasPriorSession = !!(this.userProfile || localStorage.getItem(GOOGLE_PROFILE_KEY));
    const prompts = [];
    if (selectAccount) prompts.push('select_account');
    if (forceConsent || !hasPriorSession) prompts.push('consent');
    const tokenOptions = { prompt: prompts.join(' ') || '' };
    const hint = String(loginHint || '').trim();
    if (hint) tokenOptions.hint = hint;
    return tokenOptions;
  },

  /** Refresh an expired access token without forcing consent when already authorized. */
  async ensureAccessToken({ interactive = false } = {}) {
    this.reloadFromStorage();
    if (this.accessToken && !this.isAccessTokenExpired()) {
      return this.accessToken;
    }
    if (!this.clientId) {
      throw new Error('Google Calendar is not configured for this household.');
    }
    const hasPriorSession = !!(this.userProfile || localStorage.getItem(GOOGLE_PROFILE_KEY));
    if (!hasPriorSession && !interactive) {
      throw new Error('Google Calendar is not connected.');
    }
    await this.requestAccessToken(this.buildTokenRequestOptions({
      forceConsent: interactive || !hasPriorSession,
      selectAccount: interactive
    }));
    return this.accessToken;
  },

  logout() {
    if (this.accessToken) {
      try {
        window.google.accounts.oauth2.revokeToken(this.accessToken, () => {});
      } catch (e) {
        console.error('Error revoking token:', e);
      }
    }
    this.clearStoredToken();
    this.userProfile = null;
    localStorage.removeItem(GOOGLE_PROFILE_KEY);
    localStorage.removeItem(LEGACY_PROFILE_KEY);

    if (this.onAuthStateChange) {
      this.onAuthStateChange({ loggedIn: false, user: null, mode: 'offline' });
    }
  },

  async fetchUserProfile() {
    try {
      // Fetch profile using standard Google OAuth userinfo endpoint
      const res = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      const data = await res.json();

      this.userProfile = {
        name: data.name || 'Google User',
        email: data.email,
        picture: data.picture || 'https://lh3.googleusercontent.com/a/default-user'
      };

      localStorage.setItem(GOOGLE_PROFILE_KEY, JSON.stringify(this.userProfile));

      if (this.onAuthStateChange) {
        this.onAuthStateChange({ loggedIn: true, user: this.userProfile, mode: 'sync' });
      }
    } catch (e) {
      console.error('Error fetching user profile:', e);
      // Fallback profile if request fails
      this.userProfile = {
        name: 'Google User',
        email: 'unknown@example.com',
        picture: 'https://lh3.googleusercontent.com/a/default-user'
      };
      localStorage.setItem(GOOGLE_PROFILE_KEY, JSON.stringify(this.userProfile));
      if (this.onAuthStateChange) {
        this.onAuthStateChange({ loggedIn: true, user: this.userProfile, mode: 'sync' });
      }
    }
  }
};
