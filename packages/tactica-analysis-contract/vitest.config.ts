import { defineConfig } from 'vitest/config'

export default defineConfig({
  resolve: {
    conditions: ['development', 'import', 'node'],
  },
  test: {
    passWithNoTests: true,
  },
})
