import { useContext } from 'react'
import { Action, AnyAction, Store } from 'redux'
import { ReactReduxContext } from '../components/Context'
import type { FixTypeLater } from '../types'
import { useReduxContext as useDefaultReduxContext } from './useReduxContext'

/**
 * Hook factory, which creates a `useStore` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useStore` hook bound to the specified context.
 */
 
export function createStoreHook<S = FixTypeLater, A extends Action = AnyAction>(context = ReactReduxContext) {
  const useReduxContext =
    context === ReactReduxContext
      ? useDefaultReduxContext
      : () => useContext(context)
  return function useStore() {
    const { store } = useReduxContext()!
    return store
  }
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
