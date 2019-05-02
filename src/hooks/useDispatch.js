import { useContext } from 'react'

import { ReactReduxContext } from '../components/Context'

export function makeUseDispatch(Context) {
  return function useDispatch() {
    let context = useContext(Context)
    return context.dispatch
  }
}

export const useDispatch = makeUseDispatch(ReactReduxContext)
