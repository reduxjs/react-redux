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
import { alienEngine } from './engine'

export interface SignalProviderProps<
  A extends Action<string> = UnknownAction,
  S = unknown,
> extends ProviderProps<A, S> {}

export function SignalProvider<
  A extends Action<string> = UnknownAction,
  S extends object = object,
>(providerProps: SignalProviderProps<A, S>) {
  const { children, context, serverState, store } = providerProps

  // The signal graph and the diff baseline are keyed to the store:
  // swapping the `store` prop starts over with a fresh registry, the
  // same way stock Provider rebuilds its Subscription. `prevState` is
  // mutable — onStateChange advances it after each diff.
  const signalState = React.useMemo(
    () => ({
      registry: createPathSignalRegistry(alienEngine),
      prevState: store.getState() as S,
    }),
    [store],
  )
  const registry = signalState.registry

  // Build context value: standard ReactReduxContextValue + signal fields
  const contextValue = React.useMemo(() => {
    const subscription = createSubscription(store)

    const baseContextValue: SignalContextValue<S, A> = {
      store,
      subscription,
      getServerState: serverState ? () => serverState : undefined,
      registry,
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
  }, [store, serverState, registry])

  const previousState = React.useMemo(() => store.getState(), [store])

  // Standard Provider subscription logic (from components/Provider.tsx)
  // + signal diff on each dispatch
  useIsomorphicLayoutEffect(() => {
    const { subscription } = contextValue
    subscription.onStateChange = () => {
      // Run signal diff BEFORE notifying nested subs, so computed values
      // are up-to-date when useSelector/useSignalSelector read them
      const prev = signalState.prevState
      const next = store.getState()
      signalState.prevState = next
      const changedRootKeys = reconcileState(prev, next, registry, alienEngine)

      // Coarse tier: wake deferred subscribers whose top-level segments
      // changed (null = root wasn't diffable, every subscriber is a
      // candidate). Runs before notifyNestedSubs so a promoted hook's
      // deep graph and current result are ready when React reads its
      // snapshot. collect() returns a snapshot array — subscribers
      // unregister themselves from the index inside onCoarseHit.
      if (prev !== next && registry.segmentIndex.size() > 0) {
        const hits = registry.segmentIndex.collect(changedRootKeys)
        for (let i = 0; i < hits.length; i++) {
          hits[i].onCoarseHit()
        }
      }

      subscription.notifyNestedSubs()
    }
    subscription.trySubscribe()

    if (previousState !== store.getState()) {
      subscription.notifyNestedSubs()
    }
    return () => {
      subscription.tryUnsubscribe()
      subscription.onStateChange = undefined
    }
  }, [contextValue, previousState])

  const Context = (context ||
    ReactReduxContext) as Context<ReactReduxContextValue<S, A> | null>

  return (
    <Context.Provider value={contextValue as ReactReduxContextValue<S, A>}>
      {children}
    </Context.Provider>
  )
}
