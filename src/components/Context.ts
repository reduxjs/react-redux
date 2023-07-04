import * as React from 'react'
import type { Context } from 'react'
import type { Action, AnyAction, Store } from 'redux'
import type { Subscription } from '../utils/Subscription'
import type { CheckFrequency } from '../hooks/useSelector'

export interface ReactReduxContextValue<
  SS = any,
  A extends Action = AnyAction
> {
  store: Store<SS, A>
  subscription: Subscription
  getServerState?: () => SS
  stabilityCheck: CheckFrequency
  noopCheck: CheckFrequency
}

const ContextKey = Symbol.for(`react-redux-context`)
const gT = globalThis as {
  [ContextKey]?: Map<
    typeof React['createContext'],
    Context<ReactReduxContextValue>
  >
}

function getContext(): Context<ReactReduxContextValue> {
  if (!React.createContext) return {} as any

  const contextMap = (gT[ContextKey] ??= new Map())
  let realContext = contextMap.get(React.createContext)
  if (!realContext) {
    realContext = React.createContext<ReactReduxContextValue>(null as any)
    if (process.env.NODE_ENV !== 'production') {
      realContext.displayName = 'ReactRedux'
    }
    contextMap.set(React.createContext, realContext)
  }
  return realContext
}

export const ReactReduxContext = /*#__PURE__*/ getContext()

export type ReactReduxContextInstance = typeof ReactReduxContext

export default ReactReduxContext
