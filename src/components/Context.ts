import React, { MutableSource } from 'react'
import { Action, AnyAction, Store } from 'redux'
import type { FixTypeLater } from '../types'

export interface ReactReduxContextValue<
  SS = FixTypeLater,
  A extends Action = AnyAction
> {
  storeSource: MutableSource<Store<SS, A>>
  store: Store<SS, A>
}

export const ReactReduxContext =
  /*#__PURE__*/ React.createContext<ReactReduxContextValue | null>(null)

export type ReactReduxContextInstance = typeof ReactReduxContext

if (process.env.NODE_ENV !== 'production') {
  ReactReduxContext.displayName = 'ReactRedux'
}

export default ReactReduxContext
