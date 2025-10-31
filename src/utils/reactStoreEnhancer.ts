// src/utils/reactStoreEnhancer.ts
import { experimental } from 'react-concurrent-store'
import type { StoreEnhancer } from 'redux'

const { createStoreFromSource } = experimental

export type Reducer<S, A> = (state: S, action: A) => S

export interface ISource<S, A> {
  /**
   * Returns an immutable snapshot of the current state
   */
  getState(): S
  /**
   * A pure function which takes and arbitrary state and an updater/action and
   * returns a new state.
   *
   * React needs this in order to generate temporary states.
   *
   * See: https://jordaneldredge.com/notes/react-rebasing/
   */
  reducer: Reducer<S, A>
}

export const addReactStore: StoreEnhancer<{
  reactStore: ReturnType<typeof createStoreFromSource<any, any>>
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
