import type { Context } from 'react'
import type { Action, Store } from 'redux'
import type { ReactReduxContextValue } from '../components/Context'
import { ReactReduxContext } from '../components/Context'
import {
  createReduxContextHook,
  useReduxContext as useDefaultReduxContext,
} from './useReduxContext'

export type StoreAction<StoreType extends Store> = StoreType extends Store<
  any,
  infer ActionType
>
  ? ActionType
  : never

export interface UseStore<StoreType extends Store> {
  (): StoreType

  <
    StateType extends ReturnType<StoreType['getState']> = ReturnType<
      StoreType['getState']
    >,
    ActionType extends Action = StoreAction<Store>
  >(): Store<StateType, ActionType>

  withTypes: <
    OverrideStoreType extends StoreType
  >() => UseStore<OverrideStoreType>
}

/**
 * Hook factory, which creates a `useStore` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useStore` hook bound to the specified context.
 */
export function createStoreHook<
  StateType = unknown,
  ActionType extends Action = Action
>(
  // @ts-ignore
  context?: Context<ReactReduxContextValue<
    StateType,
    ActionType
  > | null> = ReactReduxContext
) {
  const useReduxContext =
    context === ReactReduxContext
      ? useDefaultReduxContext
      : // @ts-ignore
        createReduxContextHook(context)
  const useStore = () => {
    const { store } = useReduxContext()
    return store
  }

  Object.assign(useStore, {
    withTypes: () => useStore,
  })

  return useStore as UseStore<Store<StateType, ActionType>>
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
