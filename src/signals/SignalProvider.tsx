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
import type { SignalEngine } from './types'

export interface SignalProviderProps<
  A extends Action<string> = UnknownAction,
  S = unknown,
> extends ProviderProps<A, S> {
  engine?: SignalEngine
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
    subscription.onStateChange = () => {
      // Run signal diff BEFORE notifying nested subs, so computed values
      // are up-to-date when useSelector/useSignalSelector read them
      const prev = prevStateRef.current
      const next = store.getState()
      prevStateRef.current = next
      reconcileState(prev, next, registry, engine)

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

  const Context = (context || ReactReduxContext) as Context<
    ReactReduxContextValue<S, A> | null
  >

  return (
    <Context.Provider value={contextValue as ReactReduxContextValue<S, A>}>
      {children}
    </Context.Provider>
  )
}
