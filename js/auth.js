import {
  CLIENT_ID_KEY,
  API_KEY_KEY,
  ACCESS_TOKEN_KEY
} from './storage-keys.js';
/**
 * PolySchedule Google Authentication Helper
 * Manages Google Identity Services OAuth 2.0 flow and local credentials configurations.
 */

import { GOOGLE_PROFILE_KEY, LEGACY_PROFILE_KEY } from './storage-keys.js';

export const AuthManager = {
  clientId: localStorage.getItem(CLIENT_ID_KEY) || '',
  apiKey: localStorage.getItem(API_KEY_KEY) || '',
  tokenClient: null,
  accessToken: localStorage.getItem(ACCESS_TOKEN_KEY) || '',
  userProfile: JSON.parse(localStorage.getItem(GOOGLE_PROFILE_KEY) || localStorage.getItem(LEGACY_PROFILE_KEY) || 'null'),
  onAuthStateChange: null,
  onAuthError: null,

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
  },

  setCredentials(clientId, apiKey) {
    const clientChanged = !!(this.clientId && this.clientId !== clientId);
    this.clientId = clientId;
    this.apiKey = apiKey;
    localStorage.setItem(CLIENT_ID_KEY, clientId);
    localStorage.setItem(API_KEY_KEY, apiKey);
    if (clientChanged) {
      this.accessToken = '';
      localStorage.removeItem(ACCESS_TOKEN_KEY);
    }

    this.loadGapiAndGis();
  },

  clearCredentials() {
    this.clientId = '';
    this.apiKey = '';
    this.accessToken = '';
    this.userProfile = null;
    localStorage.removeItem(CLIENT_ID_KEY);
    localStorage.removeItem(API_KEY_KEY);
    localStorage.removeItem(ACCESS_TOKEN_KEY);
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
          return;
        }
        this.accessToken = tokenResponse.access_token;
        localStorage.setItem(ACCESS_TOKEN_KEY, this.accessToken);
        
        // Fetch user profile info
        this.fetchUserProfile();
      },
    });
  },

  login() {
    this.reloadFromStorage();
    if (!this.clientId) {
      throw new Error('Google Calendar is not configured for this household. An admin must set OAuth Client ID and API Key under Admin → Google Calendar Settings.');
    }
    
    if (!this.tokenClient) {
      this.initTokenClient();
    }

    if (this.tokenClient) {
      // Request access token (forces popup)
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
      throw new Error('Google identity client library is still loading. Please try again in a few seconds.');
    }
  },

  logout() {
    if (this.accessToken) {
      try {
        window.google.accounts.oauth2.revokeToken(this.accessToken, () => {});
      } catch (e) {
        console.error('Error revoking token:', e);
      }
    }
    this.accessToken = '';
    this.userProfile = null;
    localStorage.removeItem(ACCESS_TOKEN_KEY);
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
