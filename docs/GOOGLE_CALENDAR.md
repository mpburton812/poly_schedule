# Google Calendar Integration

PolySchedule can sync partners, homes, and schedule events through a shared Google Calendar instead of browser-only local storage.

## Setup

1. Sign in as an **Admin** and open **Admin** from the sidebar (or navigate to `#admin`).
2. In **Google Calendar Integration**, enter credentials from [Google Cloud Console](https://console.cloud.google.com/):
   - **OAuth 2.0 Client ID** (Web application; add your app origin to authorized JavaScript origins)
   - **API Key** (restrict to Calendar API)
   - **Calendar ID** (optional — defaults to `primary`; use a shared group calendar ID for households)
3. Click **Save Google Credentials**.
4. Any member can then choose **Google Calendar API Sync Mode** in profile settings and click **Sync Google** in the top bar to approve Calendar access.

On success, the app loads config and events from Google Calendar and writes changes back on save.

## How data is stored

| Data | Google Calendar representation |
|------|-------------------------------|
| Partners, homes, rules | All-day config event titled `[CONFIG] PolySchedule Core Settings` (JSON in description) |
| Events & proposals | Regular calendar events with PolySchedule metadata JSON in the description |
| Sleeping nights | All-day events (one calendar day per night) |
| Batch sleeping (approved) | Individual all-day sleeping events per night/room — not the batch title event |
| Proposal titles | Prefixed with `[PROPOSAL]`, `[PROPOSAL-SLEEP]`, or `[PROPOSAL-BATCH]` while open |

Workflow fields (`workflowState`, votes, participant roles, archive timestamps) are included in the description JSON so proposals survive sync.

## Disconnecting

Use **Disconnect Google Sync** on the Admin page to revoke OAuth without ending local partner login. The app falls back to offline/local storage.

## One-time calendar alignment

After upgrading sync behavior, the app runs a **one-time alignment** the next time you connect in Google Calendar sync mode. It:

- Removes legacy batch parent events and other orphans from Google Calendar
- Materializes missing per-night events for approved batch sleeping proposals
- Re-syncs sleeping nights as all-day events and updates remaining events to match the app database

You will see a confirmation toast when alignment completes. It runs once per browser (`polyschedule_gcal_align_version` in local storage).

## Offline fallback

If Google Calendar is unreachable at startup, the app shows an error toast and continues in offline mode using local storage.

See [SECURITY.md](./SECURITY.md) for token storage and hardening notes.
