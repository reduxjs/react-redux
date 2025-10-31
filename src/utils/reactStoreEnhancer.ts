// src/utils/reactStoreEnhancer.ts
import { experimental } from 'react-concurrent-store'
import type { StoreEnhancer } from 'redux'

const { createStoreFromSource } = experimental

export type ReactStore = ReturnType<typeof createStoreFromSource<any, any>>

export const addReactStore: StoreEnhancer<{
  reactStore: ReactStore
}> = (createStore) => {
  return (reducer, preloadedState) => {
    const store = createStore(reducer, preloadedState)

    // Create concurrent-safe store wrapper
    const reactStore = createStoreFromSource({
      getState: store.getState,
      reducer: reducer,
    })

    // Intercept dispatch to notify reactStore
    const originalDispatch = store.dispatch
    store.dispatch = (action: any) => {
      const result = originalDispatch(action)
      reactStore.handleUpdate(action)
      return result
    }

    // Attach reactStore to Redux store
    return Object.assign(store, { reactStore })
  }
}
