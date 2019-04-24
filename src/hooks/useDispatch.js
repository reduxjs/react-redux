import { useContextSelector } from 'react'

import { ReactReduxContext } from '../components/Context'

const storeSelector = c => c.store

export function makeUseDispatch(Context) {
  return function useDispatch() {
    let store = useContextSelector(Context, storeSelector)
    return store.dispatch
  }
}

export const useDispatch = makeUseDispatch(ReactReduxContext)
