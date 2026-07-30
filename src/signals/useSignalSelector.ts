import { React } from '../utils/react'
import { useSignalContext } from './context'
import {
  createTrackingProxy,
  getProxyPath,
  type LeafObjectTracker,
} from './trackingProxy'
import { untrackResult } from './untrack'

const { useRef, useMemo, useEffect, useSyncExternalStore } = React

// Returned by the computed when the selector threw. A unique sentinel
// (never a real result) so alien-signals sees the value as changed and
// keeps propagating to the effect — returning the previous result would
// cut off propagation and React would never be notified of the error.
const SELECTOR_THREW = Symbol('selector threw') as unknown


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
    // Set when the selector threw during an effect re-evaluation (classic
    // zombie child: an entity was removed while a component selecting it
    // is still mounted). getSnapshot retries and rethrows if it persists.
    let pendingError: unknown = null

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

    // Force a fresh evaluation of the computed WITHOUT notifying React.
    // Bumping the version signal dirties the computed; a plain .get()
    // alone would return the cached value. On a selector error the
    // computed records pendingError and yields the SELECTOR_THREW
    // sentinel, which must never replace the last good result.
    const recomputeInPlace = (): void => {
      suppressNotify = true
      try {
        selectorVersionSignal.set(selectorVersionSignal.get() + 1)
        const value = selectorComputed.get()
        if (pendingError === null) {
          currentResult = value
        }
      } finally {
        suppressNotify = false
      }
    }

    const setSelector = (nextSelector: (state: S) => R): void => {
      selectorRef.current = nextSelector
      // Recompute in place: this runs during render, and getSnapshot
      // picks up the fresh value in the same pass. Scheduling a
      // re-render here would loop forever for selectors that return a
      // new reference on every run.
      recomputeInPlace()
      if (pendingError !== null) {
        // The new closure threw — surface it in this render.
        throw pendingError
      }
    }

    const selectorComputed = engine.computed(() => {
      selectorVersionSignal.get()
      // pendingError reflects the LAST evaluation: a successful re-run
      // clears an earlier error.
      pendingError = null
      try {
        const state = store.getState() as S & object

        leafTracker.accessedObjects.clear()
        leafTracker.traversedPaths.clear()

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
      } catch (e) {
        // The selector threw — typically a zombie child whose entity was
        // removed in the same dispatch that will unmount it. The error
        // CANNOT propagate from here: alien-signals evaluates dirty
        // computeds during its flush (checkDirty), so an uncaught throw
        // escapes store.dispatch and skips every remaining component's
        // effect. Record it and yield the sentinel; the effect notifies
        // React and getSnapshot re-evaluates — if a parent unmounts this
        // component first the error dissolves, otherwise it rethrows
        // into the render where an error boundary owns it (matching
        // stock useSelector under React's useSyncExternalStore).
        pendingError = e
        return SELECTOR_THREW as R
      }
    })

    // Initialize with current value. A selector that throws on mount
    // surfaces here, during render — same as stock useSelector.
    currentResult = selectorComputed.get()
    if (pendingError !== null) {
      throw pendingError
    }

    return {
      subscribe(onStoreChange: () => void): () => void {
        notifyReact = onStoreChange

        // Create an effect that fires when the computed value changes.
        // We apply the user's equalityFn here since alien-signals
        // doesn't support custom equality per-computed.
        let isFirst = true
        const dispose = engine.effect(() => {
          const newValue = selectorComputed.get()

          if (pendingError !== null) {
            // The evaluation threw (newValue is the SELECTOR_THREW
            // sentinel — never adopt it). Notify React so getSnapshot
            // can retry and surface or dissolve the error.
            isFirst = false
            if (!suppressNotify) {
              notifyReact?.()
            }
            return
          }

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
        if (pendingError !== null) {
          // A previous evaluation threw. Retry against current state:
          // the situation may have resolved (entity restored, or this is
          // a fresh render pass after the parent re-rendered). Clear
          // first — the effect's catch re-sets it if the selector still
          // throws. On rethrow, LEAVE pendingError set so the next
          // getSnapshot (React retries during render after a
          // subscription-phase throw) re-evaluates instead of returning
          // a stale value.
          pendingError = null
          recomputeInPlace()
          if (pendingError !== null) {
            throw pendingError
          }
        }
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
