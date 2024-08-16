import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    globals: true,
    alias: {
      'react-redux': new URL(
        process.env.TEST_DIST ? 'node_modules/react-redux' : 'src/index.ts',
        import.meta.url,
      ).pathname,
      // this mapping is disabled as we want `dist` imports in the tests only to be used for "type-only" imports which don't play a role for jest
      '@internal': new URL('src', import.meta.url).pathname,
    },
  },
})
