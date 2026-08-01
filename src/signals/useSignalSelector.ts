import type { Context } from 'react'
import { React } from '../utils/react'
import type {
  DevModeChecks,
  UseSelectorOptions,
} from '../hooks/useSelector'
import type { ReactReduxContextValue } from '../components/Context'
import type { EqualityFn } from '../types'
import { createProbeProxy } from './coarseSegments'
import type { CoarseSub } from './coarseSegments'
import type { SignalContextValue } from './context'
import {
  createSignalContextHook,
  ReactReduxContext,
  useSignalContext,
} from './context'
import {
  createTrackingProxy,
  getProxyPath,
  type LeafObjectTracker,
} from './trackingProxy'
import { untrackResult } from './untrack'

const { useRef, useMemo, useEffect, useSyncExternalStore, useDebugValue } =
  React

const refEquality: EqualityFn<any> = Object.is

// Returned by the computed when the selector threw. A unique sentinel
// (never a real result) so alien-signals sees the value as changed and
// keeps propagating to the effect — returning the previous result would
// cut off propagation and React would never be notified of the error.
const SELECTOR_THREW = Symbol('selector threw') as unknown

// Only plain-object roots can be probed by the coarse tier: method calls
// through a proxy over a Map/Set/class-instance root would run with the
// proxy as `this` and break internal-slot access.
function isPlainObjectState(v: unknown): v is object {
  if (v === null || typeof v !== 'object') return false
  const proto = Object.getPrototypeOf(v)
  return proto === Object.prototype || proto === null
}


/**
 * A React hook that selects state from a Redux store using signal-based
 * dependency tracking. Only re-renders when the selected value actually
 * changes, with O(k) selectivity where k = number of affected selectors.
 *
 * Must be used within a <SignalProvider>.
 * @param selector - Function that extracts a value from the store state
 * @param equalityFnOrOptions - Equality function, or an options object
 *   with `equalityFn` and `devModeChecks` (same shape as stock
 *   `useSelector`)
 * @param useBoundSignalContext - Internal: the context hook to read the
 *   signal context from. Bound by `createSignalSelectorHook`.
 * @returns The selected value
 */
const useSignalSelectorImpl = <S, R>(
  selector: (state: S) => R,
  equalityFnOrOptions: EqualityFn<R> | UseSelectorOptions<R> = {},
  useBoundSignalContext: <SS>() => SignalContextValue<SS> = useSignalContext,
): R => {
  const { equalityFn = refEquality as EqualityFn<R>, devModeChecks = {} } =
    typeof equalityFnOrOptions === 'function'
      ? { equalityFn: equalityFnOrOptions, devModeChecks: {} }
      : equalityFnOrOptions

  if (process.env.NODE_ENV !== 'production') {
    if (!selector) {
      throw new Error(`You must pass a selector to useSignalSelector`)
    }
    if (typeof selector !== 'function') {
      throw new Error(
        `You must pass a function as a selector to useSignalSelector`,
      )
    }
    if (typeof equalityFn !== 'function') {
      throw new Error(
        `You must pass a function as an equality function to useSignalSelector`,
      )
    }
  }

  const reduxContext = useBoundSignalContext<S>()
  const { store, registry, engine } = reduxContext

  // Track latest selector/equalityFn via refs. Updated during render
  // (idempotent ref writes, same approach as React's
  // useSyncExternalStoreWithSelector) so a selector closing over changed
  // props is applied in THIS render, not a layout effect later.
  const selectorRef = useRef(selector)
  const equalityFnRef = useRef(equalityFn)
  equalityFnRef.current = equalityFn

  // Dev-mode check settings. Per-hook `devModeChecks` overrides merge over
  // the Provider-level defaults, matching stock useSelector. Kept in refs
  // (idempotent render-phase writes) so the bridge closure always reads
  // the latest values.
  const devModeChecksRef = useRef<Partial<DevModeChecks>>(devModeChecks)
  devModeChecksRef.current = devModeChecks
  const contextRef = useRef(reduxContext)
  contextRef.current = reduxContext

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

    // --- Coarse tier state ---
    // The hook starts "unbuilt": no tracking proxies, no path signals,
    // no alien-signals effect. At mount, one shallow probe records which
    // top-level state keys the selector reads; the hook then waits in
    // the segment index and is promoted to the deep tier on the first
    // dispatch that changes one of those keys.
    let built = false
    let disposeEffect: (() => void) | null = null
    let coarseSub: CoarseSub | null = null
    let probeSegments = new Set<string>()
    // Footprint can't be gated: the selector read no top-level keys,
    // returned the root, or enumerated root keys — or the root isn't a
    // plain object. Such hooks build the deep tier eagerly.
    let ungateable = false
    // State ref that probeSegments/currentResult were probed against.
    let probedState: unknown = null
    // Freshness cache for unbuilt getSnapshot recomputes.
    let lastSnapshotState: unknown = null

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
    // The holder object is stable; its containers are swapped for fresh
    // ones at the start of each evaluation (a computed never re-enters
    // its own evaluation, so this is safe).
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

      if (built) {
        // Recompute in place: this runs during render, and getSnapshot
        // picks up the fresh value in the same pass. Scheduling a
        // re-render here would loop forever for selectors that return a
        // new reference on every run.
        recomputeInPlace()
        if (pendingError !== null) {
          // The new closure threw — surface it in this render.
          throw pendingError
        }
        return
      }

      // Still in the coarse tier: the registered footprint reflects the
      // OLD closure. Re-probe with the new one and swap the registration
      // — `s => flag ? s.a : s.b` left registered under {a} alone would
      // silently miss every change to b.
      const state = store.getState()
      if (isPlainObjectState(state)) {
        // A probe throw propagates into this render (stock parity for
        // selector swaps); the old registration stays until a working
        // closure lands.
        probe(state as S & object)
        if (coarseSub !== null) {
          registry.segmentIndex.unregister(coarseSub)
          coarseSub = {
            // Ungateable after the swap (returns root / enumerates keys):
            // the deep effect can't be attached during render, so
            // register a wildcard — the next root change promotes it.
            segments: ungateable ? null : probeSegments,
            onCoarseHit,
          }
          registry.segmentIndex.register(coarseSub)
        }
        // Not subscribed yet: subscribe() handles registration (and the
        // eager build for ungateable footprints).
      } else {
        // Root became non-plain while never subscribed (a dispatch in
        // the render→subscribe gap) — can't probe it. Promote now; the
        // effect attaches in subscribe().
        built = true
        recomputeInPlace()
        if (pendingError !== null) {
          throw pendingError
        }
      }
    }

    // Dev-mode selector checks (stability / identity function), matching
    // stock useSelector. They run inside the computed because that is the
    // only place the selector executes. `firstRun` is per hook instance:
    // 'once' means literally once, on the first evaluation — a later
    // render-phase selector swap does NOT re-arm it.
    let firstRun = true
    const runDevModeChecks = (selected: R, proxy: S): void => {
      const { stabilityCheck = 'once', identityFunctionCheck = 'once' } =
        contextRef.current
      const finalChecks: DevModeChecks = {
        stabilityCheck,
        identityFunctionCheck,
        ...devModeChecksRef.current,
      }

      if (
        finalChecks.stabilityCheck === 'always' ||
        (finalChecks.stabilityCheck === 'once' && firstRun)
      ) {
        // Re-running the selector against the same proxy registers the
        // same dependencies (idempotent) and returns proxy-consistent
        // values, so === / shallowEqual comparisons behave correctly.
        const toCompare = selectorRef.current(proxy)
        if (!equalityFnRef.current(selected, toCompare)) {
          let stack: string | undefined = undefined
          try {
            throw new Error()
          } catch (e) {
            stack = (e as Error).stack
          }
          console.warn(
            'Selector ' +
              (selectorRef.current.name || 'unknown') +
              ' returned a different result when called with the same parameters. This can lead to unnecessary rerenders.' +
              '\nSelectors that return a new reference (such as an object or an array) should be memoized: https://redux.js.org/usage/deriving-data-selectors#optimizing-selectors-with-memoization',
            { selected, selected2: toCompare, stack },
          )
        }
      }

      if (
        finalChecks.identityFunctionCheck === 'always' ||
        (finalChecks.identityFunctionCheck === 'once' && firstRun)
      ) {
        if ((selected as unknown) === proxy) {
          let stack: string | undefined = undefined
          try {
            throw new Error()
          } catch (e) {
            stack = (e as Error).stack
          }
          console.warn(
            'Selector ' +
              (selectorRef.current.name || 'unknown') +
              ' returned the root state when called. With useSignalSelector this component will NEVER re-render, because signal dependencies are only created for the specific paths a selector reads — and this selector read none.' +
              '\nSelect the smallest values your component needs instead of the entire state object.',
            { stack },
          )
        }
      }

      firstRun = false
    }

    const selectorComputed = engine.computed(() => {
      selectorVersionSignal.get()
      // pendingError reflects the LAST evaluation: a successful re-run
      // clears an earlier error.
      pendingError = null
      try {
        const state = store.getState() as S & object

        leafTracker.accessedObjects = new Map()
        leafTracker.traversedPaths = new Set()

        const proxy = createTrackingProxy(
          state,
          '',
          registry,
          registry.proxyCache,
          leafTracker,
        )
        const result = selectorRef.current(proxy as S)

        if (process.env.NODE_ENV !== 'production') {
          runDevModeChecks(result, proxy as S)
        }

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

    // Create the alien-signals effect that drives the deep tier: fires
    // when the computed value changes, applies the user's equalityFn,
    // and notifies React. Extracted from subscribe() because promotion
    // from the coarse tier (first coarse hit) also attaches it.
    const attachEffect = (): void => {
      let isFirst = true
      disposeEffect = engine.effect(() => {
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
    }

    // Run the selector once through a one-level shallow probe proxy:
    // seeds currentResult and records the coarse footprint (which
    // top-level keys it read) without building tracking proxies or path
    // signals. Throws propagate to the caller — mount render / selector
    // swap, stock parity.
    const probe = (state: S & object): void => {
      const { proxy, record } = createProbeProxy(state)
      const value = selectorRef.current(proxy as S)
      if (process.env.NODE_ENV !== 'production') {
        runDevModeChecks(value, proxy as S)
      }
      currentResult = untrackResult(value)
      probeSegments = record.segments
      ungateable = record.segments.size === 0 || record.enumerated
      probedState = state
      lastSnapshotState = state
    }

    // Promotion: a dispatch changed one of this hook's root segments.
    // Build the deep tier — evaluate the computed (creating tracking
    // proxies and path signals), attach the driving effect, and notify
    // React if the value actually changed. Runs synchronously inside
    // the Provider's onStateChange, before notifyNestedSubs.
    const onCoarseHit = (): void => {
      if (built || notifyReact === null) return
      if (coarseSub !== null) {
        registry.segmentIndex.unregister(coarseSub)
        coarseSub = null
      }
      built = true
      attachEffect()
      // The effect's first run evaluated the computed (isFirst skip);
      // this read returns the cached value.
      const newValue = selectorComputed.get()
      if (pendingError !== null) {
        // Zombie-child window: the dispatch that woke us also removed
        // the entity. getSnapshot retries and surfaces or dissolves it.
        notifyReact?.()
        return
      }
      if (!equalityFnRef.current(currentResult, newValue)) {
        currentResult = newValue
        version++
        notifyReact?.()
      }
    }

    // --- Mount seeding ---
    // Probe the selector's coarse footprint and seed the initial value.
    // Footprints that can't be gated (and non-plain-object roots, which
    // can't be probed) fall back to building the deep tier eagerly — the
    // pre-coarse-tier behavior. A selector that throws on mount surfaces
    // here, during render — same as stock useSelector.
    const initialState = store.getState()
    if (isPlainObjectState(initialState)) {
      probe(initialState as S & object)
    } else {
      ungateable = true
    }
    if (ungateable) {
      built = true
      currentResult = selectorComputed.get()
      if (pendingError !== null) {
        throw pendingError
      }
    }

    return {
      subscribe(onStoreChange: () => void): () => void {
        notifyReact = onStoreChange

        if (!built) {
          // A dispatch may have landed between render (probe) and
          // subscribe. Re-probe so the registered footprint and seeded
          // value reflect the state we're subscribing against.
          const state = store.getState()
          if (state !== probedState) {
            if (isPlainObjectState(state)) {
              try {
                probe(state as S & object)
              } catch {
                // The selector threw against the newer state (zombie
                // window). Fall back to the deep tier — its pendingError
                // machinery owns surfacing (effect notify → getSnapshot
                // rethrow into render).
                built = true
                recomputeInPlace()
              }
            } else {
              built = true
              recomputeInPlace()
            }
          }

          if (!built) {
            if (ungateable) {
              // Can't gate this footprint — build eagerly. On error the
              // computed set pendingError; the effect's first run
              // notifies and getSnapshot rethrows into render.
              built = true
              const value = selectorComputed.get()
              if (pendingError === null) {
                currentResult = value
              }
            } else {
              coarseSub = { segments: probeSegments, onCoarseHit }
              registry.segmentIndex.register(coarseSub)
            }
          }
        }

        if (built && disposeEffect === null) {
          attachEffect()
        }

        return () => {
          notifyReact = null
          if (coarseSub !== null) {
            registry.segmentIndex.unregister(coarseSub)
            coarseSub = null
          }
          if (disposeEffect !== null) {
            disposeEffect()
            disposeEffect = null
          }
        }
      },

      getSnapshot(): R {
        if (!built) {
          // Deferred: no effect is watching yet. Serve fresh values for
          // dispatches in the render→subscribe gap (and wildcard waits)
          // by recomputing against RAW state — no proxies, no signals,
          // no untracking needed. Cached per state ref; equalityFn
          // preserves the previous result's identity for equal-but-new
          // references. A throw propagates into render — stock parity.
          const state = store.getState()
          if (state !== lastSnapshotState) {
            lastSnapshotState = state
            const fresh = selectorRef.current(state as S)
            if (!equalityFnRef.current(currentResult, fresh)) {
              currentResult = fresh
            }
          }
          return currentResult
        }

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
  const selectedState = useSyncExternalStore(
    bridge.subscribe,
    bridge.getSnapshot,
    bridge.getSnapshot,
  )

  useDebugValue(selectedState)

  return selectedState
}

/**
 * The signal-based `useSignalSelector` hook, including the `withTypes`
 * helper for creating a pre-typed version:
 *
 * ```ts
 * export const useAppSignalSelector = useSignalSelector.withTypes<RootState>()
 * ```
 */
export interface UseSignalSelector<StateType = unknown> {
  <TState extends StateType = StateType, Selected = unknown>(
    selector: (state: TState) => Selected,
    equalityFnOrOptions?:
      | EqualityFn<NoInfer<Selected>>
      | UseSelectorOptions<NoInfer<Selected>>,
  ): Selected

  withTypes: <
    OverrideStateType extends StateType,
  >() => UseSignalSelector<OverrideStateType>
}

/**
 * Hook factory, which creates a `useSignalSelector` hook bound to a given
 * context. Mirrors stock `createSelectorHook`.
 *
 * The context must be provided by a `<SignalProvider context={...}>` —
 * the returned hook validates that the context value carries the signal
 * registry and engine.
 *
 * @param context - Context passed to your `<SignalProvider>`.
 * @returns A `useSignalSelector` hook bound to the given context.
 */
export function createSignalSelectorHook(
  context: Context<ReactReduxContextValue<
    any,
    any
  > | null> = ReactReduxContext,
): UseSignalSelector {
  const useBoundSignalContext =
    context === ReactReduxContext
      ? useSignalContext
      : createSignalContextHook(context)

  const useSignalSelectorBound = <S, R>(
    selector: (state: S) => R,
    equalityFnOrOptions: EqualityFn<R> | UseSelectorOptions<R> = {},
  ): R =>
    useSignalSelectorImpl(selector, equalityFnOrOptions, useBoundSignalContext)

  const boundHook = Object.assign(useSignalSelectorBound, {
    withTypes: () => boundHook,
  }) as UseSignalSelector

  return boundHook
}

export const useSignalSelector = /* @__PURE__ */ createSignalSelectorHook()
