import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Everything under test here is a pure function — no DB, no engine process, no fixtures
    passWithNoTests: true,
  },
})
