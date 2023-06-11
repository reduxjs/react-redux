import { createContext } from 'react'
import type { Action, AnyAction, Store } from 'redux'
import type { Subscription } from '../utils/Subscription'
import { StabilityCheck } from '../hooks/useSelector'

export interface ReactReduxContextValue<
  SS = any,
  A extends Action = AnyAction
> {
  store: Store<SS, A>
  subscription: Subscription
  getServerState?: () => SS
  stabilityCheck: StabilityCheck
}

export const ReactReduxContext =
  /*#__PURE__*/ createContext<ReactReduxContextValue>(null as any)

export type ReactReduxContextInstance = typeof ReactReduxContext

if (process.env.NODE_ENV !== 'production') {
  ReactReduxContext.displayName = 'ReactRedux'
}

export default ReactReduxContext
