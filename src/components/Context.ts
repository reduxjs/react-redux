import React from 'react'
import type Subscription from '../utils/Subscription'

export type ReduxContextProps = {
  store: any
  subscription: Subscription
}
export const ReactReduxContext = /*#__PURE__*/ React.createContext<ReduxContextProps | null>(null)

if (process.env.NODE_ENV !== 'production') {
  ReactReduxContext.displayName = 'ReactRedux'
}

export default ReactReduxContext
