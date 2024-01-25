import { defineConfig } from 'vitest/config'

import path from 'node:path'
import { fileURLToPath } from 'node:url'

// No __dirname under Node ESM
const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

export default defineConfig({
  test: {
    typecheck: { tsconfig: './test/typetests/tsconfig.json' },
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
    alias: {
      reselect: path.join(__dirname, 'src/index.ts'), // @remap-prod-remove-line

      // this mapping is disabled as we want `dist` imports in the tests only to be used for "type-only" imports which don't play a role for jest
      '@internal': path.join(__dirname, 'src'),
    },
  },
})
