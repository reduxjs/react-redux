/* eslint-env es6 */

import { useReducer, useRef, useMemo } from 'react'
import { useReduxContext } from './useReduxContext'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import Subscription from '../utils/Subscription'
import { createDeepProxy, isDeepChanged } from '../utils/deepProxy'

// TODO createTrackedStateHook for custom context

export const useTrackedState = () => {
  const [, forceUpdate] = useReducer(c => c + 1, 0)
  const { store, subscription: contextSub } = useReduxContext()
  const state = store.getState()
  const subscription = useMemo(() => new Subscription(store, contextSub), [
    store,
    contextSub
  ])
  const affected = new WeakMap()
  const lastTracked = useRef(null)
  useIsomorphicLayoutEffect(() => {
    lastTracked.current = {
      state,
      affected,
      cache: new WeakMap()
    }
  })
  useIsomorphicLayoutEffect(() => {
    const checkForUpdates = () => {
      const nextState = store.getState()
      if (
        lastTracked.current.state === nextState ||
        !isDeepChanged(
          lastTracked.current.state,
          nextState,
          lastTracked.current.affected,
          lastTracked.current.cache
        )
      ) {
        // not changed
        return
      }
      forceUpdate()
    }
    subscription.onStateChange = checkForUpdates
    subscription.trySubscribe()

    checkForUpdates()

    return () => subscription.tryUnsubscribe()
  }, [store, subscription])
  const proxyCache = useRef(new WeakMap()) // per-hook proxyCache
  return createDeepProxy(state, affected, proxyCache.current)
}
