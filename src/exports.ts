import connect from './components/connect'
import Provider from './components/Provider'
import { defaultNoopBatch } from './utils/batch'
import shallowEqual from './utils/shallowEqual'
export type {
  Connect,
  ConnectedProps,
  ConnectProps,
} from './components/connect'
export { ReactReduxContext } from './components/Context'
export type { ReactReduxContextValue } from './components/Context'
export type { ProviderProps } from './components/Provider'
export type {
  MapDispatchToProps,
  MapDispatchToPropsFactory,
  MapDispatchToPropsFunction,
  MapDispatchToPropsNonObject,
  MapDispatchToPropsParam,
  MapStateToProps,
  MapStateToPropsFactory,
  MapStateToPropsParam,
  MergeProps,
  Selector,
  SelectorFactory,
} from './connect/selectorFactory'
export { createDispatchHook, useDispatch } from './hooks/useDispatch'
export type { UseDispatch } from './hooks/useDispatch'
export { createSelectorHook, useSelector } from './hooks/useSelector'
export type { UseSelector } from './hooks/useSelector'
export { createStoreHook, useStore } from './hooks/useStore'
export type { UseStore } from './hooks/useStore'
export type * from './types'
export type { Subscription } from './utils/Subscription'

/**
 * @deprecated As of React 18, batching is enabled by default for ReactDOM and React Native.
 * This is now a no-op that immediately runs the callback.
 */
const batch = defaultNoopBatch

export { batch, connect, Provider, shallowEqual }
