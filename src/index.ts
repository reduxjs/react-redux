import Provider from './components/Provider'
import type { ProviderProps } from './components/Provider'
import connectAdvanced from './components/connectAdvanced'
import type {
  ConnectAdvancedOptions,
  ConnectProps,
} from './components/connectAdvanced'
import type {
  SelectorFactory,
  Selector,
  MapStateToProps,
  MapStateToPropsFactory,
  MapStateToPropsParam,
  MapDispatchToPropsFunction,
  MapDispatchToProps,
  MapDispatchToPropsFactory,
  MapDispatchToPropsParam,
  MapDispatchToPropsNonObject,
  MergeProps,
} from './connect/selectorFactory'
import { ReactReduxContext } from './components/Context'
import type { ReactReduxContextValue } from './components/Context'
import connect from './connect/connect'

import { useDispatch, createDispatchHook } from './hooks/useDispatch'
import { useSelector, createSelectorHook } from './hooks/useSelector'
import { useStore, createStoreHook } from './hooks/useStore'

import { setBatch } from './utils/batch'
import { unstable_batchedUpdates as batch } from './utils/reactBatchedUpdates'
import shallowEqual from './utils/shallowEqual'

setBatch(batch)

export * from './types'
export {
  ProviderProps,
  Provider,
  connectAdvanced,
  SelectorFactory,
  Selector,
  MapStateToProps,
  MapStateToPropsFactory,
  MapStateToPropsParam,
  ConnectProps,
  ConnectAdvancedOptions,
  MapDispatchToPropsFunction,
  MapDispatchToProps,
  MapDispatchToPropsFactory,
  MapDispatchToPropsParam,
  MapDispatchToPropsNonObject,
  MergeProps,
  ReactReduxContext,
  ReactReduxContextValue,
  connect,
  batch,
  useDispatch,
  createDispatchHook,
  useSelector,
  createSelectorHook,
  useStore,
  createStoreHook,
  shallowEqual,
}
