# PolySchedule Notify Service

Web Push backend for Android and iPhone PWAs.

## Setup

```bash
cd notify-service
npm install
npm run generate-vapid
```

Copy the generated keys into `.env` (see `.env.example`), set `NOTIFY_SECRET`, then:

```bash
npm start
```

Configure the PolySchedule **Admin** page with notify URL and secret.

Each user enables push under **Settings → Mobile notifications**.

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
