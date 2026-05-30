# Tactica E2E Tests

Playwright tests that drive the Expo Web build through a real browser and verify the full stack: Expo app → Fastify `tactica-core` service → SuperTokens → Postgres.

## Prerequisites: bring up the services yourself

`pnpm test:e2e` does **not** start any services for you. Bring them up first, in separate terminals (or backgrounded):

```bash
# From the repo root:

# 1. Start the dev Postgres + create per-service DBs/users
pnpm db:migrate-up

# 2. Start the SuperTokens core (foreground; runs in Docker)
pnpm --filter @tactica/supertokens serve

# 3. Start the tactica-core service (foreground; tsx watch)
pnpm --filter @tactica/tactica-core serve

# 4. Start the Expo web build (foreground; Metro)
pnpm --filter @tactica/tactica-app web

# 5. Once all four are running, run the E2E tests:
pnpm test:e2e
```

If any of those services aren't reachable, the test will fail fast with a clear error pointing at this README.

## What is verified

`src/todos.spec.ts` exercises:

1. Signup with a brand-new email/password → redirect to the todo list
2. Empty-state for a fresh user
3. Create a todo
4. Edit the todo's title and verify it persists after a page reload
5. Log out → log back in → verify the todo is still there (session + DB persistence)
6. Delete the todo → empty state again

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
