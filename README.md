# Tactica

A chess learning app monorepo. This branch contains the scaffolding only — auth + a "todo" list to prove the stack works end-to-end.

## Stack

| Layer    | Choice                                                                 |
| -------- | ---------------------------------------------------------------------- |
| Monorepo | pnpm workspaces + Turborepo                                            |
| Backend  | Fastify + ts-rest + Drizzle + Postgres                                 |
| Auth     | SuperTokens (EmailPassword + Session), self-hosted core via Docker     |
| Frontend | Expo + Expo Router (iOS / Android / web from one codebase)             |
| Tests    | Vitest (unit + backend integration), Playwright (E2E against Expo Web) |
| Language | TypeScript (Node 22)                                                   |

## Layout

```
backends/
├── tactica-core/       # The Fastify service (todos for now)
└── supertokens/        # Docker config for SuperTokens core
frontends/
└── tactica-app/        # Expo app (iOS + Android + Web)
packages/
├── tactica-core-contract/  # ts-rest contracts for the tactica-core service
├── tactica-core-client/    # axios-based ts-rest client for tactica-core
├── api-client-utils/       # ContractBuilder, axios builder, response helpers
├── drizzle-utils/          # standardFields, db client helpers
├── errors/                 # BaseError + ServerError hierarchy
├── eslint-config/          # Shared ESLint flat config
├── fastify-utils/          # FastifyAppBuilder, ts-rest plugin, supertokens plugin
├── logging/                # Winston logger
└── tsconfig/               # Shared base.json + library.json + node-app.json
e2e-tests/                  # Playwright E2E tests (top-level, separate from packages)
tools/scripts/              # Bash scripts for Postgres lifecycle (copied/adapted from parker)
```

## Local dev

### One-time setup

```bash
nvm use                          # Node 22
pnpm install
pnpm exec playwright install chromium   # for E2E
```

### Day-to-day

In separate terminals:

```bash
# Terminal 1: bring up Postgres + apply migrations
pnpm db:migrate-up

# Terminal 2: SuperTokens core (runs in Docker)
pnpm --filter @tactica/supertokens serve

# Terminal 3: the Fastify service
pnpm --filter @tactica/tactica-core serve

# Terminal 4: the Expo app (web, iOS, Android — pick one)
pnpm --filter @tactica/tactica-app web      # → http://localhost:8081
pnpm --filter @tactica/tactica-app ios
pnpm --filter @tactica/tactica-app android
```

### Workspace-wide commands

```bash
pnpm typecheck       # TypeScript across everything
pnpm lint            # Prettier check + ESLint
pnpm format          # Prettier write + ESLint --fix
pnpm build           # Compile every package to dist/
pnpm test            # Vitest unit + backend integration tests (no E2E)
pnpm test:e2e        # Playwright E2E (assumes services are running — see below)
pnpm db:migrate-up   # Ensure dev Postgres is up, run migrations
pnpm db:clean        # Tear down Postgres containers + volumes
```

## E2E verification loop

`pnpm test:e2e` does NOT auto-start any services. Bring them up first (see "Day-to-day" above), then run the test. If a service isn't reachable the test fails fast with a clear error.

The full E2E checklist:

```bash
nvm use
pnpm install
pnpm exec playwright install chromium      # one-time

pnpm typecheck && pnpm lint && pnpm build && pnpm test

# Bring up the stack in separate terminals (or background each):
pnpm db:migrate-up
pnpm --filter @tactica/supertokens serve &
pnpm --filter @tactica/tactica-core serve &
pnpm --filter @tactica/tactica-app web &

pnpm test:e2e                              # signup → todo CRUD → logout/login round trip
```

## The no-compile workspace deps story

Internal workspace packages use a conditional `exports` map. The `"development"` condition points at TS source; `"default"` points at compiled JS:

```json
"exports": {
  ".": {
    "development": "./src/index.ts",
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  }
}
```

- **`tsc` / IDE** — `tsconfig.base.json` sets `moduleResolution: "bundler"` and `customConditions: ["development"]`, so the TS resolver follows the `development` branch directly to `src/`. **No `dist/` required even on a fresh clone.**
- **Fastify dev** — `tsx watch --conditions=development src/main.ts` (see `backends/tactica-core/package.json`).
- **Vitest** — `resolve.conditions = ['development', 'import', 'node']`.
- **Expo / Metro** — `metro.config.js` sets `unstable_enablePackageExports: true` and `unstable_conditionNames: ['development', ...]`. A small `resolveRequest` hook also translates `.js` imports to `.ts`/`.tsx` for files under `packages/` and `backends/` (TS source uses NodeNext-style `.js` extensions for prod ESM compatibility, but Metro doesn't natively rewrite them).
- **Production** — `node dist/main.js` (no conditions flag) → `default` wins → compiled JS from every workspace dep.

This means editing `packages/errors/src/something.ts` is picked up immediately by the running Fastify service, by Metro, and by Vitest. No `tsc --watch` running anywhere.

## Ports

| Service          | Port |
| ---------------- | ---- |
| Expo Web         | 8081 |
| tactica-core     | 3501 |
| SuperTokens core | 3567 |
| Postgres (dev)   | 5440 |
| Postgres (test)  | 5441 |
