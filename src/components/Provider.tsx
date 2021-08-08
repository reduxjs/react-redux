import React, {
  Context,
  ReactNode,
  unstable_createMutableSource as createMutableSource,
  useMemo,
} from 'react'
import { ReactReduxContext, ReactReduxContextValue } from './Context'
import type { FixTypeLater } from '../types'
import { Action, AnyAction, Store } from 'redux'

export interface ProviderProps<A extends Action = AnyAction> {
  /**
   * The single Redux store in your application.
   */
  store: Store<FixTypeLater, A>
  /**
   * Optional context to be used internally in react-redux. Use React.createContext() to create a context to be used.
   * If this is used, you'll need to customize `connect` by supplying the same context provided to the Provider.
   * Initial value doesn't matter, as it is overwritten with the internal state of Provider.
   */
  context?: Context<ReactReduxContextValue | null>
  children: ReactNode
}

export function createReduxContext(store: Store) {
  return {
    storeSource: createMutableSource(store, () => store.getState()),
    store,
  }
}

function Provider({ store, context, children }: ProviderProps) {
  const contextValue: ReactReduxContextValue = useMemo(
    () => createReduxContext(store),
    [store]
  )
  const Context = context || ReactReduxContext

  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

export default Provider
