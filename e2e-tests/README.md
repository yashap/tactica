# Tactica E2E Tests

Playwright tests that drive the Expo Web build through a real browser and verify the full stack: Expo app → Fastify `tactica-core` service → SuperTokens → Postgres.

## Prerequisites: bring up the services yourself

`pnpm test:e2e` does **not** start any services for you. Bring them up first - see the standard local dev flow in the [main README](../README.md).

Or more briefly:

```bash
# From the repo root:

# 1. After pulling: install deps + migrate DBs (idempotent)
pnpm sync

# 2. Start the backends (tactica-core + SuperTokens core, in parallel via turbo)
pnpm serve:backend

# 3. Start the Expo web build (Metro)
pnpm --filter @tactica/tactica-app web

# 4. Once both terminals are running, run the E2E tests:
pnpm test:e2e
```

## State cleanup

Before each test, the fixture truncates the `Todo` table in the `tactica_core` DB _and_ the SuperTokens user tables in the `supertokens` DB on the dev Postgres container. This means **running E2E will wipe out local todos and accounts** — keep that in mind if you have manual local data you care about.

## Configuration

Service URLs are read from env, with these defaults:

| Variable               | Default                                                                                     |
| ---------------------- | ------------------------------------------------------------------------------------------- |
| `TACTICA_WEB_URL`      | `http://localhost:8081`                                                                     |
| `TACTICA_CORE_URL`     | `http://localhost:3501`                                                                     |
| `SUPERTOKENS_CORE_URL` | `http://localhost:3567`                                                                     |
| `DATABASE_URL`         | `postgres://tactica_core:tactica_core_password@localhost:5440/tactica_core?sslmode=disable` |
| `SUPERTOKENS_DB_URL`   | `postgres://supertokens:supertokens_password@localhost:5440/supertokens?sslmode=disable`    |
