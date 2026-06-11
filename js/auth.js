/**
 * PolySchedule Google Authentication Helper
 * Manages Google Identity Services OAuth 2.0 flow and local credentials configurations.
 */

import { GOOGLE_PROFILE_KEY, LEGACY_PROFILE_KEY } from './helpers.js';

export const AuthManager = {
  clientId: localStorage.getItem('polyschedule_client_id') || '',
  apiKey: localStorage.getItem('polyschedule_api_key') || '',
  tokenClient: null,
  accessToken: localStorage.getItem('polyschedule_access_token') || '',
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
    this.clientId = localStorage.getItem('polyschedule_client_id') || '';
    this.apiKey = localStorage.getItem('polyschedule_api_key') || '';
    this.accessToken = localStorage.getItem('polyschedule_access_token') || '';
  },

  setCredentials(clientId, apiKey) {
    const clientChanged = !!(this.clientId && this.clientId !== clientId);
    this.clientId = clientId;
    this.apiKey = apiKey;
    localStorage.setItem('polyschedule_client_id', clientId);
    localStorage.setItem('polyschedule_api_key', apiKey);
    if (clientChanged) {
      this.accessToken = '';
      localStorage.removeItem('polyschedule_access_token');
    }

    this.loadGapiAndGis();
  },

  clearCredentials() {
    this.clientId = '';
    this.apiKey = '';
    this.accessToken = '';
    this.userProfile = null;
    localStorage.removeItem('polyschedule_client_id');
    localStorage.removeItem('polyschedule_api_key');
    localStorage.removeItem('polyschedule_access_token');
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
        localStorage.setItem('polyschedule_access_token', this.accessToken);
        
        // Fetch user profile info
        this.fetchUserProfile();
      },
    });
  },

  login() {
    if (!this.clientId) {
      throw new Error('Please configure your Google Client ID and API Key in Settings first.');
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
    localStorage.removeItem('polyschedule_access_token');
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
