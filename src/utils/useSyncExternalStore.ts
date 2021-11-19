import type { useSyncExternalStore } from 'use-sync-external-store'
import type { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector'

const notInitialized = () => {
  throw new Error('Not initialize!')
}

let uSES: typeof useSyncExternalStore = notInitialized
let uSESWS: typeof useSyncExternalStoreWithSelector = notInitialized

// Allow injecting the actual functions from the entry points
export const setSyncFunctions = (
  sync: typeof useSyncExternalStore,
  withSelector: typeof useSyncExternalStoreWithSelector
) => {
  uSES = sync
  uSESWS = withSelector
}

// Supply a getter just to skip dealing with ESM bindings
export const getSyncFunctions = () => [uSES, uSESWS] as const
