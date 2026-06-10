# Google Calendar Integration

PolySchedule can sync partners, homes, and schedule events through a shared Google Calendar instead of browser-only local storage.

## Setup

1. Open **Settings** (profile avatar → Connection Mode) or navigate to `#settings`.
2. Choose **Google Calendar API Sync Mode**.
3. Enter credentials from [Google Cloud Console](https://console.cloud.google.com/):
   - **OAuth 2.0 Client ID** (Web application; add your app origin to authorized JavaScript origins)
   - **API Key** (restrict to Calendar API)
   - **Calendar ID** (optional — defaults to `primary`; use a shared group calendar ID for households)
4. Click **Save Credentials**.
5. Click **Sync Google** in the top bar and approve Calendar access.

On success, the app loads config and events from Google Calendar and writes changes back on save.

## How data is stored

| Data | Google Calendar representation |
|------|-------------------------------|
| Partners, homes, rules | All-day config event titled `[CONFIG] PolySchedule Core Settings` (JSON in description) |
| Events & proposals | Regular calendar events with PolySchedule metadata JSON in the description |
| Proposal titles | Prefixed with `[PROPOSAL]`, `[PROPOSAL-SLEEP]`, or `[PROPOSAL-BATCH]` while open |

Workflow fields (`workflowState`, votes, participant roles, archive timestamps) are included in the description JSON so proposals survive sync.

## Disconnecting

Use **Disconnect Google Sync** in Settings to revoke OAuth without ending your local partner login. The app falls back to offline/local storage.

## Offline fallback

If Google Calendar is unreachable at startup, the app shows an error toast and continues in offline mode using local storage.

See [SECURITY.md](./SECURITY.md) for token storage and hardening notes.
