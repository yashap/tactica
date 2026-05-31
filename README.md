# Tactica

Monorepo for the **Tactica** AI chess coach app.

## Stack

| Layer    | Tech                                |
| -------- | ----------------------------------- |
| Monorepo | pnpm workspaces + Turborepo         |
| Language | TypeScript                          |
| Database | Postgres                            |
| Backend  | Fastify + ts-rest + Drizzle         |
| Auth     | SuperTokens                         |
| Frontend | ReactNative + Expo + Expo Router    |
| Tests    | Vitest (unit), Playwright (web E2E) |

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

- Install pnpm deps
  ```bash
  nvm use
  pnpm install
  ```
- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  - For your local platform, e.g. [Docker for Mac](https://docs.docker.com/desktop/install/mac-install/) for a Mac
- [XCode](https://en.wikipedia.org/wiki/Xcode)
  - Ensure XCode is installed, with command line tools (necessary for running iOS Simulator)
  - Ensure you can open a simulated iPhone with Simulator, and it starts up properly
- [cmake](https://cmake.org/)
  - On a Mac, `brew install cmake`
- Install default browsers for E2E tests
  ```bash
  pnpm --filter @tactica/e2e-tests exec playwright install
  ```

### Local dev environment

In separate terminals:

```bash
# Terminal 1: bring up Postgres + apply migrations
pnpm db:migrate-up

# Terminal 2: SuperTokens core (runs in Docker)
pnpm --filter @tactica/supertokens serve

# Terminal 3: the Fastify service
pnpm --filter @tactica/tactica-core serve

# Terminal 4: the Expo app (web, iOS, Android — pick one)
pnpm --filter @tactica/tactica-app web
pnpm --filter @tactica/tactica-app ios
pnpm --filter @tactica/tactica-app android
```

### Common workflows

```bash
pnpm install         # Install all dependencies managed via pnpm
pnpm lint            # Prettier check + typechecking + ESLint
pnpm format          # Prettier write + ESLint --fix
pnpm build           # Compile every package to dist/
pnpm test            # Vitest unit + backend integration tests (no E2E)
pnpm test:e2e        # Playwright E2E (assumes services are running — see below)
pnpm db:migrate-up   # Ensure dev Postgres is up, run migrations
pnpm db:clean        # Tear down Postgres containers + volumes
```

## Running E2E tests

For web E2E tests, see [the E2E README](./e2e-tests/README.md).

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
