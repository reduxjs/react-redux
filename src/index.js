import Provider from './components/Provider'
import connectAdvanced from './components/connectAdvanced'
import { ReactReduxContext } from './components/Context'
import connect from './connect/connect'

import { useDispatch } from './hooks/useDispatch'
import { useSelector } from './hooks/useSelector'
import { useShallowEqualSelector } from './hooks/useShallowEqualSelector'
import { useStore } from './hooks/useStore'

import { setBatch } from './utils/batch'
import { unstable_batchedUpdates as batch } from './utils/reactBatchedUpdates'

setBatch(batch)

export {
  Provider,
  connectAdvanced,
  ReactReduxContext,
  connect,
  batch,
  useDispatch,
  useSelector,
  useStore,
  useShallowEqualSelector
}
