import { useContext } from 'react'
import invariant from 'invariant'
import { ReactReduxContext } from '../components/Context'

/**
 * A hook to access the value of the `ReactReduxContext`. This is a low-level
 * hook that you should usually not need to call directly.
 *
 * @param {Function} [context=ReactReduxContext] Context passed to your `<Provider>`, if you're not using the default.
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
export function useReduxContext(context = ReactReduxContext) {
  const contextValue = useContext(context)

  invariant(
    contextValue,
    'could not find react-redux context value; please ensure the component is wrapped in a <Provider>'
  )

  return contextValue
}
