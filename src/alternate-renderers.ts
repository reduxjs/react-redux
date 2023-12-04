// The "alternate renderers" entry point is primarily here to fall back on a no-op
// version of `unstable_batchedUpdates`, for use with renderers other than ReactDOM/RN.
// Examples include React-Three-Fiber, Ink, etc.
// We'll assume they're built with React 18 and thus have `useSyncExternalStore` available.

import * as React from 'react'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector.js'

import { initializeUseSelector } from './hooks/useSelector'
import { initializeConnect } from './components/connect'

initializeUseSelector(useSyncExternalStoreWithSelector)
initializeConnect(React.useSyncExternalStore)

import { getBatch } from './utils/batch'

// For other renderers besides ReactDOM and React Native,
// use the default noop batch function
const batch = getBatch()

export { batch }

export * from './exports'
