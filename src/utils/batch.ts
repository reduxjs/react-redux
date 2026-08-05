// Default to a dummy "batch" implementation that just runs the callback
export function defaultNoopBatch(callback: () => void) {
  callback()
}

/**
 * @deprecated As of React 18, batching is enabled by default for ReactDOM and React Native.
 * This is now a no-op that immediately runs the callback.
 */
export const batch = defaultNoopBatch
