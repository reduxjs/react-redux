import { useContextSelector, useCallback, useContext } from 'react'

import { ReactReduxContext } from '../components/Context'

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser. We need useLayoutEffect to ensure we can
// run effects before the node is updated in our queue

/*
  makeUseSelector is implemented as a factory first in order to support the need
  for user supplied contexts.
*/

export function makeUseSelector(Context) {
  return function useSelector(selector, deps) {
    // memoize the selector with the provided deps
    let select = useCallback(context => selector(context.state), deps)
    let context = useContext(Context)

    return useContextSelector(Context, select)
  }
}

export const useSelector = makeUseSelector(ReactReduxContext)
