// The primary entry point assumes we are working with React 18, and thus have
// useSyncExternalStore available. We can import that directly from React itself.
// The useSyncExternalStoreWithSelector has to be imported, but we can use the
// non-shim version. This shaves off the byte size of the shim.

import * as React from 'react'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector'

import { unstable_batchedUpdates as batchInternal } from './utils/reactBatchedUpdates'
import { setBatch } from './utils/batch'

import { initializeUseSelector } from './hooks/useSelector'
import { initializeConnect } from './components/connect'

initializeUseSelector(useSyncExternalStoreWithSelector)
initializeConnect(React.useSyncExternalStore)

// Enable batched updates in our subscriptions for use
// with standard React renderers (ReactDOM, React Native)
setBatch(batchInternal)

// Avoid needing `react-dom` in the final TS types
// by providing a simpler type for `batch`
const batch: (cb: () => void) => void = batchInternal

export { batch }

export * from './exports'
