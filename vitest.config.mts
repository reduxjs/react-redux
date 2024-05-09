import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    globals: true,
    alias: {
      'react-redux': new URL('src/index.ts', import.meta.url).pathname, // @remap-prod-remove-line
      // this mapping is disabled as we want `dist` imports in the tests only to be used for "type-only" imports which don't play a role for jest
      '@internal': new URL('src', import.meta.url).pathname,
    },
  },
})
