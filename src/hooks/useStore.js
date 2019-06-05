import { useContextSelector } from 'react'

import { ReactReduxContext } from '../components/Context'

let storeSelector = c => c.store

export function makeUseStore(Context) {
  return function useStore() {
    return useContextSelector(Context, storeSelector)
  }
}

export const useStore = makeUseStore(ReactReduxContext)
