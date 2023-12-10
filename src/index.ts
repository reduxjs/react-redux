// The primary entry point assumes we are working with React 18, and thus have
// useSyncExternalStore available. We can import that directly from React itself.
// The useSyncExternalStoreWithSelector has to be imported, but we can use the
// non-shim version. This shaves off the byte size of the shim.

import * as React from 'react'
import { useSyncExternalStoreWithSelector } from 'use-sync-external-store/with-selector.js'

import { initializeUseSelector } from './hooks/useSelector'
import { initializeConnect } from './components/connect'

initializeUseSelector(useSyncExternalStoreWithSelector)
initializeConnect(React.useSyncExternalStore)

export * from './exports'
