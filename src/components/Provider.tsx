import React, { Context, ReactNode, useMemo } from 'react'
import PropTypes from 'prop-types'
import { ReactReduxContext, ReactReduxContextValue } from './Context'
import Subscription from '../utils/Subscription'
import { useIsomorphicLayoutEffect } from '../utils/useIsomorphicLayoutEffect'
import type { FixTypeLater } from '../types'
import { Action, AnyAction, Store } from 'redux'

interface ProviderProps<A extends Action = AnyAction> {
  /**
   * The single Redux store in your application.
   */
  store: Store<FixTypeLater, A>;
  /**
   * Optional context to be used internally in react-redux. Use React.createContext() to create a context to be used.
   * If this is used, generate own connect HOC by using connectAdvanced, supplying the same context provided to the
   * Provider. Initial value doesn't matter, as it is overwritten with the internal state of Provider.
   */
  context?: Context<ReactReduxContextValue>;
  children: ReactNode
}

function Provider({ store, context, children }: ProviderProps) {
  const contextValue = useMemo(() => {
    const subscription = new Subscription(store)
    subscription.onStateChange = subscription.notifyNestedSubs
    return {
      store,
      subscription,
    }
  }, [store])

  const previousState = useMemo(() => store.getState(), [store])

  useIsomorphicLayoutEffect(() => {
    const { subscription } = contextValue
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

  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

if (process.env.NODE_ENV !== 'production') {
  Provider.propTypes = {
    store: PropTypes.shape({
      subscribe: PropTypes.func.isRequired,
      dispatch: PropTypes.func.isRequired,
      getState: PropTypes.func.isRequired,
    }),
    context: PropTypes.object,
    children: PropTypes.any,
  }
}

export default Provider
