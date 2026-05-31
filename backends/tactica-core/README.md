# tactica-core

Core aspects of the Tactica domain - a bit of a "monolith" service that we'll pull services out of as we figure out the proper service boundaries.

## Database migrations

We use [Drizzle ORM](https://orm.drizzle.team/) + [drizzle-kit](https://orm.drizzle.team/kit-docs/overview). Schema is defined in TypeScript, migrations are generated from the schema as plain SQL files, and applied via a small TypeScript runner.

### Where things live

- **Schema** — `src/db/schema.ts`. Defines tables, columns, indexes, relations using Drizzle's `pgTable(...)` helpers. Use `standardFields` from `@tactica/drizzle-utils` for the standard `id` + `createdAt` + `updatedAt` columns.
- **Migrations** — `drizzle/*.sql`. Each one is a numbered, named SQL file (e.g. `0001_add_user_email_unique.sql`). Committed to git, run in order. **Once a migration is on `main`, treat it as immutable** — write a new one to fix it, don't edit it in place.
- **Migration metadata** — `drizzle/meta/`. JSON snapshots that drizzle-kit uses to diff schema versions. Committed too. Don't edit by hand.
- **Drizzle config** — `drizzle.config.ts`. Points drizzle-kit at the schema file and the dev DB URL.
- **Runner** — `src/db/migrate.ts`. Tiny script that calls drizzle's `migrate()` against `drizzle/`. Run automatically by `pnpm db:migrate-up`.
- **Migration tracking table** — `__drizzle_migrations` in Postgres. Drizzle creates this on first run; it remembers which migrations have already been applied.

### Workflow: change the schema, generate a migration, apply it

```bash
# 1. Edit src/db/schema.ts — add a column, table, index, etc.

# 2. Generate a migration from the schema diff. Provide a short snake-case name.
#    This brings up the dev Postgres + creates the tactica_core DB/user if needed,
#    builds @tactica/drizzle-utils (drizzle-kit can't follow the `development` exports
#    condition on its own), then runs drizzle-kit generate.
pnpm --filter @tactica/tactica-core db:generate-migration add_user_email

# 3. Inspect the generated file at drizzle/NNNN_add_user_email.sql.
#    If it looks wrong, edit src/db/schema.ts and re-generate (drizzle-kit will
#    rewrite the same file).

# 4. Apply the migration against the dev DB.
pnpm db:migrate-up
# …and against the test DB so backend integration tests see the same schema.
pnpm db:migrate-up:test
```

### Hand-written migrations

For things drizzle-kit can't infer — backfills, complex constraints, data migrations — generate an empty migration and write the SQL yourself:

```bash
pnpm --filter @tactica/tactica-core db:generate-custom-migration backfill_legacy_users
# Creates drizzle/NNNN_backfill_legacy_users.sql with no content. Fill it in, commit it.
# pnpm db:migrate-up applies it like any other.
```

### Resetting local state

```bash
# Drop just the tactica_core DB/user (leaves the Postgres container running and other DBs intact):
pnpm --filter @tactica/tactica-core db:clean
pnpm db:migrate-up

# Snapshot the current state to fixtures.sql for sharing/seed data:
pnpm --filter @tactica/tactica-core db:dump-fixtures

# Restore the committed fixtures.sql (drops + re-creates DB, loads SQL, then runs migrations):
pnpm --filter @tactica/tactica-core db:restore-fixtures

# Nuclear option — destroy both Postgres containers (dev + test) and their volumes:
pnpm db:clean
pnpm db:migrate-up         # rebuilds the dev DB + applies all migrations
pnpm db:migrate-up:test    # same for the test DB
```

## Scripts (cheat sheet)

| Command                                                                   | What it does                                                                                                            |
| ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `pnpm --filter @tactica/tactica-core serve`                               | `tsx watch` the service on `:3501`                                                                                      |
| `pnpm --filter @tactica/tactica-core start`                               | Run the compiled `dist/main.js` (after `pnpm build`)                                                                    |
| `pnpm --filter @tactica/tactica-core test`                                | Vitest integration tests (uses the test Postgres on `:5441`; run `pnpm db:migrate-up:test` first if it's a fresh clone) |
| `pnpm --filter @tactica/tactica-core lint`                                | tsc + ESLint                                                                                                            |
| `pnpm --filter @tactica/tactica-core db:generate-migration <name>`        | Generate a migration from the current schema diff                                                                       |
| `pnpm --filter @tactica/tactica-core db:generate-custom-migration <name>` | Generate an empty migration for hand-written SQL                                                                        |
| `pnpm --filter @tactica/tactica-core db:migrate-up`                       | Apply migrations against the dev Postgres                                                                               |
| `pnpm --filter @tactica/tactica-core db:migrate-up:test`                  | Apply migrations against the test Postgres                                                                              |
| `pnpm --filter @tactica/tactica-core db:clean`                            | Drop the tactica-core DB + user from the dev container                                                                  |
| `pnpm --filter @tactica/tactica-core db:clean:test`                       | Same, but for the test container                                                                                        |
| `pnpm --filter @tactica/tactica-core db:dump-fixtures`                    | Dump the current tactica-core DB to `fixtures.sql`                                                                      |
| `pnpm --filter @tactica/tactica-core db:restore-fixtures`                 | Drop + re-create DB from `fixtures.sql`, then migrate                                                                   |
