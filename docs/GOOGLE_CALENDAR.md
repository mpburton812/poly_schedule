# Google Calendar Integration

PolySchedule uses **Google Calendar** as the household source of truth. Each device connects with its own Google OAuth token; household config and events sync through the shared calendar and the Render notify hub.

## Setup (admin)

1. Sign in as an **Admin** and open **Admin** (`#admin`).
2. Under **Google Calendar Integration**, enter credentials from [Google Cloud Console](https://console.cloud.google.com/):
   - **OAuth 2.0 Client ID** (Web application; add your app origin to authorized JavaScript origins)
   - **API Key** (restrict to Calendar API)
   - **Calendar ID** (optional — defaults to `primary`; use a shared group calendar for households)
3. Click **Save Google Credentials** (writes to Google Calendar config event).
4. Configure **Notify Service URL** and **Notify secret** (must match `NOTIFY_SECRET` on Render).
5. Each device: complete **Google sign-in** when prompted (connect gate or OFFLINE banner).

On success, the app loads config and events from Google Calendar and writes changes back on save.

## Login vs Google

| Step | What |
|------|------|
| **Username/password** | Authenticates via Render notify service (`POST /v1/auth/login`). Returns household config and events cache. |
| **Google OAuth** | Required per device before using the app. Tokens stay in browser `localStorage`; not synced between devices. |

Logging out clears only the PolySchedule session, not Google tokens.

## How data is stored

| Data | Google Calendar representation |
|------|-------------------------------|
| Partners, homes, rules | All-day config event titled `[CONFIG] PolySchedule Core Settings` (JSON in description) |
| Events & proposals | Regular calendar events with PolySchedule metadata JSON in the description |
| Sleeping nights | All-day events (one calendar day per night) |
| Batch sleeping (approved) | Individual all-day sleeping events per night/room — not the batch title event |
| Proposal titles | Prefixed with `[PROPOSAL]`, `[PROPOSAL-SLEEP]`, or `[PROPOSAL-BATCH]` while open |

Workflow fields (`workflowState`, votes, participant roles, archive timestamps) are included in the description JSON so proposals survive sync.

Partner **password hashes** live on the notify service (and in GCal config when set by admin); they are never returned to the browser on login.

## Disconnecting Google

Use **Disconnect Google Sync** on the Admin page to revoke OAuth on this device. The OFFLINE banner lets you re-authenticate without logging out of PolySchedule.

## One-time calendar alignment

After upgrading sync behavior, the app runs a **one-time alignment** the next time you connect in sync mode. It:

- Removes legacy batch parent events and other orphans from Google Calendar
- Materializes missing per-night events for approved batch sleeping proposals
- Re-syncs sleeping nights as all-day events and updates remaining events to match the app database

You will see a confirmation toast when alignment completes. It runs once per browser (`polyschedule_gcal_align_version` in local storage).

## When Google is unreachable

If calendar sync fails at startup (network, expired token, missing credentials):

- The app loads the last cached config/events from `localStorage`
- The **OFFLINE** banner appears; click it to re-authenticate with Google
- Username/password login still works via the notify service

See [SECURITY.md](./SECURITY.md) for token storage and hardening notes.
