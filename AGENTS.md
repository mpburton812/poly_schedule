# AGENTS.md

## Cursor Cloud specific instructions

PolySchedule is a vanilla-JS Progressive Web App (repo root) plus an optional
Express backend (`notify-service/`). Both are Node.js/npm projects. There is no
bundler and **no linter** configured (no ESLint/Prettier, no `lint` script).

Dependencies (root + `notify-service`) and the Playwright Chromium browser are
installed automatically by the startup update script, so you normally don't need
to run installs yourself. Standard scripts live in `package.json` /
`notify-service/package.json`.

### Services

| Service | Dir | Dev run | Port | Required? |
|---|---|---|---|---|
| PolySchedule PWA (frontend) | repo root | `npm run dev` (live reload) or `npm start` | 8080 | Yes |
| Notify service (Express) | `notify-service/` | `npm run notify` | 8787 | Optional |

- Frontend `npm run dev` runs `generate-version.js` then `five-server` on
  `127.0.0.1:8080`. `npm start` uses `http-server` instead (no live reload).
- Notify service needs `notify-service/.env` (copy `notify-service/.env.example`).
  Generate keys with `npm run generate-vapid` and `npm run generate:notify-secret`
  (run from `notify-service/`). It defaults to JSON file storage in `DATA_DIR`;
  Postgres (`DATABASE_URL`) and SMTP are optional and off by default. Health
  check: `GET http://127.0.0.1:8787/health`.

### Tests

- Unit: `npm run test:unit` (Vitest, fast, ~236 tests).
- E2E: `npm run test:e2e` (`npm run build` then Playwright; Playwright starts its
  own `http-server` on port **8091** — do not pre-start a server on 8091).
- `playwright.config.js` defines chromium/firefox/webkit projects, but the update
  script only installs **chromium**. Run E2E with `--project=chromium`; other
  browsers will fail with "browser not installed" (this matches CI, which also
  installs only chromium).
- Known pre-existing failures on `dev`: two chromium e2e tests
  (`should support activating a passive partner`,
  `should allow admin to delete a passive partner` in `tests/app.spec.js`) fail
  in CI and locally. They are app/test issues, not environment problems.

### Google Calendar dependency (important)

Google Calendar is the app's real backend. A genuine login + schedule/write flow
requires Google OAuth credentials (client ID + API key) **and** an interactive
Google sign-in with an account that can access the shared calendar. Without them,
after login the app shows a "Connect Google" gate and calendar writes are blocked.

For development/testing without Google, the app ships an E2E harness: setting
`window.__POLYSCHEDULE_E2E__` plus seeding localStorage (see `tests/helpers.js`
and `tests/fixtures/household-seed.js`) bypasses the Google gate and mocks the
notify login. This is how the Playwright suite exercises core flows (creating
event/sleeping proposals, voting, approval) end-to-end.
