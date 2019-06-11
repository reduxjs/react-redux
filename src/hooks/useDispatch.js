import { useStore as useDefaultStore, createStoreHook } from './useStore'

/**
 * Hook factory, which creates a `useDispatch` hook bound to a given context.
 *
 * @param {Function} [useReduxContext] Hook which returns the Redux context.
 * @returns {Function} A `useDispatch` hook bound to the specified context.
 */
export function createDispatchHook(useReduxContext = null) {
  const useStore = useReduxContext
    ? createStoreHook(useReduxContext)
    : useDefaultStore
  return function useDispatch() {
    const store = useStore()
    return store.dispatch
  }
}

/**
 * A hook to access the redux `dispatch` function. Note that in most cases where you
 * might want to use this hook it is recommended to use `useActions` instead to bind
 * action creators to the `dispatch` function.
 *
 * @returns {any|function} redux store's `dispatch` function
 *
 * @example
 *
 * import React, { useCallback } from 'react'
 * import { useReduxDispatch } from 'react-redux'
 *
 * export const CounterComponent = ({ value }) => {
 *   const dispatch = useDispatch()
 *   const increaseCounter = useCallback(() => dispatch({ type: 'increase-counter' }), [])
 *   return (
 *     <div>
 *       <span>{value}</span>
 *       <button onClick={increaseCounter}>Increase counter</button>
 *     </div>
 *   )
 * }
 */
export const useDispatch = createDispatchHook()
