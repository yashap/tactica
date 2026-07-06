# Tactica

Monorepo for the **Tactica** AI chess coach app.

## Stack

| Layer            | Tech                                                      |
| ---------------- | --------------------------------------------------------- |
| Monorepo         | pnpm workspaces + Turborepo                               |
| Language         | TypeScript                                                |
| Database         | Postgres                                                  |
| Backend Services | Fastify + ts-rest + Drizzle                               |
| Auth             | SuperTokens                                               |
| Frontend         | ReactNative + Expo + Expo Router                          |
| Tests            | Vitest (unit), Playwright (web E2E), Maestro (mobile E2E) |

## Local dev

### Initial setup

- [nvm](https://github.com/nvm-sh/nvm)
  - For managing multiple node versions
  - Suggest setting up `nvm` to [auto-switch to the right node version on cd](https://github.com/nvm-sh/nvm#deeper-shell-integration)

- [pnpm](https://pnpm.io/installation)

  ```bash
  npm install --global corepack@latest
  corepack enable pnpm
  ```

  - If you run `which pnpm`, it should show something like `~/.nvm/versions/node/<node_version>/bin/pnpm`

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - For your local platform, e.g. [Docker for Mac](https://docs.docker.com/desktop/install/mac-install/) for a Mac

- [XCode](https://en.wikipedia.org/wiki/Xcode)
  - Ensure XCode is installed, with command line tools (necessary for running iOS Simulator)
  - Ensure you can open a simulated iPhone with Simulator, and it starts up properly

- [cmake](https://cmake.org/)
  - On a Mac, `brew install cmake`

- [Maestro CLI](https://maestro.mobile.dev/getting-started/installing-maestro) for e2e mobile tests. Install via Homebrew (recommended on macOS):

  ```bash
  brew install maestro
  ```

- Sync the workspace — installs pnpm deps, brings up the dev/test Postgres containers, and runs migrations against both:

  ```bash
  nvm use
  pnpm sync
  ```

- Install the Playwright browsers for e2e web tests:

  ```bash
  pnpm --filter @tactica/e2e-tests-web exec playwright install
  ```

### Common local dev workflows

Very common:

```bash
# Install pnpm deps + ensure DB up + run migrations (dev & test)
pnpm sync

# In own terminal: serve all backends (tactica-core + SuperTokens core, in parallel via turbo)
pnpm serve:backend

# In own terminal: the Expo app (web, iOS, Android)
pnpm serve:tactica:web
pnpm serve:tactica:ios
pnpm serve:tactica:android

# Lint (including typechecking) and format
pnpm lint
pnpm format

# Vitest unit + backend integration tests (no E2E)
pnpm test

# E2E tests - backend and frontend must be separately running
pnpm test:e2e:web
pnpm test:e2e:mobile
```

Less common:

```bash
# Per-backend: dump current DB to fixtures.sql
pnpm db:dump-fixtures

# Per-backend: drop + re-create DB, replay fixtures.sql, migrate
pnpm db:restore-fixtures

# Tear down Postgres containers + volumes
pnpm db:clean
```

Note also, more details about E2E tests in their READMEs:
- For web E2E tests, see [the web E2E README](./e2e-tests-web/README.md)
- For mobile E2E tests, see [the mobile E2E README](./e2e-tests-mobile/README.md)

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

| Service                       | Port |
| ----------------------------- | ---- |
| Expo (web, Metro bundler)     | 8081 |
| Expo (iOS, Metro bundler)     | 8082 |
| Expo (Android, Metro bundler) | 8083 |
| tactica-core                  | 3501 |
| SuperTokens core              | 3567 |
| Postgres (dev)                | 5440 |
| Postgres (test)               | 5441 |
