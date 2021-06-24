import Provider from './components/Provider'
import connectAdvanced from './components/connectAdvanced'
import { ReactReduxContext } from './components/Context'
import connect from './connect/connect'

import { useDispatch, createDispatchHook } from './hooks/useDispatch'
import { useSelector, createSelectorHook } from './hooks/useSelector'
import { useStore, createStoreHook } from './hooks/useStore'

import { setBatch } from './utils/batch'
import { unstable_batchedUpdates as batch } from './utils/reactBatchedUpdates'
import shallowEqual from './utils/shallowEqual'

setBatch(batch)

export {
  Provider,
  connectAdvanced,
  ReactReduxContext,
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
