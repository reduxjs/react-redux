import type { Context } from 'react'
import { React } from '../utils/react'
import type { Action, UnknownAction } from 'redux'
import type { ReactReduxContextValue } from '../components/Context'
import { ReactReduxContext } from '../components/Context'
import type { ProviderProps } from '../components/Provider'
import { createSubscription } from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import type { SignalContextValue } from './context'
import { createPathSignalRegistry } from './pathSignalRegistry'
import { reconcileState } from './diff'
import { changedSegments } from './coarseSegments'
import type { CoarseSub } from './coarseSegments'
import { scheduleCallback, shouldYield } from './scheduler'

import { alienEngine } from './engine'
import type { SignalEngine } from './types'

// Default for SignalProvider's `sliceThreshold`: above this many candidates in
// a single dispatch, the coarse first-touch pass is time-sliced (responsive,
// but updates stagger); below it, it runs inline (atomic — all candidates in
// one synchronous pass). Override via the prop.
const DEFAULT_SLICE_THRESHOLD = 64

export interface SignalProviderProps<
  A extends Action<string> = UnknownAction,
  S = unknown,
> extends ProviderProps<A, S> {
  engine?: SignalEngine
  /**
   * Candidate count above which the coarse first-touch build+notify burst is
   * time-sliced across macrotasks (keeps a huge burst from blocking a frame,
   * at the cost of updates staggering during that burst). Below it the pass
   * runs inline in one synchronous, atomic step. Default `64`. Set to
   * `Infinity` to always run inline (atomic, may block on a large first
   * touch); set to `0` to always slice. Only affects the first-touch burst —
   * steady-state updates are always synchronous.
   */
  sliceThreshold?: number
}

export function SignalProvider<
  S extends object,
  A extends Action = UnknownAction,
>(providerProps: SignalProviderProps<A, S>) {
  const {
    children,
    context,
    serverState,
    store,
    engine = alienEngine,
    sliceThreshold = DEFAULT_SLICE_THRESHOLD,
  } = providerProps

  // Create signal registry once (lazy init via ref)
  const registryRef = React.useRef(createPathSignalRegistry(engine))
  const registry = registryRef.current

  // Track previous state for signal diffing
  const prevStateRef = React.useRef<S>(store.getState())

  // Build context value: standard ReactReduxContextValue + signal fields
  const contextValue = React.useMemo(() => {
    const subscription = createSubscription(store)

    const baseContextValue: SignalContextValue<S, A> = {
      store,
      subscription,
      getServerState: serverState ? () => serverState : undefined,
      registry,
      engine,
    }

    if (process.env.NODE_ENV === 'production') {
      return baseContextValue
    } else {
      const { identityFunctionCheck = 'once', stabilityCheck = 'once' } =
        providerProps

      return Object.assign(baseContextValue, {
        stabilityCheck,
        identityFunctionCheck,
      })
    }
  }, [store, serverState, registry, engine])

  const previousState = React.useMemo(() => store.getState(), [store])

  // Standard Provider subscription logic (from components/Provider.tsx)
  // + signal diff on each dispatch
  useIsomorphicLayoutEffect(() => {
    const { subscription } = contextValue

    // Gated, time-sliced drain of coarse candidates. A large first-touch
    // burst (e.g. every hook depends on the one slice that just changed) is
    // chunked across macrotasks so it never blocks a frame; a small burst
    // runs inline. Deferring a candidate only delays its re-render — the
    // value is read fresh from committed state when it finally builds.
    let pending: CoarseSub[] = []
    const pendingSet = new Set<CoarseSub>()
    let draining = false
    let disposed = false

    const drainChunk = (): void => {
      if (disposed) return
      let sub = pending.pop()
      while (sub !== undefined) {
        pendingSet.delete(sub)
        sub.onCoarseHit()
        if (pending.length > 0 && shouldYield()) break
        sub = pending.pop()
      }
      if (pending.length > 0) {
        scheduleCallback(drainChunk)
      } else {
        draining = false
      }
    }

    const runCoarse = (candidates: Set<CoarseSub>): void => {
      if (!draining && candidates.size < sliceThreshold) {
        for (const sub of candidates) sub.onCoarseHit()
        return
      }
      for (const sub of candidates) {
        if (!pendingSet.has(sub)) {
          pendingSet.add(sub)
          pending.push(sub)
          // Drop it from the segment index as soon as it's queued, so a
          // dispatch arriving mid-drain doesn't re-collect the whole backlog
          // of already-queued subs (O(unbuilt) per tick during a large
          // first-touch drain). Safe: the queued build reads the latest
          // committed state when it runs, so any further change to this
          // sub's segment while it waits is still picked up.
          registry.segmentIndex.unregister(sub)
        }
      }
      if (!draining) {
        draining = true
        scheduleCallback(drainChunk)
      }
    }

    subscription.onStateChange = () => {
      // Run signal diff BEFORE notifying nested subs, so computed values
      // are up-to-date when useSelector/useSignalSelector read them
      const prev = prevStateRef.current
      const next = store.getState()
      prevStateRef.current = next
      reconcileState(prev, next, registry, engine)

      // Coarse tier: build + notify any deferred (not-yet-built) hooks whose
      // top-level segment changed this dispatch. Built hooks are already
      // handled by the deep reconcile above and drop out of the index, so
      // this only ever touches the lazy ones.
      const changed = changedSegments(
        prev as Record<string, unknown>,
        next as Record<string, unknown>,
      )
      if (changed.length > 0) {
        const candidates = new Set<CoarseSub>()
        registry.segmentIndex.collect(changed, candidates)
        if (candidates.size > 0) runCoarse(candidates)
      }

      subscription.notifyNestedSubs()
    }
    subscription.trySubscribe()

    if (previousState !== store.getState()) {
      subscription.notifyNestedSubs()
    }
    return () => {
      disposed = true
      pending = []
      pendingSet.clear()
      subscription.tryUnsubscribe()
      subscription.onStateChange = undefined
    }
  }, [contextValue, previousState, sliceThreshold])

  const Context = (context || ReactReduxContext) as Context<
    ReactReduxContextValue<S, A> | null
  >

  return (
    <Context.Provider value={contextValue as ReactReduxContextValue<S, A>}>
      {children}
    </Context.Provider>
  )
}
