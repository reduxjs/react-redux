import React from 'react'
import { Action, AnyAction, Store } from 'redux'
import type { FixTypeLater } from '../types'
import type Subscription from '../utils/Subscription'

export interface ReactReduxContextValue<A extends Action = AnyAction> {
  store: Store<FixTypeLater, A>;
  subscription: Subscription
}

export const ReactReduxContext = /*#__PURE__*/ React.createContext<ReactReduxContextValue | null>(null)

if (process.env.NODE_ENV !== 'production') {
  ReactReduxContext.displayName = 'ReactRedux'
}

export default ReactReduxContext
