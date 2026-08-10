import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['test/setup.ts'],
    globals: true,
    alias: {
      // Which implementation the shared spec files run against.
      // TEST_DIST=1     -> the built package
      // TEST_IMPL=signals -> useSignalSelector / SignalProvider
      // default         -> stock hooks
      // The signal and stock entries live in test/entries and present
      // their implementation under the stock public names, so one spec
      // file validates both without being copied.
      'react-redux': new URL(
        process.env.TEST_DIST
          ? 'node_modules/react-redux'
          : process.env.TEST_IMPL === 'signals'
            ? 'test/entries/signals.ts'
            : 'test/entries/stock.ts',
        import.meta.url,
      ).pathname,
      // this mapping is disabled as we want `dist` imports in the tests only to be used for "type-only" imports which don't play a role for jest
      '@internal': new URL('src', import.meta.url).pathname,
    },
  },
})
