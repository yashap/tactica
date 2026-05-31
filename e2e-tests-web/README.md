# Tactica Web E2E Tests

Playwright tests that drive the Expo Web build through a real browser and verify the full stack: Expo app → Fastify `tactica-core` service → SuperTokens → Postgres.

## Running the tests

`pnpm test:e2e:web` does **not** start any services for you. Bring them up first - see the standard local dev flow in the [main README](../README.md).

Or more briefly:

```bash
# From the repo root:

# 1. After pulling: install deps + migrate DBs
pnpm sync

# 2. Start the backends (tactica-core + SuperTokens core, in parallel via turbo)
pnpm serve:backend

# 3. Start the Expo web build (Metro)
pnpm serve:tactica:web

# 4. Once both terminals are running, run the E2E tests:
pnpm test:e2e:web
```

## State isolation

Tests do **not** touch your local dev data. Each test:

- Uses a unique signup email (`tactica-e2e-${timestamp}-${random}@example.com`), so it never collides with previous test runs or your manual dev accounts.
- Gets a fresh Playwright browser context with no cookies / storage, so there's no carry-over session.
- Deletes the todo it created as the last step of the flow, so it leaves no Todo rows behind.

The only residue from each run is a single dead SuperTokens user with a unique throwaway email — harmless to leave around. If you want to wipe them, use the per-service helpers documented in the main README (`pnpm --filter @tactica/supertokens db:clean` for SuperTokens accounts; `pnpm --filter @tactica/tactica-core db:clean` for the `Todo` table).

## Configuration

Service URLs are read from env, with these defaults:

| Variable               | Default                 |
| ---------------------- | ----------------------- |
| `TACTICA_WEB_URL`      | `http://localhost:8081` |
| `TACTICA_CORE_URL`     | `http://localhost:3501` |
| `SUPERTOKENS_CORE_URL` | `http://localhost:3567` |
