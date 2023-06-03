import { createContext } from 'react'
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

let realContext: Context<ReactReduxContextValue> | null = null
function getContext() {
  if (!realContext) {
    realContext = createContext<ReactReduxContextValue>(null as any)
    if (process.env.NODE_ENV !== 'production') {
      realContext.displayName = 'ReactRedux'
    }
  }
  return realContext
}

export const ReactReduxContext = /*#__PURE__*/ new Proxy(
  {} as Context<ReactReduxContextValue>,
  /*#__PURE__*/ new Proxy<ProxyHandler<Context<ReactReduxContextValue>>>(
    {},
    {
      get(_, handler) {
        const target = getContext()
        // @ts-ignore
        return (_target, ...args) => Reflect[handler](target, ...args)
      },
    }
  )
)

export type ReactReduxContextInstance = typeof ReactReduxContext

export default ReactReduxContext
