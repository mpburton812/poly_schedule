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
