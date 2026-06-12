# PolySchedule Notify Service

Web Push backend for Android and iPhone PWAs.

## Setup

```bash
cd notify-service
npm install
npm run generate-vapid
```

Copy the generated keys into `.env` (see `.env.example`), set `NOTIFY_SECRET` (or run `npm run generate:notify-secret`), then:

```bash
npm start
```

Configure the PolySchedule **Admin** page with notify URL and secret.

### Lockout recovery (all admin passwords lost)

If household sync wiped login hashes, reset a partner password with the notify secret:

```bash
curl -X POST "https://YOUR-NOTIFY.onrender.com/v1/auth/reset-password" \
  -H "Content-Type: application/json" \
  -H "X-Notify-Secret: YOUR_NOTIFY_SECRET" \
  -d '{"username":"kathompson","password":"Choose-A-New-Password"}'
```

On Render shell (from `notify-service`):

```bash
node scripts/reset-partner-password.js kathompson 'Choose-A-New-Password'
```

Then sign in to PolySchedule with the new password.

See [docs/SECRET_ROTATION.md](./docs/SECRET_ROTATION.md) for rotating `NOTIFY_SECRET` after exposure.

Each user enables push under **Settings → Mobile notifications**.

## Household sync hub (Phases 0–3)

Google Calendar stays the source of truth. The notify service coordinates near-real-time updates:

| Endpoint | Purpose |
|----------|---------|
| `POST /v1/auth/login` | Username/password login — returns config, events, `groupName`, `googleIntegration`, and `notifyService` |
| `POST /v1/auth/reset-password` | **Lockout recovery** — set a partner password using `X-Notify-Secret` (same secret as Admin → Notify) |
| `GET /v1/usernames/check` | Check global username availability |
| `POST /v1/sync/register` | Register a device for a household |
| `GET /v1/sync/status` | Current revision for polling fallback |
| `GET /v1/sync/config` | Cached config (204 if unchanged) |
| `GET /v1/sync/events` | Cached events (204 if unchanged) |
| `POST /v1/sync/push` | Writer pushes cache + broadcasts SSE/Web Push |
| `GET /v1/sync/stream` | SSE stream per `householdId` |
| `POST /v1/gcal/watch` | Register Google Calendar `channels.watch` |
| `POST /v1/gcal/webhook` | Google push notification callback |

Set `PUBLIC_BASE_URL` to your Render HTTPS URL so GCal webhooks can reach `/v1/gcal/webhook`.

Optional **single-household mode**: set `HOUSEHOLD_ID` to the internal id from your synced config. Login and username checks then use that household only (no cross-household registry).

On the PolySchedule **Admin** page: configure notify URL/secret, save config to Google Calendar (sync id is assigned automatically), then **Register GCal Webhook** after Google is connected.

## Event types

The client POSTs to `/v1/events` with:

| type | When |
|------|------|
| `proposal-submitted` | New proposal needs review |
| `proposal-vote` | Someone voted on your proposal |
| `proposal-approved` | Proposal fully approved |
| `proposal-declined` | Proposal declined |
| `proposal-retracted` | Proposer retracted to draft |
| `proposal-cancelled` | Proposer cancelled proposal |

All types use the same payload shape: `type`, `title`, `body`, `url`, `recipientIds`, `dedupeKey`, optional `proposalId`.

## iPhone

Users must **Add to Home Screen** (iOS 16.4+) for Web Push to work.

## Deploy (Render)

Create a Web Service pointing at `notify-service`, set env vars, and attach a persistent disk at `/opt/render/project/src/notify-service/data` if you want subscription storage to survive restarts (or use Postgres in a later phase).

### CORS for Vercel (Path A)

When the PWA is hosted on Vercel, add your production and preview origins to `ALLOWED_ORIGINS`:

```
ALLOWED_ORIGINS=https://your-app.vercel.app,https://polyschedule.example.com
```

For PR preview URLs (`*.vercel.app`), either add each preview origin or use `*` during development only.

In PolySchedule **Admin**, set **Notify Service URL** to your Render HTTPS URL (not `http://127.0.0.1:8787`).

## Deploy (Vercel — frontend only)

The static PWA deploys from the repo root using `vercel.json`. The notify service stays on Render (or similar).

1. Import the GitHub repo in [Vercel](https://vercel.com/new).
2. Framework preset: **Other**; production branch: `dev` (or your release branch).
3. Build command: `node generate-version.js` (also set via `vercel.json`).
4. After deploy, add the Vercel URL to Google OAuth **Authorized JavaScript origins** and API key referrers.
5. Configure notify on Render and point Admin → Notify URL to that HTTPS endpoint.

See `vercel.json` and `.vercelignore` in the repo root.
