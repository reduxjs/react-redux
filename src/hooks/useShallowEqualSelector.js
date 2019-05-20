import shallowEqual from '../utils/shallowEqual'
import { useSelector } from './useSelector'

/**
 * A hook to access the redux store's state. This hook takes a selector function
 * as an argument. The selector is called with the store state.
 * It uses shallowEqual to determine whether to rerender
 *
 * @param {Function} selector the selector function
 *
 * @returns {any} the selected state
 *
 * @example
 *
 * import React from 'react'
 * import { useSelector } from 'react-redux'
 * import { RootState } from './store'
 *
 * export const CounterComponent = () => {
 *   const counter = useSelector(state => ({ counter: selector.counter }))
 *   return <div>{counter}</div>
 * }
 */
export function useShallowEqualSelector(selector) {
  return useSelector(selector, shallowEqual)
}
