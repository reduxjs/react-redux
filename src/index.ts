// The default entry point assumes we are working with React 18, and thus have
// useSyncExternalStore available. We can import that directly from React itself.
// The useSyncExternalStoreWithSelector has to be imported, but we can use the
// non-shim version. This shaves off the byte size of the shim.

// @ts-ignore React types not updated yet
import { useSyncExternalStore } from 'react'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector'

import { setSyncFunctions } from './utils/useSyncExternalStore'
import { unstable_batchedUpdates as batch } from './utils/reactBatchedUpdates'
import { setBatch } from './utils/batch'

setSyncFunctions(useSyncExternalStore, useSyncExternalStoreWithSelector)

// Enable batched updates in our subscriptions for use
// with standard React renderers (ReactDOM, React Native)
setBatch(batch)

export { batch }

export * from './exports'
