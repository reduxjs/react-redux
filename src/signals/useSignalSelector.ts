import { React } from '../utils/react'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import { useSignalContext } from './context'
import { createTrackingProxy, getProxyPath } from './trackingProxy'

const { useRef, useMemo, useEffect, useSyncExternalStore } = React

/**
 * A React hook that selects state from a Redux store using signal-based
 * dependency tracking. Only re-renders when the selected value actually
 * changes, with O(k) selectivity where k = number of affected selectors.
 *
 * Must be used within a <SignalProvider>.
 */
export function useSignalSelector<S extends object, R>(
  selector: (state: S) => R,
  equalityFn: (a: R, b: R) => boolean = Object.is,
): R {
  const { store, registry, engine } = useSignalContext<S>()

  // Track latest selector/equalityFn via refs, synced in layout effect (not during render)
  const selectorRef = useRef(selector)
  const equalityFnRef = useRef(equalityFn)
  useIsomorphicLayoutEffect(() => {
    selectorRef.current = selector
    equalityFnRef.current = equalityFn
  })

  // Create the signal bridge once (stable across renders)
  const bridge = useMemo(() => {
    let currentResult: R
    let version = 0
    let notifyReact: (() => void) | null = null
    let effectDispose: (() => void) | null | void = null

    // Create a computed that runs the selector through a tracking proxy.
    // This establishes signal dependencies on the paths the selector reads.
    //
    // Intermediate object traversals don't create signal dependencies (to avoid
    // "false sharing" where siblings cause re-runs). Only leaf primitive reads
    // create deps automatically. If the selector returns a proxy (object result),
    // we explicitly read that object's signal to establish the terminal dependency.
    const selectorComputed = engine.computed(() => {
      const state = store.getState() as S & object
      const proxy = createTrackingProxy(state, '', registry, registry.proxyCache)
      const result = selectorRef.current(proxy as S)

      // If the selector returned a tracking proxy (object), explicitly
      // read its signal to establish a reactive dependency on that path.
      const proxyPath = getProxyPath(result)
      if (proxyPath !== undefined) {
        registry.getOrCreate(proxyPath, result).get()
      }

      return result
    })

    // Initialize with current value
    currentResult = selectorComputed.get()

    return {
      subscribe(onStoreChange: () => void): () => void {
        notifyReact = onStoreChange

        // Create an effect that fires when the computed value changes.
        // We apply the user's equalityFn here since alien-signals
        // doesn't support custom equality per-computed.
        const scope = engine.createScope()
        effectDispose = scope.run(() => {
          let isFirst = true
          return engine.effect(() => {
            const newValue = selectorComputed.get()

            if (isFirst) {
              // First effect run — just establish tracking, don't notify
              isFirst = false
              return
            }

            // Apply user's equality function
            if (!equalityFnRef.current(currentResult, newValue)) {
              currentResult = newValue
              version++
              notifyReact?.()
            }
          })
        })

        return () => {
          notifyReact = null
          effectDispose?.()
          effectDispose = null
        }
      },

      getSnapshot(): R {
        return currentResult
      },
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [store, registry, engine])

  // Cleanup scope on unmount
  useEffect(() => {
    return () => {
      // bridge.subscribe's cleanup handles effect disposal
    }
  }, [bridge])

  return useSyncExternalStore(bridge.subscribe, bridge.getSnapshot)
}
