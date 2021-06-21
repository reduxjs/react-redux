import { ReactReduxContext } from '../components/Context'
import { useStore as useDefaultStore, createStoreHook } from './useStore'
import bindActionCreators from '../utils/bindActionCreators'

/**
 * Hook factory, which creates a `useBoundDispatch` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useBoundDispatch` hook bound to the specified context.
 */

/**
 * 
 * @param {*} context 
 * @returns 
 */
export function createBoundDispatchHook(context = ReactReduxContext) {
  const useStore =
    context === ReactReduxContext ? useDefaultStore : createStoreHook(context)

  return function useBoundDispatch(actions) {

    const store = useStore()
    let boundActions = bindActionCreators(actions,store.dispatch)
    return boundActions
  }
}

/**
 * A hook to access the redux `dispatch` function.
 *
 * @returns {any|function} redux store's `dispatch` function
 *
 * @example
 *
 * import React, { useCallback } from 'react'
 * import { useBoundDispatch } from 'react-redux'
 * const actions = {
 *    increaseCounter() {
 *        return { type: types.increaseCounter };
 *    }
 *  }
 *
 * export const CounterComponent = ({ value }) => {
 *   const boundActions = useBoundDispatch(actions)
 *   const increaseCounter = useCallback(() => boundActions.increaseCounter(), [])
 *   return (
 *     <div>
 *       <span>{value}</span>
 *       <button onClick={increaseCounter}>Increase counter</button>
 *     </div>
 *   )
 * }
 */
export const useBoundDispatch = /*#__PURE__*/ createBoundDispatchHook()
