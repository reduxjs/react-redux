import type { Context } from 'react'
import type { Action as BasicAction, Store, UnknownAction } from 'redux'
import type { ReactReduxContextValue } from '../components/Context'
import { ReactReduxContext } from '../components/Context'
import {
  createReduxContextHook,
  useReduxContext as useDefaultReduxContext,
} from './useReduxContext'

export type StoreAction<StoreType extends Store> = StoreType extends Store<
  any,
  infer Action
>
  ? Action
  : never

export interface UseStore {
  <State = any, Action extends BasicAction = UnknownAction>(): Store<
    State,
    Action
  >

  withTypes: <AppStore extends Store>() => () => AppStore
}
// export interface UseStore<StoreType extends Store = Store> {
//   <
//     State extends ReturnType<StoreType['getState']> = ReturnType<
//       StoreType['getState']
//     >,
//     Action extends BasicAction = StoreAction<Store>
//   >(): Store<State, Action>

//   withTypes: <
//     OverrideStoreType extends StoreType
//   >() => UseStore<OverrideStoreType>
// }

/**
 * Hook factory, which creates a `useStore` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useStore` hook bound to the specified context.
 */
export function createStoreHook<
  S = unknown,
  A extends BasicAction = BasicAction
  // @ts-ignore
>(context?: Context<ReactReduxContextValue<S, A> | null> = ReactReduxContext) {
  const useReduxContext =
    // @ts-ignore
    context === ReactReduxContext
      ? useDefaultReduxContext
      : // @ts-ignore
        createReduxContextHook(context)
  const useStore = <
    State = S,
    Action2 extends BasicAction = A
    // @ts-ignore
  >() => {
    const { store } = useReduxContext()
    // @ts-ignore
    return store as Store<State, Action2>
  }

  Object.assign(useStore, {
    withTypes: () => useStore,
  })

  return useStore as UseStore
}

/**
 * A hook to access the redux store.
 *
 * @returns {any} the redux store
 *
 * @example
 *
 * import React from 'react'
 * import { useStore } from 'react-redux'
 *
 * export const ExampleComponent = () => {
 *   const store = useStore()
 *   return <div>{store.getState()}</div>
 * }
 */
export const useStore = /*#__PURE__*/ createStoreHook()
