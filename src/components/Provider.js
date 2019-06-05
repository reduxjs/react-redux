import React, { useState, useEffect, useRef } from 'react'
import { isContextProvider } from 'react-is'
import PropTypes from 'prop-types'
import { ReactReduxContext } from './Context'

export function Provider({ context, store, children }) {
  // construct a new updater and assign it to a ref on initial render

  let [contextValue, setContextValue] = useState(() => ({
    state: store.getState(),
    store
  }))

  let mountedRef = useRef(false)
  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  useEffect(() => {
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

export default Provider
