import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    conditions: ['development', 'import', 'node'],
  },
  test: {
    setupFiles: ['./src/test/setup.ts'],
    sequence: { concurrent: false },
    fileParallelism: false,
    passWithNoTests: true,
    server: {
      deps: {
        // pg-pool ships an ESM wrapper that exports its class as `default`. Vite picks that ESM
        // entrypoint, and then pg's internal `require('pg-pool')` resolves to a Module object
        // rather than the Pool class — `class extends [object Module]` blows up. Inlining these
        // forces them through Vite's CJS-to-ESM transform, which unwraps the default export.
        inline: ['pg', 'pg-pool', 'pg-types', 'pg-protocol', 'pg-int8', /^drizzle-orm/],
      },
    },
  },
})
