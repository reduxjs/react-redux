import { useContext } from 'react'
import invariant from 'invariant'
import { ReactReduxContext } from '../components/Context'

/**
 * Hook factory, which creates a `useReduxContext` hook bound to a given context.
 *
 * @param {Function} [context=ReactReduxContext] React context passed to the `context` prop of your `<Provider>`.
 * @returns {Function} A `useReactContext` hook bound to the specified context.
 */
export function createReduxContextHook(context = ReactReduxContext) {
  return function useReduxContext() {
    const contextValue = useContext(context)

    invariant(
      contextValue,
      'could not find react-redux context value; please ensure the component is wrapped in a <Provider>'
    )

    return contextValue
  }
}

/**
 * A hook to access the value of the `ReactReduxContext`. This is a low-level
 * hook that you should usually not need to call directly.
 *
 * @returns {any} the value of the `ReactReduxContext`
 *
 * @example
 *
 * import React from 'react'
 * import { useReduxContext } from 'react-redux'
 *
 * export const CounterComponent = ({ value }) => {
 *   const { store } = useReduxContext()
 *   return <div>{store.getState()}</div>
 * }
 */
export const useReduxContext = createReduxContextHook()
