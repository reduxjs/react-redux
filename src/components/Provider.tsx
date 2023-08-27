import type { Context, ReactNode } from 'react'
import * as React from 'react'
import type { ReactReduxContextValue } from './Context'
import { ReactReduxContext } from './Context'
import { createSubscription } from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import type { Action, AnyAction, Store } from 'redux'
import type { CheckFrequency } from '../hooks/useSelector'
import { createNode, updateNode } from '../utils/autotracking/proxy'

export interface ProviderProps<A extends Action = AnyAction, S = unknown> {
  /**
   * The single Redux store in your application.
   */
  store: Store<S, A>

  /**
   * An optional server state snapshot. Will be used during initial hydration render if available, to ensure that the UI output is consistent with the HTML generated on the server.
   */
  serverState?: S

  /**
   * Optional context to be used internally in react-redux. Use React.createContext() to create a context to be used.
   * If this is used, you'll need to customize `connect` by supplying the same context provided to the Provider.
   * Initial value doesn't matter, as it is overwritten with the internal state of Provider.
   */
  context?: Context<ReactReduxContextValue<S, A>>

  /** Global configuration for the `useSelector` stability check */
  stabilityCheck?: CheckFrequency

  /** Global configuration for the `useSelector` no-op check */
  noopCheck?: CheckFrequency

  children: ReactNode
}

function Provider<A extends Action = AnyAction, S = unknown>({
  store,
  context,
  children,
  serverState,
  stabilityCheck = 'once',
  noopCheck = 'once',
}: ProviderProps<A, S>) {
  const contextValue: ReactReduxContextValue = React.useMemo(() => {
    const trackingNode = createNode(store.getState() as any)
    //console.log('Created tracking node: ', trackingNode)
    const subscription = createSubscription(
      store as any,
      undefined,
      trackingNode
    )
    return {
      store: store as any,
      subscription,
      getServerState: serverState ? () => serverState : undefined,
      stabilityCheck,
      noopCheck,
      trackingNode,
    }
  }, [store, serverState, stabilityCheck, noopCheck])

  const previousState = React.useMemo(() => store.getState(), [store])

  useIsomorphicLayoutEffect(() => {
    const { subscription } = contextValue
    subscription.onStateChange = subscription.notifyNestedSubs
    subscription.trySubscribe()

    if (previousState !== store.getState()) {
      subscription.notifyNestedSubs()
    }
    return () => {
      subscription.tryUnsubscribe()
      subscription.onStateChange = undefined
    }
  }, [contextValue, previousState])

  const Context = context || ReactReduxContext

  // @ts-ignore 'AnyAction' is assignable to the constraint of type 'A', but 'A' could be instantiated with a different subtype
  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

export default Provider
