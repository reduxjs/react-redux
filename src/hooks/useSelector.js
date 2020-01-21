import { useReducer, useMemo, useContext } from 'react'
import { useReduxContext as useDefaultReduxContext } from './useReduxContext'
import Subscription from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import { ReactReduxContext } from '../components/Context'

const refEquality = (a, b) => a === b

function useSelectorWithStoreAndSubscription(
  selector,
  equalityFn,
  store,
  contextSub
) {
  const [selectedState, checkForUpdates] = useReducer(
    prevSelectedState => {
      const nextState = store.getState()
      const nextSelectedState = selector(nextState)
      if (equalityFn(prevSelectedState, nextSelectedState)) {
        return prevSelectedState
      }
      return nextSelectedState
    },
    store.getState(),
    selector
  )

  const subscription = useMemo(() => new Subscription(store, contextSub), [
    store,
    contextSub
  ])

  useIsomorphicLayoutEffect(() => {
    subscription.onStateChange = checkForUpdates
    subscription.trySubscribe()

    checkForUpdates()

    return () => subscription.tryUnsubscribe()
  }, [subscription])

  return selectedState
}

/**
 * Hook factory, which creates a `useSelector` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useSelector` hook bound to the specified context.
 */
export function createSelectorHook(context = ReactReduxContext) {
  const useReduxContext =
    context === ReactReduxContext
      ? useDefaultReduxContext
      : () => useContext(context)
  return function useSelector(selector, equalityFn = refEquality) {
    if (process.env.NODE_ENV !== 'production' && !selector) {
      throw new Error(`You must pass a selector to useSelectors`)
    }
    const { store, subscription: contextSub } = useReduxContext()

    return useSelectorWithStoreAndSubscription(
      selector,
      equalityFn,
      store,
      contextSub
    )
  }
}

/**
 * A hook to access the redux store's state. This hook takes a selector function
 * as an argument. The selector is called with the store state.
 *
 * This hook takes an optional equality comparison function as the second parameter
 * that allows you to customize the way the selected state is compared to determine
 * whether the component needs to be re-rendered.
 *
 * @param {Function} selector the selector function
 * @param {Function=} equalityFn the function that will be used to determine equality
 *
 * @returns {any} the selected state
 *
 * @example
 *
 * import React from 'react'
 * import { useSelector } from 'react-redux'
 *
 * export const CounterComponent = () => {
 *   const counter = useSelector(state => state.counter)
 *   return <div>{counter}</div>
 * }
 */
export const useSelector = /*#__PURE__*/ createSelectorHook()
