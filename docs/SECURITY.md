# PolySchedule Security Notes

PolySchedule is a client-side progressive web app backed by a **Render notify service** for login and sync coordination, with **Google Calendar** as the durable household store. Treat the following as operational guidance, not a formal audit.

## Authentication model

- **Partner login** uses username and password verified by the notify service (`POST /v1/auth/login`). Password hashes are stored server-side on Render (and in GCal config when admins set passwords). Login responses **never** include password hashes.
- **Google Calendar sync** uses OAuth 2.0 via Google Identity Services. Access tokens are stored per device in `localStorage`. Client ID, API key, and calendar ID can be **server-managed** via notify service env vars (`GOOGLE_CLIENT_ID`, `GOOGLE_API_KEY`, `GOOGLE_CALENDAR_ID`) so household members never enter them in Admin.
- **Local logout** (profile / sidebar) clears only the partner session (`polyschedule_local_session`). It does not revoke Google tokens.
- **Notify secret** (`NOTIFY_SECRET` on Render, mirrored in Admin) protects sync push, push subscriptions, and emergency password reset. Rotate if exposed — see `notify-service/docs/SECRET_ROTATION.md`.

## Data storage

| Key / location | Contents |
|----------------|----------|
| Render notify `households.json` | Cached config (with password hashes), events, revision |
| `polyschedule_local_config` | Cached partners, homes, rules (no password hashes after login) |
| `polyschedule_local_events` | Events and proposals |
| `polyschedule_local_session` | Active partner session |
| `polyschedule_notify_url` / `polyschedule_notify_secret` | Notify service connection |
| `polyschedule_client_id` / `polyschedule_api_key` / `polyschedule_access_token` | Google API credentials (per device) |
| `polyschedule_google_profile` | Google OAuth profile metadata |

Anyone with physical or remote access to the unlocked browser profile can read or modify local data and use stored Google tokens until they expire.

## Lockout recovery

If login fails after a bad sync wiped password hashes, an operator with the notify secret can reset passwords:

- `POST /v1/auth/reset-password` with header `X-Notify-Secret`
- Or Render shell: `node scripts/reset-partner-passwords.js …`

See `notify-service/README.md`.

## Reporting issues

If you discover a security concern in this repository, please open a private issue or contact the maintainers directly. Do not commit API keys, OAuth client secrets, notify secrets, or production calendar IDs to the repo.

## Recommended hardening (future)

- HttpOnly session cookies instead of localStorage for sensitive tokens (would require broader backend changes).
- Restrict Google OAuth client IDs to approved origins in Google Cloud Console.
- Enable Content Security Policy headers when serving the app from a host you control.
- Periodic rotation of `NOTIFY_SECRET` and partner passwords after incidents.
