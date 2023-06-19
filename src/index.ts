// The primary entry point assumes we're working with standard ReactDOM/RN, but
// older versions that do not include `useSyncExternalStore` (React 16.9 - 17.x).
// Because of that, the useSyncExternalStore compat shim is needed.

import { useSyncExternalStore } from 'use-sync-external-store/shim'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/shim/with-selector'

import { unstable_batchedUpdates as batchInternal } from './utils/reactBatchedUpdates'
import { setBatch } from './utils/batch'

import { initializeUseSelector } from './hooks/useSelector'
import { initializeConnect } from './components/connect'

initializeUseSelector(useSyncExternalStoreWithSelector)
initializeConnect(useSyncExternalStore)

// Enable batched updates in our subscriptions for use
// with standard React renderers (ReactDOM, React Native)
setBatch(batchInternal)

// Avoid needing `react-dom` in the final TS types
// by providing a simpler type for `batch`
const batch: (cb: () => void) => void = batchInternal

export { batch }

export * from './exports'
