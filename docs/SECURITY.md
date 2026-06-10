# PolySchedule Security Notes

PolySchedule is a client-side progressive web app intended for trusted household scheduling. Treat the following as operational guidance, not a formal audit.

## Authentication model

- **Local partner login** uses usernames and passwords stored in browser `localStorage` as part of the demo/offline config seed. This is suitable for local demos only—not for production multi-tenant hosting without a real backend.
- **Google Calendar sync** uses OAuth 2.0 via Google Identity Services. Access tokens and API keys are stored in `localStorage` on the client. Disconnect Google sync (`Disconnect Google Sync` in Settings) revokes the token and clears the Google profile without ending the local partner session.
- **Local logout** (sidebar / profile) clears only the partner session (`polyschedule_local_session`) and returns to the login screen. It does not revoke Google tokens.

## Data storage

All schedule data, credentials, and logs persist in the browser:

| Key | Contents |
|-----|----------|
| `polyschedule_local_config` | Partners, homes, rules |
| `polyschedule_local_events` | Events and proposals |
| `polyschedule_local_session` | Active partner session |
| `polyschedule_google_profile` | Google OAuth profile metadata |
| `polyschedule_client_id` / `polyschedule_api_key` | Google API credentials |

Anyone with physical or remote access to the unlocked browser profile can read or modify this data.

## Reporting issues

If you discover a security concern in this repository, please open a private issue or contact the maintainers directly. Do not commit API keys, OAuth client secrets, or production calendar IDs to the repo.

## Recommended hardening (future)

- Move authentication and secrets to a backend service.
- Use HttpOnly session cookies instead of localStorage for tokens.
- Restrict Google OAuth client IDs to approved origins in Google Cloud Console.
- Enable Content Security Policy headers when serving the app from a host you control.
