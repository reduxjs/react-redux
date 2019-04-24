import React, { useState, useEffect, useLayoutEffect, useRef } from 'react'
import { isContextProvider } from 'react-is'
import PropTypes from 'prop-types'
import { ReactReduxContext } from './Context'

// React currently throws a warning when using useLayoutEffect on the server.
// To get around it, we can conditionally useEffect on the server (no-op) and
// useLayoutEffect in the browser. We need useLayoutEffect to ensure the store
// subscription callback always has the selector from the latest render commit
// available, otherwise a store update may happen between render and the effect,
// which may cause missed updates; we also must ensure the store subscription
// is created synchronously, otherwise a store update may occur before the
// subscription is created and an inconsistent state may be observed
const useIsomorphicLayoutEffect =
  typeof window !== 'undefined' &&
  typeof window.document !== 'undefined' &&
  typeof window.document.createElement !== 'undefined'
    ? useLayoutEffect
    : useEffect

export function Provider({ context, store, children }) {
  // construct a new updater and assign it to a ref on initial render

  let [contextValue, setContextValue] = useState(() => ({
    state: store.getState(),
    store
  }))

  let mountedRef = useRef(false)
  useIsomorphicLayoutEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useIsomorphicLayoutEffect(() => {
    let unsubscribe = store.subscribe(() => {
      if (mountedRef.current) {
        setContextValue({ state: store.getState(), store })
      }
    })
    if (contextValue.state !== store.getState()) {
      setContextValue({ state: store.getState(), store })
    }
    return () => {
      unsubscribe()
    }
  }, [store])

  // use context from props if one was provided
  const Context =
    context && context.Provider && isContextProvider(<context.Provider />)
      ? context
      : ReactReduxContext

  return <Context.Provider value={contextValue}>{children}</Context.Provider>
}

Provider.propTypes = {
  store: PropTypes.shape({
    subscribe: PropTypes.func.isRequired,
    dispatch: PropTypes.func.isRequired,
    getState: PropTypes.func.isRequired
  }),
  context: PropTypes.object,
  children: PropTypes.any
}
