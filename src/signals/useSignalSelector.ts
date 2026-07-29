import { React } from '../utils/react'
import { useSignalContext } from './context'
import {
  createTrackingProxy,
  getProxyPath,
  type LeafObjectTracker,
} from './trackingProxy'
import { beginUntrackEvaluation, untrackResult } from './untrack'

const { useRef, useMemo, useEffect, useSyncExternalStore } = React


/**
 * A React hook that selects state from a Redux store using signal-based
 * dependency tracking. Only re-renders when the selected value actually
 * changes, with O(k) selectivity where k = number of affected selectors.
 *
 * Must be used within a <SignalProvider>.
 * @param selector - Function that extracts a value from the store state
 * @param equalityFn - Custom equality function for change detection
 * @returns The selected value
 */
export function useSignalSelector<S extends object, R>(
  selector: (state: S) => R,
  equalityFn: (a: R, b: R) => boolean = Object.is,
): R {
  const { store, registry, engine } = useSignalContext<S>()

  // Track latest selector/equalityFn via refs. Updated during render
  // (idempotent ref writes, same approach as React's
  // useSyncExternalStoreWithSelector) so a selector closing over changed
  // props is applied in THIS render, not a layout effect later.
  const selectorRef = useRef(selector)
  const equalityFnRef = useRef(equalityFn)
  equalityFnRef.current = equalityFn

  // Create the signal bridge once (stable across renders)
  const bridge = useMemo(() => {
    let currentResult: R
    let version = 0
    let notifyReact: (() => void) | null = null
    let suppressNotify = false

    // Create a computed that runs the selector through a tracking proxy.
    // This establishes signal dependencies on the paths the selector reads.
    //
    // Intermediate object traversals don't create signal dependencies (to avoid
    // "false sharing" where siblings cause re-runs). Only leaf primitive reads
    // create deps automatically. If the selector returns a proxy (object result),
    // we explicitly read that object's signal to establish the terminal dependency.
    // Track leaf object accesses for identity comparison support.
    // Objects read by the selector but never traversed deeper are
    // "leaf objects" — their identity matters (e.g., `a === b`).
    // Reused across evaluations (cleared at the start of each) — a
    // computed never re-enters its own evaluation, so this is safe and
    // avoids two allocations per eval.
    const leafTracker: LeafObjectTracker = {
      accessedObjects: new Map(),
      traversedPaths: new Set(),
    }

    // Bumped when the component re-renders with a different selector
    // function (e.g., an inline selector closing over changed props).
    // The computed reads it, so bumping forces a re-evaluation with the
    // new closure — otherwise the selector would keep returning the old
    // closure's result until an unrelated store change fired a signal.
    const selectorVersionSignal = engine.signal(0)

    const setSelector = (nextSelector: (state: S) => R): void => {
      selectorRef.current = nextSelector
      // Recompute in place WITHOUT notifying React: this runs during
      // render, and getSnapshot picks up the fresh value in the same
      // pass. Scheduling a re-render here would loop forever for
      // selectors that return a new reference on every run.
      suppressNotify = true
      try {
        selectorVersionSignal.set(selectorVersionSignal.get() + 1)
        currentResult = selectorComputed.get()
      } finally {
        suppressNotify = false
      }
    }

    const selectorComputed = engine.computed(() => {
      selectorVersionSignal.get()
      const state = store.getState() as S & object

      leafTracker.accessedObjects.clear()
      leafTracker.traversedPaths.clear()
      // Activate (or deactivate) the untrack finalization queue for this
      // evaluation, per the current strategy.
      beginUntrackEvaluation()

      const proxy = createTrackingProxy(
        state,
        '',
        registry,
        registry.proxyCache,
        leafTracker,
      )
      const result = selectorRef.current(proxy as S)

      // If the selector returned a tracking proxy (object), explicitly
      // read its signal to establish a reactive dependency on that path.
      const proxyPath = getProxyPath(result)
      if (proxyPath !== undefined) {
        registry.getOrCreate(proxyPath, result).get()
      }

      // Read version signals for leaf objects — objects that were accessed
      // but never had their properties read. These are used for identity
      // comparison (===) and need their ref-change signals tracked.
      for (const [objPath, rawValue] of leafTracker.accessedObjects) {
        if (!leafTracker.traversedPaths.has(objPath)) {
          // This object was read but never traversed — it's a leaf.
          // Read its version signal to track identity changes.
          // Skip root path since root changes every dispatch.
          if (objPath !== '') {
            registry.getOrCreate(objPath, rawValue).get()
          }
        }
      }

      // Strip tracking proxies before the result crosses into React.
      // Must run AFTER the dependency reads above (they need the proxies
      // in hand). Everything downstream — equalityFn, getSnapshot,
      // components, dispatch payloads — sees only raw state.
      return untrackResult(result)
    })

    // Initialize with current value
    currentResult = selectorComputed.get()

    return {
      subscribe(onStoreChange: () => void): () => void {
        notifyReact = onStoreChange

        // Create an effect that fires when the computed value changes.
        // We apply the user's equalityFn here since alien-signals
        // doesn't support custom equality per-computed.
        let isFirst = true
        const dispose = engine.effect(() => {
          const newValue = selectorComputed.get()

          if (isFirst) {
            // First effect run — just establish tracking, don't notify
            isFirst = false
            return
          }

          if (suppressNotify) {
            // Render-phase selector swap (setSelector): adopt the value
            // so the equality baseline is current, but let the ongoing
            // render pick it up via getSnapshot instead of scheduling
            // another render.
            currentResult = newValue
            return
          }

          // Apply user's equality function
          if (!equalityFnRef.current(currentResult, newValue)) {
            currentResult = newValue
            version++
            notifyReact?.()
          }
        })

        return () => {
          notifyReact = null
          dispose()
        }
      },

      getSnapshot(): R {
        return currentResult
      },

      setSelector,
    }
  }, [store, registry, engine])

  // Render-phase selector swap: if this render brought a different
  // selector function (inline selector closing over changed props),
  // re-evaluate now so getSnapshot returns the new closure's value in
  // this same render.
  if (selectorRef.current !== selector) {
    bridge.setSelector(selector)
  }

  // Cleanup scope on unmount
  useEffect(() => {
    return () => {
      // bridge.subscribe's cleanup handles effect disposal
    }
  }, [bridge])

  // getSnapshot doubles as getServerSnapshot: the computed already ran
  // during useMemo, so SSR renders the current selected value.
  return useSyncExternalStore(
    bridge.subscribe,
    bridge.getSnapshot,
    bridge.getSnapshot,
  )
}
