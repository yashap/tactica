# Builds and Dependencies

Information about approaches we take with builds and dependency management.

## Dependency supply-chain policy

Two pnpm settings in `pnpm-workspace.yaml` guard against compromised npm releases. Both can surprise you, so it's
worth knowing how they behave:

**`minimumReleaseAge`** — a version published less than this many minutes ago won't be installed, giving the ecosystem
time to spot and yank a malicious release. Note that `pnpm add foo` **silently resolves to the previous version** rather
than erroring, so if you get an unexpectedly old version, that's why. Use `minimumReleaseAgeExclude` if you genuinely
need something immediately.

The policy is also checked against the committed lockfile on every install, including `--frozen-lockfile` in CI. A
failure looks like:

```
ERR_PNPM_MINIMUM_RELEASE_AGE_VIOLATION
  foo@1.2.3 was published at ..., within the minimumReleaseAge cutoff
```

That means either the lockfile is stale, or a too-fresh version was committed from a machine that bypassed the policy —
worth actually reading the `pnpm-lock.yaml` diff before waving it through.

**`allowBuilds`** — dependency install/postinstall scripts are blocked unless listed. An install script is the most
direct route from a compromised package to code execution on your machine or in CI, so keep this list as short as it
currently is (one entry: `esbuild`). If you add a dependency that needs one, pnpm skips it silently; run
`pnpm approve-builds` to review and allow it explicitly.

## The no-compile workspace deps story

Internal workspace packages use a conditional `exports` map. The `"development"` condition points at TS source;
`"default"` points at compiled JS:

```json
"exports": {
  ".": {
    "development": "./src/index.ts",
    "types": "./dist/index.d.ts",
    "default": "./dist/index.js"
  }
}
```

- **`tsc` / IDE** — `tsconfig.base.json` sets `moduleResolution: "bundler"` and `customConditions: ["development"]`, so
  the TS resolver follows the `development` branch directly to `src/`. **No `dist/` required even on a fresh clone.**
- **Fastify dev** — `tsx watch --conditions=development src/main.ts` (see `backends/tactica-core/package.json`).
- **Vitest** — `resolve.conditions = ['development', 'import', 'node']`.
- **Expo / Metro** — `metro.config.js` sets `unstable_enablePackageExports: true` and
  `unstable_conditionNames: ['development', ...]`. A small `resolveRequest` hook also translates `.js` imports to
  `.ts`/`.tsx` for files under `packages/` and `backends/` (TS source uses NodeNext-style `.js` extensions for prod ESM
  compatibility, but Metro doesn't natively rewrite them).
- **Production** — `node dist/main.js` (no conditions flag) → `default` wins → compiled JS from every workspace dep.

This means editing `packages/errors/src/something.ts` is picked up immediately by the running Fastify service, by Metro,
and by Vitest. No `tsc --watch` running anywhere.
