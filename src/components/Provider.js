import React, { useEffect, useMemo, useRef } from 'react'
import { isContextProvider } from 'react-is'
import PropTypes from 'prop-types'
import { ReactReduxContext } from './Context'
import { createUpdater } from '../updater/updater'

export function Provider({ context, store, children }) {
  // construct a new updater and assign it to a ref on initial render
  let updaterRef = useRef(null)
  if (updaterRef.current === null) {
    updaterRef.current = createUpdater()
  }

  // access updater and methods
  let [updater, methods] = updaterRef.current

  // synchronously set the store
  updater.setStore(store)

  // when store changes set the store, and subscribe
  // to additional store updates
  useEffect(() => {
    updater.setStore(store)
    return store.subscribe(() => updater.newState(store.getState()))
  }, [updater, store])

  // merge the store with updater methods in a ref stable way
  let contextValue = useMemo(() => {
    return { ...methods, store }
  }, [methods, store])

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
