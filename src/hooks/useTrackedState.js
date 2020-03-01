/* eslint-env es6 */

import {
  useReducer,
  useRef,
  useMemo,
  useContext,
  useEffect,
  useDebugValue
} from 'react'
import { useReduxContext as useDefaultReduxContext } from './useReduxContext'
import Subscription from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import { ReactReduxContext } from '../components/Context'
import { createDeepProxy, isDeepChanged } from '../utils/deepProxy'

// convert "affected" (WeakMap) to serializable value (array of array of string)
const affectedToPathList = (state, affected) => {
  const list = []
  const walk = (obj, path) => {
    const used = affected.get(obj)
    if (used) {
      used.forEach(key => {
        walk(obj[key], path ? [...path, key] : [key])
      })
    } else if (path) {
      list.push(path)
    }
  }
  walk(state)
  return list
}

const useAffectedDebugValue = (state, affected) => {
  const pathList = useRef(null)
  useEffect(() => {
    pathList.current = affectedToPathList(state, affected)
  })
  useDebugValue(pathList)
}

function useTrackedStateWithStoreAndSubscription(store, contextSub) {
  const [, forceRender] = useReducer(s => s + 1, 0)

  const subscription = useMemo(() => new Subscription(store, contextSub), [
    store,
    contextSub
  ])

  const state = store.getState()
  const affected = new WeakMap()
  const latestTracked = useRef(null)
  useIsomorphicLayoutEffect(() => {
    latestTracked.current = {
      state,
      affected,
      cache: new WeakMap()
    }
  })
  useIsomorphicLayoutEffect(() => {
    function checkForUpdates() {
      const nextState = store.getState()
      if (
        latestTracked.current.state !== nextState &&
        isDeepChanged(
          latestTracked.current.state,
          nextState,
          latestTracked.current.affected,
          latestTracked.current.cache
        )
      ) {
        forceRender()
      }
    }

    subscription.onStateChange = checkForUpdates
    subscription.trySubscribe()

    checkForUpdates()

    return () => subscription.tryUnsubscribe()
  }, [store, subscription])

  if (process.env.NODE_ENV !== 'production') {
    useAffectedDebugValue(state, affected)
  }

  const proxyCache = useRef(new WeakMap()) // per-hook proxyCache
  return createDeepProxy(state, affected, proxyCache.current)
}

/**
 * Hook factory, which creates a `useTrackedState` hook bound to a given context.
 *
 * @param {React.Context} [context=ReactReduxContext] Context passed to your `<Provider>`.
 * @returns {Function} A `useTrackedState` hook bound to the specified context.
 */
export function createTrackedStateHook(context = ReactReduxContext) {
  const useReduxContext =
    context === ReactReduxContext
      ? useDefaultReduxContext
      : () => useContext(context)
  return function useTrackedState() {
    const { store, subscription: contextSub } = useReduxContext()

    return useTrackedStateWithStoreAndSubscription(store, contextSub)
  }
}

/**
 * A hook to return the redux store's state.
 *
 * This hook tracks the state usage and only triggers
 * re-rerenders if the used part of the state is changed.
 *
 * @returns {any} the whole state
 *
 * @example
 *
 * import React from 'react'
 * import { useTrackedState } from 'react-redux'
 *
 * export const CounterComponent = () => {
 *   const state = useTrackedState()
 *   return <div>{state.counter}</div>
 * }
 */
export const useTrackedState = /*#__PURE__*/ createTrackedStateHook()
