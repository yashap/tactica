# tactica-core

The first Fastify service for Tactica. Owns the `Todo` schema for now; chess-specific routes will land alongside.

## Scripts

| Command                                                  | What it does                                             |
| -------------------------------------------------------- | -------------------------------------------------------- |
| `pnpm --filter @tactica/tactica-core serve`              | `tsx watch` the service on `:3501`                       |
| `pnpm --filter @tactica/tactica-core start`              | Run the compiled `dist/main.js` (after `pnpm build`)     |
| `pnpm --filter @tactica/tactica-core db:migrate-up`      | Apply migrations against the dev Postgres (`:5440`)      |
| `pnpm --filter @tactica/tactica-core db:migrate-up:test` | Apply migrations against the test Postgres (`:5441`)     |
| `pnpm --filter @tactica/tactica-core db:generate`        | Generate a new Drizzle migration from `src/db/schema.ts` |
| `pnpm --filter @tactica/tactica-core test`               | Vitest integration tests (requires test DB; see below)   |
| `pnpm --filter @tactica/tactica-core typecheck` / `lint` | Standard checks                                          |

## Tests

`TodoRepository.spec.ts` is an integration test that exercises the real Drizzle queries against a real Postgres. It uses the **test** Postgres container on port `5441` and resets the `Todo` table between cases.

Before running the test for the first time (or after `pnpm db:clean`):

```bash
pnpm --filter @tactica/tactica-core db:migrate-up:test
```

Then:

```bash
pnpm --filter @tactica/tactica-core test
# or, from the repo root, runs the full workspace test suite:
pnpm test
```

The Vitest setup at `src/test/setup.ts` pins `DATABASE_URL` to the test container so the same `db` import that the running service uses points at the right database during tests.

If the test Postgres isn't running, the tests will fail at connection time with a clear error.
