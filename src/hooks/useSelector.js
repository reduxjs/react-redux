import { useContextSelector, useCallback } from 'react'

import { ReactReduxContext } from '../components/Context'

/*
  makeUseSelector is implemented as a factory first in order to support the need
  for user supplied contexts.
*/

export function makeUseSelector(Context) {
  return function useSelector(selector) {
    // memoize the selector with the provided deps
    let select = useCallback(context => selector(context.state), [selector])

    return useContextSelector(Context, select)
  }
}

export const useSelector = makeUseSelector(ReactReduxContext)
