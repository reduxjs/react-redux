import { Store } from 'redux'
import {
  MutableSource,
  unstable_useMutableSource as useMutableSource,
} from 'react'

const subscribe = (store: Store, callback: () => void) => {
  return store.subscribe(callback)
}

export const useStoreSource = <Value>(
  source: MutableSource<Store>,
  getSnapshot: (store: Store) => Value
): Value => {
  return useMutableSource(source, getSnapshot, subscribe)
}
