# Tactica Mobile E2E Tests

[Maestro](https://maestro.mobile.dev/) flows that drive the **iOS Simulator** (and optionally an Android Emulator) running the Expo dev build of `tactica-app`. Mirrors `e2e-tests-web/` but exercises the native render pipeline instead of Expo Web.

## Running the tests

`pnpm test:e2e:mobile` does **not** start any services or simulators for you. Bring them up first - see the standard local dev flow in the [main README](../README.md).

Or more briefly:

```bash
# From the repo root:

# 1. After pulling: install deps + migrate DBs
pnpm sync

# 2. Start the backends (tactica-core + SuperTokens core, in parallel via turbo)
pnpm serve:backend

# 3. Start the Expo dev server with the iOS Simulator. This opens the Simulator, installs the
#    Expo Go runtime if needed, and loads our app.
pnpm serve:tactica:ios

# 4. Once the app is visible in the Simulator on the log-in screen, run the tests:
pnpm test:e2e:mobile
```

## Troubleshooting

- **`maestro: command not found`** — install Maestro (see the [main README](../README.md)).
- **`No devices found`** — make sure the iOS Simulator is open AND showing our app. `pnpm serve:tactica:ios` handles both.
- **`Element not visible`** — the testIDs are defined in `frontends/tactica-app/src/app/**` and `src/app/(auth)/*.tsx`. If a test fails on an element lookup, check that the testID still exists in the React code.
- **Stale Expo bundle** — restart `pnpm serve:tactica:ios` to force a re-bundle if you've changed FE code recently.
