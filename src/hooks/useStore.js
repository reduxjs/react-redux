import { useContext } from 'react'

import { ReactReduxContext } from '../components/Context'

export function makeUseStore(Context) {
  return function useStore() {
    let context = useContext(Context)
    return context.store
  }
}

export const useStore = makeUseStore(ReactReduxContext)
